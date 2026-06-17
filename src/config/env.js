const config = {
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
    supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    apiBaseUrl: import.meta.env.VITE_API_BASE_URL,
    isDevelopment: import.meta.env.DEV,
    appVersion: import.meta.env.VITE_APP_VERSION
};

const requiredVars = [
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY'
];

const missingVars = requiredVars.filter(
    varName => !import.meta.env[varName]
);

if (missingVars.length > 0) {
    throw new Error(
        `Missing environment variables: ${missingVars.join(', ')}`
    );
}

export default config;