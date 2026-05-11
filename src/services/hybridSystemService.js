import { supabase, supabaseService } from './supabase';

class HybridSystemService {
    constructor() {
        this.isOnline = navigator.onLine;
        this.mode = 'online'; // 'online' or 'offline'
        this.syncQueue = [];
        this.deviceStates = {};
        this.timers = [];
        this.lastSyncTime = null;
        this.syncInProgress = false;
        this.retryAttempts = 0;
        this.maxRetries = 3;
        this.retryDelay = 5000; // 5 seconds
        
        // Event listeners
        this.setupEventListeners();
    }

    setupEventListeners() {
        window.addEventListener('online', this.handleOnline.bind(this));
        window.addEventListener('offline', this.handleOffline.bind(this));
        
        // Periodic sync check
        setInterval(() => {
            if (this.isOnline && this.mode === 'online') {
                this.checkForPendingSync();
            }
        }, 30000); // Check every 30 seconds
    }

    handleOnline() {
        console.log('System came online');
        this.isOnline = true;
        this.mode = 'online';
        this.retryAttempts = 0;
        
        // Attempt to sync pending data
        this.syncPendingData();
        
        // Notify all components
        this.notifyModeChange('online');
    }

    handleOffline() {
        console.log('System went offline');
        this.isOnline = false;
        this.mode = 'offline';
        
        // Store current state locally
        this.storeOfflineState();
        
        // Notify all components
        this.notifyModeChange('offline');
    }

    notifyModeChange(newMode) {
        const event = new CustomEvent('hybridModeChange', {
            detail: { mode: newMode, isOnline: this.isOnline }
        });
        window.dispatchEvent(event);
    }

    // Device State Management
    async updateDeviceState(deviceId, state, source = 'manual') {
        try {
            // Update local state immediately
            this.deviceStates[deviceId] = {
                ...this.deviceStates[deviceId],
                ...state,
                lastUpdated: new Date().toISOString(),
                source: source
            };

            if (this.isOnline && this.mode === 'online') {
                // Try to sync immediately
                await this.syncDeviceState(deviceId, state, source);
            } else {
                // Queue for offline sync
                this.queueSyncAction({
                    type: 'device_state',
                    deviceId: deviceId,
                    state: state,
                    source: source,
                    timestamp: new Date().toISOString()
                });
            }

            // Store locally for offline access
            this.storeOfflineState();
            
            return true;
        } catch (error) {
            console.error('Error updating device state:', error);
            return false;
        }
    }

    async syncDeviceState(deviceId, state, source) {
        try {
            await supabaseService.updateDeviceState(deviceId, state);
            await supabaseService.logDeviceAction(deviceId, null, 'state_update', null, state, source);
            
            this.lastSyncTime = new Date().toISOString();
            return true;
        } catch (error) {
            console.error('Error syncing device state:', error);
            
            // Queue for retry
            this.queueSyncAction({
                type: 'device_state',
                deviceId: deviceId,
                state: state,
                source: source,
                timestamp: new Date().toISOString(),
                retry: true
            });
            
            return false;
        }
    }

    // Timer Management
    async createTimer(deviceId, duration, targetState, source = 'manual') {
        try {
            const timer = {
                id: `timer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                deviceId: deviceId,
                duration: duration,
                targetState: targetState,
                startTime: new Date().toISOString(),
                endTime: new Date(Date.now() + duration * 60 * 1000).toISOString(),
                source: source,
                active: true
            };

            // Add to local timers
            this.timers.push(timer);

            if (this.isOnline && this.mode === 'online') {
                // Sync to Supabase
                await supabaseService.createTimer(deviceId, null, duration, targetState);
            } else {
                // Queue for offline sync
                this.queueSyncAction({
                    type: 'timer_create',
                    timer: timer,
                    timestamp: new Date().toISOString()
                });
            }

            // Store locally
            this.storeOfflineState();
            
            // Set up timer expiration
            this.setupTimerExpiration(timer);
            
            return timer;
        } catch (error) {
            console.error('Error creating timer:', error);
            return null;
        }
    }

    setupTimerExpiration(timer) {
        const endTime = new Date(timer.endTime).getTime();
        const now = Date.now();
        const delay = endTime - now;

        if (delay > 0) {
            setTimeout(async () => {
                await this.executeTimerAction(timer);
            }, delay);
        }
    }

    async executeTimerAction(timer) {
        try {
            console.log(`Executing timer action for device ${timer.deviceId}`);
            
            // Update device state
            await this.updateDeviceState(timer.deviceId, {
                [`relay${timer.relay || 1}`]: timer.targetState
            }, 'timer');

            // Mark timer as inactive
            timer.active = false;
            
            // Remove from active timers
            this.timers = this.timers.filter(t => t.id !== timer.id);
            
            // Store updated state
            this.storeOfflineState();
            
            // Log the action
            if (this.isOnline && this.mode === 'online') {
                await supabaseService.logDeviceAction(
                    timer.deviceId, 
                    null, 
                    'timer_executed', 
                    null, 
                    { targetState: timer.targetState }, 
                    'timer'
                );
            } else {
                this.queueSyncAction({
                    type: 'timer_executed',
                    timer: timer,
                    timestamp: new Date().toISOString()
                });
            }
        } catch (error) {
            console.error('Error executing timer action:', error);
        }
    }

    // Sync Queue Management
    queueSyncAction(action) {
        this.syncQueue.push(action);
        this.storeOfflineState();
    }

    async syncPendingData() {
        if (this.syncInProgress || this.syncQueue.length === 0) {
            return;
        }

        this.syncInProgress = true;
        
        try {
            const actionsToSync = [...this.syncQueue];
            const results = [];

            for (const action of actionsToSync) {
                try {
                    let result = false;
                    
                    switch (action.type) {
                        case 'device_state':
                            result = await this.syncDeviceState(action.deviceId, action.state, action.source);
                            break;
                        case 'timer_create':
                            result = await supabaseService.createTimer(
                                action.timer.deviceId, 
                                null, 
                                action.timer.duration, 
                                action.timer.targetState
                            );
                            break;
                        case 'timer_executed':
                            await supabaseService.logDeviceAction(
                                action.timer.deviceId, 
                                null, 
                                'timer_executed', 
                                null, 
                                { targetState: action.timer.targetState }, 
                                'timer'
                            );
                            result = true;
                            break;
                    }

                    if (result) {
                        // Remove from queue on success
                        this.syncQueue = this.syncQueue.filter(a => a !== action);
                        results.push({ success: true, action });
                    } else {
                        results.push({ success: false, action, error: 'Sync failed' });
                    }
                } catch (error) {
                    results.push({ success: false, action, error: error.message });
                }
            }

            // Handle failed syncs
            const failedActions = results.filter(r => !r.success);
            if (failedActions.length > 0) {
                this.handleSyncFailures(failedActions);
            } else {
                this.retryAttempts = 0;
                this.lastSyncTime = new Date().toISOString();
            }

            // Store updated queue
            this.storeOfflineState();
            
        } catch (error) {
            console.error('Error during sync:', error);
        } finally {
            this.syncInProgress = false;
        }
    }

    handleSyncFailures(failedActions) {
        this.retryAttempts++;
        
        if (this.retryAttempts >= this.maxRetries) {
            console.error('Max sync retries reached, keeping actions in queue');
            this.retryAttempts = 0;
        } else {
            console.log(`Sync failed, retrying in ${this.retryDelay}ms (attempt ${this.retryAttempts}/${this.maxRetries})`);
            setTimeout(() => {
                this.syncPendingData();
            }, this.retryDelay * this.retryAttempts);
        }
    }

    checkForPendingSync() {
        if (this.syncQueue.length > 0 && !this.syncInProgress) {
            this.syncPendingData();
        }
    }

    // Local Storage Management
    storeOfflineState() {
        try {
            const offlineData = {
                deviceStates: this.deviceStates,
                timers: this.timers,
                syncQueue: this.syncQueue,
                lastSyncTime: this.lastSyncTime,
                mode: this.mode,
                timestamp: new Date().toISOString()
            };
            
            localStorage.setItem('hybridSystem_offlineData', JSON.stringify(offlineData));
        } catch (error) {
            console.error('Error storing offline state:', error);
        }
    }

    loadOfflineState() {
        try {
            const stored = localStorage.getItem('hybridSystem_offlineData');
            if (stored) {
                const data = JSON.parse(stored);
                
                this.deviceStates = data.deviceStates || {};
                this.timers = data.timers || [];
                this.syncQueue = data.syncQueue || [];
                this.lastSyncTime = data.lastSyncTime;
                
                // Restore active timers
                this.timers.forEach(timer => {
                    if (timer.active) {
                        this.setupTimerExpiration(timer);
                    }
                });
                
                console.log('Offline state loaded successfully');
            }
        } catch (error) {
            console.error('Error loading offline state:', error);
        }
    }

    // ESP32 Communication
    async sendCommandToDevice(deviceId, command, params = {}) {
        try {
            if (this.mode === 'offline') {
                // In offline mode, communicate directly with ESP32 via local network
                return await this.sendLocalCommand(deviceId, command, params);
            } else {
                // In online mode, route through Supabase
                return await this.sendCloudCommand(deviceId, command, params);
            }
        } catch (error) {
            console.error('Error sending command to device:', error);
            return { success: false, error: error.message };
        }
    }

    async sendLocalCommand(deviceId, command, params) {
        try {
            // Get device IP from local cache
            const device = this.deviceStates[deviceId];
            if (!device || !device.ipAddress) {
                throw new Error('Device IP not available in offline mode');
            }

            const response = await fetch(`http://${device.ipAddress}/api/${command}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(params)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            return { success: true, data: result };
        } catch (error) {
            console.error('Error sending local command:', error);
            throw error;
        }
    }

    async sendCloudCommand(deviceId, command, params) {
        try {
            // Queue command for cloud processing
            this.queueSyncAction({
                type: 'device_command',
                deviceId: deviceId,
                command: command,
                params: params,
                timestamp: new Date().toISOString()
            });

            return { success: true, message: 'Command queued for cloud processing' };
        } catch (error) {
            console.error('Error sending cloud command:', error);
            throw error;
        }
    }

    // Time Synchronization
    async syncTime() {
        try {
            if (!this.isOnline) {
                return { success: false, error: 'System is offline' };
            }

            const serverTime = await this.getServerTime();
            const localTime = new Date();
            const timeDiff = serverTime - localTime;

            // Store time offset for offline operations
            localStorage.setItem('hybridSystem_timeOffset', timeDiff.toString());
            
            return { success: true, serverTime, localTime, offset: timeDiff };
        } catch (error) {
            console.error('Error syncing time:', error);
            return { success: false, error: error.message };
        }
    }

    async getServerTime() {
        try {
            const response = await fetch('/api/time');
            const data = await response.json();
            return new Date(data.timestamp);
        } catch (error) {
            // Fallback to browser time
            return new Date();
        }
    }

    getAdjustedTime() {
        const offset = localStorage.getItem('hybridSystem_timeOffset');
        if (offset) {
            return new Date(Date.now() + parseInt(offset));
        }
        return new Date();
    }

    // Status and Monitoring
    getSystemStatus() {
        return {
            isOnline: this.isOnline,
            mode: this.mode,
            syncQueueLength: this.syncQueue.length,
            lastSyncTime: this.lastSyncTime,
            deviceCount: Object.keys(this.deviceStates).length,
            activeTimers: this.timers.filter(t => t.active).length,
            retryAttempts: this.retryAttempts
        };
    }

    // Cleanup
    cleanup() {
        window.removeEventListener('online', this.handleOnline);
        window.removeEventListener('offline', this.handleOffline);
    }
}

export const hybridSystemService = new HybridSystemService();

// Initialize on load
if (typeof window !== 'undefined') {
    hybridSystemService.loadOfflineState();
}
