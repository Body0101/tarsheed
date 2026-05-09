# Online/Offline Mode Switching Guide

## Table of Contents

1. [Overview](#overview)
2. [Mode Detection Logic](#mode-detection-logic)
3. [Offline Mode Operation](#offline-mode-operation)
4. [Online Mode Operation](#online-mode-operation)
5. [Mode Switching Process](#mode-switching-process)
6. [State Synchronization](#state-synchronization)
7. [Configuration Management](#configuration-management)
8. [Troubleshooting](#troubleshooting)
9. [Implementation Details](#implementation-details)

## Overview

The ESP32 Smart Home Automation system seamlessly operates in two distinct modes:

- **Offline Mode**: Self-contained operation with local web interface
- **Online Mode**: Full-stack operation with cloud authentication and synchronization

The system automatically detects available connectivity and switches between modes while maintaining core functionality and preserving user preferences.

## Mode Detection Logic

### Initial Boot Detection

```cpp
// In main.cpp - setup()
void setup() {
    // ... initialization code ...
    
    // Check for internet connectivity
    if (strlen(STA_SSID) > 0) {
        WiFi.begin(STA_SSID, STA_PASSWORD);
        // Wait for connection and test internet
        if (testInternetConnectivity()) {
            enableOnlineMode();
        } else {
            enableOfflineMode();
        }
    } else {
        // No WiFi credentials configured
        enableOfflineMode();
    }
}
```

### Connectivity Testing

```cpp
bool testInternetConnectivity() {
    // Test 1: WiFi connection status
    if (WiFi.status() != WL_CONNECTED) {
        return false;
    }
    
    // Test 2: DNS resolution
    IPAddress testIp;
    if (!WiFi.hostByName("google.com", testIp)) {
        return false;
    }
    
    // Test 3: HTTP connectivity to cloud service
    HTTPClient http;
    http.begin("https://api.supabase.io/health");
    int httpCode = http.GET();
    http.end();
    
    return (httpCode > 0);
}
```

### Runtime Detection

```cpp
void maintainWiFi() {
    static uint32_t lastConnectivityCheck = 0;
    const uint32_t CHECK_INTERVAL = 30000; // 30 seconds
    
    uint32_t now = millis();
    if (now - lastConnectivityCheck >= CHECK_INTERVAL) {
        lastConnectivityCheck = now;
        
        bool currentlyOnline = testInternetConnectivity();
        static bool wasOnline = false;
        
        if (currentlyOnline != wasOnline) {
            if (currentlyOnline) {
                switchToOnlineMode();
            } else {
                switchToOfflineMode();
            }
            wasOnline = currentlyOnline;
        }
    }
}
```

## Offline Mode Operation

### Characteristics

- **Web Server**: ESP32 hosts local web server on IP 192.168.4.1
- **Authentication**: Local MAC address-based authentication stored in NVS
- **Data Storage**: Local NVS for settings, LittleFS for logs
- **User Interface**: Simple HTML/CSS/JavaScript served from LittleFS
- **Functionality**: Full relay control, timer management, PIR automation

### Offline Mode Components

```
ESP32 Device (Offline Mode)
├── WebPortal.cpp
│   ├── HTTP Server (port 80)
│   ├── WebSocket Server (port 81)
│   ├── Captive Portal DNS
│   └── Local Authentication
├── ControlEngine.cpp
│   ├── Relay Control Logic
│   ├── Timer Management
│   └── PIR Processing
├── StorageLayer.cpp
│   ├── Preferences (NVS)
│   ├── LittleFS File System
│   └── Local User Management
└── data/index.html
    ├── Local UI Components
    ├── Authentication Forms
    └── Control Dashboard
```

### Offline Authentication Flow

```cpp
// In WebPortal.cpp
bool authenticateUser(const String& macAddress, const String& password) {
    // Load user accounts from NVS
    AccessControlRuntime access;
    if (!gStorage.loadUserAccounts(&access)) {
        return false;
    }
    
    // Find user by MAC address
    UserAccount* user = findUserByMac(macAddress.c_str());
    if (!user) {
        return false;
    }
    
    // Verify password hash
    String hashedInput = hashPassword(password);
    return strcmp(hashedInput.c_str(), user->passwordHash) == 0;
}
```

### Offline Data Storage

```cpp
// Local storage locations
struct OfflineStorage {
    // Preferences (NVS)
    String wifiCredentials;      // STA SSID/Password
    UserAccount localUsers[16];  // Local user accounts
    RelayConfig relaySettings;    // Relay configurations
    TimerPlan activeTimers[2];   // Active timer plans
    
    // LittleFS
    String eventLogs;            // /logs.jsonl
    String pendingEvents;        // /pending.jsonl
    String webInterface;         // /index.html
};
```

## Online Mode Operation

### Characteristics

- **Frontend**: React application hosted on GitHub Pages
- **Backend**: Node.js server handling API and real-time communication
- **Authentication**: Supabase Auth with JWT tokens
- **Database**: Supabase PostgreSQL for user data and device state
- **Real-time**: WebSocket connections for live updates
- **Synchronization**: Bidirectional sync between ESP32 and cloud

### Online Mode Components

```
Online Mode Architecture
├── Frontend (GitHub Pages)
│   ├── React Application
│   ├── Supabase Client
│   ├── Authentication Pages
│   └── Dashboard Components
├── Backend Server
│   ├── Express.js API
│   ├── WebSocket Server
│   ├── Supabase Integration
│   └── ESP32 Communication
├── Supabase Backend
│   ├── Authentication Service
│   ├── PostgreSQL Database
│   ├── Real-time Engine
│   └── Row Level Security
└── ESP32 Device
    ├── CloudSyncService
    ├── HTTP Client
    └── Local Cache
```

### Online Authentication Flow

```javascript
// Frontend authentication
const signIn = async (email, password) => {
    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });
        
        if (error) throw error;
        
        // Store JWT token
        localStorage.setItem('supabase_token', data.session.access_token);
        
        // Get user role from database
        const { data: profile } = await supabase
            .from('user_profiles')
            .select('role')
            .eq('id', data.user.id)
            .single();
            
        return { user: data.user, role: profile.role };
    } catch (error) {
        console.error('Authentication failed:', error);
        throw error;
    }
};
```

### Online Data Flow

```javascript
// Real-time state synchronization
const subscribeToDeviceState = (deviceId) => {
    const subscription = supabase
        .channel(`device:${deviceId}`)
        .on('postgres_changes', 
            { event: '*', schema: 'public', table: 'device_states', filter: `device_id=eq.${deviceId}` },
            (payload) => {
                updateDeviceState(payload.new);
            }
        )
        .subscribe();
        
    return subscription;
};
```

## Mode Switching Process

### Switching to Online Mode

```cpp
void switchToOnlineMode() {
    Serial.println("[Mode] Switching to ONLINE mode");
    
    // 1. Initialize cloud sync service
    gCloudSync.begin(&gControl, &gStorage, &gTimeKeeper);
    
    // 2. Sync local state to cloud
    syncLocalStateToCloud();
    
    // 3. Start cloud communication tasks
    if (gCloudSync.isConfigured()) {
        xTaskCreatePinnedToCore(cloudTask, "cloud_task", 12288, nullptr, 1, &gCloudTaskHandle, 0);
    }
    
    // 4. Update mode flag
    gRuntime.onlineMode = true;
    
    // 5. Notify connected clients
    pushSystemEvent("mode.online", "Switched to online mode");
}
```

### Switching to Offline Mode

```cpp
void switchToOfflineMode() {
    Serial.println("[Mode] Switching to OFFLINE mode");
    
    // 1. Stop cloud sync tasks
    if (gCloudTaskHandle) {
        vTaskDelete(gCloudTaskHandle);
        gCloudTaskHandle = nullptr;
    }
    
    // 2. Cache critical online data locally
    cacheOnlineDataLocally();
    
    // 3. Enable local web server
    gWebPortal.enableLocalMode();
    
    // 4. Update mode flag
    gRuntime.onlineMode = false;
    
    // 5. Notify connected clients
    pushSystemEvent("mode.offline", "Switched to offline mode");
}
```

## State Synchronization

### Local to Cloud Sync

```cpp
void syncLocalStateToCloud() {
    JsonDocument doc;
    
    // Sync relay states
    JsonArray relays = doc["relays"].to<JsonArray>();
    for (size_t i = 0; i < RELAY_COUNT; ++i) {
        JsonObject relay = relays.add<JsonObject>();
        relay["id"] = i;
        relay["state"] = relayStateToText(gRuntime.relays[i].appliedState);
        relay["mode"] = relayModeToText(gRuntime.relays[i].manualMode);
    }
    
    // Sync timer plans
    JsonArray timers = doc["timers"].to<JsonArray>();
    for (size_t i = 0; i < RELAY_COUNT; ++i) {
        if (gRuntime.relays[i].timer.active) {
            JsonObject timer = timers.add<JsonObject>();
            timer["relay_id"] = i;
            timer["end_epoch"] = gRuntime.relays[i].timer.endEpoch;
            timer["target_state"] = relayStateToText(gRuntime.relays[i].timer.targetState);
        }
    }
    
    // Send to cloud
    String payload;
    serializeJson(doc, payload);
    gCloudSync.enqueueLocalEvent(payload);
}
```

### Cloud to Local Sync

```cpp
void processCloudCommand(const String& command) {
    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, command);
    
    if (error) {
        Serial.println("[Cloud] Invalid command format");
        return;
    }
    
    String type = doc["type"];
    
    if (type == "set_relay") {
        size_t relayId = doc["relay_id"];
        RelayState state = relayStateFromText(doc["state"]);
        String error;
        
        if (gControl.setManualMode(relayId, state == RelayState::ON ? RelayMode::ON : RelayMode::OFF, &error)) {
            Serial.printf("[Cloud] Relay %zu set to %s\n", relayId, relayStateToText(state));
        } else {
            Serial.printf("[Cloud] Failed to set relay %zu: %s\n", relayId, error.c_str());
        }
    }
    else if (type == "set_timer") {
        size_t relayId = doc["relay_id"];
        uint32_t duration = doc["duration_minutes"];
        RelayState targetState = relayStateFromText(doc["target_state"]);
        String error;
        
        if (gControl.setTimer(relayId, duration, targetState, &error)) {
            Serial.printf("[Cloud] Timer set for relay %zu\n", relayId);
        } else {
            Serial.printf("[Cloud] Failed to set timer for relay %zu: %s\n", relayId, error.c_str());
        }
    }
}
```

## Configuration Management

### Mode Preference Storage

```cpp
// In Config.h - Add mode preference
constexpr char PREF_MODE_PREFERENCE[] = "mode_preference";

enum class ModePreference : uint8_t {
    AUTO = 0,    // Automatically detect
    OFFLINE = 1,  // Force offline mode
    ONLINE = 2    // Force online mode
};
```

### User Interface for Mode Selection

```javascript
// Frontend mode selection component
const ModeSelector = () => {
    const [mode, setMode] = useState('auto');
    
    const handleModeChange = async (newMode) => {
        setMode(newMode);
        
        // Update user preference in database
        await supabase
            .from('user_preferences')
            .upsert({
                user_id: user.id,
                preference_key: 'mode_preference',
                preference_value: newMode
            });
            
        // Notify ESP32 of mode change
        await fetch('/api/mode/set', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: newMode })
        });
    };
    
    return (
        <div className="mode-selector">
            <h3>Operation Mode</h3>
            <button onClick={() => handleModeChange('auto')}>Auto</button>
            <button onClick={() => handleModeChange('offline')}>Offline Only</button>
            <button onClick={() => handleModeChange('online')}>Online Only</button>
        </div>
    );
};
```

## Troubleshooting

### Common Issues

#### 1. Mode Switching Loop
**Symptoms**: Device continuously switches between online and offline modes

**Causes**: Intermittent internet connectivity, DNS resolution failures

**Solutions**:
```cpp
// Add hysteresis to mode switching
constexpr uint32_t MODE_SWITCH_HYSTERESIS_MS = 60000; // 1 minute
static uint32_t lastModeSwitch = 0;

bool shouldSwitchMode(bool currentlyOnline) {
    uint32_t now = millis();
    return (now - lastModeSwitch >= MODE_SWITCH_HYSTERESIS_MS);
}
```

#### 2. Authentication Failure After Mode Switch
**Symptoms**: Users can't log in after switching modes

**Causes**: Different authentication systems, cached credentials

**Solutions**:
```javascript
// Clear authentication cache on mode switch
const clearAuthCache = () => {
    localStorage.removeItem('supabase_token');
    localStorage.removeItem('user_role');
    sessionStorage.clear();
};
```

#### 3. Data Loss During Mode Switch
**Symptoms**: Relay states or timers lost during mode transition

**Causes**: Incomplete synchronization, race conditions

**Solutions**:
```cpp
// Ensure atomic state transitions
void atomicModeSwitch(bool newOnlineMode) {
    // Backup current state
    SystemRuntime backup = gRuntime;
    
    // Attempt mode switch
    if (newOnlineMode) {
        if (!switchToOnlineMode()) {
            // Restore backup on failure
            gRuntime = backup;
            return false;
        }
    } else {
        if (!switchToOfflineMode()) {
            gRuntime = backup;
            return false;
        }
    }
    
    return true;
}
```

### Debug Mode

```cpp
// Enable detailed logging for mode switching
constexpr bool DEBUG_MODE_SWITCHING = true;

void debugModeSwitch(const char* from, const char* to, const char* reason) {
    if (DEBUG_MODE_SWITCHING) {
        Serial.printf("[Mode Debug] %s -> %s: %s\n", from, to, reason);
        Serial.printf("[Mode Debug] Timestamp: %llu\n", gTimeKeeper.nowEpoch());
        Serial.printf("[Mode Debug] WiFi Status: %d\n", WiFi.status());
        Serial.printf("[Mode Debug] IP: %s\n", WiFi.localIP().toString().c_str());
    }
}
```

## Implementation Details

### Mode State Machine

```cpp
enum class SystemMode : uint8_t {
    OFFLINE = 0,
    ONLINE = 1,
    TRANSITIONING = 2
};

class ModeManager {
private:
    SystemMode currentMode_ = SystemMode::OFFLINE;
    SystemMode targetMode_ = SystemMode::OFFLINE;
    uint32_t transitionStart_ = 0;
    
public:
    void update() {
        switch (currentMode_) {
            case SystemMode::OFFLINE:
                handleOfflineState();
                break;
            case SystemMode::ONLINE:
                handleOnlineState();
                break;
            case SystemMode::TRANSITIONING:
                handleTransitionState();
                break;
        }
    }
    
    void requestModeChange(SystemMode newMode) {
        if (newMode != currentMode_) {
            targetMode_ = newMode;
            currentMode_ = SystemMode::TRANSITIONING;
            transitionStart_ = millis();
        }
    }
};
```

### Configuration Validation

```cpp
bool validateOnlineConfiguration() {
    // Check Supabase configuration
    if (strlen(SUPABASE_URL) == 0 || strlen(SUPABASE_PUBLISHABLE_KEY) == 0) {
        Serial.println("[Mode] Supabase credentials not configured");
        return false;
    }
    
    // Check backend server configuration
    if (strlen(BACKEND_SERVER_URL) == 0) {
        Serial.println("[Mode] Backend server URL not configured");
        return false;
    }
    
    // Test connectivity
    if (!testBackendConnectivity()) {
        Serial.println("[Mode] Backend server not reachable");
        return false;
    }
    
    return true;
}
```

This comprehensive guide ensures reliable mode switching while maintaining system integrity and providing a seamless user experience across both online and offline operation modes.
