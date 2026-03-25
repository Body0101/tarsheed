#pragma once

#include <Arduino.h>
#include <WebServer.h>
#include <WebSocketsServer.h>
#include <array>

#include "Config.h"
#include "ControlEngine.h"
#include "StorageLayer.h"
#include "TimeKeeper.h"

class WebPortal {
 public:
  void begin(ControlEngine *engine, StorageLayer *storage, TimeKeeper *timeKeeper);
  void loop();

  bool enqueueEvent(const String &eventJson, bool bufferIfOffline);
  uint16_t connectedClientCount() const;

 private:
  struct QueuedEvent {
    bool bufferIfOffline;
    char json[400];
    char mac[20];
  };

  struct CommandContextGuard {
    explicit CommandContextGuard(WebPortal *portal) : portal_(portal) {}
    ~CommandContextGuard();
    WebPortal *portal_ = nullptr;
  };

  void setupRoutes();
  void handleWsEvent(uint8_t clientId, WStype_t type, uint8_t *payload, size_t length);
  void onClientConnected(uint8_t clientId);
  void onClientDisconnected(uint8_t clientId);
  void handleClientMessage(uint8_t clientId, const String &payload);
  void sendToClient(uint8_t clientId, const String &json);
  void broadcast(const String &json);
  void flushPendingToClient(uint8_t clientId);
  void sendCommandAck(uint8_t clientId, bool ok, const String &message);
  void pushStateSnapshot(uint8_t clientId);
  void processQueue();
  String normalizeLogPayload(const String &rawJson, const String &fallbackMac) const;
  String formatEpochClock(uint64_t epoch) const;
  void setCommandContext(uint8_t clientId);
  void clearCommandContext();
  String activeCommandMac();
  String resolveClientMac(uint8_t clientId);
  static String formatMac(const uint8_t mac[6]);
  static IPAddress ipFromAddr(uint32_t addr, bool reverseOrder);
  String handleSetTime(const String &body);
  uint16_t recalcConnectedClients();
  void updateClientCountInEngine();

  static void onWsEventStatic(uint8_t clientId, WStype_t type, uint8_t *payload, size_t length);
  static WebPortal *instance_;

  ControlEngine *engine_ = nullptr;
  StorageLayer *storage_ = nullptr;
  TimeKeeper *timeKeeper_ = nullptr;

  WebServer server_{HTTP_PORT};
  WebSocketsServer socket_{WS_PORT};
  QueueHandle_t outboundQueue_ = nullptr;
  SemaphoreHandle_t contextMutex_ = nullptr;
  std::array<bool, WS_MAX_CLIENTS> clients_{};
  std::array<String, WS_MAX_CLIENTS> clientMacs_{};
  uint16_t connectedClients_ = 0;
  bool commandContextActive_ = false;
  TaskHandle_t commandContextTask_ = nullptr;
  String commandContextMac_ = "SYSTEM";
  uint32_t commandContextExpiryMs_ = 0;
};
