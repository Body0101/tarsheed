# ESP32 Smart Home Automation - System Architecture

## Table of Contents

1. [Overview](#overview)
2. [Architecture Modes](#architecture-modes)
3. [System Components](#system-components)
4. [Data Flow Architecture](#data-flow-architecture)
5. [Authentication & Security](#authentication--security)
6. [Deployment Architecture](#deployment-architecture)
7. [Technology Stack](#technology-stack)
8. [Communication Protocols](#communication-protocols)
9. [State Management](#state-management)
10. [Scalability Considerations](#scalability-considerations)

## Overview

The ESP32 Smart Home Automation system is a hybrid IoT platform that operates in two distinct modes:

- **Offline Mode**: Self-contained ESP32 device with local web interface
- **Online Mode**: Full-stack web application with cloud authentication and multi-device support

The system provides seamless switching between modes while maintaining core functionality and user experience.

## Architecture Modes

### Offline Mode Architecture

```
┌─────────────────┐    WiFi AP    ┌─────────────────┐
│   Browser      │◄──────────────►│   ESP32 Device  │
│   (Local)      │               │                 │
│                │               │ ┌─────────────┐ │
│ ┌─────────────┐ │               │ │ Relays      │ │
│ │ Local UI    │ │               │ │ (GPIO)      │ │
│ │ (index.html)│ │               │ └─────────────┘ │
│ └─────────────┘ │               │ ┌─────────────┐ │
│                │               │ │ PIR Sensors │ │
│                │               │ │ (GPIO)      │ │
│                │               │ └─────────────┘ │
└─────────────────┘               └─────────────────┘
```

**Characteristics:**
- ESP32 hosts captive portal web server
- Local authentication stored in ESP32 NVS
- Direct hardware control via GPIO
- No internet dependency
- Single device operation

### Online Mode Architecture

```
┌─────────────────┐    HTTPS     ┌─────────────────┐    HTTPS     ┌─────────────────┐
│   Browser      │◄──────────────►│  GitHub Pages   │◄──────────────►│  Supabase      │
│   (Any)        │               │  (Frontend)     │               │  (Backend)     │
│                │               │                 │               │                 │
│ ┌─────────────┐ │               │ ┌─────────────┐ │               │ ┌─────────────┐ │
│ │ React App    │ │               │ │ Auth Pages  │ │               │ │ Auth API    │ │
│ │ Dashboard    │ │               │ │ Dashboard   │ │               │ │ Database    │ │
│ │ Controls     │ │               │ │ Components  │ │               │ │ Realtime    │ │
│ └─────────────┘ │               │ └─────────────┘ │               │ └─────────────┘ │
└─────────────────┘               └─────────────────┘               └─────────────────┘
         │                                 │                                 │
         │ WebSocket/HTTPS                   │ HTTP/WebSocket                  │ HTTP
         ▼                                 ▼                                 ▼
┌─────────────────┐               ┌─────────────────┐               ┌─────────────────┐
│ ESP32 Device   │◄──────────────►│ Backend Server  │◄──────────────►│ Supabase       │
│ (Local)        │               │ (Node.js)       │               │ (Realtime)      │
│                │               │                 │               │                 │
│ ┌─────────────┐ │               │ ┌─────────────┐ │               │ ┌─────────────┐ │
│ │ Relays      │ │               │ │ Auth Logic  │ │               │ │ Live Sync   │ │
│ │ PIR Sensors │ │               │ │ API Routes  │ │               │ │ State Store │ │
│ │ Local WiFi  │ │               │ │ Realtime    │ │               │ │ Role Mgmt   │ │
│ └─────────────┘ │               │ └─────────────┘ │               │ └─────────────┘ │
└─────────────────┘               └─────────────────┘               └─────────────────┘
```

**Characteristics:**
- Frontend hosted on GitHub Pages
- Backend server handles business logic
- Supabase provides authentication and database
- Multi-device and multi-user support
- Cloud synchronization and backup

## System Components

### ESP32 Device Layer

**Files:**
- `SmartHomeAutomation/src/main.cpp` - Main firmware entry point
- `SmartHomeAutomation/src/ControlEngine.cpp/.h` - Hardware control logic
- `SmartHomeAutomation/src/StorageLayer.cpp/.h` - Local persistence
- `SmartHomeAutomation/src/WebPortal.cpp/.h` - Local web server
- `SmartHomeAutomation/src/CloudSyncService.cpp/.h` - Cloud communication
- `SmartHomeAutomation/src/TimeKeeper.cpp/.h` - Time management
- `SmartHomeAutomation/src/SystemTypes.h` - Core data structures
- `SmartHomeAutomation/src/Config.h` - Hardware configuration

**Responsibilities:**
- GPIO control for relays and sensors
- Local web server for offline mode
- Cloud synchronization service
- Hardware state management
- Real-time control loops

### Frontend Layer (Online Mode)

**Files (GitHub Pages):**
- `frontend/src/App.jsx` - Main React application
- `frontend/src/pages/` - Page components (Login, Dashboard, Admin)
- `frontend/src/components/` - Reusable UI components
- `frontend/src/hooks/` - Custom React hooks
- `frontend/src/services/` - API and Supabase services
- `frontend/src/utils/` - Utility functions
- `frontend/src/context/` - React context providers

**Responsibilities:**
- User interface and experience
- Authentication flows
- Real-time dashboard updates
- Device control interfaces
- Role-based access control

### Backend Server Layer

**Files:**
- `server/src/index.js` - Server entry point
- `server/src/auth/` - Authentication middleware and logic
- `server/src/api/` - API route handlers
- `server/src/realtime/` - WebSocket and real-time logic
- `server/src/database/` - Database operations
- `server/src/middleware/` - Express middleware
- `server/src/utils/` - Server utilities

**Responsibilities:**
- User authentication and session management
- API endpoint handling
- Real-time WebSocket connections
- ESP32 device communication
- Business logic enforcement

### Supabase Layer

**Components:**
- Authentication service
- PostgreSQL database
- Real-time subscriptions
- Row Level Security (RLS) policies
- Storage buckets (if needed)

**Responsibilities:**
- User identity management
- Data persistence
- Real-time synchronization
- Role-based access control
- Backup and recovery

## Data Flow Architecture

### Offline Mode Data Flow

```
User Action → Local Web Server → ControlEngine → GPIO Hardware
                ↓
            Local Storage (NVS/LittleFS)
```

### Online Mode Data Flow

```
User Action → Frontend → Backend Server → Supabase → ESP32 Device
     ↓           ↓            ↓             ↓           ↓
  Local State → API Call → Auth Check → Database → Hardware Control
     ↓           ↓            ↓             ↓           ↓
  UI Update ← WebSocket ← Realtime ← Realtime ← State Sync
```

### Authentication Flow

```
Login Attempt → Frontend → Supabase Auth → Backend → Role Assignment → Dashboard
                     ↓            ↓           ↓            ↓
               Token Storage → Session → API Access → UI Permissions
```

## Authentication & Security

### Offline Authentication
- MAC address-based user identification
- Local password storage in ESP32 NVS
- Simple role system (Admin/Restricted)
- No external dependencies

### Online Authentication
- Supabase Auth integration
- JWT token management
- Role-based access control
- Session persistence
- Multi-factor authentication support

### Security Layers
1. **Transport Layer**: HTTPS/WSS encryption
2. **Authentication Layer**: Supabase Auth + JWT
3. **Authorization Layer**: Role-based permissions
4. **Data Layer**: Supabase RLS policies
5. **Network Layer**: CORS, rate limiting

## Deployment Architecture

### Offline Deployment
```
ESP32 Flash → Local Web Server → Direct Device Access
```

### Online Deployment
```
GitHub Pages (Frontend) ←→ Backend Server ←→ Supabase ←→ ESP32 Devices
       ↓                        ↓              ↓           ↓
   Static Hosting        API Gateway      Database    IoT Devices
```

## Technology Stack

### ESP32 Firmware
- **Platform**: ESP32 (Xtensa LX6 Dual-Core)
- **Framework**: Arduino + FreeRTOS
- **Libraries**: ArduinoJson, WebSockets, LittleFS, Preferences
- **Language**: C++

### Frontend (Online Mode)
- **Framework**: React 18
- **Build Tool**: Vite
- **Styling**: TailwindCSS
- **HTTP Client**: Axios
- **Real-time**: Supabase Realtime
- **Deployment**: GitHub Pages

### Backend Server
- **Runtime**: Node.js
- **Framework**: Express.js
- **Authentication**: Supabase Auth
- **Real-time**: Socket.io
- **Database**: Supabase PostgreSQL
- **Deployment**: Vercel/Heroku

### Database & Auth
- **Provider**: Supabase
- **Database**: PostgreSQL 14
- **Authentication**: Supabase Auth
- **Real-time**: Supabase Realtime
- **Storage**: Supabase Storage (optional)

## Communication Protocols

### ESP32 Communication
- **Local**: HTTP/WebSocket (WiFi)
- **Cloud**: HTTPS REST API
- **Real-time**: WebSocket connections

### Frontend-Backend Communication
- **API**: HTTPS REST
- **Real-time**: WebSocket
- **Authentication**: JWT tokens

### Backend-Supabase Communication
- **Database**: PostgreSQL client
- **Auth**: Supabase client SDK
- **Real-time**: Supabase Realtime client

## State Management

### ESP32 State
- **Runtime**: In-memory structures
- **Persistence**: Preferences (NVS) + LittleFS
- **Synchronization**: CloudSyncService

### Frontend State
- **Local**: React Context + useState
- **Persistence**: localStorage + Supabase
- **Real-time**: Supabase subscriptions

### Backend State
- **Session**: Memory + Redis (optional)
- **Persistence**: Supabase database
- **Real-time**: Socket.io rooms

## Scalability Considerations

### Current Limitations
- **ESP32**: Single device, limited memory
- **Frontend**: Static hosting, no server-side processing
- **Backend**: Single instance, limited database connections

### Scaling Strategies
1. **Multi-Device**: ESP32 mesh networking
2. **Backend**: Load balancing, horizontal scaling
3. **Database**: Connection pooling, read replicas
4. **Frontend**: CDN, edge caching

### Performance Optimization
- **ESP32**: Efficient GPIO operations, minimal web overhead
- **Frontend**: Code splitting, lazy loading
- **Backend**: Caching, connection pooling
- **Database**: Indexing, query optimization

## Mode Switching Logic

### Automatic Detection
1. **Network Check**: Internet connectivity test
2. **Configuration**: User preference or auto-detect
3. **Fallback**: Offline mode if online unavailable

### Seamless Transition
- **State Sync**: Preserve user preferences
- **Data Continuity**: Sync local changes to cloud
- **UI Consistency**: Maintain similar interface patterns
- **Feature Parity**: Core functions available in both modes

### Configuration Management
- **Offline**: Local NVS storage
- **Online**: Supabase user preferences
- **Hybrid**: Local cache with cloud backup

This architecture provides a robust foundation for both standalone IoT operation and cloud-connected smart home automation, ensuring reliability and scalability while maintaining user experience consistency across modes.
