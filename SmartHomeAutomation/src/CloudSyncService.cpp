#include "CloudSyncService.h"

#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <cstring>
#include <initializer_list>

#include "Config.h"
#include "Utils.h"

namespace {
constexpr uint32_t RELAY_CLOUD_RATE_LIMIT_MS = 250;

// Supabase currently presents certificates chaining to ISRG Root X1 for
// *.supabase.co. Keeping a CA pinned is safer than setInsecure().
constexpr char SUPABASE_ROOT_CA[] PROGMEM = R"EOF(
-----BEGIN CERTIFICATE-----
MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRGPgu2OCiwAwDQYJKoZIhvcNAQELBQAw
TzELMAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVybmV0IFNlY3VyaXR5IFJlc2Vh
cmNoIEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3QgWDEwHhcNMTUwNjA0MTEwNDM4
WhcNMzUwNjA0MTEwNDM4WjBPMQswCQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJu
ZXQgU2VjdXJpdHkgUmVzZWFyY2ggR3JvdXAxFTATBgNVBAMTDElTUkcgUm9vdCBY
MTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAK3oJHP0FDfzm54rVygc
h77ct984kIxuPOZXoHj3dcKi/vVqbvYATyjb3miGbESTtrFj/RQSa78f0uoxmyF+
0TM8ukj13Xnfs7j/EvEhmkvBioZxaUpmZmyPfjxwv60pIgbz5MDmgK7iS4+3mX6U
A5/TR5d8mUgjU+g4rk8Kb4Mu0UlXjIB0ttov0DiNewNwIRt18jA8+o+u3dpjq+sW
T8KOEUt+zwvo/7V3LvSye0rgTBIlDHCNAymg4VMk7BPZ7hm/ELNKjD+Jo2FR3qyH
B5T0Y3HsLuJvW5iB4YlcNHlsdu87kGJ55tukmi8mxdAQ4Q7e2RCOFvu396j3x+UC
B5iPNgiV5+I3lg02dZ77DnKxHZu8A/lJBdiB3QW0KtZB6awBdpUKD9jf1b0SHzUv
KBds0pjBqAlkd25HN7rOrFleaJ1/ctaJxQZBKT5ZPt0m9STJEadao0xAH0ahmbWn
OlFuhjuefXKnEgV4We0+UXgVCwOPjdAvBbI+e0ocS3MFEvzG6uBQE3xDk3SzynTn
jh8BCNAw1FtxNrQHusEwMFxIt4I7mKZ9YIqioymCzLq9gwQbooMDQaHWBfEbwrbw
qHyGO0aoSCqI3Haadr8faqU9GY/rOPNk3sgrDQoo//fb4hVC1CLQJ13hef4Y53CI
rU7m2Ys6xt0nUW7/vGT1M0NPAgMBAAGjQjBAMA4GA1UdDwEB/wQEAwIBBjAPBgNV
HRMBAf8EBTADAQH/MB0GA1UdDgQWBBR5tFnme7bl5AFzgAiIyBpY9umbbjANBgkq
hkiG9w0BAQsFAAOCAgEAVR9YqbyyqFDQDLHYGmkgJykIrGF1XIpu+ILlaS/V9lZL
ubhzEFnTIZd+50xx+7LSYK05qAvqFyFWhfFQDlnrzuBZ6brJFe+GnY+EgPbk6ZGQ
3BebYhtF8GaV0nxvwuo77x/Py9auJ/GpsMiu/X1+mvoiBOv/2X/qkSsisRcOj/KK
NFtY2PwByVS5uCbMiogziUwthDyC3+6WVwW6LLv3xLfHTjuCvjHIInNzktHCgKQ5
ORAzI4JMPJ+GslWYHb4phowim57iaztXOoJwTdwJx4nLCgdNbOhdjsnvzqvHu7Ur
TkXWStAmzOVyyghqpZXjFaH3pO3JLF+l+/+sKAIuvtd7u+Nxe5AW0wdeRlN8NwdC
jNPElpzVmbUq4JUagEiuTDkHzsxHpFKVK7q4+63SM1N95R1NbdWhscdCb+ZAJzVc
oyi3B43njTOQ5yOf+1CceWxG1bQVs5ZufpsMljq4Ui0/1lvh+wjChP4kqKOJ2qxq
4RgqsahDYVvTH9w7jXbyLeiNdd8XM2w9U/t7y0Ff/9yi0GE44Za4rF2LN9d11TPA
mRGunUHBcnWEvgJBQl9nJEiU0Zsnvgc/ubhPgXRR4Xq37Z0j4r7g1SgEEzwxA57d
emyPxgcYxn/eR44/KJ4EBs+lVDR3veyJm+kXQ99b21/+jh5Xos1AnX5iItreGCc=
-----END CERTIFICATE-----
)EOF";

String trimmedSupabaseUrl() {
  String url = SUPABASE_URL;
  while (url.endsWith("/")) {
    url.remove(url.length() - 1);
  }
  return url;
}

bool isCloudEnabledAtBuild() {
#if CLOUD_SYNC_ENABLED
  return true;
#else
  return false;
#endif
}

String u64ToString(uint64_t value) {
  char buffer[24];
  snprintf(buffer, sizeof(buffer), "%llu", static_cast<unsigned long long>(value));
  return String(buffer);
}
}  // namespace

void CloudSyncService::begin(ControlEngine *engine, StorageLayer *storage, TimeKeeper *timeKeeper) {
  engine_ = engine;
  storage_ = storage;
  timeKeeper_ = timeKeeper;
  configured_ = isCloudEnabledAtBuild() && strlen(SUPABASE_URL) > 0 && strlen(SUPABASE_PUBLISHABLE_KEY) > 0;
  if (!configured_) {
    Serial.println("[Cloud] Disabled. Offline/local mode remains primary.");
    return;
  }
  eventQueue_ = xQueueCreate(CLOUD_EVENT_QUEUE_LENGTH, sizeof(QueuedCloudEvent));
  configured_ = eventQueue_ != nullptr;
  if (!configured_) {
    Serial.println("[Cloud] Failed to allocate event queue; cloud sync disabled.");
    return;
  }
  Serial.printf("[Cloud] Enabled for device_id=%s\n", deviceId().c_str());
}

bool CloudSyncService::isConfigured() const { return configured_; }

bool CloudSyncService::enqueueLocalEvent(const String &eventJson) {
  if (!configured_ || !eventQueue_) {
    return false;
  }
  QueuedCloudEvent queued{};
  eventJson.substring(0, sizeof(queued.json) - 1).toCharArray(queued.json, sizeof(queued.json));
  stateDirty_ = true;
  if (xQueueSend(eventQueue_, &queued, 0) == pdTRUE) {
    return true;
  }
  QueuedCloudEvent dropped{};
  xQueueReceive(eventQueue_, &dropped, 0);
  return xQueueSend(eventQueue_, &queued, 0) == pdTRUE;
}

void CloudSyncService::loop() {
  if (!configured_) {
    return;
  }

  processRealtimeEventQueue();

  if (!networkReady()) {
    return;
  }

  const uint32_t nowMs = millis();
  if (nowMs - lastQueueFlushMs_ >= CLOUD_QUEUE_FLUSH_INTERVAL_MS) {
    lastQueueFlushMs_ = nowMs;
    flushStoredEventQueue();
  }
  if (stateDirty_ || nowMs - lastStateSyncMs_ >= CLOUD_STATE_SYNC_INTERVAL_MS) {
    if (syncStateSnapshot()) {
      stateDirty_ = false;
      lastStateSyncMs_ = nowMs;
    }
  }
  if (nowMs - lastCommandPollMs_ >= CLOUD_COMMAND_POLL_INTERVAL_MS) {
    lastCommandPollMs_ = nowMs;
    pollRemoteCommands();
  }
}

bool CloudSyncService::networkReady() const {
  return WiFi.status() == WL_CONNECTED;
}

String CloudSyncService::deviceId() {
  if (!deviceId_.isEmpty()) {
    return deviceId_;
  }
  deviceId_ = CLOUD_DEVICE_ID;
  if (deviceId_.isEmpty()) {
    deviceId_ = "esp32-";
    String mac = WiFi.softAPmacAddress();
    mac.replace(":", "");
    mac.toLowerCase();
    deviceId_ += mac;
  }
  return deviceId_;
}

String CloudSyncService::restPath(const String &tablePath) const {
  return trimmedSupabaseUrl() + "/rest/v1/" + tablePath;
}

String CloudSyncService::jsonString(const String &value) const {
  String out = "\"";
  for (size_t i = 0; i < value.length(); ++i) {
    const char c = value[i];
    if (c == '"' || c == '\\') {
      out += '\\';
      out += c;
    } else if (c == '\n') {
      out += "\\n";
    } else if (c == '\r') {
      out += "\\r";
    } else {
      out += c;
    }
  }
  out += "\"";
  return out;
}

String CloudSyncService::urlEncode(const String &value) const {
  const char hex[] = "0123456789ABCDEF";
  String out;
  for (size_t i = 0; i < value.length(); ++i) {
    const uint8_t c = static_cast<uint8_t>(value[i]);
    if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') ||
        c == '-' || c == '_' || c == '.' || c == '~') {
      out += static_cast<char>(c);
    } else {
      out += '%';
      out += hex[(c >> 4) & 0x0F];
      out += hex[c & 0x0F];
    }
  }
  return out;
}

uint64_t CloudSyncService::nowEpoch() const {
  if (!timeKeeper_) {
    return 0;
  }
  const uint64_t userEpoch = timeKeeper_->nowUserEpoch();
  return userEpoch > 0 ? userEpoch : timeKeeper_->nowEpoch();
}

bool CloudSyncService::httpRequest(const char *method,
                                   const String &path,
                                   const String &body,
                                   int *statusCode,
                                   String *response,
                                   const char *preferHeader) {
  if (!configured_ || !networkReady() || !method || strlen(method) == 0) {
    return false;
  }

  WiFiClientSecure client;
  client.setCACert(SUPABASE_ROOT_CA);
  client.setTimeout((CLOUD_HTTP_TIMEOUT_MS + 999UL) / 1000UL);

  HTTPClient http;
  http.setReuse(false);
  http.setTimeout(CLOUD_HTTP_TIMEOUT_MS);
  if (!http.begin(client, restPath(path))) {
    return false;
  }
  http.addHeader("apikey", SUPABASE_PUBLISHABLE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_PUBLISHABLE_KEY);
  http.addHeader("Content-Type", "application/json");
  if (preferHeader && strlen(preferHeader) > 0) {
    http.addHeader("Prefer", preferHeader);
  }

  const int code = body.isEmpty() ? http.sendRequest(method) : http.sendRequest(method, body);
  if (statusCode) {
    *statusCode = code;
  }
  if (response) {
    response->remove(0);
    if (code > 0) {
      *response = http.getString();
      if (response->length() > CLOUD_MAX_RESPONSE_BYTES) {
        *response = response->substring(0, CLOUD_MAX_RESPONSE_BYTES);
      }
    }
  }
  http.end();
  return code >= 200 && code < 300;
}

bool CloudSyncService::sendEventToCloud(const String &eventJson) {
  if (eventJson.isEmpty()) {
    return true;
  }
  JsonDocument eventDoc;
  if (deserializeJson(eventDoc, eventJson)) {
    return false;
  }
  const String eventName = eventDoc["event"] | "unknown";
  const int channel = eventDoc["channel"] | -1;
  const uint64_t eventTs = eventDoc["ts"] | nowEpoch();

  String dedupe = deviceId() + ":" + u64ToString(eventTs) + ":" + eventName + ":" + String(channel);
  String body;
  body.reserve(eventJson.length() + 180);
  body += "[{\"device_id\":";
  body += jsonString(deviceId());
  body += ",\"event\":";
  body += jsonString(eventName);
  body += ",\"event_ts\":";
  body += u64ToString(eventTs);
  body += ",\"dedupe_key\":";
  body += jsonString(dedupe);
  body += ",\"payload\":";
  body += eventJson;
  body += "}]";

  int code = 0;
  const bool ok = httpRequest("POST", "device_events", body, &code, nullptr, "return=minimal");
  return ok || code == 409;
}

bool CloudSyncService::syncStateSnapshot() {
  if (!engine_) {
    return false;
  }
  const String stateJson = engine_->buildStateJson();
  String body;
  body.reserve(stateJson.length() + 140);
  body += "[{\"device_id\":";
  body += jsonString(deviceId());
  body += ",\"updated_epoch\":";
  body += u64ToString(nowEpoch());
  body += ",\"state\":";
  body += stateJson;
  body += "}]";

  int code = 0;
  return httpRequest("POST",
                     "device_states?on_conflict=device_id",
                     body,
                     &code,
                     nullptr,
                     "resolution=merge-duplicates,return=minimal");
}

void CloudSyncService::processRealtimeEventQueue() {
  if (!eventQueue_) {
    return;
  }
  QueuedCloudEvent queued{};
  uint8_t processed = 0;
  while (processed < 3 && xQueueReceive(eventQueue_, &queued, 0) == pdTRUE) {
    const String line(queued.json);
    if (!networkReady() || !sendEventToCloud(line)) {
      if (shouldPersistEventForCloud(line) && storage_) {
        storage_->appendCloudQueue(line);
      }
    }
    ++processed;
  }
}

void CloudSyncService::flushStoredEventQueue() {
  if (!storage_) {
    return;
  }
  String line;
  if (!storage_->readCloudQueueHead(&line)) {
    return;
  }
  if (sendEventToCloud(line)) {
    storage_->dropCloudQueueHead();
  }
}

bool CloudSyncService::shouldPersistEventForCloud(const String &eventJson) const {
  JsonDocument doc;
  if (deserializeJson(doc, eventJson)) {
    return false;
  }
  const String event = doc["event"] | "";
  // PIR activity is live telemetry only. Do not persist PIR event history to
  // flash, preserving the existing bounded-storage policy.
  return event != "pir.motion" && event != "pir.idle" && event != "energy_update" &&
         event != "client.connected" && event != "client.disconnected";
}

bool CloudSyncService::validateCommandToken(JsonObjectConst command) const {
  if (strlen(CLOUD_COMMAND_TOKEN) == 0) {
    return true;
  }
  const char *token = command["token"] | "";
  return strcmp(token, CLOUD_COMMAND_TOKEN) == 0;
}

bool CloudSyncService::commandHasOnlyAllowedKeys(JsonObjectConst command,
                                                std::initializer_list<const char *> allowedKeys) const {
  if (command.isNull()) {
    return false;
  }
  for (JsonPairConst pair : command) {
    const char *key = pair.key().c_str();
    bool allowed = false;
    for (const char *allowedKey : allowedKeys) {
      if (strcmp(key, allowedKey) == 0) {
        allowed = true;
        break;
      }
    }
    if (!allowed) {
      return false;
    }
  }
  return true;
}

bool CloudSyncService::rateLimitRelayCommand(size_t relayIndex) {
  if (relayIndex >= RELAY_COUNT) {
    return true;
  }
  const uint32_t nowMs = millis();
  if (lastRelayCommandMs_[relayIndex] != 0 &&
      static_cast<uint32_t>(nowMs - lastRelayCommandMs_[relayIndex]) < RELAY_CLOUD_RATE_LIMIT_MS) {
    return true;
  }
  lastRelayCommandMs_[relayIndex] = nowMs;
  return false;
}

bool CloudSyncService::applyRemoteCommand(const String &commandId, JsonObjectConst command, String *resultMessage) {
  (void)commandId;
  if (!engine_ || command.isNull()) {
    if (resultMessage) *resultMessage = "Invalid command.";
    return false;
  }
  if (!validateCommandToken(command)) {
    if (resultMessage) *resultMessage = "Invalid cloud command token.";
    return false;
  }

  const String type = command["type"] | "";
  if (type == "set_manual") {
    if (!commandHasOnlyAllowedKeys(command, {"type", "channel", "mode", "token"})) {
      if (resultMessage) *resultMessage = "Invalid manual command.";
      return false;
    }
    const int channelValue = command["channel"] | -1;
    const String modeText = command["mode"] | "";
    if (channelValue < 0 || static_cast<size_t>(channelValue) >= RELAY_COUNT ||
        !(modeText == "ON" || modeText == "OFF" || modeText == "AUTO")) {
      if (resultMessage) *resultMessage = "Invalid manual command.";
      return false;
    }
    const size_t channel = static_cast<size_t>(channelValue);
    if (rateLimitRelayCommand(channel)) {
      if (resultMessage) *resultMessage = "Relay command rate limited.";
      return false;
    }
    return engine_->setManualMode(channel, relayModeFromText(modeText), resultMessage);
  }

  if (type == "set_timer") {
    if (!commandHasOnlyAllowedKeys(command, {"type", "channel", "durationMinutes", "durationSec", "target", "epoch", "token"})) {
      if (resultMessage) *resultMessage = "Invalid timer command.";
      return false;
    }
    const int channelValue = command["channel"] | -1;
    const String targetText = command["target"] | "";
    if (channelValue < 0 || static_cast<size_t>(channelValue) >= RELAY_COUNT || !(targetText == "ON" || targetText == "OFF")) {
      if (resultMessage) *resultMessage = "Invalid timer command.";
      return false;
    }
    if (command["epoch"].is<uint64_t>() && timeKeeper_) {
      const uint64_t epoch = command["epoch"].as<uint64_t>();
      if (epoch >= 1700000000ULL) {
        timeKeeper_->syncFromClient(epoch);
      }
    }
    uint32_t durationMinutes = command["durationMinutes"] | 0;
    if (durationMinutes == 0 && command["durationSec"].is<uint32_t>()) {
      const uint32_t durationSec = command["durationSec"].as<uint32_t>();
      durationMinutes = max(1UL, (durationSec + 59UL) / 60UL);
    }
    return engine_->setTimer(static_cast<size_t>(channelValue), durationMinutes, relayStateFromText(targetText), resultMessage);
  }

  if (type == "cancel_timer") {
    if (!commandHasOnlyAllowedKeys(command, {"type", "channel", "token"})) {
      if (resultMessage) *resultMessage = "Invalid cancel command.";
      return false;
    }
    const int channelValue = command["channel"] | -1;
    if (channelValue < 0 || static_cast<size_t>(channelValue) >= RELAY_COUNT) {
      if (resultMessage) *resultMessage = "Invalid cancel command.";
      return false;
    }
    const bool ok = engine_->cancelTimer(static_cast<size_t>(channelValue));
    if (!ok && resultMessage) *resultMessage = "No active timer on this relay.";
    return ok;
  }

  if (type == "set_energy_tracking") {
    if (!commandHasOnlyAllowedKeys(command, {"type", "enabled", "token"}) || !command["enabled"].is<bool>()) {
      if (resultMessage) *resultMessage = "Invalid energy tracking command.";
      return false;
    }
    return engine_->setEnergyTrackingEnabled(command["enabled"].as<bool>(), resultMessage);
  }

  if (type == "get_state") {
    if (!commandHasOnlyAllowedKeys(command, {"type", "token"})) {
      if (resultMessage) *resultMessage = "Invalid state command.";
      return false;
    }
    stateDirty_ = true;
    if (resultMessage) *resultMessage = "State sync requested.";
    return true;
  }

  if (resultMessage) *resultMessage = "Unsupported cloud command.";
  return false;
}

bool CloudSyncService::markRemoteCommand(const String &commandId, const char *status, bool ok, const String &message) {
  if (commandId.isEmpty() || !status) {
    return false;
  }
  String body = "{\"status\":";
  body += jsonString(status);
  if (strcmp(status, "done") == 0 || strcmp(status, "failed") == 0) {
    body += ",\"processed_epoch\":";
    body += u64ToString(nowEpoch());
    body += ",\"result\":{\"ok\":";
    body += ok ? "true" : "false";
    body += ",\"msg\":";
    body += jsonString(message);
    body += "}";
  }
  body += "}";
  String path = "remote_commands?id=eq.";
  path += urlEncode(commandId);
  path += "&device_id=eq.";
  path += urlEncode(deviceId());
  return httpRequest("PATCH", path, body, nullptr, nullptr, "return=minimal");
}

void CloudSyncService::pollRemoteCommands() {
  String path = "remote_commands?select=id,command&device_id=eq.";
  path += urlEncode(deviceId());
  path += "&status=eq.pending&order=created_at.asc&limit=";
  path += String(CLOUD_MAX_COMMANDS_PER_POLL);

  String response;
  int code = 0;
  if (!httpRequest("GET", path, "", &code, &response) || code != 200 || response.isEmpty()) {
    return;
  }

  JsonDocument doc;
  if (deserializeJson(doc, response)) {
    return;
  }
  JsonArrayConst rows = doc.as<JsonArrayConst>();
  if (rows.isNull()) {
    return;
  }

  for (JsonVariantConst rowVariant : rows) {
    JsonObjectConst row = rowVariant.as<JsonObjectConst>();
    const String commandId = row["id"] | "";
    JsonObjectConst command = row["command"].as<JsonObjectConst>();
    if (commandId.isEmpty() || command.isNull()) {
      continue;
    }

    // Mark first. If the network cannot reserve the command, do not execute it;
    // this avoids duplicate timer/relay actions after transient reconnects.
    if (!markRemoteCommand(commandId, "processing", false, "Processing")) {
      continue;
    }

    String result;
    const bool ok = applyRemoteCommand(commandId, command, &result);
    if (result.isEmpty()) {
      result = ok ? "Command applied." : "Command failed.";
    }
    markRemoteCommand(commandId, ok ? "done" : "failed", ok, result);
    storage_->saveStringSetting(CLOUD_LAST_COMMAND_KEY, commandId);
    if (ok) {
      stateDirty_ = true;
    }
  }
}
