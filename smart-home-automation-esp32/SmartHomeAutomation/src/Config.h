#pragma once

#include "SystemTypes.h"

#ifndef ALLOW_RATED_RESET
#define ALLOW_RATED_RESET false
#endif

constexpr char AP_SSID[] = "ESP32-SmartHome";
constexpr char AP_PASSWORD[] = "12345678";

// Keep blank if no infrastructure Wi-Fi is available.
constexpr char STA_SSID[] = "";
constexpr char STA_PASSWORD[] = "";

constexpr RelayConfig RELAY_CONFIG[RELAY_COUNT] = {
    {26, "Relay A", 60.0f},
    {27, "Relay B", 100.0f},
};

// Most 2-channel ESP32 relay boards are active-low:
// LOW energizes the relay, HIGH releases it.
// Keeping this configurable here lets the rest of the control logic
// use natural ON/OFF semantics without inverting button behavior.
constexpr bool RELAY_ACTIVE_LOW = true;

constexpr PirConfig PIR_CONFIG[PIR_COUNT] = {
    {32, 0b01, "PIR A"},  // drives Relay A
    {33, 0b10, "PIR B"},  // drives Relay B
    {25, 0b11, "PIR C"},  // shared area drives both relays
};

constexpr uint32_t CONTROL_TASK_PERIOD_MS = 50;
constexpr uint32_t WEB_TASK_PERIOD_MS = 10;
constexpr uint32_t PIR_DEBOUNCE_MS = 180;
constexpr uint32_t PIR_HOLD_SECONDS = 20;
constexpr uint32_t HOUSEKEEPING_PERIOD_MS = 1500;

constexpr uint32_t LOG_MAX_BYTES = 120 * 1024;
constexpr uint32_t PENDING_MAX_BYTES = 48 * 1024;
constexpr uint16_t LOG_FETCH_MAX_ITEMS = 200;
constexpr uint8_t LOG_RETENTION_DAYS = 2;
constexpr uint32_t STATS_FLUSH_INTERVAL_SECONDS = 300;

constexpr uint8_t DAY_START_HOUR = 6;
constexpr uint8_t NIGHT_START_HOUR = 18;

constexpr uint16_t HTTP_PORT = 80;
constexpr uint16_t WS_PORT = 81;
constexpr uint8_t WS_MAX_CLIENTS = 8;

constexpr uint8_t WATCHDOG_TIMEOUT_SECONDS = 12;

constexpr char PREF_NAMESPACE[] = "smart_home";
constexpr char FILE_LOGS[] = "/logs.jsonl";
constexpr char FILE_PENDING[] = "/pending.jsonl";
