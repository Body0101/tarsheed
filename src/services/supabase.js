import { createClient } from "@supabase/supabase-js";
import config from "../config/env";

export const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

// Subscribe to device updates
export const subscribeToDeviceUpdates = (deviceId, callback) => {
  return supabase
    .channel(`device:${deviceId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "devices",
        filter: `id=eq.${deviceId}`,
      },
      callback
    )
    .subscribe();
};

// Subscribe to timer updates
export const subscribeToTimerUpdates = (deviceId, callback) => {
  return supabase
    .channel(`timer:${deviceId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "device_timers",
        filter: `device_id=eq.${deviceId}`,
      },
      callback
    )
    .subscribe();
};
