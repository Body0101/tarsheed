# File Responsibility Map

## Table of Contents

1. [Overview](#overview)
2. [ESP32 Files](#esp32-files)
3. [Frontend Files](#frontend-files)
4. [Backend Files](#backend-files)
5. [Database/Supabase Files](#databasesupabase-files)
6. [Configuration Files](#configuration-files)
7. [Deployment Files](#deployment-files)
8. [Testing Files](#testing-files)
9. [Documentation Files](#documentation-files)
10. [File Cross-Reference](#file-cross-reference)

## Overview

This document provides a comprehensive mapping of all files in the ESP32 Smart Home Automation system, categorizing them by their deployment target, runtime environment, and functional responsibilities.

### System Components

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   ESP32 Device   │    │   Frontend      │    │   Backend       │
│   (Offline)      │    │   (Online)      │    │   (Online)      │
│                 │    │                 │    │                 │
│ • Firmware       │    │ • React App      │    │ • Node.js API   │
│ • Local Web UI   │    │ • Auth Pages     │    │ • WebSocket     │
│ • Local Auth     │    │ • Dashboard      │    │ • Business Logic│
│ • Device Control │    │ • API Client     │    │ • Database Ops   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │   Supabase     │
                    │   (Cloud)       │
                    │                 │
                    │ • Auth Service  │
                    │ • Database       │
                    │ • Real-time      │
                    │ • Storage        │
                    └─────────────────┘
```

## ESP32 Files

### Core Firmware Files

| File Path | Purpose | Dependencies | Runtime Environment |
|------------|---------|--------------|-------------------|
| `SmartHomeAutomation/src/main.cpp` | Main firmware entry point, task initialization | All ESP32 modules | ESP32 Device |
| `SmartHomeAutomation/src/Config.h` | Hardware configuration, pin definitions, system constants | SystemTypes.h | ESP32 Device |
| `SmartHomeAutomation/src/SystemTypes.h` | Core data structures, enums, type definitions | Arduino.h, vector | ESP32 Device |
| `SmartHomeAutomation/src/Utils.h` | Utility functions, text conversion helpers | SystemTypes.h | ESP32 Device |

### Control System Files

| File Path | Purpose | Dependencies | Runtime Environment |
|------------|---------|--------------|-------------------|
| `SmartHomeAutomation/src/ControlEngine.cpp` | Device control logic, relay management, timer handling | SystemTypes.h, Config.h, TimeKeeper.h, StorageLayer.h | ESP32 Device |
| `SmartHomeAutomation/src/ControlEngine.h` | ControlEngine class interface, method declarations | SystemTypes.h | ESP32 Device |
| `SmartHomeAutomation/src/TimeKeeper.cpp` | Time management, NTP sync, timezone handling | Preferences.h, SystemTypes.h | ESP32 Device |
| `SmartHomeAutomation/src/TimeKeeper.h` | TimeKeeper class interface | SystemTypes.h | ESP32 Device |

### Storage System Files

| File Path | Purpose | Dependencies | Runtime Environment |
|------------|---------|--------------|-------------------|
| `SmartHomeAutomation/src/StorageLayer.cpp` | Persistent storage, NVS operations, LittleFS management | ArduinoJson.h, LittleFS.h, Preferences.h, SystemTypes.h | ESP32 Device |
| `SmartHomeAutomation/src/StorageLayer.h` | StorageLayer class interface | SystemTypes.h | ESP32 Device |

### Network & Web Files

| File Path | Purpose | Dependencies | Runtime Environment |
|------------|---------|--------------|-------------------|
| `SmartHomeAutomation/src/WebPortal.cpp` | Local web server, WebSocket handling, captive portal | WebServer.h, WebSocketsServer.h, DNSServer.h, ControlEngine.h | ESP32 Device |
| `SmartHomeAutomation/src/WebPortal.h` | WebPortal class interface | SystemTypes.h | ESP32 Device |
| `SmartHomeAutomation/src/CloudSyncService.cpp` | Cloud synchronization, HTTP client, remote command processing | HTTPClient.h, WiFiClientSecure.h, ArduinoJson.h | ESP32 Device |
| `SmartHomeAutomation/src/CloudSyncService.h` | CloudSyncService class interface | SystemTypes.h | ESP32 Device |

### Web UI Files

| File Path | Purpose | Dependencies | Runtime Environment |
|------------|---------|--------------|-------------------|
| `SmartHomeAutomation/data/index.html` | Local web interface, offline dashboard | None (served by ESP32) | ESP32 Device |
| `SmartHomeAutomation/data/restricted.html` | Limited access interface for restricted users | None (served by ESP32) | ESP32 Device |
| `SmartHomeAutomation/data/unauthorized.html` | Access denied page | None (served by ESP32) | ESP32 Device |

### Build Configuration Files

| File Path | Purpose | Dependencies | Runtime Environment |
|------------|---------|--------------|-------------------|
| `SmartHomeAutomation/platformio.ini` | PlatformIO build configuration, library dependencies | None | Build Environment |
| `scripts/inject_cloud_env.py` | Cloud environment variable injection script | Python 3.x | Build Environment |

## Frontend Files

### Core Application Files

| File Path | Purpose | Dependencies | Deployment Target |
|------------|---------|--------------|-------------------|
| `frontend/src/main.jsx` | React application entry point, root rendering | React, ReactDOM | GitHub Pages |
| `frontend/src/App.jsx` | Main application component, routing setup | React Router, Auth Context | GitHub Pages |
| `frontend/src/index.css` | Global styles, TailwindCSS imports | TailwindCSS | GitHub Pages |

### Page Components

| File Path | Purpose | Dependencies | Deployment Target |
|------------|---------|--------------|-------------------|
| `frontend/src/pages/LoginPage.jsx` | User login interface, authentication flow | LoginForm, authService | GitHub Pages |
| `frontend/src/pages/RegisterPage.jsx` | User registration, account creation | RegisterForm, authService | GitHub Pages |
| `frontend/src/pages/DashboardPage.jsx` | Main dashboard for authenticated users | DeviceCard, useDeviceState | GitHub Pages |
| `frontend/src/pages/AdminDashboardPage.jsx` | Administrative interface, system management | AdminComponents, useAuth | GitHub Pages |

### Authentication Components

| File Path | Purpose | Dependencies | Deployment Target |
|------------|---------|--------------|-------------------|
| `frontend/src/components/auth/LoginForm.jsx` | Login form component, validation | React, authService | GitHub Pages |
| `frontend/src/components/auth/RegisterForm.jsx` | Registration form, password validation | React, authService | GitHub Pages |
| `frontend/src/components/auth/ProtectedRoute.jsx` | Route protection wrapper, role-based access | React Router, useAuth | GitHub Pages |
| `frontend/src/components/auth/AuthContext.jsx` | Global authentication state management | React Context, authService | GitHub Pages |

### Dashboard Components

| File Path | Purpose | Dependencies | Deployment Target |
|------------|---------|--------------|-------------------|
| `frontend/src/components/dashboard/DeviceCard.jsx` | Device status display, control interface | React, deviceService | GitHub Pages |
| `frontend/src/components/dashboard/RelayControl.jsx` | Relay toggle controls, state management | React, deviceService | GitHub Pages |
| `frontend/src/components/dashboard/TimerControl.jsx` | Timer configuration interface | React, deviceService | GitHub Pages |
| `frontend/src/components/dashboard/SystemStatus.jsx` | System health indicators, connectivity status | React, useOnlineStatus | GitHub Pages |

### Common UI Components

| File Path | Purpose | Dependencies | Deployment Target |
|------------|---------|--------------|-------------------|
| `frontend/src/components/common/Button.jsx` | Reusable button component with variants | React | GitHub Pages |
| `frontend/src/components/common/Modal.jsx` | Modal dialog component | React | GitHub Pages |
| `frontend/src/components/common/LoadingSpinner.jsx` | Loading indicator component | React | GitHub Pages |
| `frontend/src/components/common/Toast.jsx` | Notification toast component | React | GitHub Pages |

### Layout Components

| File Path | Purpose | Dependencies | Deployment Target |
|------------|---------|--------------|-------------------|
| `frontend/src/components/layout/Layout.jsx` | Main application layout wrapper | React, Navigation | GitHub Pages |
| `frontend/src/components/layout/Navigation.jsx` | Navigation menu, route links | React Router | GitHub Pages |
| `frontend/src/components/layout/Sidebar.jsx` | Collapsible sidebar navigation | React | GitHub Pages |

### Service Layer Files

| File Path | Purpose | Dependencies | Deployment Target |
|------------|---------|--------------|-------------------|
| `frontend/src/services/auth.js` | Authentication service, Supabase integration | @supabase/supabase-js | GitHub Pages |
| `frontend/src/services/api.js` | HTTP client, API communication | Axios | GitHub Pages |
| `frontend/src/services/deviceService.js` | Device control API, real-time updates | Axios, WebSocket | GitHub Pages |
| `frontend/src/services/supabase.js` | Supabase client configuration | @supabase/supabase-js | GitHub Pages |

### Custom Hooks

| File Path | Purpose | Dependencies | Deployment Target |
|------------|---------|--------------|-------------------|
| `frontend/src/hooks/useAuth.js` | Authentication state hook | AuthContext | GitHub Pages |
| `frontend/src/hooks/useDeviceState.js` | Device state management hook | deviceService | GitHub Pages |
| `frontend/src/hooks/useToast.js` | Toast notification hook | Toast component | GitHub Pages |
| `frontend/src/hooks/useLocalStorage.js` | Local storage management hook | Browser APIs | GitHub Pages |
| `frontend/src/hooks/useDebounce.js` | Debounce utility hook | React | GitHub Pages |

### Utility Files

| File Path | Purpose | Dependencies | Deployment Target |
|------------|---------|--------------|-------------------|
| `frontend/src/utils/validation.js` | Form validation functions | None | GitHub Pages |
| `frontend/src/utils/formatting.js` | Data formatting utilities | None | GitHub Pages |
| `frontend/src/utils/constants.js` | Application constants, configuration | None | GitHub Pages |
| `frontend/src/utils/helpers.js` | General utility functions | None | GitHub Pages |

### Configuration Files

| File Path | Purpose | Dependencies | Deployment Target |
|------------|---------|--------------|-------------------|
| `frontend/vite.config.js` | Vite build configuration, plugins | Vite, React | Build Environment |
| `frontend/tailwind.config.js` | TailwindCSS configuration | TailwindCSS | Build Environment |
| `frontend/package.json` | Project dependencies, scripts | None | Build Environment |
| `frontend/.env.example` | Environment variables template | None | Development |

## Backend Files

### Core Server Files

| File Path | Purpose | Dependencies | Runtime Environment |
|------------|---------|--------------|-------------------|
| `backend/src/index.js` | Server entry point, Express setup, WebSocket initialization | Express, Socket.io, all services | Node.js Server |
| `backend/package.json` | Backend dependencies, scripts | None | Build Environment |

### API Route Files

| File Path | Purpose | Dependencies | Runtime Environment |
|------------|---------|--------------|-------------------|
| `backend/src/routes/auth.js` | Authentication API endpoints | authController, validation middleware | Node.js Server |
| `backend/src/routes/devices.js` | Device control API endpoints | deviceController, auth middleware | Node.js Server |
| `backend/src/routes/users.js` | User management API endpoints | userController, auth middleware | Node.js Server |
| `backend/src/routes/admin.js` | Administrative API endpoints | adminController, role middleware | Node.js Server |

### Controller Files

| File Path | Purpose | Dependencies | Runtime Environment |
|------------|---------|--------------|-------------------|
| `backend/src/controllers/auth.js` | Authentication request handlers | authService, validation | Node.js Server |
| `backend/src/controllers/devices.js` | Device control request handlers | deviceService, esp32Service | Node.js Server |
| `backend/src/controllers/users.js` | User management request handlers | userService, database | Node.js Server |
| `backend/src/controllers/admin.js` | Administrative request handlers | userService, database | Node.js Server |

### Middleware Files

| File Path | Purpose | Dependencies | Runtime Environment |
|------------|---------|--------------|-------------------|
| `backend/src/middleware/auth.js` | JWT validation, session management | Supabase, Express | Node.js Server |
| `backend/src/middleware/validation.js` | Input validation, sanitization | Express-validator | Node.js Server |
| `backend/src/middleware/rateLimit.js` | Rate limiting, abuse prevention | Express-rate-limit, Redis | Node.js Server |
| `backend/src/middleware/cors.js` | CORS configuration, security headers | Express-cors | Node.js Server |
| `backend/src/middleware/errorHandler.js` | Global error handling, logging | Winston | Node.js Server |

### Service Layer Files

| File Path | Purpose | Dependencies | Runtime Environment |
|------------|---------|--------------|-------------------|
| `backend/src/services/authService.js` | Authentication business logic, Supabase integration | @supabase/supabase-js, bcrypt | Node.js Server |
| `backend/src/services/deviceService.js` | Device management, ESP32 communication | HTTP client, WebSocket | Node.js Server |
| `backend/src/services/userService.js` | User management, profile operations | Database queries | Node.js Server |
| `backend/src/services/supabaseService.js` | Supabase client configuration | @supabase/supabase-js | Node.js Server |
| `backend/src/services/esp32Service.js` | ESP32 device communication | HTTP client, WebSocket | Node.js Server |

### Real-time Communication Files

| File Path | Purpose | Dependencies | Runtime Environment |
|------------|---------|--------------|-------------------|
| `backend/src/realtime/websocket.js` | WebSocket server setup, connection management | Socket.io, auth middleware | Node.js Server |
| `backend/src/realtime/events.js` | Real-time event handling, broadcasting | Socket.io, deviceService | Node.js Server |
| `backend/src/realtime/rooms.js` | WebSocket room management | Socket.io | Node.js Server |

### Database Layer Files

| File Path | Purpose | Dependencies | Runtime Environment |
|------------|---------|--------------|-------------------|
| `backend/src/database/models/` | Data model definitions | None | Node.js Server |
| `backend/src/database/queries.js` | SQL query definitions | PostgreSQL client | Node.js Server |
| `backend/src/database/migrations.js` | Database migration scripts | PostgreSQL client | Node.js Server |

### Utility Files

| File Path | Purpose | Dependencies | Runtime Environment |
|------------|---------|--------------|-------------------|
| `backend/src/utils/logger.js` | Logging configuration, Winston setup | Winston | Node.js Server |
| `backend/src/utils/validation.js` | Server-side validation helpers | Express-validator | Node.js Server |
| `backend/src/utils/encryption.js` | Encryption, password hashing | Bcrypt, crypto | Node.js Server |
| `backend/src/utils/helpers.js` | General utility functions | Node.js built-ins | Node.js Server |

### Configuration Files

| File Path | Purpose | Dependencies | Runtime Environment |
|------------|---------|--------------|-------------------|
| `backend/src/config/database.js` | Database connection configuration | PostgreSQL client | Node.js Server |
| `backend/src/config/supabase.js` | Supabase client configuration | @supabase/supabase-js | Node.js Server |
| `backend/src/config/server.js` | Server configuration, environment variables | Express | Node.js Server |
| `backend/.env.example` | Environment variables template | None | Development |

## Database/Supabase Files

### Database Schema Files

| File Path | Purpose | Dependencies | Runtime Environment |
|------------|---------|--------------|-------------------|
| `database/schema.sql` | Complete database schema definition | PostgreSQL | Supabase Dashboard |
| `database/migrations/` | Database migration scripts | PostgreSQL | Supabase Dashboard |

### RLS Policy Files

| File Path | Purpose | Dependencies | Runtime Environment |
|------------|---------|--------------|-------------------|
| `database/policies/user_policies.sql` | User table Row Level Security policies | PostgreSQL | Supabase Dashboard |
| `database/policies/device_policies.sql` | Device table RLS policies | PostgreSQL | Supabase Dashboard |
| `database/policies/admin_policies.sql` | Admin table RLS policies | PostgreSQL | Supabase Dashboard |

### Configuration Files

| File Path | Purpose | Dependencies | Runtime Environment |
|------------|---------|--------------|-------------------|
| `database/setup.sql` | Initial database setup script | PostgreSQL | Supabase Dashboard |
| `database/seed_data.sql` | Sample data for testing | PostgreSQL | Supabase Dashboard |

## Configuration Files

### Build Configuration

| File Path | Purpose | Dependencies | Runtime Environment |
|------------|---------|--------------|-------------------|
| `platformio.ini` | PlatformIO build configuration | PlatformIO | Build Environment |
| `frontend/vite.config.js` | Frontend build configuration | Vite, React | Build Environment |
| `backend/ecosystem.config.js` | PM2 process management configuration | PM2 | Production Server |

### Environment Configuration

| File Path | Purpose | Dependencies | Runtime Environment |
|------------|---------|--------------|-------------------|
| `frontend/.env.example` | Frontend environment variables template | None | Development |
| `backend/.env.example` | Backend environment variables template | None | Development |
| `scripts/inject_cloud_env.py` | Cloud environment injection script | Python 3.x | Build Environment |

## Deployment Files

### Frontend Deployment

| File Path | Purpose | Dependencies | Runtime Environment |
|------------|---------|--------------|-------------------|
| `.github/workflows/deploy.yml` | GitHub Actions CI/CD pipeline | GitHub Actions | GitHub Actions |
| `frontend/vercel.json` | Vercel deployment configuration (alternative) | Vercel | Vercel Platform |
| `frontend/netlify.toml` | Netlify deployment configuration (alternative) | Netlify | Netlify Platform |

### Backend Deployment

| File Path | Purpose | Dependencies | Runtime Environment |
|------------|---------|--------------|-------------------|
| `Dockerfile` | Docker container configuration | Docker | Docker Environment |
| `docker-compose.yml` | Multi-container Docker setup | Docker Compose | Docker Environment |
| `.github/workflows/backend-deploy.yml` | Backend CI/CD pipeline | GitHub Actions | GitHub Actions |
| `backend/nginx.conf` | Nginx reverse proxy configuration | Nginx | Production Server |

### Infrastructure Files

| File Path | Purpose | Dependencies | Runtime Environment |
|------------|---------|--------------|-------------------|
| `kubernetes/` | Kubernetes deployment manifests | Kubernetes | Kubernetes Cluster |
| `terraform/` | Infrastructure as Code definitions | Terraform | Cloud Provider |
| `ansible/` | Ansible playbooks for server setup | Ansible | Production Servers |

## Testing Files

### Frontend Tests

| File Path | Purpose | Dependencies | Runtime Environment |
|------------|---------|--------------|-------------------|
| `frontend/src/tests/unit/` | Frontend unit tests | Vitest, React Testing Library | Development |
| `frontend/src/tests/integration/` | Frontend integration tests | Vitest, Playwright | Development |
| `frontend/src/tests/e2e/` | End-to-end tests | Playwright | Development |

### Backend Tests

| File Path | Purpose | Dependencies | Runtime Environment |
|------------|---------|--------------|-------------------|
| `backend/tests/unit/` | Backend unit tests | Jest, Supertest | Development |
| `backend/tests/integration/` | Backend integration tests | Jest, Supertest | Development |
| `backend/tests/fixtures/` | Test data fixtures | JSON files | Development |

### Test Configuration

| File Path | Purpose | Dependencies | Runtime Environment |
|------------|---------|--------------|-------------------|
| `frontend/vitest.config.js` | Vitest configuration | Vitest | Development |
| `backend/jest.config.js` | Jest configuration | Jest | Development |
| `playwright.config.js` | E2E test configuration | Playwright | Development |

## Documentation Files

### Project Documentation

| File Path | Purpose | Dependencies | Runtime Environment |
|------------|---------|--------------|-------------------|
| `README.md` | Project overview, setup instructions | Markdown | Documentation |
| `SYSTEM_ARCHITECTURE.md` | Complete system architecture documentation | Markdown | Documentation |
| `ONLINE_OFFLINE_GUIDE.md` | Mode switching guide | Markdown | Documentation |
| `AUTH_FLOW.md` | Authentication flow documentation | Markdown | Documentation |
| `FRONTEND_STRUCTURE_GUIDE.md` | Frontend structure guide | Markdown | Documentation |
| `BACKEND_STRUCTURE_GUIDE.md` | Backend structure guide | Markdown | Documentation |
| `SUPABASE_SETUP_GUIDE.md` | Supabase setup guide | Markdown | Documentation |
| `SERVER_SETUP_GUIDE.md` | Server deployment guide | Markdown | Documentation |
| `GITHUB_PAGES_DEPLOYMENT.md` | GitHub Pages deployment guide | Markdown | Documentation |

### API Documentation

| File Path | Purpose | Dependencies | Runtime Environment |
|------------|---------|--------------|-------------------|
| `docs/api/` | API endpoint documentation | Markdown | Documentation |
| `docs/authentication.md` | Authentication API docs | Markdown | Documentation |
| `docs/websocket.md` | WebSocket API documentation | Markdown | Documentation |

## File Cross-Reference

### Authentication Flow Dependencies

```
Frontend Login → Backend Auth → Supabase Auth → Database
     ↓                ↓              ↓            ↓
LoginForm.jsx → authController → authService → user_profiles
     ↓                ↓              ↓            ↓
ProtectedRoute → auth middleware → JWT validation → RLS policies
```

### Device Control Flow

```
Frontend Control → Backend API → ESP32 Device → Hardware
       ↓               ↓              ↓           ↓
RelayControl → deviceController → esp32Service → ControlEngine
       ↓               ↓              ↓           ↓
useDeviceState → deviceService → HTTP/WebSocket → GPIO
```

### Real-time Data Flow

```
ESP32 Device → Backend WebSocket → Frontend WebSocket → UI Update
      ↓               ↓                  ↓              ↓
CloudSync → Socket.io → React Context → Component Re-render
```

### Data Persistence Flow

```
Frontend → Backend → Database ← → Supabase
    ↓         ↓          ↓          ↓
Form → API → SQL → Row → RLS → Tables
```

## Deployment Matrix

| Environment | ESP32 Files | Frontend Files | Backend Files | Database |
|-------------|--------------|-----------------|----------------|------------|
| **Offline Only** | ✅ All ESP32 files | ❌ Not deployed | ❌ Not running | ❌ Not used |
| **Online Full** | ✅ All ESP32 files | ✅ GitHub Pages | ✅ Node.js Server | ✅ Supabase |
| **Development** | ✅ ESP32 (local) | ✅ Local dev server | ✅ Local server | ✅ Local/Supabase |
| **Production** | ✅ ESP32 (deployed) | ✅ GitHub Pages | ✅ Cloud server | ✅ Supabase |

## Runtime Environment Summary

### ESP32 Device (Offline Mode)
- **Runtime**: FreeRTOS on ESP32
- **Memory**: SRAM + Flash storage
- **Network**: WiFi AP mode only
- **Storage**: NVS + LittleFS
- **Web Server**: Local HTTP server on port 80

### Frontend (Online Mode)
- **Runtime**: Browser JavaScript environment
- **Hosting**: GitHub Pages (static hosting)
- **Build**: Vite + React
- **Communication**: HTTPS to backend + Supabase
- **State Management**: React Context + Local Storage

### Backend (Online Mode)
- **Runtime**: Node.js on server
- **Hosting**: Cloud server (VPS, PaaS)
- **Process Manager**: PM2
- **Database**: Supabase PostgreSQL
- **Real-time**: Socket.io WebSocket server

### Database (Online Mode)
- **Platform**: Supabase (PostgreSQL)
- **Security**: Row Level Security (RLS)
- **Real-time**: Supabase Realtime
- **Authentication**: Supabase Auth
- **Storage**: Supabase Storage (optional)

This comprehensive file responsibility map provides complete clarity on how each file fits into the overall ESP32 Smart Home Automation system architecture.
