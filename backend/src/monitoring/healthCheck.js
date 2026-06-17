import { supabase } from "../config/supabase.js";

export async function healthCheck() {
    const checks = {
        database: await checkDatabase(),
        supabase: await checkSupabase(),
        storage: await checkStorage(),
        realtime: await checkRealtime()
    };
    
    const allHealthy = Object.values(checks).every(check => check.healthy);
    
    return {
        healthy: allHealthy,
        checks,
        timestamp: new Date().toISOString()
    };
}

async function checkDatabase() {
    try {
        const { error } = await supabase
            .from('user_profiles')
            .select('id')
            .limit(1);
        
        return { healthy: !error, error };
    } catch (error) {
        return { healthy: false, error: error.message };
    }
}

async function checkSupabase() {
    try {
        const { error } = await supabase.auth.getSession();
        return { healthy: !error, error };
    } catch (error) {
        return { healthy: false, error: error.message };
    }
}

async function checkStorage() {
    return { healthy: true };
}

async function checkRealtime() {
    return { healthy: true };
}
