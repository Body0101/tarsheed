#include <Arduino.h>
#include <ArduinoJson.h>
#include <WiFi.h>
#include <esp_task_wdt.h>

#include "Config.h"
#include "ControlEngine.h"
#include "StorageLayer.h"
#include "SystemTypes.h"
#include "TimeKeeper.h"
#include "WebPortal.h"

StorageLayer gStorage;
TimeKeeper gTimeKeeper;
ControlEngine gControl;
WebPortal gWebPortal;

SystemRuntime gRuntime{};
SemaphoreHandle_t gStateMutex = nullptr;

TaskHandle_t gControlTaskHandle = nullptr;
TaskHandle_t gNetworkTaskHandle = nullptr;

String buildSystemEvent(const String &eventName, const String &message, const String &logType) {
  JsonDocument doc;
  doc["type"] = logType;
  doc["event"] = eventName;
  doc["msg"] = message;
  // Prefer the user-derived clock when available so system events line up with
  // timer and log timestamps after the first browser/device synchronization.
  const uint64_t eventTs = gTimeKeeper.nowUserEpoch() > 0 ? gTimeKeeper.nowUserEpoch() : gTimeKeeper.nowEpoch();
  doc["ts"] = eventTs;
  String payload;
  serializeJson(doc, payload);
  return payload;
}

void pushSystemEvent(const String &eventName, const String &message, bool bufferIfOffline = false, bool isError = false) {
  gWebPortal.enqueueEvent(buildSystemEvent(eventName, message, isError ? "ERROR" : "TIMER"), bufferIfOffline);
}

void initRuntimeDefaults() {
  memset(&gRuntime, 0, sizeof(gRuntime));
  gRuntime.interlockEnabled = false;
  gRuntime.energyTrackingEnabled = false;
  gRuntime.dayPhase = DayPhase::DAY;
  gRuntime.timeValid = false;
  gRuntime.nightLockActive = false;

  for (size_t i = 0; i < RELAY_COUNT; ++i) {
    gRuntime.relays[i].manualMode = RelayMode::AUTO;
    gRuntime.relays[i].appliedState = RelayState::OFF;
    gRuntime.relays[i].appliedSource = ControlSource::NONE;
    gRuntime.relays[i].timer.active = false;
    gRuntime.relays[i].timer.startEpoch = 0;
    gRuntime.relays[i].timer.endEpoch = 0;
    gRuntime.relays[i].timer.targetState = RelayState::OFF;
    gRuntime.relays[i].timer.previousState = RelayState::OFF;
    gRuntime.relays[i].timer.previousManualMode = RelayMode::AUTO;
    gRuntime.relays[i].timer.durationMinutes = 0;
    gRuntime.relays[i].timer.restorePending = false;
    gRuntime.relays[i].autoHoldUntilEpoch = 0;
    gRuntime.relays[i].ratedPowerWatts = RELAY_CONFIG[i].ratedPowerWatts;
    gRuntime.relays[i].ratedPowerLocked = false;
    gRuntime.relays[i].energyTrackingActive = false;
    gRuntime.relays[i].energyStartEpoch = 0;
    gRuntime.relays[i].stats.timerUses = 0;
    gRuntime.relays[i].stats.totalTimerMinutes = 0;
    gRuntime.relays[i].stats.accumulatedOnSeconds = 0;
    gRuntime.relays[i].stats.lastOnEpoch = 0;
    gRuntime.relays[i].stats.totalEnergyWh = 0.0f;
    gRuntime.relays[i].stats.lastEnergyWh = 0.0f;
  }

  for (size_t i = 0; i < PIR_COUNT; ++i) {
    gRuntime.pirs[i].rawValue = false;
    gRuntime.pirs[i].stableValue = false;
    gRuntime.pirs[i].lastChangeMs = 0;
    gRuntime.pirs[i].lastTriggerEpoch = 0;
    // PIR MAPPING START
    gRuntime.pirMap[i].relayA = (PIR_CONFIG[i].relayMask & 0x01U) != 0;
    gRuntime.pirMap[i].relayB = (PIR_CONFIG[i].relayMask & 0x02U) != 0;
    // PIR MAPPING END
  }
}

void onWiFiEvent(WiFiEvent_t event, WiFiEventInfo_t info) {
  (void)info;
  switch (event) {
    case ARDUINO_EVENT_WIFI_STA_CONNECTED:
      pushSystemEvent("wifi.sta_connected", "Connected to upstream Wi-Fi.");
      break;
    case ARDUINO_EVENT_WIFI_STA_GOT_IP:
      pushSystemEvent("wifi.sta_ip", String("STA IP: ") + WiFi.localIP().toString());
      break;
    case ARDUINO_EVENT_WIFI_STA_DISCONNECTED:
      pushSystemEvent("wifi.sta_disconnected", "Disconnected from upstream Wi-Fi.", false, true);
      break;
    case ARDUINO_EVENT_WIFI_AP_STACONNECTED:
      pushSystemEvent("wifi.ap_client_connected", "A device joined the ESP32 AP.");
      break;
    case ARDUINO_EVENT_WIFI_AP_STADISCONNECTED:
      pushSystemEvent("wifi.ap_client_disconnected", "A device left the ESP32 AP.");
      break;
    default:
      break;
  }
}

void setupWiFi() {
  WiFi.mode(WIFI_AP_STA);
  // Keep credentials/runtime Wi-Fi state in RAM only so reconnect attempts do
  // not generate extra flash churn or stale network state across brownouts.
  WiFi.persistent(false);
  // Disable Wi-Fi sleep so websocket and AP responsiveness stay stable under
  // bursts of commands and frequent browser interaction.
  WiFi.setSleep(false);
  WiFi.setAutoReconnect(true);
  WiFi.onEvent(onWiFiEvent);

  const bool apOk = WiFi.softAP(AP_SSID, AP_PASSWORD);
  if (apOk) {
    Serial.printf("[WiFi] AP ready SSID=%s IP=%s\n", AP_SSID, WiFi.softAPIP().toString().c_str());
  } else {
    Serial.println("[WiFi] Failed to start AP mode.");
  }

  if (strlen(STA_SSID) > 0) {
    WiFi.begin(STA_SSID, STA_PASSWORD);
    Serial.printf("[WiFi] Connecting STA to %s\n", STA_SSID);
  } else {
    Serial.println("[WiFi] STA credentials empty; running AP-only until configured.");
  }
}

void maintainWiFi() {
  static uint32_t lastApCheckMs = 0;
  static uint32_t lastStaReconnectMs = 0;
  const uint32_t nowMs = millis();

  if (nowMs - lastApCheckMs >= 2500UL) {
    lastApCheckMs = nowMs;
    if (WiFi.softAPIP() == IPAddress(0, 0, 0, 0)) {
      // Re-assert the AP mode before restart so the captive portal and websocket
      // server stay reachable even after transient Wi-Fi stack faults.
      WiFi.mode(WIFI_AP_STA);
      WiFi.setSleep(false);
      if (WiFi.softAP(AP_SSID, AP_PASSWORD)) {
        pushSystemEvent("wifi.ap_restarted", "SoftAP restarted automatically after a connection failure.", false, true);
      }
    }
  }

  if (strlen(STA_SSID) > 0 && WiFi.status() != WL_CONNECTED && (nowMs - lastStaReconnectMs) >= 10000UL) {
    lastStaReconnectMs = nowMs;
    // Retry STA reconnection without blocking the network task. A soft reconnect
    // is attempted first, then a full begin() refresh if the station is still down.
    WiFi.reconnect();
    if (WiFi.status() != WL_CONNECTED) {
      WiFi.disconnect(false, false);
      WiFi.begin(STA_SSID, STA_PASSWORD);
    }
  }
}

void initWatchdog() {
#if defined(ESP_IDF_VERSION_MAJOR) && (ESP_IDF_VERSION_MAJOR >= 5)
  esp_task_wdt_config_t config = {
      .timeout_ms = WATCHDOG_TIMEOUT_SECONDS * 1000,
      .idle_core_mask = (1 << portNUM_PROCESSORS) - 1,
      .trigger_panic = true,
  };
  esp_err_t result = esp_task_wdt_init(&config);
#else
  esp_err_t result = esp_task_wdt_init(WATCHDOG_TIMEOUT_SECONDS, true);
#endif
  if (result != ESP_OK && result != ESP_ERR_INVALID_STATE) {
    Serial.printf("[WDT] init warning: %d\n", result);
  }
}

void controlTask(void *parameter) {
  (void)parameter;
  esp_task_wdt_add(NULL);
  while (true) {
    gControl.tickFast();
    esp_task_wdt_reset();
    vTaskDelay(pdMS_TO_TICKS(CONTROL_TASK_PERIOD_MS));
  }
}

void networkTask(void *parameter) {
  (void)parameter;
  esp_task_wdt_add(NULL);
  uint32_t lastHousekeeping = 0;
  while (true) {
    gWebPortal.loop();
    maintainWiFi();
    gTimeKeeper.trySyncFromNtp();
    gTimeKeeper.maybePersistSyncPoint();

    const uint32_t nowMs = millis();
    if (nowMs - lastHousekeeping >= HOUSEKEEPING_PERIOD_MS) {
      lastHousekeeping = nowMs;
      gControl.tickHousekeeping();
    }
    esp_task_wdt_reset();
    vTaskDelay(pdMS_TO_TICKS(WEB_TASK_PERIOD_MS));
  }
}

void setup() {
  Serial.begin(115200);
  delay(200);

  initRuntimeDefaults();
  gStateMutex = xSemaphoreCreateMutex();
  if (!gStateMutex) {
    Serial.println("[Init] Failed to allocate state mutex.");
    while (true) {
      delay(1000);
    }
  }

  if (!gStorage.begin()) {
    Serial.println("[Init] LittleFS/Preferences initialization failed.");
    while (true) {
      delay(1000);
    }
  }
  gStorage.loadRuntime(&gRuntime);

  gTimeKeeper.begin(gStorage.prefs());

  setupWiFi();
  initWatchdog();

  gControl.begin(&gRuntime, &gStorage, &gTimeKeeper, gStateMutex);
  gWebPortal.begin(&gControl, &gStorage, &gTimeKeeper);
  gControl.setEventCallback([](const String &json, bool bufferIfOffline) {
    gWebPortal.enqueueEvent(json, bufferIfOffline);
  });

  pushSystemEvent("system.boot", "System boot completed.");
  gControl.refreshOutputs();

  xTaskCreatePinnedToCore(controlTask, "control_task", 8192, nullptr, 2, &gControlTaskHandle, 1);
  xTaskCreatePinnedToCore(networkTask, "network_task", 12288, nullptr, 1, &gNetworkTaskHandle, 0);
}

void loop() {
  // Main loop remains idle because FreeRTOS tasks own runtime behavior.
  delay(1000);
}
