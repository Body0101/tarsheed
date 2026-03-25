#include "WebPortal.h"

#include <ArduinoJson.h>
#include <LittleFS.h>
#include <cstring>
#include <esp_idf_version.h>
#include <esp_wifi.h>
#include <time.h>

#if defined(ESP_IDF_VERSION_MAJOR) && (ESP_IDF_VERSION_MAJOR >= 5)
#include <esp_netif.h>
#else
#include <tcpip_adapter.h>
#endif

#include "Utils.h"

namespace {
bool eventNeedsSnapshot(const String &jsonLine) {
  DynamicJsonDocument doc(256);
  if (deserializeJson(doc, jsonLine)) {
    return false;
  }
  const String event = doc["event"] | "";
  return event == "relay.changed" || event == "timer.started" || event == "timer.ended" || event == "timer.canceled" ||
         event == "manual.changed" || event == "interlock.changed" || event == "mode.changed";
}
}  // namespace

WebPortal *WebPortal::instance_ = nullptr;

WebPortal::CommandContextGuard::~CommandContextGuard() {
  if (portal_) {
    portal_->clearCommandContext();
  }
}

void WebPortal::begin(ControlEngine *engine, StorageLayer *storage, TimeKeeper *timeKeeper) {
  engine_ = engine;
  storage_ = storage;
  timeKeeper_ = timeKeeper;
  outboundQueue_ = xQueueCreate(48, sizeof(QueuedEvent));
  contextMutex_ = xSemaphoreCreateMutex();
  clients_.fill(false);
  clientMacs_.fill("");
  connectedClients_ = 0;

  setupRoutes();
  server_.begin();

  instance_ = this;
  socket_.begin();
  socket_.onEvent(onWsEventStatic);
}

void WebPortal::loop() {
  server_.handleClient();
  socket_.loop();
  processQueue();
}

bool WebPortal::enqueueEvent(const String &eventJson, bool bufferIfOffline) {
  if (!outboundQueue_) {
    return false;
  }

  QueuedEvent queued{};
  queued.bufferIfOffline = bufferIfOffline;
  eventJson.substring(0, sizeof(queued.json) - 1).toCharArray(queued.json, sizeof(queued.json));

  // Default MAC for system-originated events is SYSTEM.
  // When a WebSocket command is currently executing, this will be replaced
  // with the command sender's MAC (captured from AP station tables).
  String mac = activeCommandMac();
  if (mac.isEmpty()) {
    mac = "SYSTEM";
  }
  mac.substring(0, sizeof(queued.mac) - 1).toCharArray(queued.mac, sizeof(queued.mac));

  return xQueueSend(outboundQueue_, &queued, 0) == pdTRUE;
}

uint16_t WebPortal::connectedClientCount() const { return connectedClients_; }

void WebPortal::setupRoutes() {
  server_.on("/", HTTP_GET, [this]() {
    File file = LittleFS.open("/index.html", FILE_READ);
    if (!file) {
      server_.send(500, "text/plain", "Missing /index.html on LittleFS.");
      return;
    }
    server_.streamFile(file, "text/html");
    file.close();
  });

  server_.on("/api/state", HTTP_GET, [this]() { server_.send(200, "application/json", engine_->buildStateJson()); });

  server_.on("/api/logs", HTTP_GET, [this]() {
    const uint16_t limit = static_cast<uint16_t>(server_.hasArg("limit") ? server_.arg("limit").toInt() : 80);
    server_.send(200, "application/json", storage_->readRecentLogsJson(limit));
  });

  server_.on("/api/time", HTTP_GET, [this]() {
    DynamicJsonDocument doc(192);
    doc["epoch"] = timeKeeper_->nowEpoch();
    doc["valid"] = timeKeeper_->hasValidTime();
    doc["dayPhase"] = dayPhaseToText(timeKeeper_->currentDayPhase());
    String payload;
    serializeJson(doc, payload);
    server_.send(200, "application/json", payload);
  });

  auto setTimeHandler = [this]() {
    const String payload = handleSetTime(server_.arg("plain"));
    const int status = payload.indexOf("\"ok\":true") >= 0 ? 200 : 400;
    server_.send(status, "application/json", payload);
  };
  server_.on("/setTime", HTTP_POST, setTimeHandler);
  server_.on("/api/setTime", HTTP_POST, setTimeHandler);

  server_.onNotFound([this]() {
    if (server_.uri() == "/index.html") {
      File file = LittleFS.open("/index.html", FILE_READ);
      if (file) {
        server_.streamFile(file, "text/html");
        file.close();
        return;
      }
    }
    server_.send(404, "text/plain", "Not found");
  });
}

void WebPortal::handleWsEvent(uint8_t clientId, WStype_t type, uint8_t *payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED:
      onClientConnected(clientId);
      break;
    case WStype_DISCONNECTED:
      onClientDisconnected(clientId);
      break;
    case WStype_TEXT: {
      String message;
      message.reserve(length + 1);
      for (size_t i = 0; i < length; ++i) {
        message += static_cast<char>(payload[i]);
      }
      handleClientMessage(clientId, message);
      break;
    }
    default:
      break;
  }
}

void WebPortal::onClientConnected(uint8_t clientId) {
  const String detectedMac = resolveClientMac(clientId);
  if (clientId < clients_.size()) {
    if (contextMutex_ && xSemaphoreTake(contextMutex_, pdMS_TO_TICKS(40)) == pdTRUE) {
      clients_[clientId] = true;
      clientMacs_[clientId] = detectedMac;
      xSemaphoreGive(contextMutex_);
    } else {
      clients_[clientId] = true;
      clientMacs_[clientId] = detectedMac;
    }
  }
  connectedClients_ = recalcConnectedClients();
  updateClientCountInEngine();

  DynamicJsonDocument event(320);
  event["type"] = "TIMER";
  event["event"] = "client.connected";
  event["msg"] = "Web client connected.";
  event["ts"] = timeKeeper_->nowEpoch();
  event["channel"] = -1;
  event["mac"] = (clientId < clientMacs_.size() && !clientMacs_[clientId].isEmpty()) ? clientMacs_[clientId] : "UNKNOWN";
  String eventLine;
  serializeJson(event, eventLine);
  enqueueEvent(eventLine, false);

  pushStateSnapshot(clientId);
  flushPendingToClient(clientId);

  DynamicJsonDocument request(160);
  request["type"] = "time_request";
  request["msg"] = "Please send current time via time_sync or /setTime.";
  request["ts"] = timeKeeper_->nowEpoch();
  String requestLine;
  serializeJson(request, requestLine);
  sendToClient(clientId, requestLine);
}

void WebPortal::onClientDisconnected(uint8_t clientId) {
  String mac = "UNKNOWN";
  if (clientId < clients_.size()) {
    if (contextMutex_ && xSemaphoreTake(contextMutex_, pdMS_TO_TICKS(40)) == pdTRUE) {
      clients_[clientId] = false;
      mac = clientMacs_[clientId].isEmpty() ? "UNKNOWN" : clientMacs_[clientId];
      clientMacs_[clientId] = "";
      xSemaphoreGive(contextMutex_);
    } else {
      clients_[clientId] = false;
      mac = clientMacs_[clientId].isEmpty() ? "UNKNOWN" : clientMacs_[clientId];
      clientMacs_[clientId] = "";
    }
  }
  connectedClients_ = recalcConnectedClients();
  updateClientCountInEngine();

  DynamicJsonDocument event(320);
  event["type"] = "TIMER";
  event["event"] = "client.disconnected";
  event["msg"] = "Web client disconnected.";
  event["ts"] = timeKeeper_->nowEpoch();
  event["channel"] = -1;
  event["mac"] = mac;
  String eventLine;
  serializeJson(event, eventLine);
  enqueueEvent(eventLine, false);
}

void WebPortal::handleClientMessage(uint8_t clientId, const String &payload) {
  setCommandContext(clientId);
  CommandContextGuard guard(this);

  DynamicJsonDocument doc(640);
  DeserializationError err = deserializeJson(doc, payload);
  if (err) {
    sendCommandAck(clientId, false, "Invalid JSON payload.");
    return;
  }

  const String type = doc["type"] | "";
  if (type == "time_sync") {
    bool ok = false;
    if (doc["epoch"].is<uint64_t>()) {
      ok = timeKeeper_->syncFromClient(doc["epoch"].as<uint64_t>());
    } else if (doc["year"].is<int>() && doc["month"].is<int>() && doc["day"].is<int>()) {
      ok = timeKeeper_->syncFromDateTime(doc["year"] | 0,
                                         doc["month"] | 0,
                                         doc["day"] | 0,
                                         doc["hours"] | 0,
                                         doc["minutes"] | 0,
                                         doc["seconds"] | 0);
    } else {
      ok = timeKeeper_->syncFromHms(doc["hours"] | -1, doc["minutes"] | -1, doc["seconds"] | -1);
    }
    if (!ok) {
      sendCommandAck(clientId, false, "Invalid time_sync payload.");
      return;
    }
    sendCommandAck(clientId, true, "Time synchronized.");
    broadcast(engine_->buildStateJson());
    return;
  }

  if (type == "set_manual") {
    const size_t channel = static_cast<size_t>(doc["channel"] | 99);
    const RelayMode mode = relayModeFromText(doc["mode"] | "AUTO");
    String errorText;
    const bool ok = engine_->setManualMode(channel, mode, &errorText);
    sendCommandAck(clientId, ok, ok ? "Manual mode updated." : errorText);
    if (ok) {
      broadcast(engine_->buildStateJson());
    }
    return;
  }

  if (type == "set_timer") {
    const size_t channel = static_cast<size_t>(doc["channel"] | 99);
    uint32_t durationMinutes = doc["durationMinutes"] | 0;
    if (durationMinutes == 0 && doc["durationSec"].is<uint32_t>()) {
      const uint32_t durationSec = doc["durationSec"].as<uint32_t>();
      durationMinutes = max(1UL, (durationSec + 59UL) / 60UL);
    }
    const RelayState target = relayStateFromText(doc["target"] | "OFF");
    String errorText;
    const bool ok = engine_->setTimer(channel, durationMinutes, target, &errorText);
    sendCommandAck(clientId, ok, ok ? "Timer saved." : errorText);
    if (ok) {
      broadcast(engine_->buildStateJson());
    }
    return;
  }

  if (type == "cancel_timer") {
    const size_t channel = static_cast<size_t>(doc["channel"] | 99);
    const bool ok = engine_->cancelTimer(channel);
    sendCommandAck(clientId, ok, ok ? "Timer canceled." : "No active timer on this relay.");
    if (ok) {
      broadcast(engine_->buildStateJson());
    }
    return;
  }

  if (type == "set_interlock") {
    const bool enabled = doc["enabled"] | false;
    engine_->setInterlock(enabled);
    sendCommandAck(clientId, true, "Interlock updated.");
    broadcast(engine_->buildStateJson());
    return;
  }

  if (type == "get_state") {
    pushStateSnapshot(clientId);
    return;
  }

  sendCommandAck(clientId, false, "Unsupported command type.");
}

void WebPortal::sendToClient(uint8_t clientId, const String &json) { socket_.sendTXT(clientId, json); }

void WebPortal::broadcast(const String &json) { socket_.broadcastTXT(json); }

void WebPortal::flushPendingToClient(uint8_t clientId) {
  storage_->flushPending([&](const String &line) { sendToClient(clientId, line); });
}

void WebPortal::sendCommandAck(uint8_t clientId, bool ok, const String &message) {
  DynamicJsonDocument doc(256);
  doc["type"] = "command_ack";
  doc["ok"] = ok;
  doc["msg"] = message;
  doc["ts"] = timeKeeper_->nowEpoch();
  String payload;
  serializeJson(doc, payload);
  sendToClient(clientId, payload);
}

void WebPortal::pushStateSnapshot(uint8_t clientId) { sendToClient(clientId, engine_->buildStateJson()); }

void WebPortal::processQueue() {
  if (!outboundQueue_) {
    return;
  }

  QueuedEvent queued{};
  while (xQueueReceive(outboundQueue_, &queued, 0) == pdTRUE) {
    const String raw(queued.json);
    const String fallbackMac(queued.mac);

    // Normalize every event into a structured log schema and ensure MAC exists.
    // Stored JSON fields:
    //  - type: ON/OFF/TIMER/ERROR
    //  - relay: relay index, or -1 for system events
    //  - message: human-readable event text
    //  - time: HH:MM:SS (derived from timestamp)
    //  - ts: epoch seconds
    //  - mac: client MAC or SYSTEM
    const String normalized = normalizeLogPayload(raw, fallbackMac);

    storage_->appendEventJson(normalized);
    if (connectedClients_ > 0) {
      broadcast(normalized);
      if (eventNeedsSnapshot(normalized)) {
        broadcast(engine_->buildStateJson());
      }
      continue;
    }
    if (queued.bufferIfOffline) {
      storage_->appendPending(normalized);
    }
  }
}

String WebPortal::normalizeLogPayload(const String &rawJson, const String &fallbackMac) const {
  DynamicJsonDocument in(640);
  if (deserializeJson(in, rawJson)) {
    DynamicJsonDocument out(320);
    out["type"] = "ERROR";
    out["relay"] = -1;
    out["message"] = "Malformed log payload received.";
    out["msg"] = out["message"];
    out["ts"] = timeKeeper_->nowEpoch();
    out["time"] = formatEpochClock(out["ts"].as<uint64_t>());
    out["mac"] = fallbackMac.isEmpty() ? "SYSTEM" : fallbackMac;
    String payload;
    serializeJson(out, payload);
    return payload;
  }

  const uint64_t ts = in["ts"] | timeKeeper_->nowEpoch();
  const String type = in["type"] | "TIMER";
  const String message = in["message"] | (in["msg"] | "");
  const int relay = in["relay"].is<int>() ? in["relay"].as<int>() : (in["channel"].is<int>() ? in["channel"].as<int>() : -1);

  String mac = in["mac"] | "";
  if (mac.isEmpty()) {
    mac = fallbackMac;
  }
  if (mac.isEmpty()) {
    mac = "SYSTEM";
  }

  DynamicJsonDocument out(768);
  out["type"] = type;
  out["relay"] = relay;
  out["message"] = message;
  out["msg"] = message;       // keep backward compatibility with existing UI code
  out["ts"] = ts;
  out["time"] = formatEpochClock(ts);
  out["mac"] = mac;

  const String eventName = in["event"] | "";
  if (!eventName.isEmpty()) {
    out["event"] = eventName;
  }
  if (relay >= 0) {
    out["channel"] = relay;   // keep backward compatibility with existing consumers
  }

  String payload;
  serializeJson(out, payload);
  return payload;
}

String WebPortal::formatEpochClock(uint64_t epoch) const {
  if (epoch == 0) {
    return "--:--:--";
  }
  time_t raw = static_cast<time_t>(epoch);
  struct tm info;
#if defined(ESP32)
  if (!localtime_r(&raw, &info)) {
    return "--:--:--";
  }
#else
  info = *localtime(&raw);
#endif
  char buff[12];
  snprintf(buff, sizeof(buff), "%02d:%02d:%02d", info.tm_hour, info.tm_min, info.tm_sec);
  return String(buff);
}

void WebPortal::setCommandContext(uint8_t clientId) {
  String mac = resolveClientMac(clientId);
  if (mac.isEmpty()) {
    mac = "UNKNOWN";
  }
  if (clientId < clientMacs_.size()) {
    clientMacs_[clientId] = mac;
  }
  if (!contextMutex_) {
    return;
  }
  if (xSemaphoreTake(contextMutex_, pdMS_TO_TICKS(50)) != pdTRUE) {
    return;
  }
  commandContextActive_ = true;
  commandContextTask_ = xTaskGetCurrentTaskHandle();
  commandContextMac_ = mac;
  // Keep context briefly so control-task events generated right after a command
  // can still inherit the triggering client MAC in logs.
  commandContextExpiryMs_ = millis() + 1600;
  xSemaphoreGive(contextMutex_);
}

void WebPortal::clearCommandContext() {
  if (!contextMutex_) {
    return;
  }
  if (xSemaphoreTake(contextMutex_, pdMS_TO_TICKS(50)) != pdTRUE) {
    return;
  }
  // Do not clear MAC context immediately; expiry is handled in activeCommandMac().
  // This preserves MAC attribution for deferred events emitted from other tasks.
  commandContextTask_ = nullptr;
  xSemaphoreGive(contextMutex_);
}

String WebPortal::activeCommandMac() {
  if (!contextMutex_) {
    return "SYSTEM";
  }
  String mac = "SYSTEM";
  if (xSemaphoreTake(contextMutex_, pdMS_TO_TICKS(10)) != pdTRUE) {
    return mac;
  }
  const uint32_t nowMs = millis();
  const bool expired = commandContextActive_ && static_cast<int32_t>(nowMs - commandContextExpiryMs_) > 0;
  if (expired) {
    commandContextActive_ = false;
    commandContextMac_ = "SYSTEM";
    commandContextExpiryMs_ = 0;
  }
  if (commandContextActive_ && !commandContextMac_.isEmpty()) {
    mac = commandContextMac_;
  } else {
    // Fallback to any known connected client MAC when context is inactive.
    for (size_t i = 0; i < clients_.size(); ++i) {
      if (clients_[i] && !clientMacs_[i].isEmpty()) {
        mac = clientMacs_[i];
        break;
      }
    }
  }
  xSemaphoreGive(contextMutex_);
  return mac;
}

String WebPortal::resolveClientMac(uint8_t clientId) {
  // MAC capture strategy:
  // 1) Read WebSocket peer IP via socket_.remoteIP(clientId)
  // 2) Read ESP32 AP station table (MAC + IP) from Wi-Fi stack
  // 3) Match by IP and return the station MAC automatically
  // This avoids any frontend-provided MAC and keeps logging server-side.
  if (clientId < clientMacs_.size() && !clientMacs_[clientId].isEmpty()) {
    return clientMacs_[clientId];
  }

  const IPAddress remoteIp = socket_.remoteIP(clientId);
  wifi_sta_list_t wifiStaList;
  memset(&wifiStaList, 0, sizeof(wifiStaList));
  if (esp_wifi_ap_get_sta_list(&wifiStaList) != ESP_OK) {
    return "UNKNOWN";
  }

#if defined(ESP_IDF_VERSION_MAJOR) && (ESP_IDF_VERSION_MAJOR >= 5)
  esp_netif_sta_list_t netifStaList;
  memset(&netifStaList, 0, sizeof(netifStaList));
  if (esp_netif_get_sta_list(&wifiStaList, &netifStaList) == ESP_OK) {
    for (int i = 0; i < netifStaList.num; ++i) {
      const uint32_t addr = netifStaList.sta[i].ip.addr;
      const IPAddress normal = ipFromAddr(addr, false);
      const IPAddress reversed = ipFromAddr(addr, true);
      if (remoteIp == normal || remoteIp == reversed) {
        return formatMac(netifStaList.sta[i].mac);
      }
    }
  }
#else
  tcpip_adapter_sta_list_t adapterStaList;
  memset(&adapterStaList, 0, sizeof(adapterStaList));
  if (tcpip_adapter_get_sta_list(&wifiStaList, &adapterStaList) == ESP_OK) {
    for (int i = 0; i < adapterStaList.num; ++i) {
      const uint32_t addr = adapterStaList.sta[i].ip.addr;
      const IPAddress normal = ipFromAddr(addr, false);
      const IPAddress reversed = ipFromAddr(addr, true);
      if (remoteIp == normal || remoteIp == reversed) {
        return formatMac(adapterStaList.sta[i].mac);
      }
    }
  }
#endif

  // Fallback when a single AP station exists but IP mapping is unavailable.
  if (wifiStaList.num == 1) {
    return formatMac(wifiStaList.sta[0].mac);
  }
  return "UNKNOWN";
}

String WebPortal::formatMac(const uint8_t mac[6]) {
  if (!mac) {
    return "UNKNOWN";
  }
  char buff[20];
  snprintf(buff, sizeof(buff), "%02X:%02X:%02X:%02X:%02X:%02X", mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
  return String(buff);
}

IPAddress WebPortal::ipFromAddr(uint32_t addr, bool reverseOrder) {
  if (reverseOrder) {
    return IPAddress((addr)&0xFF, (addr >> 8) & 0xFF, (addr >> 16) & 0xFF, (addr >> 24) & 0xFF);
  }
  return IPAddress((addr >> 24) & 0xFF, (addr >> 16) & 0xFF, (addr >> 8) & 0xFF, (addr)&0xFF);
}

String WebPortal::handleSetTime(const String &body) {
  DynamicJsonDocument response(320);
  response["type"] = "set_time_ack";
  response["ok"] = false;

  DynamicJsonDocument doc(512);
  if (deserializeJson(doc, body)) {
    response["status"] = "ERROR";
    response["msg"] = "Invalid JSON body.";
    String payload;
    serializeJson(response, payload);
    return payload;
  }

  bool ok = false;
  if (doc["epoch"].is<uint64_t>()) {
    ok = timeKeeper_->syncFromClient(doc["epoch"].as<uint64_t>());
  } else if (doc["year"].is<int>() && doc["month"].is<int>() && doc["day"].is<int>()) {
    ok = timeKeeper_->syncFromDateTime(doc["year"] | 0,
                                       doc["month"] | 0,
                                       doc["day"] | 0,
                                       doc["hours"] | 0,
                                       doc["minutes"] | 0,
                                       doc["seconds"] | 0);
  } else {
    ok = timeKeeper_->syncFromHms(doc["hours"] | -1, doc["minutes"] | -1, doc["seconds"] | -1);
  }

  response["ok"] = ok;
  response["status"] = ok ? "OK" : "ERROR";
  response["epoch"] = timeKeeper_->nowEpoch();
  response["dayPhase"] = dayPhaseToText(timeKeeper_->currentDayPhase());
  response["msg"] = ok ? "Clock synchronized." : "Could not parse/validate supplied time.";

  if (ok) {
    DynamicJsonDocument event(256);
    event["type"] = "TIMER";
    event["event"] = "time.sync";
    event["msg"] = "Device time synced from web client.";
    event["ts"] = timeKeeper_->nowEpoch();
    event["channel"] = -1;
    event["mac"] = "SYSTEM";
    String line;
    serializeJson(event, line);
    enqueueEvent(line, false);
  }

  String payload;
  serializeJson(response, payload);
  return payload;
}

uint16_t WebPortal::recalcConnectedClients() {
  uint16_t count = 0;
  if (contextMutex_ && xSemaphoreTake(contextMutex_, pdMS_TO_TICKS(25)) == pdTRUE) {
    for (bool active : clients_) {
      if (active) {
        ++count;
      }
    }
    xSemaphoreGive(contextMutex_);
    return count;
  }
  for (bool active : clients_) {
    if (active) {
      ++count;
    }
  }
  return count;
}

void WebPortal::updateClientCountInEngine() { engine_->updateConnectedClients(connectedClients_); }

void WebPortal::onWsEventStatic(uint8_t clientId, WStype_t type, uint8_t *payload, size_t length) {
  if (instance_) {
    instance_->handleWsEvent(clientId, type, payload, length);
  }
}
