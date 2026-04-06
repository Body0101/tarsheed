#include "WebPortal.h"

#include <ArduinoJson.h>
#include <LittleFS.h>
#include <WiFi.h>
#include <cstring>
#include <esp_idf_version.h>
#include <esp_netif.h>
#include <esp_wifi.h>
#include <time.h>

#include "Utils.h"

namespace {
bool eventNeedsSnapshot(const String &jsonLine) {
  JsonDocument doc;
  if (deserializeJson(doc, jsonLine)) {
    return false;
  }
  const String event = doc["event"] | "";
  return event == "relay.changed" || event == "timer.started" || event == "timer.ended" || event == "timer.canceled" ||
         event == "manual.changed" || event == "mode.changed" ||
         event == "client.connected" || event == "client.disconnected" ||
         event == "pir.motion" || event == "pir.idle" ||
         event == "night_lock.activated" || event == "night_lock.released" || event == "relay.night_forced_off" ||
         event == "energy_update" || event == "energy_tracking.changed";
}

bool shouldRateLimitRelayCommand(size_t relayIndex) {
  constexpr uint32_t RELAY_COMMAND_RATE_LIMIT_MS = 120UL;
  static uint32_t lastRelayCommandMs[RELAY_COUNT] = {};

  if (relayIndex >= RELAY_COUNT) {
    return false;
  }

  const uint32_t nowMs = millis();
  if (lastRelayCommandMs[relayIndex] != 0 &&
      static_cast<uint32_t>(nowMs - lastRelayCommandMs[relayIndex]) < RELAY_COMMAND_RATE_LIMIT_MS) {
    return true;
  }

  lastRelayCommandMs[relayIndex] = nowMs;
  return false;
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
  inboundQueue_ = xQueueCreate(24, sizeof(QueuedCommand));
  contextMutex_ = xSemaphoreCreateMutex();
  clients_.fill(false);
  clientMacs_.fill("");
  connectedClients_ = 0;
  lastClientRefreshMs_ = 0;
  stateBroadcastPending_ = false;

  setupRoutes();
  server_.begin();

  instance_ = this;
  socket_.begin();
  // Heartbeat disconnects stale sockets quickly so dead peers do not keep
  // accumulating failed writes during bursts of events/commands.
  socket_.enableHeartbeat(15000, 3500, 2);
  socket_.onEvent(onWsEventStatic);
  // CAPTIVE PORTAL START
  beginCaptivePortal();
  // CAPTIVE PORTAL END
}

void WebPortal::recoverAfterAccessPointRestart() {
  // Clear stale client/session state first so reconnecting browsers start from a
  // clean AP view after the Wi-Fi stack is rebuilt.
  clients_.fill(false);
  clientMacs_.fill("");
  connectedClients_ = 0;
  stateBroadcastPending_ = false;
  updateClientCountInEngine();

  // Restart listeners after AP recovery so HTTP, WebSocket, and captive DNS all
  // bind again without changing the rest of the project flow.
  server_.begin();
  socket_.begin();
  socket_.onEvent(onWsEventStatic);
  beginCaptivePortal();
}

void WebPortal::loop() {
  // CAPTIVE PORTAL START
  ensureCaptivePortal();
  if (captivePortalEnabled_) {
    dnsServer_.processNextRequest();
  }
  // CAPTIVE PORTAL END
  server_.handleClient();
  socket_.loop();
  // Reconcile active websocket sessions against the live AP station list so the
  // client count reflects only currently connected devices.
  if (millis() - lastClientRefreshMs_ >= 1000UL) {
    lastClientRefreshMs_ = millis();
    syncConnectedClients(true);
  }
  processInboundCommands();
  processQueue();
  processPendingStateBroadcast();
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

  if (xQueueSend(outboundQueue_, &queued, 0) == pdTRUE) {
    return true;
  }

  // Keep the queue moving under bursts by dropping the oldest unsent event
  // instead of blocking the network task or crashing the websocket callback.
  QueuedEvent dropped{};
  xQueueReceive(outboundQueue_, &dropped, 0);
  return xQueueSend(outboundQueue_, &queued, 0) == pdTRUE;
}

uint16_t WebPortal::connectedClientCount() const { return connectedClients_; }

void WebPortal::setupRoutes() {
  // CAPTIVE PORTAL START
  auto captiveProbeHandler = [this]() { sendCaptivePortalResponse(200); };
  server_.on("/fwlink", HTTP_ANY, captiveProbeHandler);
  server_.on("/generate_204", HTTP_ANY, captiveProbeHandler);
  server_.on("/gen_204", HTTP_ANY, captiveProbeHandler);
  server_.on("/hotspot-detect.html", HTTP_ANY, captiveProbeHandler);
  server_.on("/connecttest.txt", HTTP_ANY, captiveProbeHandler);
  server_.on("/library/test/success.html", HTTP_ANY, captiveProbeHandler);
  server_.on("/success.txt", HTTP_ANY, captiveProbeHandler);
  server_.on("/canonical.html", HTTP_ANY, captiveProbeHandler);
  server_.on("/redirect", HTTP_ANY, captiveProbeHandler);
  server_.on("/ncsi.txt", HTTP_ANY, captiveProbeHandler);
  // CAPTIVE PORTAL END

  server_.on("/", HTTP_GET, [this]() {
    // If a phone or desktop browser requested some external host that DNS
    // hijacked back to the ESP32, bounce it to the actual SoftAP URL.
    if (shouldRedirectToCaptivePortal()) {
      sendCaptivePortalResponse(302);
      return;
    }
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
    JsonDocument doc;
    const uint64_t apiEpoch = timeKeeper_->nowUserEpoch() > 0 ? timeKeeper_->nowUserEpoch() : timeKeeper_->nowEpoch();
    doc["epoch"] = apiEpoch;
    doc["valid"] = timeKeeper_->hasValidTime();
    doc["userValid"] = timeKeeper_->hasUserTime();
    doc["dayPhase"] = dayPhaseToText(timeKeeper_->currentDayPhase());
    String payload;
    serializeJson(doc, payload);
    server_.send(200, "application/json", payload);
  });

  // PIR MAPPING START
  server_.on("/api/pirMapping", HTTP_POST, [this]() {
    JsonDocument response;
    response["ok"] = false;

    JsonDocument doc;
    if (deserializeJson(doc, server_.arg("plain"))) {
      response["msg"] = "Invalid JSON body.";
      String payload;
      serializeJson(response, payload);
      server_.send(400, "application/json", payload);
      return;
    }

    JsonArray mappingsJson = doc["mappings"].as<JsonArray>();
    if (mappingsJson.isNull() || mappingsJson.size() != PIR_COUNT) {
      response["msg"] = "Expected one mapping entry per PIR.";
      String payload;
      serializeJson(response, payload);
      server_.send(400, "application/json", payload);
      return;
    }

    PIRMapping mappings[PIR_COUNT]{};
    for (size_t i = 0; i < PIR_COUNT; ++i) {
      JsonObject item = mappingsJson[i];
      mappings[i].relayA = item["relayA"] | false;
      mappings[i].relayB = item["relayB"] | false;
    }

    String errorText;
    const bool ok = engine_->setPirMapping(mappings, &errorText);
    response["ok"] = ok;
    response["msg"] = ok ? "Sensor mapping saved." : errorText;
    String payload;
    serializeJson(response, payload);
    server_.send(ok ? 200 : 400, "application/json", payload);
    if (ok) {
      scheduleStateBroadcast();
    }
  });
  // PIR MAPPING END

  // POWER RESET START
  server_.on("/api/resetConsumption", HTTP_POST, [this]() {
    String errorText;
    const bool ok = engine_->resetConsumption(&errorText);

    JsonDocument doc;
    doc["ok"] = ok;
    doc["msg"] = ok ? "Consumption counters reset." : errorText;
    String payload;
    serializeJson(doc, payload);
    server_.send(ok ? 200 : 400, "application/json", payload);
  });
  // POWER RESET END

  // RATED DYNAMIC START
  server_.on("/api/ratedPower", HTTP_POST, [this]() {
    JsonDocument response;
    response["ok"] = false;

    JsonDocument doc;
    if (deserializeJson(doc, server_.arg("plain"))) {
      response["msg"] = "Invalid JSON body.";
      String payload;
      serializeJson(response, payload);
      server_.send(400, "application/json", payload);
      return;
    }

    const size_t channel = static_cast<size_t>(doc["channel"] | 99);
    const float powerW = doc["powerW"] | 0.0f;
    String errorText;
    const bool ok = engine_->setRatedPower(channel, powerW, &errorText);

    response["ok"] = ok;
    response["msg"] = ok ? "Rated power saved." : errorText;
    String payload;
    serializeJson(response, payload);
    server_.send(ok ? 200 : 400, "application/json", payload);
  });
  // RATED DYNAMIC END

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
    // CAPTIVE PORTAL START
    sendCaptivePortalResponse(302);
    // CAPTIVE PORTAL END
  });
}

// CAPTIVE PORTAL START
void WebPortal::beginCaptivePortal() {
  const IPAddress apIp = WiFi.softAPIP();
  if (apIp == IPAddress(0, 0, 0, 0)) {
    captivePortalEnabled_ = false;
    captivePortalIp_ = IPAddress(0, 0, 0, 0);
    return;
  }

  dnsServer_.stop();
  dnsServer_.setErrorReplyCode(DNSReplyCode::NoError);
  captivePortalIp_ = apIp;
  captivePortalEnabled_ = dnsServer_.start(53, "*", apIp);
}

void WebPortal::ensureCaptivePortal() {
  const IPAddress apIp = WiFi.softAPIP();
  if (apIp == IPAddress(0, 0, 0, 0)) {
    if (captivePortalEnabled_) {
      dnsServer_.stop();
      captivePortalEnabled_ = false;
      captivePortalIp_ = IPAddress(0, 0, 0, 0);
    }
    return;
  }

  // Restart DNS hijack automatically after AP restarts or IP changes so
  // captive redirection stays reliable without rebooting the ESP32.
  if (!captivePortalEnabled_ || captivePortalIp_ != apIp) {
    beginCaptivePortal();
  }
}

String WebPortal::captivePortalUrl() const {
  const IPAddress apIp = WiFi.softAPIP();
  if (apIp == IPAddress(0, 0, 0, 0)) {
    return "http://192.168.4.1/";
  }
  return String("http://") + apIp.toString() + "/";
}

bool WebPortal::shouldRedirectToCaptivePortal() {
  const String host = server_.hostHeader();
  if (host.isEmpty()) {
    return false;
  }

  const String apIp = WiFi.softAPIP().toString();
  if (host.equalsIgnoreCase(apIp) || host.equalsIgnoreCase(apIp + ":80")) {
    return false;
  }
  if (host.equalsIgnoreCase("localhost") || host.equalsIgnoreCase("esp32") || host.equalsIgnoreCase("esp32.local")) {
    return false;
  }
  return true;
}

void WebPortal::sendCaptivePortalResponse(int httpCode) {
  const String redirectUrl = captivePortalUrl();
  server_.sendHeader("Cache-Control", "no-cache, no-store, must-revalidate", true);
  server_.sendHeader("Pragma", "no-cache", true);
  server_.sendHeader("Expires", "0", true);
  if (httpCode >= 300 && httpCode < 400) {
    server_.sendHeader("Location", redirectUrl, true);
  }

  String html;
  html.reserve(320);
  html += "<!doctype html><html><head><meta charset='utf-8'>";
  html += "<meta name='viewport' content='width=device-width,initial-scale=1'>";
  html += "<meta http-equiv='refresh' content='0; url=";
  html += redirectUrl;
  html += "'>";
  html += "<title>ESP32 Portal</title></head><body>";
  html += "<script>window.location.replace('";
  html += redirectUrl;
  html += "');</script>";
  html += "<p>Opening portal... <a href='";
  html += redirectUrl;
  html += "'>Continue</a></p></body></html>";

  server_.send(httpCode, "text/html", html);
}
// CAPTIVE PORTAL END

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
      enqueueInboundCommand(clientId, message);
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
  syncConnectedClients(true);

  const uint64_t eventTs = timeKeeper_->nowUserEpoch() > 0 ? timeKeeper_->nowUserEpoch() : timeKeeper_->nowEpoch();

  JsonDocument event;
  event["type"] = "TIMER";
  event["event"] = "client.connected";
  event["msg"] = "Web client connected.";
  event["ts"] = eventTs;
  event["channel"] = -1;
  event["mac"] = (clientId < clientMacs_.size() && !clientMacs_[clientId].isEmpty()) ? clientMacs_[clientId] : "UNKNOWN";
  String eventLine;
  serializeJson(event, eventLine);
  enqueueEvent(eventLine, false);

  pushStateSnapshot(clientId);
  flushPendingToClient(clientId);

  JsonDocument request;
  request["type"] = "time_request";
  request["msg"] = "Please send current time via time_sync or /setTime.";
  request["ts"] = eventTs;
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
  syncConnectedClients(true);

  const uint64_t eventTs = timeKeeper_->nowUserEpoch() > 0 ? timeKeeper_->nowUserEpoch() : timeKeeper_->nowEpoch();

  JsonDocument event;
  event["type"] = "TIMER";
  event["event"] = "client.disconnected";
  event["msg"] = "Web client disconnected.";
  event["ts"] = eventTs;
  event["channel"] = -1;
  event["mac"] = mac;
  String eventLine;
  serializeJson(event, eventLine);
  enqueueEvent(eventLine, false);
}

bool WebPortal::enqueueInboundCommand(uint8_t clientId, const String &payload) {
  if (!inboundQueue_) {
    return false;
  }

  // get_state can be spammed by reconnects and UI refreshes. Coalesce it so
  // status traffic does not starve higher-value control commands.
  if (payload.indexOf("\"type\":\"get_state\"") >= 0 && stateBroadcastPending_) {
    return true;
  }

  QueuedCommand queued{};
  queued.clientId = clientId;
  payload.substring(0, sizeof(queued.json) - 1).toCharArray(queued.json, sizeof(queued.json));

  if (xQueueSend(inboundQueue_, &queued, 0) == pdTRUE) {
    return true;
  }

  // When overloaded, prefer keeping the newest command and freeing space by
  // dropping the oldest queued request rather than blocking the websocket loop.
  QueuedCommand dropped{};
  xQueueReceive(inboundQueue_, &dropped, 0);
  const bool queuedOk = xQueueSend(inboundQueue_, &queued, 0) == pdTRUE;
  if (!queuedOk && socket_.clientIsConnected(clientId)) {
    sendCommandAck(clientId, false, "Controller busy, please retry.");
  }
  return queuedOk;
}

void WebPortal::handleClientMessage(uint8_t clientId, const String &payload) {
  setCommandContext(clientId);
  CommandContextGuard guard(this);

  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, payload);
  if (err) {
    sendCommandAck(clientId, false, "Invalid JSON payload.");
    return;
  }

  const String type = doc["type"] | "";
  if (type == "time_sync") {
    const bool ok = applyTimeSyncFromJson(doc, true);
    if (!ok) {
      sendCommandAck(clientId, false, "Invalid time_sync payload.");
      return;
    }
    sendCommandAck(clientId, true, "Time synchronized.");
    scheduleStateBroadcast();
    return;
  }

  if (type == "set_manual") {
    const size_t channel = static_cast<size_t>(doc["channel"] | 99);
    const RelayMode mode = relayModeFromText(doc["mode"] | "AUTO");
    if (shouldRateLimitRelayCommand(channel)) {
      sendCommandAck(clientId, false, "Relay command rate limited, please retry.");
      return;
    }
    String errorText;
    const bool ok = engine_->setManualMode(channel, mode, &errorText);
    if (!ok && errorText == "Night Lock Active") {
      // Explicit reject payload requested by frontend for ON commands during night lock.
      JsonDocument errDoc;
      errDoc["error"] = "Night Lock Active";
      String errPayload;
      serializeJson(errDoc, errPayload);
      sendToClient(clientId, errPayload);
      pushStateSnapshot(clientId);
      return;
    }
    sendCommandAck(clientId, ok, ok ? "Manual mode updated." : errorText);
    if (ok) {
      scheduleStateBroadcast();
    }
    return;
  }

  if (type == "set_timer") {
    // Timer start should refresh the controller clock from the latest device time when present,
    // so persisted start/end timestamps stay anchored to the user device instead of stale sync state.
    if (!applyTimeSyncFromJson(doc, false)) {
      sendCommandAck(clientId, false, "Invalid time fields in timer request.");
      return;
    }
    const size_t channel = static_cast<size_t>(doc["channel"] | 99);
    uint32_t durationMinutes = doc["durationMinutes"] | 0;
    if (durationMinutes == 0 && doc["durationSec"].is<uint32_t>()) {
      const uint32_t durationSec = doc["durationSec"].as<uint32_t>();
      durationMinutes = max(1UL, (durationSec + 59UL) / 60UL);
    }
    const RelayState target = relayStateFromText(doc["target"] | "OFF");
    String errorText;
    const bool ok = engine_->setTimer(channel, durationMinutes, target, &errorText);
    if (!ok && errorText == "Night Lock Active") {
      // Explicit reject payload requested by frontend when Night Lock blocks
      // timer creation entirely on the backend.
      JsonDocument errDoc;
      errDoc["error"] = "Night Lock Active";
      String errPayload;
      serializeJson(errDoc, errPayload);
      sendToClient(clientId, errPayload);
      pushStateSnapshot(clientId);
      return;
    }
    sendCommandAck(clientId, ok, ok ? "Timer saved." : errorText);
    if (ok) {
      scheduleStateBroadcast();
    }
    return;
  }

  if (type == "cancel_timer") {
    const size_t channel = static_cast<size_t>(doc["channel"] | 99);
    const bool ok = engine_->cancelTimer(channel);
    sendCommandAck(clientId, ok, ok ? "Timer canceled." : "No active timer on this relay.");
    if (ok) {
      scheduleStateBroadcast();
    }
    return;
  }

  if (type == "set_energy_tracking") {
    const bool enabled = doc["enabled"] | false;
    String errorText;
    const bool ok = engine_->setEnergyTrackingEnabled(enabled, &errorText);
    sendCommandAck(clientId, ok, ok ? String("Energy tracking ") + (enabled ? "enabled." : "disabled.") : errorText);
    if (ok) {
      scheduleStateBroadcast();
    }
    return;
  }

  if (type == "get_state") {
    pushStateSnapshot(clientId);
    return;
  }

  sendCommandAck(clientId, false, "Unsupported command type.");
}

void WebPortal::sendToClient(uint8_t clientId, const String &json) {
  if (clientId >= clients_.size()) {
    return;
  }
  if (!socket_.clientIsConnected(clientId)) {
    clients_[clientId] = false;
    clientMacs_[clientId] = "";
    syncConnectedClients(false);
    return;
  }
  // WebSockets API expects mutable String references.
  String payload = json;
  if (!socket_.sendTXT(clientId, payload)) {
    clients_[clientId] = false;
    clientMacs_[clientId] = "";
    socket_.disconnect(clientId);
    syncConnectedClients(false);
  }
}

void WebPortal::broadcast(const String &json) {
  if (connectedClients_ == 0) {
    return;
  }
  // WebSockets API expects mutable String references.
  String payload = json;
  if (!socket_.broadcastTXT(payload)) {
    syncConnectedClients(false);
  }
}

void WebPortal::flushPendingToClient(uint8_t clientId) {
  storage_->flushPending([&](const String &line) { sendToClient(clientId, line); });
}

void WebPortal::sendCommandAck(uint8_t clientId, bool ok, const String &message) {
  JsonDocument doc;
  doc["type"] = "command_ack";
  doc["ok"] = ok;
  doc["msg"] = message;
  const uint64_t ackTs = timeKeeper_->nowUserEpoch() > 0 ? timeKeeper_->nowUserEpoch() : timeKeeper_->nowEpoch();
  doc["ts"] = ackTs;
  String payload;
  serializeJson(doc, payload);
  sendToClient(clientId, payload);
}

void WebPortal::pushStateSnapshot(uint8_t clientId) { sendToClient(clientId, engine_->buildStateJson()); }

void WebPortal::processInboundCommands() {
  if (!inboundQueue_) {
    return;
  }

  // Process only a bounded number of inbound websocket commands per loop so
  // traffic spikes cannot monopolize the network task and starve Wi-Fi.
  uint8_t processed = 0;
  QueuedCommand queued{};
  while (processed < 4 && xQueueReceive(inboundQueue_, &queued, 0) == pdTRUE) {
    const String payload(queued.json);
    handleClientMessage(queued.clientId, payload);
    ++processed;
  }
}

void WebPortal::processQueue() {
  if (!outboundQueue_) {
    return;
  }

  bool snapshotNeeded = false;
  uint8_t processed = 0;
  QueuedEvent queued{};
  while (processed < 6 && xQueueReceive(outboundQueue_, &queued, 0) == pdTRUE) {
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
        snapshotNeeded = true;
      }
    } else if (queued.bufferIfOffline) {
      storage_->appendPending(normalized);
    }
    ++processed;
  }

  if (snapshotNeeded) {
    scheduleStateBroadcast();
  }
}

void WebPortal::scheduleStateBroadcast() { stateBroadcastPending_ = true; }

void WebPortal::processPendingStateBroadcast() {
  if (!stateBroadcastPending_ || connectedClients_ == 0) {
    return;
  }
  stateBroadcastPending_ = false;
  broadcast(engine_->buildStateJson());
}

bool WebPortal::applyTimeSyncFromJson(const JsonDocument &doc, bool requireClockFields) {
  if (!doc["tzOffsetMinutes"].isNull()) {
    if (!doc["tzOffsetMinutes"].is<int>() ||
        !timeKeeper_->setTimezoneOffsetMinutes(doc["tzOffsetMinutes"].as<int32_t>())) {
      return false;
    }
  }

  if (doc["epoch"].is<uint64_t>()) {
    return timeKeeper_->syncFromClient(doc["epoch"].as<uint64_t>());
  }
  if (doc["year"].is<int>() && doc["month"].is<int>() && doc["day"].is<int>()) {
    return timeKeeper_->syncFromDateTime(doc["year"] | 0,
                                         doc["month"] | 0,
                                         doc["day"] | 0,
                                         doc["hours"] | 0,
                                         doc["minutes"] | 0,
                                         doc["seconds"] | 0);
  }
  if (doc["hours"].is<int>() || doc["minutes"].is<int>() || doc["seconds"].is<int>()) {
    return timeKeeper_->syncFromHms(doc["hours"] | -1, doc["minutes"] | -1, doc["seconds"] | -1);
  }

  return !requireClockFields;
}

String WebPortal::normalizeLogPayload(const String &rawJson, const String &fallbackMac) const {
  JsonDocument in;
  if (deserializeJson(in, rawJson)) {
    JsonDocument out;
    out["type"] = "ERROR";
    out["relay"] = -1;
    out["message"] = "Malformed log payload received.";
    out["msg"] = out["message"];
    const uint64_t fallbackTs = timeKeeper_->nowUserEpoch() > 0 ? timeKeeper_->nowUserEpoch() : timeKeeper_->nowEpoch();
    out["ts"] = fallbackTs;
    out["time"] = formatEpochClock(out["ts"].as<uint64_t>());
    out["mac"] = fallbackMac.isEmpty() ? "SYSTEM" : fallbackMac;
    String payload;
    serializeJson(out, payload);
    return payload;
  }

  uint64_t ts = in["ts"].is<uint64_t>() ? in["ts"].as<uint64_t>() : 0;
  if (ts < 1700000000ULL) {
    // Repair zero/invalid timestamps before persisting them so retention and timer logs
    // stay comparable even when an event is emitted before the clock is refreshed.
    ts = timeKeeper_->nowUserEpoch() > 0 ? timeKeeper_->nowUserEpoch() : timeKeeper_->nowEpoch();
  }
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

  JsonDocument out;
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
  if (in["lastWh"].is<float>() || in["lastWh"].is<double>()) {
    out["lastWh"] = in["lastWh"].as<float>();
  }
  if (in["totalWh"].is<float>() || in["totalWh"].is<double>()) {
    out["totalWh"] = in["totalWh"].as<float>();
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
  JsonDocument response;
  response["type"] = "set_time_ack";
  response["ok"] = false;

  JsonDocument doc;
  if (deserializeJson(doc, body)) {
    response["status"] = "ERROR";
    response["msg"] = "Invalid JSON body.";
    String payload;
    serializeJson(response, payload);
    return payload;
  }

  const bool ok = applyTimeSyncFromJson(doc, true);

  response["ok"] = ok;
  response["status"] = ok ? "OK" : "ERROR";
  response["epoch"] = timeKeeper_->nowEpoch();
  response["dayPhase"] = dayPhaseToText(timeKeeper_->currentDayPhase());
  response["msg"] = ok ? "Clock synchronized." : "Could not parse/validate supplied time.";

  if (ok) {
    JsonDocument event;
    event["type"] = "TIMER";
    event["event"] = "time.sync";
    event["msg"] = "Device time synced from web client.";
    event["ts"] = timeKeeper_->nowUserEpoch() > 0 ? timeKeeper_->nowUserEpoch() : timeKeeper_->nowEpoch();
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
  wifi_sta_list_t wifiStaList;
  memset(&wifiStaList, 0, sizeof(wifiStaList));
  const bool haveStationList = esp_wifi_ap_get_sta_list(&wifiStaList) == ESP_OK;

  std::array<String, WS_MAX_CLIENTS> countedDevices{};
  uint16_t count = 0;

  if (contextMutex_ && xSemaphoreTake(contextMutex_, pdMS_TO_TICKS(25)) == pdTRUE) {
    for (size_t i = 0; i < clients_.size(); ++i) {
      if (!clients_[i]) {
        continue;
      }

      if (clientMacs_[i].isEmpty() || clientMacs_[i] == "UNKNOWN") {
        clientMacs_[i] = resolveClientMac(static_cast<uint8_t>(i));
      }

      bool stationActive = !haveStationList;
      if (haveStationList) {
        stationActive = false;
        for (int s = 0; s < wifiStaList.num; ++s) {
          if (clientMacs_[i].equalsIgnoreCase(formatMac(wifiStaList.sta[s].mac))) {
            stationActive = true;
            break;
          }
        }
      }

      // Drop stale websocket sessions that no longer exist in the AP station list.
      if (!stationActive) {
        clients_[i] = false;
        clientMacs_[i] = "";
        continue;
      }

      String deviceKey = clientMacs_[i];
      if (deviceKey.isEmpty() || deviceKey == "UNKNOWN") {
        deviceKey = String("ws:") + String(i);
      }

      bool seen = false;
      for (size_t existing = 0; existing < count; ++existing) {
        if (countedDevices[existing].equalsIgnoreCase(deviceKey)) {
          seen = true;
          break;
        }
      }
      if (!seen && count < WS_MAX_CLIENTS) {
        countedDevices[count++] = deviceKey;
      }
    }
    xSemaphoreGive(contextMutex_);
  } else {
    // If the mutex is temporarily busy, keep the last known live count instead of
    // falsely dropping to zero and forcing a spurious AUTO/Night Lock UI transition.
    return connectedClients_;
  }
  return count;
}

void WebPortal::syncConnectedClients(bool broadcastSnapshot) {
  const uint16_t liveCount = recalcConnectedClients();
  if (liveCount == connectedClients_) {
    return;
  }

  connectedClients_ = liveCount;
  updateClientCountInEngine();

  // Push the authoritative state to every remaining client whenever the live
  // device count changes so all UIs stay aligned on mode/night-lock state.
  if (broadcastSnapshot && connectedClients_ > 0) {
    scheduleStateBroadcast();
  }
}

void WebPortal::updateClientCountInEngine() { engine_->updateConnectedClients(connectedClients_); }

void WebPortal::onWsEventStatic(uint8_t clientId, WStype_t type, uint8_t *payload, size_t length) {
  if (instance_) {
    instance_->handleWsEvent(clientId, type, payload, length);
  }
}
