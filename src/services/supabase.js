import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Validate environment variables
if (!supabaseUrl) {
    throw new Error('VITE_SUPABASE_URL is missing. Please check your .env file.');
}

if (!supabaseAnonKey) {
    throw new Error('VITE_SUPABASE_ANON_KEY is missing. Please check your .env file.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    realtime: {
        params: {
            eventsPerSecond: 10
        }
    }
});

// Enhanced Supabase Service for Smart Building Management
class SupabaseService {
    // Device Management
    async getDevices(userId = null) {
        try {
            let query = supabase.from('devices').select('*');
            
            if (userId) {
                // Get devices user has permission for
                const { data: permissions } = await supabase
                    .from('device_permissions')
                    .select('device_id')
                    .eq('user_id', userId)
                    .eq('can_view', true);
                
                const deviceIds = permissions?.map(p => p.device_id) || [];
                if (deviceIds.length > 0) {
                    query = query.in('id', deviceIds);
                } else {
                    return [];
                }
            }
            
            const { data, error } = await query.eq('is_active', true).order('created_at', { ascending: false });
            
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error fetching devices:', error);
            return [];
        }
    }

    async updateDeviceState(deviceId, state) {
        try {
            const { data, error } = await supabase
                .from('devices')
                .update({ 
                    state: state,
                    last_updated: new Date().toISOString()
                })
                .eq('id', deviceId)
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error updating device state:', error);
            throw error;
        }
    }

    async logDeviceAction(deviceId, userId, action, previousState = null, newState = null, source = 'manual') {
        try {
            const { error } = await supabase
                .from('device_history')
                .insert({
                    device_id: deviceId,
                    user_id: userId,
                    action: action,
                    previous_state: previousState,
                    new_state: newState,
                    source: source,
                    created_at: new Date().toISOString()
                });

            if (error) throw error;
        } catch (error) {
            console.error('Error logging device action:', error);
        }
    }

    // User Management
    async getUserProfile(userId) {
        try {
            const { data, error } = await supabase
                .from('user_profiles')
                .select('*')
                .eq('id', userId)
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error fetching user profile:', error);
            return null;
        }
    }

    async updateUserProfile(userId, updates) {
        try {
            const { data, error } = await supabase
                .from('user_profiles')
                .update({
                    ...updates,
                    updated_at: new Date().toISOString()
                })
                .eq('id', userId)
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error updating user profile:', error);
            throw error;
        }
    }

    // Permission Management
    async getUserPermissions(userId) {
        try {
            const { data, error } = await supabase
                .from('device_permissions')
                .select(`
                    *,
                    devices (
                        id,
                        name,
                        location,
                        status,
                        relay_count
                    )
                `)
                .eq('user_id', userId);

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error fetching user permissions:', error);
            return [];
        }
    }

    async grantDevicePermission(userId, deviceId, permissions = {}) {
        try {
            const { data, error } = await supabase
                .from('device_permissions')
                .upsert({
                    user_id: userId,
                    device_id: deviceId,
                    can_control: permissions.can_control ?? true,
                    can_view: permissions.can_view ?? true,
                    can_manage_timers: permissions.can_manage_timers ?? true,
                    granted_by: userId, // This should be the admin user ID
                    granted_at: new Date().toISOString()
                })
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error granting device permission:', error);
            throw error;
        }
    }

    async revokeDevicePermission(userId, deviceId) {
        try {
            const { error } = await supabase
                .from('device_permissions')
                .delete()
                .eq('user_id', userId)
                .eq('device_id', deviceId);

            if (error) throw error;
        } catch (error) {
            console.error('Error revoking device permission:', error);
            throw error;
        }
    }

    // Timer Management
    async createTimer(deviceId, userId, durationMinutes, targetState) {
        try {
            const endTime = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();
            
            const { data, error } = await supabase
                .from('device_timers')
                .insert({
                    device_id: deviceId,
                    duration_minutes: durationMinutes,
                    target_state: targetState,
                    end_time: endTime,
                    created_by: userId,
                    active: true
                })
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error creating timer:', error);
            throw error;
        }
    }

    async cancelTimer(timerId) {
        try {
            const { error } = await supabase
                .from('device_timers')
                .update({ active: false })
                .eq('id', timerId);

            if (error) throw error;
        } catch (error) {
            console.error('Error cancelling timer:', error);
            throw error;
        }
    }

    async getActiveTimers(deviceId = null) {
        try {
            let query = supabase
                .from('device_timers')
                .select('*')
                .eq('active', true)
                .order('end_time', { ascending: true });

            if (deviceId) {
                query = query.eq('device_id', deviceId);
            }

            const { data, error } = await query;
            
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error fetching active timers:', error);
            return [];
        }
    }

    // Real-time Subscriptions
    subscribeToDeviceUpdates(deviceId, callback) {
        return supabase
            .channel(`device:${deviceId}`)
            .on('postgres_changes', 
                { 
                    event: '*', 
                    schema: 'public', 
                    table: 'devices',
                    filter: `id=eq.${deviceId}`
                },
                callback
            )
            .subscribe();
    }

    subscribeToAllDeviceUpdates(callback) {
        return supabase
            .channel('all-devices')
            .on('postgres_changes', 
                { 
                    event: '*', 
                    schema: 'public', 
                    table: 'devices'
                },
                callback
            )
            .subscribe();
    }

    subscribeToTimerUpdates(deviceId, callback) {
        return supabase
            .channel(`timer:${deviceId}`)
            .on('postgres_changes', 
                { 
                    event: '*', 
                    schema: 'public', 
                    table: 'device_timers',
                    filter: `device_id=eq.${deviceId}`
                },
                callback
            )
            .subscribe();
    }

    subscribeToUserUpdates(userId, callback) {
        return supabase
            .channel(`user:${userId}`)
            .on('postgres_changes', 
                { 
                    event: '*', 
                    schema: 'public', 
                    table: 'user_profiles',
                    filter: `id=eq.${userId}`
                },
                callback
            )
            .subscribe();
    }

    // System Health
    async getSystemStats() {
        try {
            const [devicesResult, usersResult, timersResult] = await Promise.all([
                supabase.from('devices').select('id, status, is_active'),
                supabase.from('user_profiles').select('id, is_active, role'),
                supabase.from('device_timers').select('id, active').eq('active', true)
            ]);

            const devices = devicesResult.data || [];
            const users = usersResult.data || [];
            const activeTimers = timersResult.data || [];

            return {
                totalDevices: devices.length,
                onlineDevices: devices.filter(d => d.status === 'online').length,
                activeDevices: devices.filter(d => d.is_active).length,
                totalUsers: users.length,
                activeUsers: users.filter(u => u.is_active).length,
                adminUsers: users.filter(u => u.role === 'admin').length,
                activeTimers: activeTimers.length
            };
        } catch (error) {
            console.error('Error fetching system stats:', error);
            return {
                totalDevices: 0,
                onlineDevices: 0,
                activeDevices: 0,
                totalUsers: 0,
                activeUsers: 0,
                adminUsers: 0,
                activeTimers: 0
            };
        }
    }

    // Building/Floor Structure (to be implemented)
    async getBuildingStructure() {
        // TODO: Implement building/floor hierarchy
        return {
            buildings: [],
            floors: [],
            devices: []
        };
    }
}

export const supabaseService = new SupabaseService();

// Legacy exports for backward compatibility
export const subscribeToDeviceUpdates = (deviceId, callback) => {
    return supabaseService.subscribeToDeviceUpdates(deviceId, callback);
};

export const subscribeToTimerUpdates = (deviceId, callback) => {
    return supabaseService.subscribeToTimerUpdates(deviceId, callback);
};
