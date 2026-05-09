# Supabase Setup Guide

## Table of Contents

1. [Overview](#overview)
2. [Account Creation](#account-creation)
3. [Project Setup](#project-setup)
4. [Database Configuration](#database-configuration)
5. [Authentication Setup](#authentication-setup)
6. [Row Level Security (RLS)](#row-level-security-rls)
7. [Real-time Configuration](#real-time-configuration)
8. [Storage Configuration](#storage-configuration)
9. [Environment Variables](#environment-variables)
10. [API Keys Management](#api-keys-management)
11. [Database Migrations](#database-migrations)
12. [Testing Configuration](#testing-configuration)
13. [Production Setup](#production-setup)
14. [Troubleshooting](#troubleshooting)

## Overview

Supabase is an open-source Firebase alternative that provides a complete backend-as-a-service platform. For the ESP32 Smart Home Automation system, Supabase provides:

- **Authentication**: User management and JWT tokens
- **Database**: PostgreSQL database with real-time capabilities
- **Storage**: File storage for user uploads and system assets
- **Real-time**: Live data synchronization
- **Edge Functions**: Serverless functions (optional)

## Account Creation

### 1. Sign Up for Supabase

1. Go to [https://supabase.com](https://supabase.com)
2. Click **"Start your project"**
3. Choose **GitHub** or **Email** authentication
4. Complete the registration process
5. Verify your email address if required

### 2. Choose Pricing Plan

**Free Tier (Recommended for Development)**:
- 500MB Database storage
- 50MB File storage
- 2GB Bandwidth
- 50,000 Auth users
- 60,000 Database rows/month
- 2 Project connections

**Pro Tier (Production)**:
- 8GB Database storage
- 100GB File storage
- 250GB Bandwidth
- 100,000 Auth users
- 5M Database rows/month
- Unlimited Project connections

## Project Setup

### 1. Create New Project

1. After logging in, click **"New Project"**
2. Select your **Organization** (create one if needed)
3. Enter project details:
   - **Project Name**: `smart-home-automation`
   - **Database Password**: Generate a strong password
   - **Region**: Choose closest to your users
4. Click **"Create new project"**
5. Wait for project initialization (2-3 minutes)

### 2. Get Project Credentials

Once your project is ready:

1. Go to **Project Settings** → **API**
2. Copy these values:
   - **Project URL**: `https://your-project-id.supabase.co`
   - **anon public**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
   - **service_role**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

**Security Note**: Never expose the `service_role` key in frontend code!

## Database Configuration

### 1. Database Schema Design

#### Users Table
```sql
-- Create user_profiles table
CREATE TABLE public.user_profiles (
    id UUID REFERENCES auth.users(id) PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    role TEXT DEFAULT 'user' CHECK (role IN ('admin', 'moderator', 'user', 'guest')),
    permissions JSONB DEFAULT '{}',
    avatar_url TEXT,
    phone TEXT,
    timezone TEXT DEFAULT 'UTC',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true
);

-- Create indexes
CREATE INDEX idx_user_profiles_email ON public.user_profiles(email);
CREATE INDEX idx_user_profiles_role ON public.user_profiles(role);
CREATE INDEX idx_user_profiles_created_at ON public.user_profiles(created_at);
```

#### Devices Table
```sql
-- Create devices table
CREATE TABLE public.devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    type TEXT DEFAULT 'esp32' CHECK (type IN ('esp32', 'arduino', 'raspberry_pi')),
    ip_address INET NOT NULL,
    port INTEGER DEFAULT 80,
    mac_address TEXT UNIQUE,
    firmware_version TEXT,
    location TEXT,
    description TEXT,
    state JSONB DEFAULT '{}',
    last_seen TIMESTAMP WITH TIME ZONE,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_updated_by UUID REFERENCES public.user_profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true
);

-- Create indexes
CREATE INDEX idx_devices_ip_address ON public.devices(ip_address);
CREATE INDEX idx_devices_mac_address ON public.devices(mac_address);
CREATE INDEX idx_devices_last_updated ON public.devices(last_updated);
CREATE INDEX idx_devices_is_active ON public.devices(is_active);
```

#### Device Timers Table
```sql
-- Create device_timers table
CREATE TABLE public.device_timers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0 AND duration_minutes <= 1440),
    target_state TEXT NOT NULL CHECK (target_state IN ('on', 'off')),
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    created_by UUID NOT NULL REFERENCES public.user_profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    active BOOLEAN DEFAULT true
);

-- Create indexes
CREATE INDEX idx_device_timers_device_id ON public.device_timers(device_id);
CREATE INDEX idx_device_timers_end_time ON public.device_timers(end_time);
CREATE INDEX idx_device_timers_active ON public.device_timers(active);
```

#### Device Permissions Table
```sql
-- Create device_permissions table
CREATE TABLE public.device_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
    can_control BOOLEAN DEFAULT true,
    can_view BOOLEAN DEFAULT true,
    can_manage_timers BOOLEAN DEFAULT true,
    granted_by UUID REFERENCES public.user_profiles(id),
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, device_id)
);

-- Create indexes
CREATE INDEX idx_device_permissions_user_id ON public.device_permissions(user_id);
CREATE INDEX idx_device_permissions_device_id ON public.device_permissions(device_id);
```

#### Device History Table
```sql
-- Create device_history table
CREATE TABLE public.device_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.user_profiles(id),
    action TEXT NOT NULL CHECK (action IN ('turn_on', 'turn_off', 'timer_set', 'timer_cancelled', 'error')),
    previous_state JSONB,
    new_state JSONB,
    source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'timer', 'pir', 'auto', 'system')),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_device_history_device_id ON public.device_history(device_id);
CREATE INDEX idx_device_history_user_id ON public.device_history(user_id);
CREATE INDEX idx_device_history_created_at ON public.device_history(created_at);
CREATE INDEX idx_device_history_action ON public.device_history(action);
```

#### User Preferences Table
```sql
-- Create user_preferences table
CREATE TABLE public.user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    preference_key TEXT NOT NULL,
    preference_value JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, preference_key)
);

-- Create indexes
CREATE INDEX idx_user_preferences_user_id ON public.user_preferences(user_id);
CREATE INDEX idx_user_preferences_key ON public.user_preferences(preference_key);
```

### 2. Execute SQL in Supabase

1. Go to **SQL Editor** in your Supabase dashboard
2. Copy and paste the SQL schema above
3. Click **"Run"** to execute
4. Verify all tables were created successfully

### 3. Enable Row Level Security

```sql
-- Enable RLS on all tables
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_timers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
```

## Authentication Setup

### 1. Configure Authentication Providers

1. Go to **Authentication** → **Settings**
2. Configure the following:

#### Email Authentication
- **Enable Email signup**: ✅ Enabled
- **Confirm email**: ✅ Enabled (recommended)
- **Enable email change**: ✅ Enabled
- **Site URL**: `https://your-domain.com`
- **Redirect URLs**: 
  - `https://your-domain.com/auth/callback`
  - `http://localhost:3000/auth/callback` (development)

#### Social Providers (Optional)
- **GitHub**: Enable if you want GitHub login
- **Google**: Enable if you want Google login
- **Apple**: Enable if you want Apple login

### 2. Create Auth Policies

```sql
-- Users can only see their own profile
CREATE POLICY "Users can view own profile" ON public.user_profiles
    FOR SELECT USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile" ON public.user_profiles
    FOR UPDATE USING (auth.uid() = id);

-- Users can insert their own profile (handled by trigger)
CREATE POLICY "Users can insert own profile" ON public.user_profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- Admins can view all profiles
CREATE POLICY "Admins can view all profiles" ON public.user_profiles
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Admins can update all profiles
CREATE POLICY "Admins can update all profiles" ON public.user_profiles
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );
```

### 3. Create User Registration Trigger

```sql
-- Create function to handle user registration
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.user_profiles (id, email, display_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
        'user'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

## Row Level Security (RLS)

### Device Access Policies

```sql
-- Users can view devices they have permission for
CREATE POLICY "Users can view permitted devices" ON public.devices
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.device_permissions 
            WHERE device_id = id AND user_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Users can update devices they have control permission for
CREATE POLICY "Users can update permitted devices" ON public.devices
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.device_permissions 
            WHERE device_id = id AND user_id = auth.uid() AND can_control = true
        )
        OR
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Admins can insert devices
CREATE POLICY "Admins can insert devices" ON public.devices
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );
```

### Device History Policies

```sql
-- Users can view history of devices they have permission for
CREATE POLICY "Users can view permitted device history" ON public.device_history
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.device_permissions 
            WHERE device_id = public.device_history.device_id 
            AND user_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = auth.uid() AND role = 'admin'
        )
        OR
        user_id = auth.uid() -- Users can see their own actions
    );

-- System can insert history (for ESP32 integration)
CREATE POLICY "System can insert device history" ON public.device_history
    FOR INSERT WITH CHECK (user_id IS NULL);
```

### Device Permissions Policies

```sql
-- Users can view their own device permissions
CREATE POLICY "Users can view own permissions" ON public.device_permissions
    FOR SELECT USING (user_id = auth.uid());

-- Users can insert permissions for devices they own
CREATE POLICY "Users can grant permissions" ON public.device_permissions
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.devices 
            WHERE id = device_id 
            AND last_updated_by = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );
```

## Real-time Configuration

### 1. Enable Real-time for Tables

```sql
-- Enable real-time for critical tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.devices;
ALTER PUBLICATION supabase_realtime ADD TABLE public.device_timers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.device_history;
ALTER PUBLICATION supabase_realtime ADD TABLE public.device_permissions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_profiles;
```

### 2. Real-time Subscription Policies

```sql
-- Users can subscribe to devices they have permission for
CREATE POLICY "Users can subscribe to permitted devices" ON public.devices
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.device_permissions 
            WHERE device_id = id AND user_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Users can subscribe to their own timers
CREATE POLICY "Users can subscribe to own timers" ON public.device_timers
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.device_permissions 
            WHERE device_id = public.device_timers.device_id 
            AND user_id = auth.uid()
        )
        OR
        created_by = auth.uid()
    );
```

### 3. Real-time Client Configuration

```javascript
// frontend/src/services/supabase.js
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
```

## Storage Configuration

### 1. Create Storage Buckets

1. Go to **Storage** in your Supabase dashboard
2. Create the following buckets:

#### User Avatars Bucket
- **Name**: `avatars`
- **Public**: Yes
- **File size limit**: 2MB
- **Allowed MIME types**: `image/jpeg`, `image/png`, `image/webp`

#### Device Images Bucket
- **Name**: `device-images`
- **Public**: Yes
- **File size limit**: 5MB
- **Allowed MIME types**: `image/jpeg`, `image/png`, `image/webp`

#### System Logs Bucket
- **Name**: `system-logs`
- **Public**: No
- **File size limit**: 10MB
- **Allowed MIME types**: `application/json`, `text/plain`

### 2. Storage Policies

```sql
-- Users can upload their own avatar
CREATE POLICY "Users can upload own avatar" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'avatars' 
        AND auth.uid()::text = (storage.foldername(name))[1]
    );

-- Users can view public avatars
CREATE POLICY "Anyone can view avatars" ON storage.objects
    FOR SELECT USING (bucket_id = 'avatars');

-- Admins can manage device images
CREATE POLICY "Admins can manage device images" ON storage.objects
    FOR ALL USING (
        bucket_id = 'device-images'
        AND EXISTS (
            SELECT 1 FROM public.user_profiles 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- System can write logs
CREATE POLICY "System can write logs" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'system-logs'
        AND auth.role() = 'service_role'
    );
```

## Environment Variables

### Frontend Environment Variables

Create `.env` file in frontend root:

```env
# Supabase Configuration
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here

# Application Configuration
VITE_APP_NAME=Smart Home Automation
VITE_APP_VERSION=1.0.0
VITE_API_BASE_URL=https://your-backend-url.com/api

# Feature Flags
VITE_ENABLE_ANALYTICS=false
VITE_ENABLE_DEBUG=false
VITE_ENABLE_PWA=true
```

### Backend Environment Variables

Create `.env` file in backend root:

```env
# Server Configuration
PORT=3001
NODE_ENV=production

# Supabase Configuration
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
SUPABASE_ANON_KEY=your-anon-key-here

# Database Configuration
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.your-project-id.supabase.co:5432/postgres

# Security Configuration
JWT_SECRET=your-super-secret-jwt-key-here
CORS_ORIGIN=https://your-frontend-domain.com

# Redis Configuration (for rate limiting)
REDIS_URL=redis://localhost:6379

# Logging Configuration
LOG_LEVEL=info
LOG_FILE=logs/app.log
```

## API Keys Management

### 1. Key Types and Usage

| Key Type | Usage | Where to Store | Security Level |
|-----------|--------|----------------|-----------------|
| **anon key** | Frontend authentication | Frontend env vars | Public |
| **service_role** | Backend admin operations | Backend env vars | Secret |
| **database URL** | Direct database access | Backend env vars | Secret |
| **JWT Secret** | Custom JWT signing | Backend env vars | Secret |

### 2. Key Rotation Strategy

1. **Regular Rotation**: Rotate keys every 90 days
2. **Emergency Rotation**: Immediately if compromise suspected
3. **Version Control**: Use key versions to allow graceful transitions
4. **Monitoring**: Monitor key usage and anomalies

### 3. Key Storage Best Practices

- Never commit keys to version control
- Use environment variables or secret management
- Implement key rotation procedures
- Monitor key usage and access patterns
- Use different keys for different environments

## Database Migrations

### 1. Migration System Setup

Create migration files in `backend/src/database/migrations/`:

```sql
-- 001_initial_schema.sql
-- Initial database schema (as shown above)

-- 002_add_device_groups.sql
CREATE TABLE public.device_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    created_by UUID NOT NULL REFERENCES public.user_profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 003_add_device_group_memberships.sql
CREATE TABLE public.device_group_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES public.device_groups(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(group_id, device_id)
);
```

### 2. Migration Runner

```javascript
// backend/src/database/migrations/runner.js
import fs from 'fs';
import path from 'path';
import { supabase } from '../../config/supabase.js';
import { logger } from '../../utils/logger.js';

export async function runMigrations() {
    try {
        // Create migrations table if it doesn't exist
        await supabase.rpc('create_migrations_table_if_not_exists');
        
        // Get executed migrations
        const { data: executedMigrations } = await supabase
            .from('migrations')
            .select('name')
            .order('executed_at');
        
        const executedNames = new Set(executedMigrations.map(m => m.name));
        
        // Get migration files
        const migrationsDir = path.join(__dirname, 'migrations');
        const migrationFiles = fs.readdirSync(migrationsDir)
            .filter(file => file.endsWith('.sql'))
            .sort();
        
        // Run pending migrations
        for (const file of migrationFiles) {
            if (!executedNames.has(file)) {
                logger.info(`Running migration: ${file}`);
                
                const migrationSQL = fs.readFileSync(
                    path.join(migrationsDir, file), 
                    'utf8'
                );
                
                const { error } = await supabase.rpc('execute_migration', {
                    migration_name: file,
                    migration_sql: migrationSQL
                });
                
                if (error) {
                    throw new Error(`Migration ${file} failed: ${error.message}`);
                }
                
                logger.info(`Migration completed: ${file}`);
            }
        }
        
        logger.info('All migrations completed successfully');
        
    } catch (error) {
        logger.error('Migration failed:', error);
        throw error;
    }
}
```

## Testing Configuration

### 1. Create Test Project

1. Create a separate Supabase project for testing
2. Use different project ID and credentials
3. Configure test environment variables

### 2. Test Database Setup

```sql
-- Insert test data
INSERT INTO public.user_profiles (id, email, display_name, role) VALUES
('00000000-0000-0000-0000-000000000001', 'test@example.com', 'Test User', 'user'),
('00000000-0000-0000-0000-000000000002', 'admin@example.com', 'Admin User', 'admin');

-- Insert test devices
INSERT INTO public.devices (id, name, type, ip_address, state) VALUES
('10000000-0000-0000-0000-000000000001', 'Test Relay 1', 'esp32', '192.168.1.100', '{"relay1": "off", "relay2": "on"}'),
('10000000-0000-0000-0000-000000000002', 'Test Relay 2', 'esp32', '192.168.1.101', '{"relay1": "on", "relay2": "off"}');

-- Insert test permissions
INSERT INTO public.device_permissions (user_id, device_id, can_control, can_view, can_manage_timers) VALUES
('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', true, true, true),
('00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', true, true, true),
('00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', true, true, true);
```

### 3. Test Configuration Files

```javascript
// backend/src/config/test.js
export const testConfig = {
    supabaseUrl: process.env.SUPABASE_TEST_URL,
    supabaseKey: process.env.SUPABASE_TEST_KEY,
    databaseUrl: process.env.DATABASE_TEST_URL,
    logLevel: 'debug'
};
```

## Production Setup

### 1. Production Project Configuration

1. Create a dedicated production project
2. Use strong database password
3. Enable all security features
4. Configure proper CORS origins
5. Set up custom domain (optional)

### 2. Production Security Settings

#### Authentication Settings
- **Enable MFA**: Enable multi-factor authentication
- **Password requirements**: Set strong password policies
- **Session duration**: Configure appropriate session timeouts
- **Rate limiting**: Enable authentication rate limiting

#### Database Settings
- **Connection pooling**: Configure appropriate pool size
- **Backup**: Enable automated backups
- **Point-in-time recovery**: Enable PITR
- **SSL**: Enforce SSL connections

#### API Settings
- **CORS**: Restrict to your domain
- **Rate limiting**: Implement strict rate limits
- **API keys**: Rotate keys regularly
- **Monitoring**: Set up alerts and monitoring

### 3. Production Monitoring

```javascript
// backend/src/monitoring/healthCheck.js
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
        const { data, error } = await supabase
            .from('user_profiles')
            .select('id')
            .limit(1);
        
        return { healthy: !error, error };
    } catch (error) {
        return { healthy: false, error: error.message };
    }
}
```

## Troubleshooting

### Common Issues

#### 1. Connection Issues
**Problem**: Cannot connect to Supabase from backend
**Solution**:
- Check database URL format
- Verify network connectivity
- Check firewall settings
- Validate credentials

#### 2. RLS Policy Issues
**Problem**: Queries return no data
**Solution**:
- Check RLS policies are correctly defined
- Verify user authentication
- Test policies in SQL Editor
- Check policy precedence

#### 3. Real-time Issues
**Problem**: Real-time subscriptions not working
**Solution**:
- Enable real-time on tables
- Check RLS policies for real-time
- Verify client configuration
- Check network connectivity

#### 4. Authentication Issues
**Problem**: Users cannot authenticate
**Solution**:
- Check email confirmation settings
- Verify redirect URLs
- Check JWT configuration
- Review auth policies

### Debug Tools

#### Supabase Dashboard
- **SQL Editor**: Test queries directly
- **Table Editor**: View and edit data
- **Auth Logs**: Monitor authentication attempts
- **Database Logs**: View database activity

#### Client-side Debugging
```javascript
// Enable Supabase debug logging
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(url, key, {
    db: {
        schema: 'public'
    },
    auth: {
        debug: true // Enable debug logging
    }
});

// Listen to auth events
supabase.auth.onAuthStateChange((event, session) => {
    console.log('Auth event:', event, session);
});
```

#### Backend Debugging
```javascript
// Add logging to Supabase operations
import { logger } from '../utils/logger.js';

export async function withLogging(operation, ...args) {
    logger.debug(`Supabase operation: ${operation}`, { args });
    
    try {
        const result = await operation(...args);
        logger.debug(`Supabase operation success: ${operation}`, { result });
        return result;
    } catch (error) {
        logger.error(`Supabase operation failed: ${operation}`, { error });
        throw error;
    }
}

// Usage
const result = await withLogging(
    supabase.from('devices').select('*'),
    'getDevices'
);
```

This comprehensive Supabase setup guide provides everything needed to configure a robust, secure backend for the ESP32 Smart Home Automation system.
