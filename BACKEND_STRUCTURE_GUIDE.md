# Backend Structure Guide

## Table of Contents

1. [Overview](#overview)
2. [Project Structure](#project-structure)
3. [Core Architecture](#core-architecture)
4. [API Routes](#api-routes)
5. [Middleware](#middleware)
6. [Services](#services)
7. [Database Layer](#database-layer)
8. [Real-time Communication](#real-time-communication)
9. [Authentication & Authorization](#authentication--authorization)
10. [ESP32 Communication](#esp32-communication)
11. [Error Handling](#error-handling)
12. [Configuration](#configuration)
13. [Testing](#testing)
14. [File Responsibilities](#file-responsibilities)

## Overview

The backend is a Node.js/Express.js server that provides API endpoints, real-time communication, and business logic for the ESP32 Smart Home Automation system in online mode. It acts as a bridge between the frontend, Supabase database, and ESP32 devices.

### Key Responsibilities
- **API Gateway**: Handle HTTP requests from frontend
- **Authentication**: Validate JWT tokens and manage sessions
- **Real-time Communication**: WebSocket server for live updates
- **Device Communication**: Communicate with ESP32 devices
- **Business Logic**: Enforce rules and manage system state
- **Data Validation**: Validate and sanitize all inputs
- **Error Handling**: Consistent error responses and logging

## Project Structure

```
backend/
├── src/
│   ├── controllers/        # Request handlers
│   │   ├── auth.js       # Authentication endpoints
│   │   ├── devices.js    # Device control endpoints
│   │   ├── users.js       # User management endpoints
│   │   └── admin.js      # Admin-only endpoints
│   ├── middleware/         # Express middleware
│   │   ├── auth.js        # Authentication validation
│   │   ├── validation.js  # Input validation
│   │   ├── rateLimit.js   # Rate limiting
│   │   ├── cors.js        # CORS configuration
│   │   └── errorHandler.js # Error handling
│   ├── services/           # Business logic services
│   │   ├── authService.js # Authentication logic
│   │   ├── deviceService.js # Device management
│   │   ├── userService.js # User management
│   │   ├── supabaseService.js # Supabase integration
│   │   └── esp32Service.js # ESP32 communication
│   ├── routes/             # Route definitions
│   │   ├── auth.js        # Authentication routes
│   │   ├── devices.js     # Device routes
│   │   ├── users.js       # User routes
│   │   └── admin.js       # Admin routes
│   ├── realtime/           # Real-time communication
│   │   ├── websocket.js   # WebSocket server
│   │   ├── events.js      # Event handling
│   │   └── rooms.js       # Room management
│   ├── database/           # Database operations
│   │   ├── models/        # Data models
│   │   ├── queries.js     # SQL queries
│   │   └── migrations.js  # Database migrations
│   ├── utils/              # Utility functions
│   │   ├── logger.js      # Logging utilities
│   │   ├── validation.js  # Validation helpers
│   │   ├── encryption.js  # Encryption utilities
│   │   └── helpers.js     # General helpers
│   ├── config/             # Configuration files
│   │   ├── database.js    # Database configuration
│   │   ├── supabase.js    # Supabase configuration
│   │   └── server.js      # Server configuration
│   └── index.js            # Application entry point
├── tests/                  # Test files
│   ├── unit/              # Unit tests
│   ├── integration/        # Integration tests
│   └── fixtures/          # Test data
├── docs/                   # Documentation
├── package.json
├── .env.example           # Environment variables template
├── .gitignore
└── README.md
```

## Core Architecture

### `src/index.js`
**Purpose**: Application entry point and server initialization.

**Responsibilities**:
- Initialize Express application
- Configure middleware
- Set up routes
- Start WebSocket server
- Handle graceful shutdown
- Error handling setup

```javascript
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

// Import routes
import authRoutes from './routes/auth.js';
import deviceRoutes from './routes/devices.js';
import userRoutes from './routes/users.js';
import adminRoutes from './routes/admin.js';

// Import middleware
import { errorHandler } from './middleware/errorHandler.js';
import { rateLimitMiddleware } from './middleware/rateLimit.js';
import { corsMiddleware } from './middleware/cors.js';

// Import services
import { initializeWebSocket } from './realtime/websocket.js';
import { connectDatabase } from './config/database.js';
import { logger } from './utils/logger.js';

const app = express();
const server = createServer(app);
const io = new Server(server, {
    cors: corsMiddleware
});

// Security middleware
app.use(helmet());
app.use(corsMiddleware);
app.use(rateLimitMiddleware);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);

// Error handling middleware
app.use(errorHandler);

// Initialize services
async function initializeServer() {
    try {
        // Connect to database
        await connectDatabase();
        
        // Initialize WebSocket
        initializeWebSocket(io);
        
        // Start server
        const PORT = process.env.PORT || 3001;
        server.listen(PORT, () => {
            logger.info(`Server running on port ${PORT}`);
        });
        
    } catch (error) {
        logger.error('Failed to initialize server:', error);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    server.close(() => {
        process.exit(0);
    });
});

initializeServer();

export default app;
```

## API Routes

### Authentication Routes (`src/routes/auth.js`)
**Purpose**: Authentication and authorization endpoints.

**Endpoints**:
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `POST /api/auth/logout` - User logout
- `POST /api/auth/refresh` - Token refresh
- `POST /api/auth/forgot-password` - Password reset
- `GET /api/auth/profile` - Get user profile
- `PUT /api/auth/profile` - Update user profile

```javascript
import express from 'express';
import { authController } from '../controllers/auth.js';
import { validateInput } from '../middleware/validation.js';
import { authRateLimit } from '../middleware/rateLimit.js';

const router = express.Router();

// Login endpoint
router.post('/login', 
    authRateLimit,
    validateInput.login,
    authController.login
);

// Registration endpoint
router.post('/register',
    authRateLimit,
    validateInput.register,
    authController.register
);

// Logout endpoint
router.post('/logout',
    authController.logout
);

// Token refresh endpoint
router.post('/refresh',
    authController.refreshToken
);

// Password reset endpoint
router.post('/forgot-password',
    authRateLimit,
    validateInput.email,
    authController.forgotPassword
);

// Profile endpoints (protected)
router.get('/profile',
    authController.getProfile
);

router.put('/profile',
    validateInput.profileUpdate,
    authController.updateProfile
);

export default router;
```

### Device Routes (`src/routes/devices.js`)
**Purpose**: Device control and management endpoints.

**Endpoints**:
- `GET /api/devices` - Get all devices
- `GET /api/devices/:id` - Get specific device
- `POST /api/devices/:id/control` - Control device
- `POST /api/devices/:id/timer` - Set timer
- `DELETE /api/devices/:id/timer` - Cancel timer
- `GET /api/devices/:id/status` - Get device status
- `GET /api/devices/history` - Get device history

```javascript
import express from 'express';
import { deviceController } from '../controllers/devices.js';
import { validateSession } from '../middleware/auth.js';
import { validateInput } from '../middleware/validation.js';

const router = express.Router();

// All device routes require authentication
router.use(validateSession);

// Get all devices
router.get('/',
    deviceController.getAllDevices
);

// Get specific device
router.get('/:id',
    validateInput.deviceId,
    deviceController.getDevice
);

// Control device
router.post('/:id/control',
    validateInput.deviceControl,
    deviceController.controlDevice
);

// Set timer
router.post('/:id/timer',
    validateInput.timerSet,
    deviceController.setTimer
);

// Cancel timer
router.delete('/:id/timer',
    deviceController.cancelTimer
);

// Get device status
router.get('/:id/status',
    deviceController.getDeviceStatus
);

// Get device history
router.get('/history',
    validateInput.dateRange,
    deviceController.getDeviceHistory
);

export default router;
```

### User Routes (`src/routes/users.js`)
**Purpose**: User management endpoints.

**Endpoints**:
- `GET /api/users/profile` - Get user profile
- `PUT /api/users/profile` - Update user profile
- `GET /api/users/preferences` - Get user preferences
- `PUT /api/users/preferences` - Update user preferences
- `DELETE /api/users/account` - Delete user account

### Admin Routes (`src/routes/admin.js`)
**Purpose**: Administrative endpoints.

**Endpoints**:
- `GET /api/admin/users` - List all users
- `POST /api/admin/users` - Create user
- `PUT /api/admin/users/:id` - Update user
- `DELETE /api/admin/users/:id` - Delete user
- `GET /api/admin/devices` - List all devices
- `GET /api/admin/system/status` - System status
- `GET /api/admin/system/logs` - System logs

## Middleware

### Authentication Middleware (`src/middleware/auth.js`)
**Purpose**: Validate JWT tokens and manage sessions.

**Responsibilities**:
- Extract JWT from Authorization header
- Verify token with Supabase
- Load user profile and permissions
- Attach user info to request object
- Handle token expiration

```javascript
import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

export const validateSession = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ 
                error: 'No token provided',
                code: 'MISSING_TOKEN'
            });
        }
        
        // Verify token with Supabase
        const { data: { user }, error } = await supabase.auth.getUser(token);
        
        if (error || !user) {
            return res.status(401).json({ 
                error: 'Invalid token',
                code: 'INVALID_TOKEN'
            });
        }
        
        // Get user profile from database
        const { data: profile, error: profileError } = await supabase
            .from('user_profiles')
            .select('role, permissions, created_at')
            .eq('id', user.id)
            .single();
        
        if (profileError || !profile) {
            return res.status(403).json({ 
                error: 'User profile not found',
                code: 'PROFILE_NOT_FOUND'
            });
        }
        
        // Attach user info to request
        req.user = {
            id: user.id,
            email: user.email,
            role: profile.role,
            permissions: profile.permissions,
            createdAt: profile.created_at
        };
        
        next();
    } catch (error) {
        logger.error('Authentication middleware error:', error);
        res.status(500).json({ 
            error: 'Authentication error',
            code: 'AUTH_ERROR'
        });
    }
};

export const requireRole = (requiredRole) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ 
                error: 'Authentication required',
                code: 'AUTH_REQUIRED'
            });
        }
        
        const roleHierarchy = {
            'admin': 3,
            'moderator': 2,
            'user': 1,
            'guest': 0
        };
        
        const userLevel = roleHierarchy[req.user.role] || 0;
        const requiredLevel = roleHierarchy[requiredRole] || 0;
        
        if (userLevel < requiredLevel) {
            return res.status(403).json({ 
                error: 'Insufficient permissions',
                code: 'INSUFFICIENT_PERMISSIONS'
            });
        }
        
        next();
    };
};
```

### Input Validation Middleware (`src/middleware/validation.js`)
**Purpose**: Validate and sanitize request inputs.

**Responsibilities**:
- Validate request body parameters
- Sanitize user inputs
- Check required fields
- Validate data types and formats
- Return validation errors

```javascript
import { body, param, query, validationResult } from 'express-validator';
import { logger } from '../utils/logger.js';

// Validation rules
export const validateInput = {
    login: [
        body('email')
            .isEmail()
            .normalizeEmail()
            .withMessage('Valid email required'),
        body('password')
            .isLength({ min: 8 })
            .withMessage('Password must be at least 8 characters')
    ],
    
    register: [
        body('email')
            .isEmail()
            .normalizeEmail()
            .withMessage('Valid email required'),
        body('password')
            .isLength({ min: 8 })
            .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
            .withMessage('Password must meet complexity requirements'),
        body('displayName')
            .isLength({ min: 2, max: 50 })
            .trim()
            .withMessage('Display name must be 2-50 characters')
    ],
    
    deviceControl: [
        param('id')
            .isUUID()
            .withMessage('Valid device ID required'),
        body('state')
            .isIn(['on', 'off'])
            .withMessage('State must be "on" or "off"'),
        body('source')
            .optional()
            .isIn(['manual', 'timer', 'auto'])
            .withMessage('Invalid source')
    ],
    
    timerSet: [
        param('id')
            .isUUID()
            .withMessage('Valid device ID required'),
        body('durationMinutes')
            .isInt({ min: 1, max: 1440 })
            .withMessage('Duration must be 1-1440 minutes'),
        body('targetState')
            .isIn(['on', 'off'])
            .withMessage('Target state must be "on" or "off"')
    ]
};

// Validation result handler
export const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
        const formattedErrors = errors.array().map(error => ({
            field: error.path,
            message: error.msg,
            value: error.value
        }));
        
        logger.warn('Validation errors:', formattedErrors);
        
        return res.status(400).json({
            error: 'Validation failed',
            code: 'VALIDATION_ERROR',
            details: formattedErrors
        });
    }
    
    next();
};
```

### Rate Limiting Middleware (`src/middleware/rateLimit.js`)
**Purpose**: Prevent abuse and protect against DDoS attacks.

**Responsibilities**:
- Limit request frequency per IP
- Different limits for different endpoints
- Store rate limit data in memory/Redis
- Provide rate limit headers

```javascript
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import Redis from 'ioredis';
import { logger } from '../utils/logger.js';

// Redis client for rate limiting
const redis = new Redis(process.env.REDIS_URL);

// General rate limit
export const generalRateLimit = rateLimit({
    store: new RedisStore({
        sendCommand: (...args) => redis.call(...args),
    }),
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: {
        error: 'Too many requests',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        logger.warn('Rate limit exceeded:', {
            ip: req.ip,
            path: req.path,
            userAgent: req.get('User-Agent')
        });
        
        res.status(429).json({
            error: 'Too many requests',
            code: 'RATE_LIMIT_EXCEEDED',
            retryAfter: '15 minutes'
        });
    }
});

// Authentication rate limit (stricter)
export const authRateLimit = rateLimit({
    store: new RedisStore({
        sendCommand: (...args) => redis.call(...args),
    }),
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // limit each IP to 5 auth requests per windowMs
    message: {
        error: 'Too many authentication attempts',
        code: 'AUTH_RATE_LIMIT_EXCEEDED',
        retryAfter: '15 minutes'
    },
    skipSuccessfulRequests: true,
    handler: (req, res) => {
        logger.warn('Auth rate limit exceeded:', {
            ip: req.ip,
            path: req.path,
            userAgent: req.get('User-Agent')
        });
        
        res.status(429).json({
            error: 'Too many authentication attempts',
            code: 'AUTH_RATE_LIMIT_EXCEEDED',
            retryAfter: '15 minutes'
        });
    }
});
```

## Services

### Authentication Service (`src/services/authService.js`)
**Purpose**: Authentication business logic and Supabase integration.

**Responsibilities**:
- User registration and login
- Password management
- Token validation and refresh
- User profile management
- Email verification

```javascript
import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { hashPassword, generateToken } from '../utils/encryption.js';

export class AuthService {
    async registerUser(email, password, displayName) {
        try {
            // Check if user already exists
            const { data: existingUser } = await supabase
                .from('user_profiles')
                .select('id')
                .eq('email', email)
                .single();
            
            if (existingUser) {
                throw new Error('User already exists');
            }
            
            // Create auth user
            const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
                email,
                password,
                email_confirm: true,
                user_metadata: {
                    display_name: displayName
                }
            });
            
            if (authError) throw authError;
            
            // Create user profile
            const { error: profileError } = await supabase
                .from('user_profiles')
                .insert({
                    id: authUser.user.id,
                    email: email,
                    display_name: displayName,
                    role: 'user',
                    permissions: {},
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                });
            
            if (profileError) throw profileError;
            
            logger.info('User registered successfully:', { email, userId: authUser.user.id });
            
            return {
                success: true,
                user: authUser.user
            };
            
        } catch (error) {
            logger.error('Registration error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    async authenticateUser(email, password) {
        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password
            });
            
            if (error) throw error;
            
            // Get user profile
            const { data: profile } = await supabase
                .from('user_profiles')
                .select('role, permissions, display_name')
                .eq('id', data.user.id)
                .single();
            
            logger.info('User authenticated:', { email, userId: data.user.id });
            
            return {
                success: true,
                user: {
                    ...data.user,
                    profile
                },
                session: data.session
            };
            
        } catch (error) {
            logger.error('Authentication error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    async refreshToken(refreshToken) {
        try {
            const { data, error } = await supabase.auth.refreshSession({
                refresh_token: refreshToken
            });
            
            if (error) throw error;
            
            return {
                success: true,
                session: data.session
            };
            
        } catch (error) {
            logger.error('Token refresh error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    async getUserProfile(userId) {
        try {
            const { data, error } = await supabase
                .from('user_profiles')
                .select('*')
                .eq('id', userId)
                .single();
            
            if (error) throw error;
            
            return {
                success: true,
                profile: data
            };
            
        } catch (error) {
            logger.error('Get profile error:', error);
            return {
                success: false,
                error: error.message
            };
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
            
            logger.info('Profile updated:', { userId, updates });
            
            return {
                success: true,
                profile: data
            };
            
        } catch (error) {
            logger.error('Update profile error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

export const authService = new AuthService();
```

### Device Service (`src/services/deviceService.js`)
**Purpose**: Device management and ESP32 communication.

**Responsibilities**:
- Device state management
- ESP32 communication
- Real-time updates
- Timer management
- Device history tracking

```javascript
import { logger } from '../utils/logger.js';
import { esp32Service } from './esp32Service.js';
import { realtimeService } from '../realtime/events.js';

export class DeviceService {
    constructor() {
        this.devices = new Map(); // device cache
        this.timers = new Map(); // active timers
    }
    
    async getAllDevices() {
        try {
            // Get devices from database
            const { data: devices, error } = await supabase
                .from('devices')
                .select('*')
                .order('created_at');
            
            if (error) throw error;
            
            // Update cache
            devices.forEach(device => {
                this.devices.set(device.id, device);
            });
            
            return {
                success: true,
                devices
            };
            
        } catch (error) {
            logger.error('Get devices error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    async getDevice(deviceId) {
        try {
            // Check cache first
            if (this.devices.has(deviceId)) {
                return {
                    success: true,
                    device: this.devices.get(deviceId)
                };
            }
            
            // Get from database
            const { data: device, error } = await supabase
                .from('devices')
                .select('*')
                .eq('id', deviceId)
                .single();
            
            if (error) throw error;
            
            // Update cache
            this.devices.set(deviceId, device);
            
            return {
                success: true,
                device
            };
            
        } catch (error) {
            logger.error('Get device error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    async controlDevice(deviceId, state, source = 'manual', userId) {
        try {
            // Validate device exists
            const deviceResult = await this.getDevice(deviceId);
            if (!deviceResult.success) {
                throw new Error('Device not found');
            }
            
            // Send command to ESP32
            const esp32Result = await esp32Service.sendCommand(deviceId, {
                type: 'set_relay',
                state,
                source,
                userId,
                timestamp: new Date().toISOString()
            });
            
            if (!esp32Result.success) {
                throw new Error(esp32Result.error);
            }
            
            // Update device state in database
            const { data: updatedDevice, error } = await supabase
                .from('devices')
                .update({
                    state,
                    last_updated: new Date().toISOString(),
                    last_updated_by: userId
                })
                .eq('id', deviceId)
                .select()
                .single();
            
            if (error) throw error;
            
            // Update cache
            this.devices.set(deviceId, updatedDevice);
            
            // Broadcast real-time update
            realtimeService.broadcastDeviceUpdate(deviceId, {
                state,
                source,
                timestamp: updatedDevice.last_updated
            });
            
            logger.info('Device controlled:', { deviceId, state, source, userId });
            
            return {
                success: true,
                device: updatedDevice
            };
            
        } catch (error) {
            logger.error('Control device error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    async setTimer(deviceId, durationMinutes, targetState, userId) {
        try {
            const endTime = new Date(Date.now() + durationMinutes * 60 * 1000);
            
            // Send timer command to ESP32
            const esp32Result = await esp32Service.sendCommand(deviceId, {
                type: 'set_timer',
                durationMinutes,
                targetState,
                endTime: endTime.toISOString(),
                userId,
                timestamp: new Date().toISOString()
            });
            
            if (!esp32Result.success) {
                throw new Error(esp32Result.error);
            }
            
            // Store timer in database
            const { data: timer, error } = await supabase
                .from('device_timers')
                .insert({
                    device_id: deviceId,
                    duration_minutes: durationMinutes,
                    target_state: targetState,
                    end_time: endTime.toISOString(),
                    created_by: userId,
                    created_at: new Date().toISOString(),
                    active: true
                })
                .select()
                .single();
            
            if (error) throw error;
            
            // Update cache
            this.timers.set(deviceId, timer);
            
            // Schedule timer expiration
            this.scheduleTimerExpiration(deviceId, endTime);
            
            // Broadcast real-time update
            realtimeService.broadcastTimerUpdate(deviceId, {
                type: 'timer_set',
                durationMinutes,
                targetState,
                endTime: endTime.toISOString()
            });
            
            logger.info('Timer set:', { deviceId, durationMinutes, targetState, userId });
            
            return {
                success: true,
                timer
            };
            
        } catch (error) {
            logger.error('Set timer error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    async cancelTimer(deviceId, userId) {
        try {
            // Send cancel command to ESP32
            const esp32Result = await esp32Service.sendCommand(deviceId, {
                type: 'cancel_timer',
                userId,
                timestamp: new Date().toISOString()
            });
            
            if (!esp32Result.success) {
                throw new Error(esp32Result.error);
            }
            
            // Deactivate timer in database
            const { error } = await supabase
                .from('device_timers')
                .update({ active: false })
                .eq('device_id', deviceId)
                .eq('active', true);
            
            if (error) throw error;
            
            // Remove from cache
            this.timers.delete(deviceId);
            
            // Cancel scheduled expiration
            this.cancelScheduledExpiration(deviceId);
            
            // Broadcast real-time update
            realtimeService.broadcastTimerUpdate(deviceId, {
                type: 'timer_cancelled'
            });
            
            logger.info('Timer cancelled:', { deviceId, userId });
            
            return {
                success: true
            };
            
        } catch (error) {
            logger.error('Cancel timer error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    scheduleTimerExpiration(deviceId, endTime) {
        const timeout = endTime.getTime() - Date.now();
        
        if (timeout > 0) {
            setTimeout(async () => {
                await this.handleTimerExpiration(deviceId);
            }, timeout);
        }
    }
    
    async handleTimerExpiration(deviceId) {
        try {
            // Get timer details
            const timer = this.timers.get(deviceId);
            if (!timer) return;
            
            // Update device state
            await this.controlDevice(
                deviceId, 
                timer.target_state === 'on' ? 'off' : 'on',
                'timer',
                'system'
            );
            
            // Deactivate timer
            await supabase
                .from('device_timers')
                .update({ active: false })
                .eq('device_id', deviceId)
                .eq('active', true);
            
            // Remove from cache
            this.timers.delete(deviceId);
            
            // Broadcast expiration
            realtimeService.broadcastTimerUpdate(deviceId, {
                type: 'timer_expired'
            });
            
            logger.info('Timer expired:', { deviceId });
            
        } catch (error) {
            logger.error('Timer expiration error:', error);
        }
    }
}

export const deviceService = new DeviceService();
```

### ESP32 Communication Service (`src/services/esp32Service.js`)
**Purpose**: Handle communication with ESP32 devices.

**Responsibilities**:
- HTTP requests to ESP32 devices
- WebSocket connections for real-time updates
- Device discovery and registration
- Connection health monitoring
- Command queuing and retry logic

```javascript
import axios from 'axios';
import WebSocket from 'ws';
import { logger } from '../utils/logger.js';

export class ESP32Service {
    constructor() {
        this.devices = new Map(); // deviceId -> device info
        this.connections = new Map(); // deviceId -> WebSocket connection
        this.commandQueue = new Map(); // deviceId -> command queue
        this.reconnectAttempts = new Map(); // deviceId -> retry count
    }
    
    async registerDevice(deviceId, deviceInfo) {
        try {
            // Validate device info
            if (!deviceInfo.ip || !deviceInfo.port) {
                throw new Error('Invalid device configuration');
            }
            
            // Store device info
            this.devices.set(deviceId, {
                id: deviceId,
                ip: deviceInfo.ip,
                port: deviceInfo.port,
                name: deviceInfo.name || `Device ${deviceId}`,
                type: deviceInfo.type || 'esp32',
                lastSeen: new Date(),
                status: 'offline'
            });
            
            // Attempt to connect
            await this.connectToDevice(deviceId);
            
            logger.info('Device registered:', { deviceId, deviceInfo });
            
            return {
                success: true,
                device: this.devices.get(deviceId)
            };
            
        } catch (error) {
            logger.error('Device registration error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    async connectToDevice(deviceId) {
        try {
            const device = this.devices.get(deviceId);
            if (!device) {
                throw new Error('Device not found');
            }
            
            // Test HTTP connection first
            const response = await axios.get(`http://${device.ip}:${device.port}/health`, {
                timeout: 5000
            });
            
            if (response.status !== 200) {
                throw new Error('Device health check failed');
            }
            
            // Establish WebSocket connection
            const ws = new WebSocket(`ws://${device.ip}:${device.port + 1}/ws`);
            
            ws.on('open', () => {
                logger.info('WebSocket connected:', { deviceId });
                device.status = 'online';
                device.lastSeen = new Date();
                this.connections.set(deviceId, ws);
                
                // Process queued commands
                this.processCommandQueue(deviceId);
            });
            
            ws.on('message', (data) => {
                this.handleDeviceMessage(deviceId, JSON.parse(data.toString()));
            });
            
            ws.on('close', () => {
                logger.warn('WebSocket disconnected:', { deviceId });
                device.status = 'offline';
                this.connections.delete(deviceId);
                
                // Schedule reconnection
                this.scheduleReconnection(deviceId);
            });
            
            ws.on('error', (error) => {
                logger.error('WebSocket error:', { deviceId, error });
                device.status = 'error';
            });
            
            return {
                success: true
            };
            
        } catch (error) {
            logger.error('Device connection error:', error);
            const device = this.devices.get(deviceId);
            if (device) {
                device.status = 'offline';
            }
            
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    async sendCommand(deviceId, command) {
        try {
            const device = this.devices.get(deviceId);
            if (!device) {
                throw new Error('Device not found');
            }
            
            // Add timestamp and ID
            const enhancedCommand = {
                ...command,
                id: this.generateCommandId(),
                timestamp: new Date().toISOString()
            };
            
            // If device is online, send via WebSocket
            if (device.status === 'online' && this.connections.has(deviceId)) {
                const ws = this.connections.get(deviceId);
                ws.send(JSON.stringify(enhancedCommand));
                
                logger.debug('Command sent via WebSocket:', { deviceId, command: enhancedCommand });
                
                return {
                    success: true,
                    commandId: enhancedCommand.id
                };
            }
            
            // Otherwise, send via HTTP and queue
            const response = await axios.post(
                `http://${device.ip}:${device.port}/api/command`,
                enhancedCommand,
                {
                    timeout: 10000,
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );
            
            if (response.status !== 200) {
                throw new Error('HTTP command failed');
            }
            
            // Queue for WebSocket when available
            this.queueCommand(deviceId, enhancedCommand);
            
            logger.debug('Command sent via HTTP:', { deviceId, command: enhancedCommand });
            
            return {
                success: true,
                commandId: enhancedCommand.id
            };
            
        } catch (error) {
            logger.error('Send command error:', error);
            
            // Queue command for retry
            this.queueCommand(deviceId, command);
            
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    handleDeviceMessage(deviceId, message) {
        try {
            logger.debug('Device message received:', { deviceId, message });
            
            const device = this.devices.get(deviceId);
            if (device) {
                device.lastSeen = new Date();
            }
            
            // Handle different message types
            switch (message.type) {
                case 'state_update':
                    this.handleStateUpdate(deviceId, message.data);
                    break;
                    
                case 'timer_update':
                    this.handleTimerUpdate(deviceId, message.data);
                    break;
                    
                case 'error':
                    this.handleDeviceError(deviceId, message.data);
                    break;
                    
                case 'heartbeat':
                    // Update last seen time
                    if (device) {
                        device.lastSeen = new Date();
                    }
                    break;
                    
                default:
                    logger.warn('Unknown message type:', { deviceId, type: message.type });
            }
            
        } catch (error) {
            logger.error('Handle device message error:', error);
        }
    }
    
    handleStateUpdate(deviceId, data) {
        // Broadcast to connected clients
        realtimeService.broadcastDeviceUpdate(deviceId, data);
        
        // Update database
        this.updateDeviceState(deviceId, data);
    }
    
    handleTimerUpdate(deviceId, data) {
        // Broadcast to connected clients
        realtimeService.broadcastTimerUpdate(deviceId, data);
        
        // Update database
        this.updateTimerState(deviceId, data);
    }
    
    handleDeviceError(deviceId, error) {
        logger.error('Device error:', { deviceId, error });
        
        // Broadcast error to clients
        realtimeService.broadcastDeviceError(deviceId, error);
        
        // Update device status
        const device = this.devices.get(deviceId);
        if (device) {
            device.status = 'error';
        }
    }
    
    queueCommand(deviceId, command) {
        if (!this.commandQueue.has(deviceId)) {
            this.commandQueue.set(deviceId, []);
        }
        
        this.commandQueue.get(deviceId).push(command);
    }
    
    processCommandQueue(deviceId) {
        const queue = this.commandQueue.get(deviceId);
        if (!queue || queue.length === 0) return;
        
        const ws = this.connections.get(deviceId);
        if (!ws) return;
        
        // Send queued commands
        while (queue.length > 0) {
            const command = queue.shift();
            ws.send(JSON.stringify(command));
        }
    }
    
    scheduleReconnection(deviceId) {
        const attempts = this.reconnectAttempts.get(deviceId) || 0;
        const maxAttempts = 5;
        
        if (attempts >= maxAttempts) {
            logger.error('Max reconnection attempts reached:', { deviceId });
            return;
        }
        
        const delay = Math.min(1000 * Math.pow(2, attempts), 30000); // Exponential backoff
        
        setTimeout(async () => {
            this.reconnectAttempts.set(deviceId, attempts + 1);
            
            const result = await this.connectToDevice(deviceId);
            if (result.success) {
                this.reconnectAttempts.delete(deviceId);
            }
        }, delay);
    }
    
    generateCommandId() {
        return `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    async updateDeviceState(deviceId, stateData) {
        try {
            await supabase
                .from('devices')
                .update({
                    state: stateData.state,
                    last_updated: new Date().toISOString()
                })
                .eq('id', deviceId);
                
        } catch (error) {
            logger.error('Update device state error:', error);
        }
    }
    
    async updateTimerState(deviceId, timerData) {
        try {
            await supabase
                .from('device_timers')
                .update({
                    active: timerData.active,
                    end_time: timerData.endTime
                })
                .eq('device_id', deviceId)
                .eq('active', true);
                
        } catch (error) {
            logger.error('Update timer state error:', error);
        }
    }
}

export const esp32Service = new ESP32Service();
```

## Database Layer

### Database Models (`src/database/models/`)
**Purpose**: Data model definitions and schemas.

**User Profile Model**:
```javascript
export const UserProfile = {
    tableName: 'user_profiles',
    schema: {
        id: 'UUID PRIMARY KEY',
        email: 'VARCHAR(255) UNIQUE NOT NULL',
        display_name: 'VARCHAR(100) NOT NULL',
        role: 'VARCHAR(50) DEFAULT "user"',
        permissions: 'JSONB DEFAULT "{}"',
        created_at: 'TIMESTAMP DEFAULT NOW()',
        updated_at: 'TIMESTAMP DEFAULT NOW()',
        last_login: 'TIMESTAMP'
    },
    indexes: [
        'CREATE INDEX idx_user_profiles_email ON user_profiles(email)',
        'CREATE INDEX idx_user_profiles_role ON user_profiles(role)'
    ]
};
```

**Device Model**:
```javascript
export const Device = {
    tableName: 'devices',
    schema: {
        id: 'UUID PRIMARY KEY',
        name: 'VARCHAR(100) NOT NULL',
        type: 'VARCHAR(50) DEFAULT "esp32"',
        ip_address: 'INET NOT NULL',
        port: 'INTEGER DEFAULT 80',
        state: 'JSONB DEFAULT "{}"',
        last_updated: 'TIMESTAMP DEFAULT NOW()',
        last_updated_by: 'UUID REFERENCES user_profiles(id)',
        created_at: 'TIMESTAMP DEFAULT NOW()',
        is_active: 'BOOLEAN DEFAULT true'
    },
    indexes: [
        'CREATE INDEX idx_devices_ip_address ON devices(ip_address)',
        'CREATE INDEX idx_devices_last_updated ON devices(last_updated)'
    ]
};
```

### Database Queries (`src/database/queries.js`)
**Purpose**: SQL query definitions and helpers.

```javascript
export const queries = {
    // User queries
    getUserProfile: 'SELECT * FROM user_profiles WHERE id = $1',
    getUserProfileByEmail: 'SELECT * FROM user_profiles WHERE email = $1',
    updateUserProfile: 'UPDATE user_profiles SET display_name = $1, updated_at = NOW() WHERE id = $2',
    
    // Device queries
    getAllDevices: 'SELECT * FROM devices WHERE is_active = true ORDER BY created_at',
    getDeviceById: 'SELECT * FROM devices WHERE id = $1 AND is_active = true',
    updateDeviceState: 'UPDATE devices SET state = $1, last_updated = NOW(), last_updated_by = $2 WHERE id = $3',
    
    // Timer queries
    getActiveTimers: 'SELECT * FROM device_timers WHERE active = true AND end_time > NOW()',
    insertTimer: 'INSERT INTO device_timers (device_id, duration_minutes, target_state, end_time, created_by) VALUES ($1, $2, $3, $4, $5)',
    deactivateTimer: 'UPDATE device_timers SET active = false WHERE device_id = $1 AND active = true'
};
```

## Real-time Communication

### WebSocket Server (`src/realtime/websocket.js`)
**Purpose**: WebSocket server setup and connection management.

**Responsibilities**:
- Initialize WebSocket server
- Handle client connections
- Manage rooms and subscriptions
- Route messages to appropriate handlers
- Handle disconnections and cleanup

```javascript
import { Server } from 'socket.io';
import { logger } from '../utils/logger.js';
import { validateSession } from '../middleware/auth.js';
import { realtimeService } from './events.js';

export function initializeWebSocket(io) {
    // Authentication middleware for WebSocket
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token;
            
            if (!token) {
                return next(new Error('Authentication required'));
            }
            
            // Verify token (reuse auth middleware logic)
            const { data: { user }, error } = await supabase.auth.getUser(token);
            
            if (error || !user) {
                return next(new Error('Invalid token'));
            }
            
            // Get user profile
            const { data: profile } = await supabase
                .from('user_profiles')
                .select('role, permissions')
                .eq('id', user.id)
                .single();
            
            socket.user = {
                ...user,
                role: profile.role,
                permissions: profile.permissions
            };
            
            next();
        } catch (error) {
            logger.error('WebSocket authentication error:', error);
            next(new Error('Authentication failed'));
        }
    });
    
    io.on('connection', (socket) => {
        logger.info('WebSocket client connected:', { 
            userId: socket.user.id,
            socketId: socket.id 
        });
        
        // Join user to their personal room
        socket.join(`user:${socket.user.id}`);
        
        // Join role-based rooms
        socket.join(`role:${socket.user.role}`);
        
        // Handle device subscriptions
        socket.on('subscribe_devices', async (deviceIds) => {
            try {
                // Validate user has access to devices
                const { data: devices } = await supabase
                    .from('device_permissions')
                    .select('device_id')
                    .eq('user_id', socket.user.id)
                    .in('device_id', deviceIds);
                
                const accessibleDeviceIds = devices.map(d => d.device_id);
                
                // Join device rooms
                accessibleDeviceIds.forEach(deviceId => {
                    socket.join(`device:${deviceId}`);
                });
                
                socket.emit('subscribed_devices', accessibleDeviceIds);
                
                logger.info('User subscribed to devices:', { 
                    userId: socket.user.id,
                    deviceIds: accessibleDeviceIds 
                });
                
            } catch (error) {
                logger.error('Subscribe devices error:', error);
                socket.emit('error', { message: 'Failed to subscribe to devices' });
            }
        });
        
        // Handle device control commands
        socket.on('control_device', async (data) => {
            try {
                const { deviceId, state, source } = data;
                
                // Validate user has permission
                const { data: permission } = await supabase
                    .from('device_permissions')
                    .select('can_control')
                    .eq('user_id', socket.user.id)
                    .eq('device_id', deviceId)
                    .single();
                
                if (!permission || !permission.can_control) {
                    socket.emit('error', { message: 'Permission denied' });
                    return;
                }
                
                // Send command to device
                const result = await deviceService.controlDevice(
                    deviceId, 
                    state, 
                    source || 'manual',
                    socket.user.id
                );
                
                if (result.success) {
                    socket.emit('device_controlled', { deviceId, state, timestamp: new Date().toISOString() });
                } else {
                    socket.emit('error', { message: result.error });
                }
                
            } catch (error) {
                logger.error('Control device error:', error);
                socket.emit('error', { message: 'Failed to control device' });
            }
        });
        
        // Handle timer commands
        socket.on('set_timer', async (data) => {
            try {
                const { deviceId, durationMinutes, targetState } = data;
                
                // Validate permission (same as device control)
                const { data: permission } = await supabase
                    .from('device_permissions')
                    .select('can_control')
                    .eq('user_id', socket.user.id)
                    .eq('device_id', deviceId)
                    .single();
                
                if (!permission || !permission.can_control) {
                    socket.emit('error', { message: 'Permission denied' });
                    return;
                }
                
                // Set timer
                const result = await deviceService.setTimer(
                    deviceId,
                    durationMinutes,
                    targetState,
                    socket.user.id
                );
                
                if (result.success) {
                    socket.emit('timer_set', { 
                        deviceId, 
                        timer: result.timer 
                    });
                } else {
                    socket.emit('error', { message: result.error });
                }
                
            } catch (error) {
                logger.error('Set timer error:', error);
                socket.emit('error', { message: 'Failed to set timer' });
            }
        });
        
        // Handle disconnection
        socket.on('disconnect', (reason) => {
            logger.info('WebSocket client disconnected:', { 
                userId: socket.user.id,
                socketId: socket.id,
                reason 
            });
            
            // Cleanup user-specific data
            realtimeService.handleUserDisconnection(socket.user.id, socket.id);
        });
    });
    
    // Initialize real-time service
    realtimeService.initialize(io);
    
    logger.info('WebSocket server initialized');
}
```

## Configuration

### Environment Configuration (`.env.example`)
```env
# Server Configuration
PORT=3001
NODE_ENV=development

# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key

# Redis Configuration (for rate limiting)
REDIS_URL=redis://localhost:6379

# ESP32 Configuration
ESP32_DISCOVERY_ENABLED=true
ESP32_DEFAULT_PORT=80

# Logging Configuration
LOG_LEVEL=info
LOG_FILE=logs/app.log

# Security Configuration
JWT_SECRET=your-jwt-secret
CORS_ORIGIN=http://localhost:3000
```

### Server Configuration (`src/config/server.js`)
```javascript
import dotenv from 'dotenv';

dotenv.config();

export const config = {
    port: process.env.PORT || 3001,
    nodeEnv: process.env.NODE_ENV || 'development',
    cors: {
        origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
        credentials: true
    },
    rateLimit: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // limit each IP to 100 requests per windowMs
        authMax: 5 // stricter limit for auth endpoints
    },
    websocket: {
        cors: {
            origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
            methods: ['GET', 'POST']
        }
    }
};
```

This backend structure provides a robust, scalable foundation for the ESP32 Smart Home Automation system with comprehensive API endpoints, real-time communication, and secure device management.
