# Frontend Structure Guide

## Table of Contents

1. [Overview](#overview)
2. [Project Structure](#project-structure)
3. [File Categories](#file-categories)
4. [Core Files](#core-files)
5. [Pages](#pages)
6. [Components](#components)
7. [Services](#services)
8. [Hooks](#hooks)
9. [Context Providers](#context-providers)
10. [Utilities](#utilities)
11. [Styling](#styling)
12. [Build Configuration](#build-configuration)
13. [Deployment Files](#deployment-files)
14. [File Responsibilities](#file-responsibilities)
15. [Development Workflow](#development-workflow)

## Overview

The frontend is a React-based single-page application (SPA) that provides the user interface for the ESP32 Smart Home Automation system in online mode. It's designed to be deployed on GitHub Pages and communicates with a backend API and Supabase for authentication and data management.

### Key Features
- **Authentication**: Login, registration, and session management
- **Real-time Dashboard**: Live device state updates
- **Device Control**: Relay and timer management
- **Role-based UI**: Different interfaces for admin and regular users
- **Responsive Design**: Works on desktop and mobile devices
- **Offline Detection**: Handles connectivity issues gracefully

## Project Structure

```
frontend/
├── public/
│   ├── index.html
│   ├── favicon.ico
│   └── manifest.json
├── src/
│   ├── components/          # Reusable UI components
│   │   ├── auth/          # Authentication components
│   │   ├── common/        # Generic components
│   │   ├── dashboard/     # Dashboard-specific components
│   │   └── layout/        # Layout components
│   ├── pages/              # Page-level components
│   ├── hooks/              # Custom React hooks
│   ├── services/           # API and external service integrations
│   ├── context/            # React context providers
│   ├── utils/              # Utility functions
│   ├── styles/             # Global styles and CSS modules
│   ├── assets/             # Static assets (images, icons)
│   ├── App.jsx             # Main application component
│   ├── main.jsx            # Application entry point
│   └── index.css          # Global styles
├── tests/                 # Test files
├── package.json
├── vite.config.js          # Vite build configuration
├── tailwind.config.js      # TailwindCSS configuration
├── .env.example           # Environment variables template
└── README.md
```

## File Categories

### 1. **Pages** (`src/pages/`)
Top-level route components that represent entire pages in the application.

### 2. **Components** (`src/components/`)
Reusable UI building blocks organized by functionality.

### 3. **Services** (`src/services/`)
External API integrations and business logic services.

### 4. **Hooks** (`src/hooks/`)
Custom React hooks for state management and side effects.

### 5. **Context** (`src/context/`)
React context providers for global state management.

### 6. **Utils** (`src/utils/`)
Pure utility functions and helpers.

### 7. **Styles** (`src/styles/`)
CSS files and styling configurations.

## Core Files

### `src/main.jsx`
**Purpose**: Application entry point and React root initialization.

**Responsibilities**:
- Import global styles
- Create React root
- Render App component
- Set up error boundaries

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import './styles/globals.css';

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);
```

### `src/App.jsx`
**Purpose**: Main application component with routing and global providers.

**Responsibilities**:
- Set up React Router
- Configure global providers (Auth, Theme, etc.)
- Define application routes
- Handle global error states
- Manage online/offline detection

```jsx
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { OnlineStatusProvider } from './context/OnlineStatusContext';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { ProtectedRoute } from './components/auth/ProtectedRoute';

// Pages
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import { AdminDashboardPage } from './pages/AdminDashboardPage';

// Components
import { Layout } from './components/layout/Layout';
import { LoadingSpinner } from './components/common/LoadingSpinner';

export const App = () => {
    return (
        <ErrorBoundary>
            <OnlineStatusProvider>
                <ThemeProvider>
                    <AuthProvider>
                        <Router>
                            <Routes>
                                <Route path="/login" element={<LoginPage />} />
                                <Route path="/register" element={<RegisterPage />} />
                                <Route path="/" element={
                                    <ProtectedRoute>
                                        <Layout>
                                            <Routes>
                                                <Route index element={<DashboardPage />} />
                                                <Route path="/admin" element={<AdminDashboardPage />} />
                                            </Routes>
                                        </Layout>
                                    </ProtectedRoute>
                                } />
                            </Routes>
                        </Router>
                    </AuthProvider>
                </ThemeProvider>
            </OnlineStatusProvider>
        </ErrorBoundary>
    );
};

export default App;
```

### `src/index.css`
**Purpose**: Global CSS styles and TailwindCSS imports.

**Responsibilities**:
- Import TailwindCSS base styles
- Define global CSS variables
- Set up base typography
- Apply global resets

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
    :root {
        --color-primary: #6366f1;
        --color-secondary: #10b981;
        --color-danger: #ef4444;
        --color-warning: #f59e0b;
        --color-background: #ffffff;
        --color-surface: #f8fafc;
        --color-text: #1f2937;
        --color-text-secondary: #6b7280;
    }

    body {
        @apply bg-background text-text font-sans;
    }
}
```

## Pages

### `src/pages/LoginPage.jsx`
**Purpose**: User authentication and login interface.

**Responsibilities**:
- Display login form
- Handle authentication logic
- Manage form state and validation
- Redirect after successful login
- Provide forgot password link

**Dependencies**:
- `LoginForm` component
- `authService` for authentication
- `useNavigate` for navigation

```jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LoginForm } from '../components/auth/LoginForm';
import { authService } from '../services/auth';
import { useToast } from '../hooks/useToast';

export const LoginPage = () => {
    const navigate = useNavigate();
    const { showToast } = useToast();
    const [loading, setLoading] = useState(false);

    const handleLogin = async (email, password) => {
        setLoading(true);
        
        try {
            const result = await authService.signIn(email, password);
            
            if (result.success) {
                showToast('Login successful!', 'success');
                navigate('/dashboard');
            } else {
                showToast(result.error, 'error');
            }
        } catch (error) {
            showToast('Login failed. Please try again.', 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="max-w-md w-full space-y-8">
                <div className="text-center">
                    <h1 className="text-3xl font-bold text-gray-900">
                        Smart Home Control
                    </h1>
                    <p className="mt-2 text-gray-600">
                        Sign in to your account
                    </p>
                </div>
                
                <LoginForm 
                    onSubmit={handleLogin}
                    loading={loading}
                />
                
                <div className="text-center">
                    <p className="text-sm text-gray-600">
                        Don't have an account?{' '}
                        <a 
                            href="/register" 
                            className="font-medium text-primary hover:text-primary-dark"
                        >
                            Sign up
                        </a>
                    </p>
                </div>
            </div>
        </div>
    );
};
```

### `src/pages/RegisterPage.jsx`
**Purpose**: New user registration and account creation.

**Responsibilities**:
- Display registration form
- Handle user creation logic
- Validate form inputs
- Show registration success/error states
- Redirect to login after successful registration

### `src/pages/DashboardPage.jsx`
**Purpose**: Main dashboard for authenticated users.

**Responsibilities**:
- Display device status overview
- Show real-time updates
- Provide quick access to controls
- Handle role-based content display

### `src/pages/AdminDashboardPage.jsx`
**Purpose**: Advanced dashboard for administrators.

**Responsibilities**:
- User management interface
- System configuration
- Advanced device controls
- Analytics and reporting
- System health monitoring

## Components

### Authentication Components (`src/components/auth/`)

#### `src/components/auth/LoginForm.jsx`
**Purpose**: Reusable login form component.

**Responsibilities**:
- Form state management
- Input validation
- Submit handling
- Error display
- Loading states

#### `src/components/auth/RegisterForm.jsx`
**Purpose**: User registration form component.

**Responsibilities**:
- Multi-step registration process
- Password strength validation
- Email verification handling
- Form validation and error handling

#### `src/components/auth/ProtectedRoute.jsx`
**Purpose**: Route protection wrapper component.

**Responsibilities**:
- Check authentication status
- Validate user roles
- Redirect unauthenticated users
- Show loading states during auth checks

### Dashboard Components (`src/components/dashboard/`)

#### `src/components/dashboard/DeviceCard.jsx`
**Purpose**: Individual device status and control card.

**Responsibilities**:
- Display device state
- Provide control buttons
- Show real-time updates
- Handle offline states

#### `src/components/dashboard/RelayControl.jsx`
**Purpose**: Relay control interface component.

**Responsibilities**:
- Toggle relay states
- Display current status
- Handle manual override
- Show timer information

#### `src/components/dashboard/TimerControl.jsx`
**Purpose**: Timer configuration and management component.

**Responsibilities**:
- Set timer duration
- Start/stop timers
- Display remaining time
- Handle timer presets

#### `src/components/dashboard/SystemStatus.jsx`
**Purpose**: System health and status display.

**Responsibilities**:
- Show connectivity status
- Display system metrics
- Alert notifications
- Performance indicators

### Common Components (`src/components/common/`)

#### `src/components/common/Button.jsx`
**Purpose**: Reusable button component with variants.

**Responsibilities**:
- Multiple button styles (primary, secondary, danger)
- Loading states
- Disabled states
- Icon support

#### `src/components/common/Modal.jsx`
**Purpose**: Modal dialog component.

**Responsibilities**:
- Overlay management
- Keyboard navigation
- Focus trapping
- Animation support

#### `src/components/common/LoadingSpinner.jsx`
**Purpose**: Loading indicator component.

**Responsibilities**:
- Consistent loading animation
- Size variants
- Color theming
- Accessibility features

#### `src/components/common/Toast.jsx`
**Purpose**: Notification toast component.

**Responsibilities**:
- Auto-dismiss notifications
- Multiple toast types
- Position management
- Animation support

### Layout Components (`src/components/layout/`)

#### `src/components/layout/Layout.jsx`
**Purpose**: Main application layout wrapper.

**Responsibilities**:
- Navigation header
- Sidebar menu
- Footer
- Responsive design
- Theme switching

#### `src/components/layout/Navigation.jsx`
**Purpose**: Navigation menu component.

**Responsibilities**:
- Route links
- Active state indicators
- Mobile menu toggle
- User menu dropdown

#### `src/components/layout/Sidebar.jsx`
**Purpose**: Sidebar navigation component.

**Responsibilities**:
- Collapsible menu
- Role-based menu items
- Active route highlighting
- Mobile responsiveness

## Services

### `src/services/auth.js`
**Purpose**: Authentication service for Supabase integration.

**Responsibilities**:
- User login/logout
- Registration
- Password reset
- Session management
- Token refresh

**Key Methods**:
```javascript
class AuthService {
    async signIn(email, password)
    async signUp(email, password, displayName)
    async signOut()
    async getCurrentSession()
    async resetPassword(email)
    onAuthStateChange(callback)
    hasRole(requiredRole)
    hasPermission(permission)
}
```

### `src/services/api.js`
**Purpose**: API client for backend communication.

**Responsibilities**:
- HTTP request handling
- Error handling
- Request/response interceptors
- Authentication headers
- Retry logic

**Key Methods**:
```javascript
class ApiService {
    async get(endpoint, params)
    async post(endpoint, data)
    async put(endpoint, data)
    async delete(endpoint)
    setAuthToken(token)
    clearAuthToken()
}
```

### `src/services/deviceService.js`
**Purpose**: Device control and status service.

**Responsibilities**:
- Relay control API calls
- Device status fetching
- Timer management
- Real-time updates via WebSocket
- Offline mode handling

**Key Methods**:
```javascript
class DeviceService {
    async getDeviceStatus()
    async setRelayState(relayId, state)
    async setTimer(relayId, duration, targetState)
    async cancelTimer(relayId)
    subscribeToDeviceUpdates(callback)
    unsubscribeFromDeviceUpdates()
}
```

### `src/services/supabase.js`
**Purpose**: Supabase client configuration and initialization.

**Responsibilities**:
- Client initialization
- Environment configuration
- Database helpers
- Real-time subscription setup

## Hooks

### `src/hooks/useAuth.js`
**Purpose**: Authentication state management hook.

**Responsibilities**:
- Access auth context
- Provide auth helper methods
- Handle authentication state changes
- Role checking utilities

```javascript
export const useAuth = () => {
    const context = useContext(AuthContext);
    
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    
    return {
        user: context.user,
        role: context.role,
        isAuthenticated: context.isAuthenticated,
        loading: context.loading,
        login: context.login,
        logout: context.logout,
        hasRole: context.hasRole,
        hasPermission: context.hasPermission
    };
};
```

### `src/hooks/useDeviceState.js`
**Purpose**: Device state management hook.

**Responsibilities**:
- Fetch device status
- Handle real-time updates
- Manage connection state
- Provide device control methods

```javascript
export const useDeviceState = () => {
    const [devices, setDevices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        // Subscribe to device updates
        const unsubscribe = deviceService.subscribeToDeviceUpdates((update) => {
            setDevices(prev => updateDeviceState(prev, update));
        });

        return unsubscribe;
    }, []);

    const controlRelay = async (relayId, state) => {
        try {
            await deviceService.setRelayState(relayId, state);
        } catch (error) {
            setError(error.message);
        }
    };

    return {
        devices,
        loading,
        error,
        isConnected,
        controlRelay,
        refreshDevices: () => deviceService.getDeviceStatus()
    };
};
```

### `src/hooks/useToast.js`
**Purpose**: Toast notification management hook.

**Responsibilities**:
- Show/hide toast notifications
- Manage toast queue
- Auto-dismiss functionality
- Toast positioning

### `src/hooks/useLocalStorage.js`
**Purpose**: Local storage management hook.

**Responsibilities**:
- Read/write localStorage
- JSON serialization
- Default values
- Change detection

### `src/hooks/useDebounce.js`
**Purpose**: Debounce utility hook.

**Responsibilities**:
- Delay function execution
- Cancel pending calls
- Memory management
- Immediate execution option

## Context Providers

### `src/context/AuthContext.jsx`
**Purpose**: Global authentication state management.

**Responsibilities**:
- User authentication state
- Role-based access control
- Session management
- Authentication event handling

```javascript
const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [state, dispatch] = useReducer(authReducer, initialState);
    
    // Authentication logic here
    
    return (
        <AuthContext.Provider value={{ ...state, login, logout, hasRole }}>
            {children}
        </AuthContext.Provider>
    );
};
```

### `src/context/ThemeContext.jsx`
**Purpose**: Theme management (light/dark mode).

**Responsibilities**:
- Theme state management
- Theme switching
- CSS variable updates
- Theme persistence

### `src/context/OnlineStatusContext.jsx`
**Purpose**: Online/offline status management.

**Responsibilities**:
- Network connectivity detection
- Offline mode handling
- Connection status notifications
- Sync state management

## Utilities

### `src/utils/validation.js`
**Purpose**: Form validation utilities.

**Responsibilities**:
- Email validation
- Password strength checking
- Form field validation
- Error message formatting

```javascript
export const validators = {
    email: (value) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(value) ? null : 'Invalid email address';
    },
    
    password: (value) => {
        if (value.length < 8) return 'Password must be at least 8 characters';
        if (!/[A-Z]/.test(value)) return 'Password must contain uppercase letter';
        if (!/[a-z]/.test(value)) return 'Password must contain lowercase letter';
        if (!/[0-9]/.test(value)) return 'Password must contain number';
        return null;
    },
    
    required: (value) => {
        return value.trim() ? null : 'This field is required';
    }
};
```

### `src/utils/formatting.js`
**Purpose**: Data formatting utilities.

**Responsibilities**:
- Date/time formatting
- Number formatting
- Currency formatting
- File size formatting

### `src/utils/constants.js`
**Purpose**: Application constants and configuration.

**Responsibilities**:
- API endpoints
- Error messages
- Default values
- Configuration options

### `src/utils/helpers.js`
**Purpose**: General utility functions.

**Responsibilities**:
- Array/object manipulation
- String operations
- Type checking
- Async utilities

## Styling

### `src/styles/globals.css`
**Purpose**: Global CSS styles and TailwindCSS configuration.

**Responsibilities**:
- CSS custom properties
- Global resets
- Base typography
- Utility classes

### `src/styles/components.css`
**Purpose**: Component-specific styles.

**Responsibilities**:
- Component overrides
- Custom animations
- Responsive utilities
- Theme variations

## Build Configuration

### `vite.config.js`
**Purpose**: Vite build tool configuration.

**Responsibilities**:
- Development server setup
- Build optimization
- Plugin configuration
- Environment variables

```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            workbox: {
                globPatterns: ['**/*.{js,css,html,ico,png,svg}']
            }
        })
    ],
    base: '/smart-home-automation/',
    build: {
        outDir: 'dist',
        sourcemap: true,
        rollupOptions: {
            output: {
                manualChunks: {
                    vendor: ['react', 'react-dom'],
                    supabase: ['@supabase/supabase-js']
                }
            }
        }
    },
    server: {
        port: 3000,
        proxy: {
            '/api': {
                target: 'http://localhost:3001',
                changeOrigin: true
            }
        }
    }
});
```

### `tailwind.config.js`
**Purpose**: TailwindCSS configuration.

**Responsibilities**:
- Theme customization
- Plugin configuration
- Purge paths
- Custom utilities

```javascript
/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                primary: {
                    50: '#eff6ff',
                    500: '#3b82f6',
                    600: '#2563eb',
                    700: '#1d4ed8',
                },
                success: {
                    50: '#f0fdf4',
                    500: '#22c55e',
                    600: '#16a34a',
                }
            },
            fontFamily: {
                sans: ['Inter', 'system-ui', 'sans-serif'],
            },
            animation: {
                'fade-in': 'fadeIn 0.5s ease-in-out',
                'slide-up': 'slideUp 0.3s ease-out',
            }
        },
    },
    plugins: [
        require('@tailwindcss/forms'),
        require('@tailwindcss/typography'),
    ],
}
```

## Deployment Files

### `package.json`
**Purpose**: Project dependencies and scripts configuration.

**Responsibilities**:
- Dependency management
- Build scripts
- Development scripts
- Project metadata

```json
{
    "name": "smart-home-automation-frontend",
    "version": "1.0.0",
    "type": "module",
    "scripts": {
        "dev": "vite",
        "build": "vite build",
        "preview": "vite preview",
        "test": "vitest",
        "test:ui": "vitest --ui",
        "lint": "eslint . --ext js,jsx --report-unused-disable-directives --max-warnings 0",
        "lint:fix": "eslint . --ext js,jsx --fix"
    },
    "dependencies": {
        "react": "^18.2.0",
        "react-dom": "^18.2.0",
        "react-router-dom": "^6.8.0",
        "@supabase/supabase-js": "^2.0.0",
        "axios": "^1.3.0"
    },
    "devDependencies": {
        "@types/react": "^18.0.28",
        "@types/react-dom": "^18.0.11",
        "@vitejs/plugin-react": "^3.1.0",
        "vite": "^4.1.0",
        "tailwindcss": "^3.2.7",
        "vitest": "^0.29.0"
    }
}
```

### `.env.example`
**Purpose**: Environment variables template.

**Responsibilities**:
- Environment variable documentation
- Configuration examples
- Security guidelines

```env
# Supabase Configuration
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Backend API
VITE_API_BASE_URL=http://localhost:3001/api

# Application Configuration
VITE_APP_NAME=Smart Home Automation
VITE_APP_VERSION=1.0.0

# Feature Flags
VITE_ENABLE_ANALYTICS=false
VITE_ENABLE_DEBUG=false
```

## File Responsibilities

### Authentication Flow Files
| File | Responsibility | Dependencies |
|------|----------------|--------------|
| `LoginPage.jsx` | Login UI and flow | `LoginForm`, `authService` |
| `RegisterPage.jsx` | Registration UI and flow | `RegisterForm`, `authService` |
| `LoginForm.jsx` | Login form component | Form validation, auth service |
| `RegisterForm.jsx` | Registration form component | Form validation, auth service |
| `auth.js` | Authentication service | Supabase client |
| `AuthContext.jsx` | Global auth state | React Context, auth service |
| `ProtectedRoute.jsx` | Route protection | Auth context, router |

### Dashboard Files
| File | Responsibility | Dependencies |
|------|----------------|--------------|
| `DashboardPage.jsx` | Main dashboard | Device cards, auth context |
| `DeviceCard.jsx` | Device status display | Device service, real-time |
| `RelayControl.jsx` | Relay control UI | Device service, state management |
| `TimerControl.jsx` | Timer management UI | Device service, validation |
| `deviceService.js` | Device API client | HTTP client, WebSocket |

### Real-time Files
| File | Responsibility | Dependencies |
|------|----------------|--------------|
| `useDeviceState.js` | Device state hook | Device service, React hooks |
| `OnlineStatusContext.jsx` | Connection status | Browser APIs, device service |
| `WebSocketService.js` | WebSocket management | Browser WebSocket API |

### API Communication Files
| File | Responsibility | Dependencies |
|------|----------------|--------------|
| `api.js` | HTTP client | Axios, interceptors |
| `supabase.js` | Supabase client | Supabase SDK |
| `deviceService.js` | Device API | HTTP client, WebSocket |

## Development Workflow

### Local Development
1. **Install dependencies**: `npm install`
2. **Start development server**: `npm run dev`
3. **Access application**: `http://localhost:3000`
4. **Hot reload**: Automatic on file changes

### Build Process
1. **Production build**: `npm run build`
2. **Output directory**: `dist/`
3. **Optimization**: Code splitting, minification
4. **Deployment ready**: Static files

### Testing
1. **Unit tests**: `npm run test`
2. **Test UI**: `npm run test:ui`
3. **Coverage**: Integrated with Vitest
4. **E2E tests**: Cypress integration

### Code Quality
1. **Linting**: `npm run lint`
2. **Auto-fix**: `npm run lint:fix`
3. **Pre-commit hooks**: Husky integration
4. **Type checking**: PropTypes/TypeScript

This frontend structure provides a solid foundation for building a scalable, maintainable React application with comprehensive authentication, real-time features, and excellent user experience.
