import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    realtime: {
        params: {
            eventsPerSecond: 10
        }
    }
});

// Subscribe to device updates
export const subscribeToDeviceUpdates = (deviceId, callback) => {
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
};

// Subscribe to timer updates
export const subscribeToTimerUpdates = (deviceId, callback) => {
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
};
