# GitHub Pages Deployment Guide

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Repository Setup](#repository-setup)
4. [Frontend Configuration](#frontend-configuration)
5. [Build Process](#build-process)
6. [GitHub Pages Setup](#github-pages-setup)
7. [Custom Domain Setup](#custom-domain-setup)
8. [SPA Routing Configuration](#spa-routing-configuration)
9. [Environment Variables](#environment-variables)
10. [Deployment Workflow](#deployment-workflow)
11. [CI/CD Pipeline](#cicd-pipeline)
12. [Performance Optimization](#performance-optimization)
13. [Troubleshooting](#troubleshooting)

## Overview

This guide covers deploying the React frontend of ESP32 Smart Home Automation system to GitHub Pages. GitHub Pages provides free static hosting for web applications with custom domain support and automatic HTTPS.

### Deployment Architecture

```
Local Development → Git Repository → GitHub Actions → GitHub Pages
       ↓                    ↓                    ↓
   Vite Dev Server → Git Push → Build Process → Static Files
                                            ↓
                                      https://username.github.io/repo-name
```

## Prerequisites

### Required Accounts
- **GitHub Account**: For repository and Pages hosting
- **Domain (Optional)**: For custom domain setup

### Required Tools
```bash
# Git (version control)
git --version  # Should be 2.x.x

# Node.js (build process)
node --version  # Should be 18.x.x or higher
npm --version   # Should be 9.x.x or higher

# GitHub CLI (optional, for easier management)
gh --version  # Should be 2.x.x
```

### System Requirements
- **OS**: Windows 10+, macOS 10.15+, or Linux
- **Memory**: 4GB+ RAM recommended
- **Storage**: 10GB+ free space
- **Network**: Internet connection for deployment

## Repository Setup

### 1. Create GitHub Repository

1. Go to [GitHub](https://github.com)
2. Click **"New repository"**
3. Configure repository:
   - **Repository name**: `smart-home-automation-frontend`
   - **Description**: `ESP32 Smart Home Automation Frontend`
   - **Visibility**: Public (required for GitHub Pages)
   - **Initialize with**: README (optional)
4. Click **"Create repository"**

### 2. Clone Repository Locally

```bash
# Clone the repository
git clone https://github.com/yourusername/smart-home-automation-frontend.git
cd smart-home-automation-frontend

# Or initialize existing project
git init
git remote add origin https://github.com/yourusername/smart-home-automation-frontend.git
```

### 3. Initialize React Project

```bash
# Create React app with Vite
npm create vite@latest . -- --template react

# Or use existing project structure
# Ensure package.json exists with proper scripts
```

### 4. Configure Git Ignore

Create `.gitignore`:

```gitignore
# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Production build
dist/
build/

# Environment variables
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# IDE files
.vscode/
.idea/
*.swp
*.swo

# OS files
.DS_Store
Thumbs.db

# Logs
logs/
*.log

# Coverage reports
coverage/
.nyc_output/

# Temporary files
*.tmp
*.temp
```

## Frontend Configuration

### 1. Package.json Configuration

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
    "lint": "eslint . --ext js,jsx --report-unused-disable-directives --max-warnings 0",
    "lint:fix": "eslint . --ext js,jsx --fix",
    "deploy": "npm run build && npm run deploy:github",
    "deploy:github": "gh-pages -d dist",
    "predeploy": "npm run build"
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
    "gh-pages": "^5.0.0",
    "tailwindcss": "^3.2.7",
    "autoprefixer": "^10.4.14",
    "postcss": "^8.4.21",
    "vitest": "^0.29.0"
  },
  "homepage": "https://yourusername.github.io/smart-home-automation-frontend"
}
```

### 2. Vite Configuration

Create `vite.config.js`:

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
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\./,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 // 24 hours
              }
            }
          }
        ]
      }
    })
  ],
  base: '/smart-home-automation-frontend/',
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          utils: ['axios']
        }
      }
    },
    chunkSizeWarningLimit: 1000
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false
      }
    }
  },
  preview: {
    port: 4173,
    host: true
  },
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version)
  }
});
```

### 3. Environment Variables

Create `.env.example`:

```env
# Supabase Configuration
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Backend API
VITE_API_BASE_URL=https://your-backend-domain.com/api

# Application Configuration
VITE_APP_NAME=Smart Home Automation
VITE_APP_VERSION=1.0.0
VITE_APP_DESCRIPTION=ESP32 Smart Home Control System

# Feature Flags
VITE_ENABLE_ANALYTICS=false
VITE_ENABLE_PWA=true
VITE_ENABLE_DEBUG=false

# Development/Production
VITE_NODE_ENV=development
```

## Build Process

### 1. Development Build

```bash
# Start development server
npm run dev

# Access at http://localhost:3000
```

### 2. Production Build

```bash
# Build for production
npm run build

# Output in dist/ directory
# Files are optimized and minified
```

### 3. Build Analysis

```bash
# Analyze bundle size
npm run build -- --analyze

# Preview production build
npm run preview
```

### 4. Build Optimization

```javascript
// vite.config.js optimizations
export default defineConfig({
  build: {
    // Minification options
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Remove console.log in production
        drop_debugger: true
      }
    },
    
    // Code splitting
    rollupOptions: {
      output: {
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: 'assets/[ext]/[name]-[hash].[ext]'
      }
    },
    
    // Asset optimization
    assetsInlineLimit: 4096, // Inline assets smaller than 4KB
    
    // CSS optimization
    cssCodeSplit: true,
    
    // Target browsers
    target: 'es2015'
  }
});
```

## GitHub Pages Setup

### 1. Enable GitHub Pages

1. Go to your repository on GitHub
2. Click **Settings** tab
3. Scroll to **Pages** section
4. Under **Build and deployment**:
   - **Source**: Deploy from a branch
   - **Branch**: `main` (or `gh-pages`)
   - **Folder**: `/root` (or `/docs`)
5. Click **Save**

### 2. Configure Branch for Deployment

#### Option A: Main Branch Deployment
```bash
# Deploy from main branch root
# Build files committed to main branch
git add dist/
git commit -m "Add production build"
git push origin main
```

#### Option B: Gh-pages Branch Deployment
```bash
# Use gh-pages package
npm install --save-dev gh-pages

# Update package.json scripts
{
  "scripts": {
    "deploy": "gh-pages -d dist",
    "predeploy": "npm run build"
  }
}

# Deploy
npm run deploy
```

### 3. Automatic Deployment with GitHub Actions

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    
    steps:
    - name: Checkout
      uses: actions/checkout@v3
      
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'
        
    - name: Install dependencies
      run: npm ci
      
    - name: Build
      run: npm run build
      env:
        VITE_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
        VITE_SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
        VITE_API_BASE_URL: ${{ secrets.API_BASE_URL }}
        
    - name: Deploy to GitHub Pages
      uses: peaceiris/actions-gh-pages@v3
      if: github.ref == 'refs/heads/main'
      with:
        github_token: ${{ secrets.GITHUB_TOKEN }}
        publish_dir: ./dist
        cname: yourdomain.com # Optional custom domain
```

### 4. Configure Secrets

1. Go to repository **Settings** → **Secrets and variables** → **Actions**
2. Add repository secrets:
   - `SUPABASE_URL`: Your Supabase project URL
   - `SUPABASE_ANON_KEY`: Your Supabase anon key
   - `API_BASE_URL`: Your backend API URL
   - `GITHUB_TOKEN`: Auto-generated by GitHub Actions

## Custom Domain Setup

### 1. DNS Configuration

#### Option A: A Record (Recommended)
```
Type: A
Name: @ (or your subdomain)
Value: 185.199.108.153
TTL: 3600 (or default)
```

#### Option B: CNAME Record
```
Type: CNAME
Name: www (or your subdomain)
Value: yourusername.github.io
TTL: 3600 (or default)
```

### 2. GitHub Pages Domain Configuration

1. Go to repository **Settings** → **Pages**
2. Under **Custom domain**, enter your domain
3. Click **Save**
4. Verify DNS configuration
5. Wait for SSL certificate (automatic)

### 3. HTTPS Certificate

GitHub Pages automatically provides:
- **Free SSL certificates**
- **Automatic renewal**
- **HTTP to HTTPS redirects**
- **HSTS support**

## SPA Routing Configuration

### 1. 404.html Redirect

Create `public/404.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Smart Home Automation</title>
    <script>
        // Redirect all 404s to index.html for SPA routing
        sessionStorage.setItem('redirect', location.pathname);
        location.replace('/smart-home-automation-frontend/');
    </script>
</head>
<body>
    <p>Redirecting...</p>
</body>
</html>
```

### 2. Router Configuration

```javascript
// src/App.jsx
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

// Handle GitHub Pages base path
const basename = import.meta.env.BASE_URL || '/';

export const App = () => {
    return (
        <Router basename={basename}>
            <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                {/* Add other routes */}
            </Routes>
        </Router>
    );
};
```

### 3. Handle Redirects

```javascript
// src/utils/redirects.js
export const handleGitHubPagesRedirect = () => {
    const redirect = sessionStorage.getItem('redirect');
    if (redirect) {
        sessionStorage.removeItem('redirect');
        // Use history.replace to avoid back button issues
        window.history.replaceState(null, '', redirect);
    }
};

// Call in App.jsx
useEffect(() => {
    handleGitHubPagesRedirect();
}, []);
```

## Environment Variables

### 1. Development Environment

Create `.env.local`:

```env
# Development configuration
VITE_SUPABASE_URL=https://dev-project.supabase.co
VITE_SUPABASE_ANON_KEY=dev-anon-key
VITE_API_BASE_URL=http://localhost:3001/api
VITE_ENABLE_DEBUG=true
```

### 2. Production Environment

Environment variables in production are set via:
- **GitHub Actions secrets** (for CI/CD)
- **Build-time variables** (hardcoded)
- **Runtime configuration** (from API)

### 3. Variable Access

```javascript
// Access environment variables
const config = {
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
    supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    apiBaseUrl: import.meta.env.VITE_API_BASE_URL,
    isDevelopment: import.meta.env.DEV,
    appVersion: import.meta.env.VITE_APP_VERSION
};

// Validation
const requiredVars = [
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY'
];

const missingVars = requiredVars.filter(varName => !import.meta.env[varName]);
if (missingVars.length > 0) {
    console.error('Missing environment variables:', missingVars);
}
```

## Deployment Workflow

### 1. Manual Deployment

```bash
# 1. Build the application
npm run build

# 2. Deploy to GitHub Pages (gh-pages method)
npm run deploy

# Or manual deployment:
# 3. Commit build files
git add dist/
git commit -m "Deploy production build"

# 4. Push to GitHub
git push origin main
```

### 2. Automated Deployment

```bash
# Push to main branch triggers automatic deployment
git add .
git commit -m "Update application"
git push origin main

# Monitor deployment at:
# https://github.com/yourusername/smart-home-automation-frontend/actions
```

### 3. Deployment Verification

1. **Check GitHub Actions**: Go to Actions tab
2. **Verify build success**: Check for green checkmarks
3. **Test deployment**: Visit the deployed URL
4. **Check console**: Look for any runtime errors
5. **Test functionality**: Verify all features work

### 4. Rollback Process

```bash
# Rollback to previous commit
git log --oneline
git checkout <previous-commit-hash>
git push -f origin main

# Or use GitHub Pages rollback:
# 1. Go to Settings → Pages
# 2. Change source branch to previous commit
# 3. Save and wait for redeployment
```

## CI/CD Pipeline

### 1. Advanced GitHub Actions Workflow

Create `.github/workflows/ci-cd.yml`:

```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

env:
  NODE_VERSION: '18'

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Run tests
        run: npm run test:ci
        
      - name: Run linting
        run: npm run lint
        
      - name: Build test
        run: npm run build
        
      - name: Upload coverage
        uses: codecov/codecov-action@v3

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Security audit
        run: npm audit --audit-level=moderate
        
      - name: Dependency check
        run: npm ci --audit=moderate

  deploy:
    needs: [test, security]
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Build
        run: npm run build
        env:
          VITE_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
          VITE_API_BASE_URL: ${{ secrets.API_BASE_URL }}
          
      - name: Deploy to staging
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
          destination_dir: staging
          
      - name: Deploy to production
        if: github.event_name == 'push' && github.ref == 'refs/heads/main'
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
          cname: yourdomain.com
```

### 2. Multi-Environment Deployment

```yaml
# .github/workflows/deploy-staging.yml
name: Deploy to Staging

on:
  push:
    branches: [ develop ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      - name: Install and build
        run: |
          npm ci
          npm run build
        env:
          VITE_NODE_ENV: staging
          VITE_API_BASE_URL: ${{ secrets.STAGING_API_URL }}
      - name: Deploy
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
          destination_dir: staging
```

## Performance Optimization

### 1. Bundle Size Optimization

```javascript
// vite.config.js
export default defineConfig({
  build: {
    // Code splitting strategy
    rollupOptions: {
      output: {
        manualChunks: {
          // Separate vendor libraries
          vendor: ['react', 'react-dom'],
          router: ['react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          utils: ['axios', 'date-fns']
        }
      }
    },
    
    // Chunk size limits
    chunkSizeWarningLimit: 500,
    
    // Asset optimization
    assetsInlineLimit: 4096,
    
    // CSS optimization
    cssCodeSplit: true
  }
});
```

### 2. Caching Strategy

```javascript
// public/sw.js (Service Worker)
const CACHE_NAME = 'smart-home-v1';
const urlsToCache = [
  '/',
  '/manifest.json',
  '/assets/'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Return cached version or fetch from network
        return response || fetch(event.request);
      })
  );
});
```

### 3. Image Optimization

```javascript
// vite.config.js
export default defineConfig({
  plugins: [
    viteImagemin({
      gifsicle: { optimizationLevel: 7 },
      optipng: { optimizationLevel: 7 },
      mozjpeg: { quality: 80 },
      pngquant: { quality: [0.65, 0.8] }
    })
  ]
});
```

### 4. Preloading Strategies

```javascript
// src/utils/preload.js
export const preloadCriticalResources = () => {
  // Preload critical fonts
  const fontLink = document.createElement('link');
  fontLink.rel = 'preload';
  fontLink.href = '/fonts/inter.woff2';
  fontLink.as = 'font';
  fontLink.type = 'font/woff2';
  document.head.appendChild(fontLink);
  
  // Preload critical CSS
  const cssLink = document.createElement('link');
  cssLink.rel = 'preload';
  cssLink.href = '/css/critical.css';
  cssLink.as = 'style';
  document.head.appendChild(cssLink);
};
```

## Troubleshooting

### Common Issues

#### 1. 404 Errors on Refresh

**Problem**: SPA routing breaks on page refresh
**Solution**:
- Configure 404.html redirect
- Use proper basename in Router
- Ensure GitHub Pages base path is correct

#### 2. White Screen After Deployment

**Problem**: Application loads but shows blank screen
**Solutions**:
- Check browser console for errors
- Verify environment variables
- Check build output for errors
- Ensure proper MIME types

#### 3. API Calls Failing

**Problem**: Frontend can't reach backend API
**Solutions**:
- Check CORS configuration
- Verify API URL in environment variables
- Ensure HTTPS endpoints in production
- Check rate limiting

#### 4. Large Bundle Size

**Problem**: Slow loading due to large JavaScript bundles
**Solutions**:
- Implement code splitting
- Use dynamic imports
- Optimize images and assets
- Enable compression

### Debug Tools

#### GitHub Actions Debugging

```yaml
# Enable debug logging
- name: Debug build
  run: |
    echo "Build directory contents:"
    ls -la dist/
    echo "Environment variables:"
    env | grep VITE_
```

#### Local Debugging

```bash
# Build with debugging
npm run build -- --mode development

# Serve build locally
npm run preview

# Analyze bundle
npx vite-bundle-analyzer dist/stats.html
```

#### Performance Monitoring

```javascript
// src/utils/performance.js
export const reportWebVitals = metric => {
  // Send to analytics service
  if (process.env.NODE_ENV === 'production') {
    gtag('event', metric.name, {
      value: Math.round(metric.value),
      event_category: 'Web Vitals'
    });
  }
};

// Use in App.jsx
import { getCLS, getFID, getFCP, getLCP, getTTFB } from 'web-vitals';

getCLS(reportWebVitals);
getFID(reportWebVitals);
getFCP(reportWebVitals);
getLCP(reportWebVitals);
getTTFB(reportWebVitals);
```

### Deployment Checklist

Before deploying to production:

- [ ] All tests pass
- [ ] Build completes without errors
- [ ] Environment variables configured
- [ ] API endpoints accessible
- [ ] HTTPS certificates valid
- [ ] Performance metrics acceptable
- [ ] Security headers configured
- [ ] Error monitoring setup
- [ ] Backup procedures tested

This comprehensive GitHub Pages deployment guide provides everything needed to successfully deploy and maintain the ESP32 Smart Home Automation frontend.
