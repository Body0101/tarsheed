import { supabase, supabaseService } from './supabase';
import { hybridSystemService } from './hybridSystemService';

class SyncService {
    constructor() {
        this.syncStrategies = new Map();
        this.conflictResolvers = new Map();
        this.syncInProgress = false;
        this.lastFullSync = null;
        this.syncInterval = 60000; // 1 minute
        this.maxRetries = 3;
        this.retryDelay = 5000;
        
        this.initializeSyncStrategies();
        this.initializeConflictResolvers();
        this.startPeriodicSync();
    }

    initializeSyncStrategies() {
        // Device State Sync Strategy
        this.syncStrategies.set('device_state', {
            priority: 1,
            conflictResolution: 'latest_wins',
            merge: (local, remote) => {
                const latest = this.getLatestTimestamp(local, remote);
                return latest.source === 'local' ? local : remote;
            },
            validate: (state) => {
                return state && typeof state === 'object' && state.lastUpdated;
            }
        });

        // Timer Sync Strategy
        this.syncStrategies.set('timer', {
            priority: 2,
            conflictResolution: 'longer_duration',
            merge: (local, remote) => {
                // Keep the timer with longer duration
                if (local.duration > remote.duration) return local;
                return remote;
            },
            validate: (timer) => {
                return timer && timer.deviceId && timer.duration && timer.endTime;
            }
        });

        // User Settings Sync Strategy
        this.syncStrategies.set('user_settings', {
            priority: 3,
            conflictResolution: 'user_preference',
            merge: (local, remote) => {
                // User's last update takes precedence
                return local.lastUpdated > remote.lastUpdated ? local : remote;
            },
            validate: (settings) => {
                return settings && settings.userId && typeof settings === 'object';
            }
        });
    }

    initializeConflictResolvers() {
        this.conflictResolvers.set('device_state', this.resolveDeviceStateConflict.bind(this));
        this.conflictResolvers.set('timer', this.resolveTimerConflict.bind(this));
        this.conflictResolvers.set('user_settings', this.resolveUserSettingsConflict.bind(this));
    }

    async resolveDeviceStateConflict(local, remote) {
        const strategy = this.syncStrategies.get('device_state');
        const resolved = strategy.merge(local, remote);
        
        // Log the conflict resolution
        await supabaseService.logDeviceAction(
            local.deviceId || remote.deviceId,
            null,
            'conflict_resolved',
            { local, remote },
            resolved,
            'sync'
        );
        
        return resolved;
    }

    async resolveTimerConflict(local, remote) {
        const strategy = this.syncStrategies.get('timer');
        const resolved = strategy.merge(local, remote);
        
        // If timers have different end times, use the later one
        if (new Date(local.endTime) > new Date(remote.endTime)) {
            return local;
        }
        return remote;
    }

    async resolveUserSettingsConflict(local, remote) {
        const strategy = this.syncStrategies.get('user_settings');
        return strategy.merge(local, remote);
    }

    getLatestTimestamp(item1, item2) {
        const time1 = new Date(item1.lastUpdated || item1.timestamp || 0);
        const time2 = new Date(item2.lastUpdated || item2.timestamp || 0);
        return time1 > time2 ? item1 : item2;
    }

    // Main synchronization methods
    async fullSync() {
        if (this.syncInProgress) {
            console.log('Sync already in progress');
            return { success: false, message: 'Sync already in progress' };
        }

        this.syncInProgress = true;
        
        try {
            console.log('Starting full synchronization...');
            
            const results = {
                deviceStates: await this.syncDeviceStates(),
                timers: await this.syncTimers(),
                userSettings: await this.syncUserSettings(),
                conflicts: await this.resolveConflicts()
            };

            this.lastFullSync = new Date().toISOString();
            
            // Store sync metadata
            await this.storeSyncMetadata(results);
            
            console.log('Full synchronization completed');
            return { success: true, results };
            
        } catch (error) {
            console.error('Error during full sync:', error);
            return { success: false, error: error.message };
        } finally {
            this.syncInProgress = false;
        }
    }

    async syncDeviceStates() {
        try {
            // Get local device states
            const localStates = hybridSystemService.deviceStates || {};
            
            // Get remote device states from Supabase
            const { data: remoteDevices } = await supabase
                .from('devices')
                .select('id, state, last_updated')
                .eq('is_active', true);

            const syncResults = {
                updated: [],
                conflicts: [],
                errors: []
            };

            // Compare and sync each device
            for (const remoteDevice of remoteDevices || []) {
                const deviceId = remoteDevice.id;
                const localState = localStates[deviceId];
                const remoteState = remoteDevice.state;

                if (!localState) {
                    // No local state, adopt remote state
                    localStates[deviceId] = {
                        ...remoteState,
                        lastUpdated: remoteDevice.last_updated,
                        source: 'remote'
                    };
                    syncResults.updated.push({ deviceId, action: 'adopted_remote' });
                } else if (!remoteState) {
                    // No remote state, push local state
                    await this.pushDeviceState(deviceId, localState);
                    syncResults.updated.push({ deviceId, action: 'pushed_local' });
                } else {
                    // Both exist, check for conflicts
                    const conflict = await this.detectDeviceStateConflict(localState, remoteState);
                    if (conflict) {
                        const resolved = await this.resolveDeviceStateConflict(localState, remoteState);
                        localStates[deviceId] = resolved;
                        syncResults.conflicts.push({ deviceId, conflict, resolved });
                        await this.pushDeviceState(deviceId, resolved);
                    } else if (this.isLocalStateNewer(localState, remoteDevice.last_updated)) {
                        await this.pushDeviceState(deviceId, localState);
                        syncResults.updated.push({ deviceId, action: 'local_newer' });
                    }
                }
            }

            // Update hybrid system with synced states
            hybridSystemService.deviceStates = localStates;
            hybridSystemService.storeOfflineState();

            return syncResults;
        } catch (error) {
            console.error('Error syncing device states:', error);
            throw error;
        }
    }

    async syncTimers() {
        try {
            // Get local timers
            const localTimers = hybridSystemService.timers || [];
            
            // Get remote timers from Supabase
            const { data: remoteTimers } = await supabase
                .from('device_timers')
                .select('*')
                .eq('active', true);

            const syncResults = {
                updated: [],
                conflicts: [],
                errors: []
            };

            // Sync local timers to remote
            for (const localTimer of localTimers.filter(t => t.active)) {
                const remoteTimer = remoteTimers?.find(t => 
                    t.device_id === localTimer.deviceId && 
                    Math.abs(new Date(t.end_time) - new Date(localTimer.endTime)) < 60000 // Within 1 minute
                );

                if (!remoteTimer) {
                    // Push local timer to remote
                    await supabaseService.createTimer(
                        localTimer.deviceId,
                        null,
                        localTimer.duration,
                        localTimer.targetState
                    );
                    syncResults.updated.push({ timerId: localTimer.id, action: 'pushed_local' });
                }
            }

            // Sync remote timers to local
            for (const remoteTimer of remoteTimers || []) {
                const localTimer = localTimers.find(t => 
                    t.deviceId === remoteTimer.device_id && 
                    Math.abs(new Date(t.endTime) - new Date(remoteTimer.end_time)) < 60000
                );

                if (!localTimer) {
                    // Adopt remote timer locally
                    const newLocalTimer = {
                        id: `remote_${remoteTimer.id}`,
                        deviceId: remoteTimer.device_id,
                        duration: remoteTimer.duration_minutes,
                        targetState: remoteTimer.target_state,
                        startTime: remoteTimer.created_at,
                        endTime: remoteTimer.end_time,
                        source: 'remote',
                        active: true
                    };
                    
                    localTimers.push(newLocalTimer);
                    hybridSystemService.setupTimerExpiration(newLocalTimer);
                    syncResults.updated.push({ timerId: remoteTimer.id, action: 'adopted_remote' });
                }
            }

            // Update hybrid system
            hybridSystemService.timers = localTimers;
            hybridSystemService.storeOfflineState();

            return syncResults;
        } catch (error) {
            console.error('Error syncing timers:', error);
            throw error;
        }
    }

    async syncUserSettings() {
        try {
            // This would sync user preferences, themes, etc.
            // For now, return empty results as this is a placeholder
            return {
                updated: [],
                conflicts: [],
                errors: []
            };
        } catch (error) {
            console.error('Error syncing user settings:', error);
            throw error;
        }
    }

    async resolveConflicts() {
        try {
            const conflicts = [];
            
            // Check for any unresolved conflicts in the sync queue
            const syncQueue = hybridSystemService.syncQueue || [];
            const conflictActions = syncQueue.filter(action => action.type === 'conflict');
            
            for (const conflictAction of conflictActions) {
                const resolver = this.conflictResolvers.get(conflictAction.entityType);
                if (resolver) {
                    const resolved = await resolver(conflictAction.local, conflictAction.remote);
                    conflicts.push({
                        type: conflictAction.entityType,
                        resolved: resolved
                    });
                }
            }
            
            return conflicts;
        } catch (error) {
            console.error('Error resolving conflicts:', error);
            throw error;
        }
    }

    // Helper methods
    async detectDeviceStateConflict(localState, remoteDevice) {
        const remoteState = remoteDevice.state;
        const remoteUpdated = new Date(remoteDevice.last_updated);
        const localUpdated = new Date(localState.lastUpdated);

        // Conflict if both were updated within a short time window with different states
        const timeDiff = Math.abs(localUpdated - remoteUpdated);
        const timeThreshold = 30000; // 30 seconds

        if (timeDiff < timeThreshold && JSON.stringify(localState) !== JSON.stringify(remoteState)) {
            return {
                local: localState,
                remote: remoteState,
                timeDiff: timeDiff
            };
        }

        return null;
    }

    isLocalStateNewer(localState, remoteLastUpdated) {
        const localUpdated = new Date(localState.lastUpdated);
        const remoteUpdated = new Date(remoteLastUpdated);
        return localUpdated > remoteUpdated;
    }

    async pushDeviceState(deviceId, state) {
        try {
            await supabaseService.updateDeviceState(deviceId, state);
            await supabaseService.logDeviceAction(deviceId, null, 'sync_push', null, state, 'sync');
        } catch (error) {
            console.error('Error pushing device state:', error);
            throw error;
        }
    }

    async storeSyncMetadata(results) {
        try {
            const metadata = {
                timestamp: new Date().toISOString(),
                results: results,
                systemStatus: hybridSystemService.getSystemStatus()
            };
            
            localStorage.setItem('syncService_lastSync', JSON.stringify(metadata));
        } catch (error) {
            console.error('Error storing sync metadata:', error);
        }
    }

    // Periodic sync
    startPeriodicSync() {
        setInterval(async () => {
            if (hybridSystemService.isOnline && !this.syncInProgress) {
                try {
                    await this.fullSync();
                } catch (error) {
                    console.error('Error during periodic sync:', error);
                }
            }
        }, this.syncInterval);
    }

    // Event-driven sync
    async syncEvent(eventType, data) {
        try {
            console.log(`Event-driven sync triggered: ${eventType}`);
            
            switch (eventType) {
                case 'device_state_changed':
                    await this.syncDeviceStates();
                    break;
                case 'timer_created':
                case 'timer_expired':
                    await this.syncTimers();
                    break;
                case 'user_settings_changed':
                    await this.syncUserSettings();
                    break;
                case 'connection_restored':
                    await this.fullSync();
                    break;
                default:
                    console.log(`Unknown sync event type: ${eventType}`);
            }
        } catch (error) {
            console.error(`Error in event-driven sync (${eventType}):`, error);
        }
    }

    // Conflict management
    async reportConflict(conflict) {
        try {
            // Store conflict for later resolution
            hybridSystemService.queueSyncAction({
                type: 'conflict',
                entityType: conflict.type,
                local: conflict.local,
                remote: conflict.remote,
                timestamp: new Date().toISOString()
            });

            // Notify admin of conflict
            if (conflict.severity === 'high') {
                await this.notifyConflict(conflict);
            }
        } catch (error) {
            console.error('Error reporting conflict:', error);
        }
    }

    async notifyConflict(conflict) {
        try {
            // This would send a notification to admin users
            console.warn('High priority conflict detected:', conflict);
            
            // Store in system logs
            await supabase.from('system_logs').insert({
                level: 'warning',
                message: 'Sync conflict detected',
                details: conflict,
                created_at: new Date().toISOString()
            });
        } catch (error) {
            console.error('Error notifying conflict:', error);
        }
    }

    // Status and monitoring
    getSyncStatus() {
        return {
            syncInProgress: this.syncInProgress,
            lastFullSync: this.lastFullSync,
            syncInterval: this.syncInterval,
            maxRetries: this.maxRetries,
            strategies: Array.from(this.syncStrategies.keys()),
            systemStatus: hybridSystemService.getSystemStatus()
        };
    }

    // Cleanup
    cleanup() {
        // Clear periodic sync
        if (this.syncIntervalId) {
            clearInterval(this.syncIntervalId);
        }
    }
}

export const syncService = new SyncService();

// Auto-initialize
if (typeof window !== 'undefined') {
    // Listen for hybrid system events
    window.addEventListener('hybridModeChange', (event) => {
        if (event.detail.mode === 'online') {
            // Trigger sync when coming online
            setTimeout(() => {
                syncService.syncEvent('connection_restored');
            }, 1000);
        }
    });
}
