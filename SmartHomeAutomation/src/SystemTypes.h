#pragma once

#include <Arduino.h>

constexpr size_t RELAY_COUNT = 2;
constexpr size_t PIR_COUNT = 3;
// ACCESS CONTROL START
constexpr size_t MAX_USER_ACCOUNTS = 16;
constexpr size_t MAX_MAC_LENGTH = 18;
constexpr size_t MAX_NAME_LENGTH = 32;
// FIX BUG-AUTH: SHA-256 hex requires 64 chars + 1 null terminator = 65 bytes.
// The previous value of 64 forced strncpy(..., MAX_PASSWORD_LENGTH - 1) to
// truncate every stored hash to 63 chars, so authenticateUser could never
// match the freshly-recomputed 64-char hash. See loadUserAccounts() and the
// /api/auth/addUser handler.
constexpr size_t MAX_PASSWORD_LENGTH = 65;

enum class RelayMode : uint8_t { OFF = 0, ON = 1, AUTO = 2 };
enum class RelayState : uint8_t { OFF = 0, ON = 1 };
enum class ControlSource : uint8_t { NONE = 0, PIR = 1, TIMER = 2, MANUAL = 3 };
enum class DayPhase : uint8_t { DAY = 0, NIGHT = 1 };

struct RelayConfig {
  uint8_t relayPin;
  const char *name;
  float ratedPowerWatts;
};

struct PirConfig {
  uint8_t pin;
  uint8_t relayMask;  // bitmask where bit0 => relay0, bit1 => relay1
  const char *name;
};

// PIR MAPPING START
struct PIRMapping {
  bool relayA;
  bool relayB;
};
// PIR MAPPING END

struct TimerPlan {
  bool active;
  uint64_t startEpoch;
  uint64_t endEpoch;
  RelayState targetState;
  RelayState previousState;
  RelayMode previousManualMode;
  uint32_t durationMinutes;
  bool restorePending;
};

struct RelayStats {
  uint32_t timerUses;
  uint32_t totalTimerMinutes;
  uint64_t accumulatedOnSeconds;
  uint64_t lastOnEpoch;
  float totalEnergyWh;
  float lastEnergyWh;
};

struct RelayRuntime {
  RelayMode manualMode;
  RelayState appliedState;
  ControlSource appliedSource;
  TimerPlan timer;
  uint64_t autoHoldUntilEpoch;
  float ratedPowerWatts;
  bool ratedPowerLocked;
  bool energyTrackingActive;
  uint64_t energyStartEpoch;
  RelayStats stats;
};

struct PirRuntime {
  bool rawValue;
  bool stableValue;
  uint32_t lastChangeMs;
  uint64_t lastTriggerEpoch;
};

struct SystemRuntime {
  RelayRuntime relays[RELAY_COUNT];
  PirRuntime pirs[PIR_COUNT];
  // PIR MAPPING START
  PIRMapping pirMap[PIR_COUNT];
  // PIR MAPPING END
  bool energyTrackingEnabled;
  uint16_t connectedClients;
  DayPhase dayPhase;
  bool timeValid;
  bool nightLockActive;
};

struct UserAccount {
  char macAddress[MAX_MAC_LENGTH];    // "AA:BB:CC:DD:EE:FF"
  char displayName[MAX_NAME_LENGTH];  // Friendly name
  char passwordHash[MAX_PASSWORD_LENGTH]; // SHA256 hex string
  bool isAdmin;
  bool canManageUsers;
  // RESTRICTED MODE: when true, this user is always redirected to the
  // restricted page (relay+timer only) and cannot access the full dashboard.
  bool restricted;
  uint64_t createdAt;
  uint64_t lastAccess;
};

struct AccessControlRuntime {
  UserAccount users[MAX_USER_ACCOUNTS];
  uint8_t userCount;
  bool enabled;
};
// ACCESS CONTROL END
