# Authentication Flow Documentation

## Table of Contents

1. [Overview](#overview)
2. [Authentication Systems](#authentication-systems)
3. [Offline Authentication](#offline-authentication)
4. [Online Authentication](#online-authentication)
5. [User Registration Flow](#user-registration-flow)
6. [Role-Based Access Control](#role-based-access-control)
7. [Session Management](#session-management)
8. [Security Implementation](#security-implementation)
9. [Authentication State Management](#authentication-state-management)
10. [Protected Routes](#protected-routes)
11. [Error Handling](#error-handling)
12. [Testing Authentication](#testing-authentication)

## Overview

The ESP32 Smart Home Automation system implements a dual authentication architecture:

- **Offline Authentication**: Local MAC address-based authentication stored in ESP32 NVS
- **Online Authentication**: Supabase-based authentication with JWT tokens and role management

Both systems provide secure access control while maintaining functionality in their respective environments.

## Authentication Systems

### System Comparison

| Feature | Offline Mode | Online Mode |
|---------|---------------|-------------|
| **Authentication Method** | MAC Address + Password | Email/Password + Supabase Auth |
| **Storage** | ESP32 NVS | Supabase Database |
| **Session Management** | Simple session timeout | JWT tokens with refresh |
| **Role System** | Admin/Restricted | Admin/User + Custom Roles |
| **Password Storage** | SHA-256 hash in NVS | Supabase Auth (bcrypt) |
| **Multi-Device Support** | Single device | Multiple devices |
| **Password Recovery** | Manual reset | Email recovery |

### Authentication Flow Decision Tree

```
Application Start
        ↓
Check Internet Connectivity
        ↓
    ┌─────────────┐
    │   Online?   │
    └─────────────┘
        ↓ Yes              ↓ No
Online Authentication    Offline Authentication
        ↓                    ↓
Supabase Auth          Local NVS Auth
        ↓                    ↓
JWT Session           MAC-based Session
        ↓                    ↓
Role-based Routing    Local Role Routing
```

## Offline Authentication

### Architecture

```
Browser (Local) → ESP32 WebPortal → StorageLayer → NVS Storage
       ↓                ↓                ↓              ↓
   Login Form → Authentication Check → User Lookup → MAC/Password Verify
       ↓                ↓                ↓              ↓
   Session Set → Local Cookie Set → Role Assignment → Dashboard Access
```

### Implementation Details

#### User Account Structure (Offline)

```cpp
// In SystemTypes.h
struct UserAccount {
    char macAddress[MAX_MAC_LENGTH];    // "AA:BB:CC:DD:EE:FF"
    char displayName[MAX_NAME_LENGTH];  // Friendly name
    char passwordHash[MAX_PASSWORD_LENGTH]; // SHA256 hex string
    bool isAdmin;
    bool canManageUsers;
    bool restricted;  // Limited UI access
    uint64_t createdAt;
    uint64_t lastAccess;
};
```

#### Password Hashing

```cpp
// In StorageLayer.cpp
String hashPassword(const String& password) {
    mbedtls_sha256_context ctx;
    unsigned char hash[32];
    char hexString[65];
    
    mbedtls_sha256_init(&ctx);
    mbedtls_sha256_starts(&ctx, 0);
    mbedtls_sha256_update(&ctx, (const unsigned char*)password.c_str(), password.length());
    mbedtls_sha256_finish(&ctx, hash);
    mbedtls_sha256_free(&ctx);
    
    // Convert to hex string
    for (int i = 0; i < 32; i++) {
        sprintf(hexString + (i * 2), "%02x", hash[i]);
    }
    hexString[64] = '\0';
    
    return String(hexString);
}
```

#### Authentication Process

```cpp
// In WebPortal.cpp
bool authenticateUser(const String& macAddress, const String& password) {
    // Load user accounts from NVS
    AccessControlRuntime access;
    if (!gStorage.loadUserAccounts(&access)) {
        Serial.println("[Auth] Failed to load user accounts");
        return false;
    }
    
    // Find user by MAC address
    UserAccount* user = findUserByMac(macAddress.c_str());
    if (!user) {
        Serial.printf("[Auth] User not found for MAC: %s\n", macAddress.c_str());
        return false;
    }
    
    // Verify password hash
    String hashedInput = hashPassword(password);
    bool passwordMatch = strcmp(hashedInput.c_str(), user->passwordHash) == 0;
    
    if (passwordMatch) {
        // Update last access time
        user->lastAccess = gTimeKeeper.nowEpoch();
        gStorage.saveUserAccounts(&access);
        
        Serial.printf("[Auth] User authenticated: %s\n", user->displayName);
        return true;
    } else {
        Serial.printf("[Auth] Password mismatch for MAC: %s\n", macAddress.c_str());
        return false;
    }
}
```

#### Session Management (Offline)

```cpp
// In WebPortal.cpp
struct AuthSession {
    String macAddress;
    String displayName;
    bool isAdmin;
    bool restricted;
    uint32_t loginTime;
    uint32_t lastActivity;
    String sessionId;
};

std::map<String, AuthSession> activeSessions;

String createSession(const UserAccount& user, const String& clientMac) {
    AuthSession session;
    session.macAddress = clientMac;
    session.displayName = user.displayName;
    session.isAdmin = user.isAdmin;
    session.restricted = user.restricted;
    session.loginTime = millis();
    session.lastActivity = millis();
    session.sessionId = generateSessionId();
    
    activeSessions[session.sessionId] = session;
    
    return session.sessionId;
}

bool validateSession(const String& sessionId) {
    auto it = activeSessions.find(sessionId);
    if (it == activeSessions.end()) {
        return false;
    }
    
    AuthSession& session = it->second;
    uint32_t now = millis();
    
    // Check session timeout (24 hours)
    if (now - session.loginTime > 24 * 60 * 60 * 1000) {
        activeSessions.erase(it);
        return false;
    }
    
    // Update last activity
    session.lastActivity = now;
    return true;
}
```

## Online Authentication

### Architecture

```
Browser → GitHub Pages → Supabase Auth → Backend Server → Supabase Database
   ↓           ↓              ↓              ↓              ↓
Login Form → Auth Client → JWT Token → Token Validation → User Profile
   ↓           ↓              ↓              ↓              ↓
Session → Local Storage → API Calls → Role Check → Dashboard Access
```

### Frontend Authentication Implementation

#### Supabase Client Configuration

```javascript
// frontend/src/services/supabase.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
    }
});
```

#### Authentication Service

```javascript
// frontend/src/services/auth.js
import { supabase } from './supabase.js';

export class AuthService {
    constructor() {
        this.user = null;
        this.role = null;
        this.listeners = [];
    }
    
    // Sign in with email and password
    async signIn(email, password) {
        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });
            
            if (error) throw error;
            
            // Get user role from database
            const { data: profile } = await supabase
                .from('user_profiles')
                .select('role, permissions')
                .eq('id', data.user.id)
                .single();
            
            this.user = data.user;
            this.role = profile.role;
            
            // Notify listeners
            this.notifyListeners();
            
            return { success: true, user: data.user, role: profile.role };
        } catch (error) {
            console.error('Sign in error:', error);
            return { success: false, error: error.message };
        }
    }
    
    // Sign up new user
    async signUp(email, password, displayName) {
        try {
            // Create auth user
            const { data, error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        display_name: displayName
                    }
                }
            });
            
            if (error) throw error;
            
            // Create user profile
            const { error: profileError } = await supabase
                .from('user_profiles')
                .insert({
                    id: data.user.id,
                    email: email,
                    display_name: displayName,
                    role: 'user', // Default role
                    permissions: {},
                    created_at: new Date().toISOString()
                });
            
            if (profileError) throw profileError;
            
            return { success: true, user: data.user };
        } catch (error) {
            console.error('Sign up error:', error);
            return { success: false, error: error.message };
        }
    }
    
    // Sign out
    async signOut() {
        try {
            await supabase.auth.signOut();
            this.user = null;
            this.role = null;
            this.notifyListeners();
        } catch (error) {
            console.error('Sign out error:', error);
        }
    }
    
    // Get current session
    async getCurrentSession() {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            
            if (session) {
                this.user = session.user;
                
                // Get user role
                const { data: profile } = await supabase
                    .from('user_profiles')
                    .select('role, permissions')
                    .eq('id', session.user.id)
                    .single();
                
                this.role = profile.role;
            }
            
            return session;
        } catch (error) {
            console.error('Get session error:', error);
            return null;
        }
    }
    
    // Subscribe to auth changes
    onAuthStateChange(callback) {
        return supabase.auth.onAuthStateChange(async (event, session) => {
            if (session) {
                this.user = session.user;
                
                // Get user role
                const { data: profile } = await supabase
                    .from('user_profiles')
                    .select('role, permissions')
                    .eq('id', session.user.id)
                    .single();
                
                this.role = profile.role;
            } else {
                this.user = null;
                this.role = null;
            }
            
            callback(event, session);
            this.notifyListeners();
        });
    }
    
    // Role-based permission checking
    hasRole(requiredRole) {
        if (!this.role) return false;
        
        const roleHierarchy = {
            'admin': 3,
            'moderator': 2,
            'user': 1
        };
        
        return roleHierarchy[this.role] >= roleHierarchy[requiredRole];
    }
    
    hasPermission(permission) {
        // Implementation for granular permissions
        return this.hasRole('admin'); // Simplified for now
    }
    
    // Subscribe to auth state changes
    subscribe(listener) {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }
    
    notifyListeners() {
        this.listeners.forEach(listener => listener({
            user: this.user,
            role: this.role
        }));
    }
}

export const authService = new AuthService();
```

#### Authentication Components

```jsx
// frontend/src/components/auth/LoginForm.jsx
import React, { useState } from 'react';
import { authService } from '../services/auth';

export const LoginForm = ({ onLogin }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    
    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        
        try {
            const result = await authService.signIn(email, password);
            
            if (result.success) {
                onLogin(result.user, result.role);
            } else {
                setError(result.error);
            }
        } catch (err) {
            setError('An unexpected error occurred');
        } finally {
            setLoading(false);
        }
    };
    
    return (
        <div className="login-form">
            <h2>Sign In</h2>
            <form onSubmit={handleSubmit}>
                <div className="form-group">
                    <label>Email:</label>
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                </div>
                <div className="form-group">
                    <label>Password:</label>
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />
                </div>
                {error && <div className="error">{error}</div>}
                <button type="submit" disabled={loading}>
                    {loading ? 'Signing in...' : 'Sign In'}
                </button>
            </form>
        </div>
    );
};
```

```jsx
// frontend/src/components/auth/RegisterForm.jsx
import React, { useState } from 'react';
import { authService } from '../services/auth';

export const RegisterForm = ({ onRegister }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    
    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        
        if (password !== confirmPassword) {
            setError('Passwords do not match');
            setLoading(false);
            return;
        }
        
        if (password.length < 8) {
            setError('Password must be at least 8 characters');
            setLoading(false);
            return;
        }
        
        try {
            const result = await authService.signUp(email, password, displayName);
            
            if (result.success) {
                onRegister(result.user);
            } else {
                setError(result.error);
            }
        } catch (err) {
            setError('An unexpected error occurred');
        } finally {
            setLoading(false);
        }
    };
    
    return (
        <div className="register-form">
            <h2>Create Account</h2>
            <form onSubmit={handleSubmit}>
                <div className="form-group">
                    <label>Email:</label>
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                </div>
                <div className="form-group">
                    <label>Display Name:</label>
                    <input
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        required
                    />
                </div>
                <div className="form-group">
                    <label>Password:</label>
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={8}
                    />
                </div>
                <div className="form-group">
                    <label>Confirm Password:</label>
                    <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                    />
                </div>
                {error && <div className="error">{error}</div>}
                <button type="submit" disabled={loading}>
                    {loading ? 'Creating account...' : 'Create Account'}
                </button>
            </form>
        </div>
    );
};
```

## User Registration Flow

### Online Registration Process

```
User Accesses Registration Page
            ↓
    Fills Registration Form
            ↓
    Frontend Validation
            ↓
    Supabase Auth Sign Up
            ↓
    User Profile Creation
            ↓
    Default Role Assignment
            ↓
    Email Verification (Optional)
            ↓
    Auto Login
            ↓
    Dashboard Redirect
```

### Backend Registration Handler

```javascript
// backend/src/api/auth.js
export const handleRegistration = async (req, res) => {
    try {
        const { email, password, displayName } = req.body;
        
        // Validate input
        if (!email || !password || !displayName) {
            return res.status(400).json({ 
                error: 'Missing required fields' 
            });
        }
        
        // Check if user already exists
        const { data: existingUser } = await supabase
            .from('user_profiles')
            .select('id')
            .eq('email', email)
            .single();
        
        if (existingUser) {
            return res.status(409).json({ 
                error: 'User already exists' 
            });
        }
        
        // Create auth user
        const { data, error } = await supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: {
                display_name: displayName
            }
        });
        
        if (error) throw error;
        
        // Create user profile
        const { error: profileError } = await supabase
            .from('user_profiles')
            .insert({
                id: data.user.id,
                email: email,
                display_name: displayName,
                role: 'user',
                permissions: {},
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });
        
        if (profileError) throw profileError;
        
        res.status(201).json({ 
            success: true, 
            user: data.user 
        });
        
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ 
            error: 'Registration failed' 
        });
    }
};
```

## Role-Based Access Control

### Role Definitions

| Role | Permissions | Access Level |
|------|-------------|--------------|
| **admin** | Full system access | Maximum |
| **moderator** | Device control, user management | High |
| **user** | Basic device control | Standard |
| **guest** | Read-only access | Minimum |

### Frontend Role Implementation

```jsx
// frontend/src/components/auth/ProtectedRoute.jsx
import React from 'react';
import { authService } from '../services/auth';

export const ProtectedRoute = ({ children, requiredRole, fallback }) => {
    const [authState, setAuthState] = React.useState({
        user: null,
        role: null,
        loading: true
    });
    
    React.useEffect(() => {
        const checkAuth = async () => {
            await authService.getCurrentSession();
            setAuthState({
                user: authService.user,
                role: authService.role,
                loading: false
            });
        };
        
        checkAuth();
        
        const unsubscribe = authService.subscribe((state) => {
            setAuthState({
                user: state.user,
                role: state.role,
                loading: false
            });
        });
        
        return unsubscribe;
    }, []);
    
    if (authState.loading) {
        return <div>Loading...</div>;
    }
    
    if (!authState.user) {
        return fallback || <div>Please sign in to access this page.</div>;
    }
    
    if (requiredRole && !authService.hasRole(requiredRole)) {
        return fallback || <div>Insufficient permissions.</div>;
    }
    
    return children;
};

// Usage example
export const AdminRoute = ({ children }) => (
    <ProtectedRoute requiredRole="admin" fallback={<div>Admin access required.</div>}>
        {children}
    </ProtectedRoute>
);
```

### Backend Role Validation

```javascript
// backend/src/middleware/auth.js
export const requireRole = (requiredRole) => {
    return async (req, res, next) => {
        try {
            // Get JWT token from Authorization header
            const token = req.headers.authorization?.replace('Bearer ', '');
            
            if (!token) {
                return res.status(401).json({ error: 'No token provided' });
            }
            
            // Verify token with Supabase
            const { data: { user }, error } = await supabase.auth.getUser(token);
            
            if (error || !user) {
                return res.status(401).json({ error: 'Invalid token' });
            }
            
            // Get user role from database
            const { data: profile } = await supabase
                .from('user_profiles')
                .select('role, permissions')
                .eq('id', user.id)
                .single();
            
            if (!profile) {
                return res.status(403).json({ error: 'User profile not found' });
            }
            
            // Check role hierarchy
            const roleHierarchy = {
                'admin': 3,
                'moderator': 2,
                'user': 1,
                'guest': 0
            };
            
            const userLevel = roleHierarchy[profile.role] || 0;
            const requiredLevel = roleHierarchy[requiredRole] || 0;
            
            if (userLevel < requiredLevel) {
                return res.status(403).json({ error: 'Insufficient permissions' });
            }
            
            // Add user info to request
            req.user = user;
            req.userRole = profile.role;
            req.userPermissions = profile.permissions;
            
            next();
        } catch (error) {
            console.error('Auth middleware error:', error);
            res.status(500).json({ error: 'Authentication error' });
        }
    };
};
```

## Session Management

### Frontend Session Management

```javascript
// frontend/src/services/session.js
export class SessionManager {
    constructor() {
        this.sessionTimeout = 24 * 60 * 60 * 1000; // 24 hours
        this.refreshInterval = 15 * 60 * 1000; // 15 minutes
        this.refreshTimer = null;
    }
    
    startSessionRefresh() {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
        }
        
        this.refreshTimer = setInterval(async () => {
            try {
                const { data: { session } } = await supabase.auth.refreshSession();
                if (!session) {
                    this.handleSessionExpired();
                }
            } catch (error) {
                console.error('Session refresh error:', error);
                this.handleSessionExpired();
            }
        }, this.refreshInterval);
    }
    
    stopSessionRefresh() {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = null;
        }
    }
    
    handleSessionExpired() {
        this.stopSessionRefresh();
        // Redirect to login
        window.location.href = '/login';
    }
    
    extendSession() {
        // Reset session timeout
        this.lastActivity = Date.now();
    }
}

export const sessionManager = new SessionManager();
```

### Backend Session Validation

```javascript
// backend/src/middleware/session.js
export const validateSession = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }
        
        // Verify with Supabase
        const { data: { user }, error } = await supabase.auth.getUser(token);
        
        if (error || !user) {
            return res.status(401).json({ error: 'Invalid token' });
        }
        
        // Check session expiry
        const now = new Date();
        const tokenExpiry = new Date(user.exp * 1000);
        
        if (now > tokenExpiry) {
            return res.status(401).json({ error: 'Token expired' });
        }
        
        req.user = user;
        next();
    } catch (error) {
        console.error('Session validation error:', error);
        res.status(500).json({ error: 'Session validation failed' });
    }
};
```

## Security Implementation

### Password Security

```javascript
// Frontend password validation
export const validatePassword = (password) => {
    const errors = [];
    
    if (password.length < 8) {
        errors.push('Password must be at least 8 characters long');
    }
    
    if (!/[A-Z]/.test(password)) {
        errors.push('Password must contain at least one uppercase letter');
    }
    
    if (!/[a-z]/.test(password)) {
        errors.push('Password must contain at least one lowercase letter');
    }
    
    if (!/[0-9]/.test(password)) {
        errors.push('Password must contain at least one number');
    }
    
    if (!/[!@#$%^&*]/.test(password)) {
        errors.push('Password must contain at least one special character');
    }
    
    return {
        isValid: errors.length === 0,
        errors
    };
};
```

### Rate Limiting

```javascript
// backend/src/middleware/rateLimit.js
const rateLimit = require('express-rate-limit');

export const authRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // limit each IP to 5 requests per windowMs
    message: 'Too many authentication attempts, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
});

export const generalRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests, please try again later',
});
```

### CSRF Protection

```javascript
// backend/src/middleware/csrf.js
import crypto from 'crypto';

export const generateCSRFToken = () => {
    return crypto.randomBytes(32).toString('hex');
};

export const validateCSRFToken = (req, res, next) => {
    const token = req.headers['x-csrf-token'];
    const sessionToken = req.session?.csrfToken;
    
    if (!token || token !== sessionToken) {
        return res.status(403).json({ error: 'Invalid CSRF token' });
    }
    
    next();
};
```

## Authentication State Management

### React Context for Auth

```jsx
// frontend/src/context/AuthContext.jsx
import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { authService } from '../services/auth';

const AuthContext = createContext();

const authReducer = (state, action) => {
    switch (action.type) {
        case 'LOGIN_START':
            return { ...state, loading: true, error: null };
        case 'LOGIN_SUCCESS':
            return { 
                ...state, 
                loading: false, 
                user: action.payload.user,
                role: action.payload.role,
                isAuthenticated: true,
                error: null 
            };
        case 'LOGIN_FAILURE':
            return { 
                ...state, 
                loading: false, 
                error: action.payload,
                isAuthenticated: false 
            };
        case 'LOGOUT':
            return { 
                ...state, 
                user: null, 
                role: null,
                isAuthenticated: false,
                error: null 
            };
        case 'CLEAR_ERROR':
            return { ...state, error: null };
        default:
            return state;
    }
};

const initialState = {
    user: null,
    role: null,
    isAuthenticated: false,
    loading: false,
    error: null
};

export const AuthProvider = ({ children }) => {
    const [state, dispatch] = useReducer(authReducer, initialState);
    
    useEffect(() => {
        // Check for existing session on mount
        const checkSession = async () => {
            const session = await authService.getCurrentSession();
            if (session) {
                dispatch({
                    type: 'LOGIN_SUCCESS',
                    payload: {
                        user: authService.user,
                        role: authService.role
                    }
                });
            }
        };
        
        checkSession();
        
        // Subscribe to auth changes
        const unsubscribe = authService.subscribe((authState) => {
            if (authState.user) {
                dispatch({
                    type: 'LOGIN_SUCCESS',
                    payload: {
                        user: authState.user,
                        role: authState.role
                    }
                });
            } else {
                dispatch({ type: 'LOGOUT' });
            }
        });
        
        return unsubscribe;
    }, []);
    
    const login = async (email, password) => {
        dispatch({ type: 'LOGIN_START' });
        
        try {
            const result = await authService.signIn(email, password);
            
            if (result.success) {
                dispatch({
                    type: 'LOGIN_SUCCESS',
                    payload: {
                        user: result.user,
                        role: result.role
                    }
                });
                return true;
            } else {
                dispatch({
                    type: 'LOGIN_FAILURE',
                    payload: result.error
                });
                return false;
            }
        } catch (error) {
            dispatch({
                type: 'LOGIN_FAILURE',
                payload: 'An unexpected error occurred'
            });
            return false;
        }
    };
    
    const logout = async () => {
        await authService.signOut();
        dispatch({ type: 'LOGOUT' });
    };
    
    const clearError = () => {
        dispatch({ type: 'CLEAR_ERROR' });
    };
    
    const value = {
        ...state,
        login,
        logout,
        clearError
    };
    
    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
```

## Protected Routes

### Frontend Route Protection

```jsx
// frontend/src/App.jsx
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ProtectedRoute, AdminRoute } from './components/auth/ProtectedRoute';

// Components
import { LoginForm } from './components/auth/LoginForm';
import { RegisterForm } from './components/auth/RegisterForm';
import { Dashboard } from './pages/Dashboard';
import { AdminDashboard } from './pages/AdminDashboard';
import { UserDashboard } from './pages/UserDashboard';

const AppRoutes = () => {
    const { isAuthenticated, user, role } = useAuth();
    
    return (
        <Routes>
            <Route path="/login" element={
                isAuthenticated ? <Navigate to="/dashboard" /> : <LoginForm />
            } />
            <Route path="/register" element={
                isAuthenticated ? <Navigate to="/dashboard" /> : <RegisterForm />
            } />
            <Route path="/dashboard" element={
                <ProtectedRoute>
                    <Dashboard />
                </ProtectedRoute>
            } />
            <Route path="/admin" element={
                <AdminRoute>
                    <AdminDashboard />
                </AdminRoute>
            } />
            <Route path="/user" element={
                <ProtectedRoute requiredRole="user">
                    <UserDashboard />
                </ProtectedRoute>
            } />
            <Route path="/" element={
                <Navigate to={isAuthenticated ? "/dashboard" : "/login"} />
            } />
        </Routes>
    );
};

const App = () => {
    return (
        <AuthProvider>
            <Router>
                <AppRoutes />
            </Router>
        </AuthProvider>
    );
};

export default App;
```

### Backend Route Protection

```javascript
// backend/src/routes/auth.js
import express from 'express';
import { handleLogin, handleRegistration } from '../api/auth';
import { authRateLimit, validateSession } from '../middleware/auth';

const router = express.Router();

// Public routes
router.post('/login', authRateLimit, handleLogin);
router.post('/register', authRateLimit, handleRegistration);

// Protected routes
router.get('/profile', validateSession, async (req, res) => {
    try {
        const { data: profile } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('id', req.user.id)
            .single();
        
        res.json(profile);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

router.put('/profile', validateSession, async (req, res) => {
    try {
        const { displayName } = req.body;
        
        const { data: profile } = await supabase
            .from('user_profiles')
            .update({
                display_name: displayName,
                updated_at: new Date().toISOString()
            })
            .eq('id', req.user.id)
            .single();
        
        res.json(profile);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

export default router;
```

## Error Handling

### Authentication Error Types

```javascript
// frontend/src/utils/authErrors.js
export const AUTH_ERRORS = {
    INVALID_CREDENTIALS: 'Invalid email or password',
    USER_NOT_FOUND: 'User not found',
    EMAIL_ALREADY_EXISTS: 'Email already registered',
    WEAK_PASSWORD: 'Password does not meet requirements',
    TOKEN_EXPIRED: 'Session expired, please login again',
    INVALID_TOKEN: 'Invalid authentication token',
    NETWORK_ERROR: 'Network error, please try again',
    SERVER_ERROR: 'Server error, please try again later'
};

export const getAuthErrorMessage = (error) => {
    const message = error?.message || error;
    
    if (message.includes('Invalid login credentials')) {
        return AUTH_ERRORS.INVALID_CREDENTIALS;
    }
    
    if (message.includes('User already registered')) {
        return AUTH_ERRORS.EMAIL_ALREADY_EXISTS;
    }
    
    if (message.includes('Password should be')) {
        return AUTH_ERRORS.WEAK_PASSWORD;
    }
    
    if (message.includes('Token has expired')) {
        return AUTH_ERRORS.TOKEN_EXPIRED;
    }
    
    if (message.includes('Invalid token')) {
        return AUTH_ERRORS.INVALID_TOKEN;
    }
    
    if (message.includes('fetch')) {
        return AUTH_ERRORS.NETWORK_ERROR;
    }
    
    return AUTH_ERRORS.SERVER_ERROR;
};
```

### Error Boundary for Auth

```jsx
// frontend/src/components/auth/AuthErrorBoundary.jsx
import React from 'react';

export class AuthErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }
    
    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }
    
    componentDidCatch(error, errorInfo) {
        console.error('Auth Error Boundary caught an error:', error, errorInfo);
    }
    
    render() {
        if (this.state.hasError) {
            return (
                <div className="auth-error-boundary">
                    <h2>Authentication Error</h2>
                    <p>Something went wrong with authentication.</p>
                    <button onClick={() => window.location.reload()}>
                        Reload Page
                    </button>
                </div>
            );
        }
        
        return this.props.children;
    }
}
```

## Testing Authentication

### Unit Tests for Auth Service

```javascript
// frontend/src/tests/auth.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthService } from '../services/auth';

describe('AuthService', () => {
    let authService;
    
    beforeEach(() => {
        authService = new AuthService();
        vi.clearAllMocks();
    });
    
    describe('signIn', () => {
        it('should successfully sign in with valid credentials', async () => {
            const mockUser = { id: '123', email: 'test@example.com' };
            const mockProfile = { role: 'user' };
            
            vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
                data: { user: mockUser },
                error: null
            });
            
            vi.mocked(supabase.from).mockReturnValue({
                select: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                        single: vi.fn().mockResolvedValue({
                            data: mockProfile,
                            error: null
                        })
                    })
                })
            });
            
            const result = await authService.signIn('test@example.com', 'password');
            
            expect(result.success).toBe(true);
            expect(result.user).toEqual(mockUser);
            expect(result.role).toBe('user');
        });
        
        it('should return error with invalid credentials', async () => {
            vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
                data: null,
                error: { message: 'Invalid login credentials' }
            });
            
            const result = await authService.signIn('test@example.com', 'wrongpassword');
            
            expect(result.success).toBe(false);
            expect(result.error).toBe('Invalid login credentials');
        });
    });
    
    describe('hasRole', () => {
        it('should return true for sufficient role', () => {
            authService.role = 'admin';
            expect(authService.hasRole('user')).toBe(true);
            expect(authService.hasRole('admin')).toBe(true);
        });
        
        it('should return false for insufficient role', () => {
            authService.role = 'user';
            expect(authService.hasRole('admin')).toBe(false);
            expect(authService.hasRole('moderator')).toBe(false);
        });
    });
});
```

### Integration Tests

```javascript
// frontend/src/tests/auth.integration.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthProvider } from '../context/AuthContext';
import { LoginForm } from '../components/auth/LoginForm';

const renderWithAuth = (component) => {
    return render(
        <AuthProvider>
            {component}
        </AuthProvider>
    );
};

describe('Authentication Integration', () => {
    beforeEach(() => {
        // Mock Supabase auth
        global.supabase = {
            auth: {
                signInWithPassword: vi.fn(),
                signUp: vi.fn(),
                signOut: vi.fn()
            }
        };
    });
    
    it('should complete full login flow', async () => {
        const mockUser = { id: '123', email: 'test@example.com' };
        global.supabase.auth.signInWithPassword.mockResolvedValue({
            data: { user: mockUser },
            error: null
        });
        
        renderWithAuth(<LoginForm onLogin={vi.fn()} />);
        
        // Fill form
        fireEvent.change(screen.getByLabelText(/email/i), {
            target: { value: 'test@example.com' }
        });
        fireEvent.change(screen.getByLabelText(/password/i), {
            target: { value: 'password' }
        });
        
        // Submit form
        fireEvent.click(screen.getByText(/sign in/i));
        
        // Wait for success
        await waitFor(() => {
            expect(global.supabase.auth.signInWithPassword).toHaveBeenCalledWith({
                email: 'test@example.com',
                password: 'password'
            });
        });
    });
});
```

This comprehensive authentication documentation provides a complete guide for implementing secure, user-friendly authentication across both offline and online modes of the ESP32 Smart Home Automation system.
