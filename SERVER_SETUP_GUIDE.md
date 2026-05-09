# Server Setup Guide

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Environment Setup](#environment-setup)
4. [Local Development](#local-development)
5. [Production Deployment](#production-deployment)
6. [Environment Configuration](#environment-configuration)
7. [Security Setup](#security-setup)
8. [Monitoring and Logging](#monitoring-and-logging)
9. [Database Setup](#database-setup)
10. [SSL/HTTPS Configuration](#sslhttps-configuration)
11. [Performance Optimization](#performance-optimization)
12. [Backup and Recovery](#backup-and-recovery)
13. [Troubleshooting](#troubleshooting)

## Overview

This guide covers the complete setup and deployment of the Node.js backend server for ESP32 Smart Home Automation system. The backend serves as the API gateway, real-time communication hub, and business logic engine.

### Server Responsibilities
- **API Gateway**: Handle HTTP requests from frontend
- **Authentication**: Validate JWT tokens and manage sessions
- **Real-time Communication**: WebSocket server for live updates
- **Device Communication**: Communicate with ESP32 devices
- **Business Logic**: Enforce rules and manage system state
- **Data Validation**: Validate and sanitize all inputs

## Prerequisites

### System Requirements

#### Minimum Requirements
- **OS**: Linux (Ubuntu 20.04+), macOS (10.15+), or Windows 10+
- **Node.js**: Version 18.0 or higher
- **Memory**: 2GB RAM minimum, 4GB recommended
- **Storage**: 10GB free space
- **Network**: Stable internet connection

#### Recommended Production Requirements
- **OS**: Ubuntu 22.04 LTS
- **CPU**: 2+ cores
- **Memory**: 4GB+ RAM
- **Storage**: 50GB+ SSD
- **Network**: 100Mbps+ connection

### Required Software

#### Development Environment
```bash
# Node.js (use nvm for version management)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 18
nvm use 18

# Verify installation
node --version  # Should be v18.x.x
npm --version   # Should be 9.x.x

# Git (for version control)
sudo apt update
sudo apt install git

# Optional: PostgreSQL client for direct database access
sudo apt install postgresql-client
```

#### Production Environment
```bash
# Process manager (PM2)
npm install -g pm2

# Reverse proxy (Nginx)
sudo apt update
sudo apt install nginx

# SSL certificate management (Certbot)
sudo apt install certbot python3-certbot-nginx

# Firewall (UFW)
sudo apt install ufw
```

## Environment Setup

### 1. Clone Repository

```bash
# Clone the repository
git clone https://github.com/your-username/smart-home-automation.git
cd smart-home-automation/backend

# Or create new project
mkdir smart-home-backend
cd smart-home-backend
npm init -y
```

### 2. Install Dependencies

```bash
# Install production dependencies
npm install express cors helmet morgan compression
npm install @supabase/supabase-js socket.io
npm install express-rate-limit express-validator
npm install bcryptjs jsonwebtoken dotenv
npm install winston ioredis axios

# Install development dependencies
npm install -D nodemon jest supertest eslint prettier
npm install -D @types/node @types/express @types/cors
```

### 3. Create Project Structure

```bash
# Create directory structure
mkdir -p src/{controllers,middleware,services,routes,realtime,database,utils,config}
mkdir -p tests/{unit,integration,fixtures}
mkdir -p docs logs

# Create initial files
touch src/index.js
touch .env.example
touch .gitignore
touch README.md
```

### 4. Configure Git Ignore

```bash
# .gitignore
# Dependencies
node_modules/
npm-debug.log*

# Environment variables
.env
.env.local
.env.production

# Logs
logs/
*.log

# Runtime data
pids/
*.pid
*.seed
*.pid.lock

# Coverage directory used by tools like istanbul
coverage/

# nyc test coverage
.nyc_output/

# Dependency directories
jspm_packages/

# Optional npm cache directory
.npm

# Optional REPL history
.node_repl_history

# Output of 'npm pack'
*.tgz

# Yarn Integrity file
.yarn-integrity

# dotenv environment variables file
.env

# parcel-bundler cache (https://parceljs.org/)
.cache
.parcel-cache

# next.js build output
.next

# nuxt.js build output
.nuxt

# vuepress build output
.vuepress/dist

# Serverless directories
.serverless

# FuseBox cache
.fusebox/

# DynamoDB Local files
.dynamodb/

# TernJS port file
.tern-port

# Stores VSCode versions used for testing VSCode extensions
.vscode-test
```

## Local Development

### 1. Environment Configuration

Create `.env` file for local development:

```env
# Server Configuration
PORT=3001
NODE_ENV=development

# Supabase Configuration
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key

# Database Configuration
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.your-project-id.supabase.co:5432/postgres

# Security Configuration
JWT_SECRET=your-super-secret-jwt-key-for-development
CORS_ORIGIN=http://localhost:3000

# Redis Configuration (for rate limiting)
REDIS_URL=redis://localhost:6379

# Logging Configuration
LOG_LEVEL=debug
LOG_FILE=logs/app.log

# ESP32 Configuration
ESP32_DISCOVERY_ENABLED=true
ESP32_DEFAULT_PORT=80
```

### 2. Development Scripts

Add to `package.json`:

```json
{
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "lint": "eslint src/ --ext .js",
    "lint:fix": "eslint src/ --ext .js --fix",
    "format": "prettier --write src/",
    "build": "echo 'No build step required for Node.js'",
    "logs": "tail -f logs/app.log"
  }
}
```

### 3. Start Development Server

```bash
# Start development server with auto-reload
npm run dev

# Or start manually
npm start

# View logs
npm run logs
```

### 4. Test Local Setup

```bash
# Test API endpoints
curl http://localhost:3001/health

# Test authentication
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}'

# Test WebSocket connection
# Use browser console or WebSocket client
const ws = new WebSocket('ws://localhost:3001');
```

## Production Deployment

### 1. Server Preparation

#### Update System
```bash
# Update package lists
sudo apt update && sudo apt upgrade -y

# Install required packages
sudo apt install -y curl wget git build-essential
```

#### Create Application User
```bash
# Create dedicated user for security
sudo adduser smarthome
sudo usermod -aG sudo smarthome

# Switch to application user
sudo su - smarthome
```

### 2. Deploy Application

#### Clone and Setup
```bash
# Clone repository
git clone https://github.com/your-username/smart-home-automation.git
cd smart-home-automation/backend

# Install dependencies
npm ci --production

# Create necessary directories
mkdir -p logs
mkdir -p uploads
```

#### Configure Production Environment
```bash
# Create production environment file
cp .env.example .env.production

# Edit production configuration
nano .env.production
```

Production `.env.production` example:
```env
# Server Configuration
PORT=3001
NODE_ENV=production

# Supabase Configuration
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-production-service-role-key
SUPABASE_ANON_KEY=your-production-anon-key

# Database Configuration
DATABASE_URL=postgresql://postgres:[STRONG-PASSWORD]@db.your-project-id.supabase.co:5432/postgres

# Security Configuration
JWT_SECRET=your-super-strong-production-jwt-secret
CORS_ORIGIN=https://yourdomain.com

# Redis Configuration
REDIS_URL=redis://localhost:6379

# Logging Configuration
LOG_LEVEL=info
LOG_FILE=logs/app.log

# ESP32 Configuration
ESP32_DISCOVERY_ENABLED=true
ESP32_DEFAULT_PORT=80
```

### 3. Process Management with PM2

#### Install PM2
```bash
# Install PM2 globally
npm install -g pm2

# Create PM2 configuration file
nano ecosystem.config.js
```

#### PM2 Configuration

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'smart-home-backend',
    script: 'src/index.js',
    instances: 'max', // Use all CPU cores
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'development',
      PORT: 3001
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    error_file: 'logs/err.log',
    out_file: 'logs/out.log',
    log_file: 'logs/combined.log',
    time: true,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    node_args: '--max_old_space_size=1024'
  }]
};
```

#### Start Application with PM2
```bash
# Start application
pm2 start ecosystem.config.js --env production

# Save PM2 configuration
pm2 save

# Setup PM2 startup script
pm2 startup
# Follow the instructions to enable startup

# Check application status
pm2 status

# View logs
pm2 logs smart-home-backend

# Monitor application
pm2 monit
```

### 4. Nginx Reverse Proxy Setup

#### Install Nginx
```bash
sudo apt update
sudo apt install nginx
```

#### Create Nginx Configuration
```bash
# Create site configuration
sudo nano /etc/nginx/sites-available/smart-home
```

```nginx
# /etc/nginx/sites-available/smart-home
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    
    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;
    
    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    
    # Security Headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    
    # API Routes
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }
    
    # WebSocket Routes
    location /socket.io/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # Static Files (if any)
    location /uploads/ {
        alias /home/smarthome/smart-home-automation/backend/uploads/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # Rate Limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req zone=api burst=20 nodelay;
}
```

#### Enable Site
```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/smart-home /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

### 5. SSL Certificate Setup

#### Install Certbot
```bash
sudo apt install certbot python3-certbot-nginx
```

#### Obtain SSL Certificate
```bash
# Get certificate (interactive)
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Or get certificate and configure manually
sudo certbot certonly --nginx -d yourdomain.com -d www.yourdomain.com
```

#### Auto-renewal Setup
```bash
# Test auto-renewal
sudo certbot renew --dry-run

# Add cron job for auto-renewal
sudo crontab -e
# Add this line:
0 12 * * * /usr/bin/certbot renew --quiet
```

## Environment Configuration

### Development Environment

```javascript
// src/config/development.js
export const developmentConfig = {
    port: process.env.PORT || 3001,
    nodeEnv: 'development',
    cors: {
        origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
        credentials: true
    },
    rateLimit: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 1000 // More lenient for development
    },
    logging: {
        level: 'debug',
        format: 'dev',
        colorize: true
    },
    database: {
        ssl: false,
        connectionTimeoutMillis: 30000
    }
};
```

### Production Environment

```javascript
// src/config/production.js
export const productionConfig = {
    port: process.env.PORT || 3001,
    nodeEnv: 'production',
    cors: {
        origin: ['https://yourdomain.com', 'https://www.yourdomain.com'],
        credentials: true
    },
    rateLimit: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100 // Stricter for production
    },
    logging: {
        level: 'info',
        format: 'json',
        colorize: false
    },
    database: {
        ssl: {
            rejectUnauthorized: false
        },
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 30000
    }
};
```

## Security Setup

### 1. Firewall Configuration

```bash
# Enable UFW firewall
sudo ufw enable

# Allow SSH
sudo ufw allow ssh

# Allow HTTP and HTTPS
sudo ufw allow 80
sudo ufw allow 443

# Allow application port (if not behind reverse proxy)
sudo ufw allow 3001

# Check firewall status
sudo ufw status
```

### 2. Application Security

#### Security Headers Middleware
```javascript
// src/middleware/security.js
import helmet from 'helmet';

export const securityMiddleware = helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "wss:", "https:"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
        },
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    }
});
```

#### Rate Limiting
```javascript
// src/middleware/rateLimit.js
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

export const apiRateLimit = rateLimit({
    store: new RedisStore({
        sendCommand: (...args) => redis.call(...args),
    }),
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: {
        error: 'Too many requests',
        code: 'RATE_LIMIT_EXCEEDED'
    },
    standardHeaders: true,
    legacyHeaders: false
});

export const authRateLimit = rateLimit({
    store: new RedisStore({
        sendCommand: (...args) => redis.call(...args),
    }),
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // limit each IP to 5 auth requests per windowMs
    skipSuccessfulRequests: true
});
```

### 3. Environment Variable Security

```bash
# Set proper file permissions
chmod 600 .env.production
chmod 600 .env

# Ensure only application user can read
sudo chown smarthome:smarthome .env.production
```

## Monitoring and Logging

### 1. Winston Logging Setup

```javascript
// src/utils/logger.js
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

const logFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
);

export const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: logFormat,
    defaultMeta: { service: 'smart-home-backend' },
    transports: [
        // Console transport for development
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        }),
        
        // File transport for production
        new DailyRotateFile({
            filename: 'logs/app-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            maxSize: '20m',
            maxFiles: '14d'
        }),
        
        // Error log file
        new DailyRotateFile({
            filename: 'logs/error-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            level: 'error',
            maxSize: '20m',
            maxFiles: '30d'
        })
    ]
});
```

### 2. Health Check Endpoint

```javascript
// src/routes/health.js
import express from 'express';
import { logger } from '../utils/logger.js';
import { checkDatabase } from '../database/connection.js';

const router = express.Router();

router.get('/health', async (req, res) => {
    try {
        const health = {
            status: 'ok',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            version: process.env.npm_package_version,
            environment: process.env.NODE_ENV,
            checks: {
                database: await checkDatabase(),
                memory: process.memoryUsage(),
                cpu: process.cpuUsage()
            }
        };
        
        const isHealthy = health.checks.database.status === 'ok';
        const statusCode = isHealthy ? 200 : 503;
        
        res.status(statusCode).json(health);
        
    } catch (error) {
        logger.error('Health check failed:', error);
        res.status(503).json({
            status: 'error',
            timestamp: new Date().toISOString(),
            error: 'Health check failed'
        });
    }
});

export default router;
```

### 3. PM2 Monitoring

```bash
# Install PM2 monitoring
pm2 install pm2-server-monit

# Monitor application
pm2 monit

# View detailed metrics
pm2 show smart-home-backend

# Setup monitoring dashboard
pm2 plus
```

## Database Setup

### 1. Connection Pool Configuration

```javascript
// src/config/database.js
import { Pool } from 'pg';

export const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? {
        rejectUnauthorized: false
    } : false,
    max: 20, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000, // How long a client is allowed to remain idle before being closed
    connectionTimeoutMillis: 2000, // How long to wait when connecting a new client
});

// Handle pool errors
pool.on('error', (err, client) => {
    logger.error('Unexpected error on idle client', err);
});
```

### 2. Database Health Check

```javascript
// src/database/connection.js
import { pool } from './database.js';
import { logger } from '../utils/logger.js';

export async function checkDatabase() {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT NOW()');
        client.release();
        
        return {
            status: 'ok',
            timestamp: result.rows[0].now,
            responseTime: Date.now()
        };
    } catch (error) {
        logger.error('Database health check failed:', error);
        return {
            status: 'error',
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
}
```

## SSL/HTTPS Configuration

### 1. Self-signed Certificate (Development)

```bash
# Generate self-signed certificate
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout private.key -out certificate.crt \
    -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"
```

### 2. Let's Encrypt Certificate (Production)

```bash
# Obtain certificate
sudo certbot certonly --standalone -d yourdomain.com

# Configure automatic renewal
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

### 3. HTTPS Server Configuration

```javascript
// src/config/https.js
import https from 'https';
import fs from 'fs';

export const httpsOptions = {
    key: fs.readFileSync(process.env.SSL_KEY_PATH || 'private.key'),
    cert: fs.readFileSync(process.env.SSL_CERT_PATH || 'certificate.crt'),
    minVersion: 'TLSv1.2',
    ciphers: [
        'ECDHE-RSA-AES256-GCM-SHA512',
        'ECDHE-RSA-AES256-GCM-SHA384',
        'ECDHE-RSA-AES256-SHA384'
    ].join(':'),
    honorCipherOrder: true
};

// Create HTTPS server
export const httpsServer = https.createServer(httpsOptions, app);
```

## Performance Optimization

### 1. Compression Middleware

```javascript
// src/middleware/compression.js
import compression from 'compression';

export const compressionMiddleware = compression({
    filter: (req, res) => {
        if (req.headers['x-no-compression']) {
            return false;
        }
        // Don't compress compressed responses
        return res.getHeader('content-encoding') === undefined;
    },
    level: 6, // Compression level (1-9)
    threshold: 1024, // Only compress responses larger than 1KB
    chunkSize: 16 * 1024 // 16KB chunks
});
```

### 2. Caching Strategy

```javascript
// src/middleware/cache.js
import NodeCache from 'node-cache';

export const cache = new NodeCache({
    stdTTL: 300, // 5 minutes default TTL
    checkperiod: 60, // Check for expired keys every 60 seconds
    useClones: false
});

export const cacheMiddleware = (duration = 300) => {
    return (req, res, next) => {
        const key = req.originalUrl;
        
        // Check cache
        const cached = cache.get(key);
        if (cached) {
            return res.json(cached);
        }
        
        // Override res.json to cache response
        const originalJson = res.json;
        res.json = function(data) {
            cache.set(key, data, duration);
            return originalJson.call(this, data);
        };
        
        next();
    };
};
```

### 3. Cluster Mode

```javascript
// src/index.js (production cluster setup)
import cluster from 'cluster';
import os from 'os';

if (cluster.isMaster && process.env.NODE_ENV === 'production') {
    const numCPUs = os.cpus().length;
    
    console.log(`Master ${process.pid} is running`);
    
    // Fork workers
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }
    
    cluster.on('exit', (worker, code, signal) => {
        console.log(`Worker ${worker.process.pid} died`);
        cluster.fork();
    });
    
} else {
    // Worker process
    require('./worker.js');
}
```

## Backup and Recovery

### 1. Database Backup Script

```bash
#!/bin/bash
# backup.sh

BACKUP_DIR="/home/smarthome/backups"
DATE=$(date +%Y%m%d_%H%M%S)
DB_URL="postgresql://postgres:[PASSWORD]@db.your-project-id.supabase.co:5432/postgres"

# Create backup directory
mkdir -p $BACKUP_DIR

# Create database backup
pg_dump $DB_URL > $BACKUP_DIR/backup_$DATE.sql

# Compress backup
gzip $BACKUP_DIR/backup_$DATE.sql

# Remove backups older than 30 days
find $BACKUP_DIR -name "backup_*.sql.gz" -mtime +30 -delete

echo "Backup completed: backup_$DATE.sql.gz"
```

### 2. Automated Backup

```bash
# Add to crontab
crontab -e

# Daily backup at 2 AM
0 2 * * * /home/smarthome/scripts/backup.sh

# Weekly backup on Sunday at 3 AM
0 3 * * 0 /home/smarthome/scripts/weekly-backup.sh
```

### 3. Application Backup

```bash
#!/bin/bash
# backup-app.sh

APP_DIR="/home/smarthome/smart-home-automation"
BACKUP_DIR="/home/smarthome/backups"
DATE=$(date +%Y%m%d_%H%M%S)

# Create application backup
tar -czf $BACKUP_DIR/app_backup_$DATE.tar.gz \
    --exclude=node_modules \
    --exclude=logs \
    --exclude=.git \
    $APP_DIR

echo "Application backup completed: app_backup_$DATE.tar.gz"
```

## Troubleshooting

### Common Issues

#### 1. Port Already in Use
```bash
# Find process using port
sudo lsof -i :3001

# Kill process
sudo kill -9 <PID>

# Or use different port
export PORT=3002
```

#### 2. Database Connection Issues
```bash
# Test database connection
psql $DATABASE_URL

# Check connection string format
echo $DATABASE_URL

# Check firewall rules
sudo ufw status
```

#### 3. Memory Issues
```bash
# Check memory usage
free -h

# Check Node.js process memory
ps aux | grep node

# Increase Node.js memory limit
export NODE_OPTIONS="--max-old-space-size=4096"
```

#### 4. SSL Certificate Issues
```bash
# Check certificate validity
openssl x509 -in certificate.crt -text -noout

# Test SSL configuration
sudo nginx -t

# Check certificate renewal
sudo certbot certificates
```

### Debug Mode

```javascript
// src/utils/debug.js
export const debugMode = process.env.NODE_ENV === 'development';

export const debugLog = (message, data) => {
    if (debugMode) {
        console.log(`[DEBUG] ${message}`, data);
    }
};

// Usage
import { debugLog } from '../utils/debug.js';
debugLog('User authenticated', { userId, role });
```

### Log Analysis

```bash
# View real-time logs
tail -f logs/app.log

# Search for errors
grep -i error logs/app.log

# Analyze request patterns
awk '{print $1}' logs/access.log | sort | uniq -c | sort -nr

# Monitor memory usage
pm2 monit
```

This comprehensive server setup guide provides everything needed to deploy and maintain a production-ready Node.js backend for the ESP32 Smart Home Automation system.
