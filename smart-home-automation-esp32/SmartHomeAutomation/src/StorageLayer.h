#pragma once

#include <Arduino.h>
#include <LittleFS.h>
#include <Preferences.h>
#include <functional>

#include "SystemTypes.h"

class StorageLayer {
 public:
  bool begin();
  Preferences *prefs();

  void loadRuntime(SystemRuntime *runtime);
  void persistManualMode(size_t relayIndex, RelayMode mode);
  void persistRelayState(size_t relayIndex, RelayState state, ControlSource source);
  void persistTimer(size_t relayIndex, const TimerPlan &plan);
  void persistRelayStats(size_t relayIndex, const RelayStats &stats);
  void persistRelayEnergyStats(size_t relayIndex, float totalEnergyWh, float lastEnergyWh);
  void persistRatedPower(size_t relayIndex, float watts, bool locked);
  // PIR MAPPING START
  void persistPirMapping(size_t pirIndex, const PIRMapping &mapping);
  // PIR MAPPING END
  void persistInterlock(bool enabled);
  void persistEnergyTrackingEnabled(bool enabled);
  void persistLastCleanupDay(uint32_t dayToken);
  uint32_t loadLastCleanupDay();

  void appendEvent(uint64_t epoch, const String &type, const String &message, int channel = -1);
  void appendEventJson(const String &jsonLine);
  void appendPending(const String &jsonLine);
  String readRecentLogsJson(uint16_t limit) const;
  void flushPending(const std::function<void(const String &line)> &sender);
  void cleanupDaily(uint64_t nowEpoch);

 private:
  bool lock() const;
  void unlock() const;
  void appendLine(const char *path, const String &line) const;
  void trimFileBySize(const char *path, uint32_t maxBytes) const;
  bool parseEpochFromLine(const String &line, uint64_t *epochOut) const;
  void compactByAge(const char *path, uint64_t minEpochToKeep) const;

  Preferences preferences_;
  mutable SemaphoreHandle_t ioMutex_ = nullptr;
};
