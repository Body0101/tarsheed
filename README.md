<<<<<<< HEAD
# Tarshid ESP32 Smart Home

Tarshid is an ESP32 smart-home controller with two separate operating modes:

- Offline ESP Local Mode: ESP SoftAP, local pages, local MAC authentication, NVS/LittleFS storage.
- Online Server Mode: infrastructure WiFi, AP disabled, GitHub Pages dashboard, Supabase Auth/database, NTP time, realtime sync.

The ESP32 remains the physical authority for relays, PIR sensors, timers, Night Lock, and energy/timer state in both modes.

## Main Documentation

- `SYSTEM_ARCHITECTURE.md` - complete architecture and file ownership
- `ONLINE_OFFLINE_GUIDE.md` - runtime behavior and deployment guide
- `SERVER_SETUP_GUIDE.md` - Supabase, RLS, Realtime, and GitHub Pages setup
- `AUTH_FLOW.md` - offline MAC auth and online Supabase auth separation

## Project Layout

```text
SmartHomeAutomation/
  data/                 Offline ESP LittleFS pages
  src/                  ESP32 firmware
online/                 GitHub Pages static frontend
supabase/               Supabase SQL schema
scripts/                PlatformIO build-time environment injection
.github/workflows/      GitHub Pages deployment workflow
```

## Build Firmware

Offline/local build:

```powershell
platformio run
platformio run --target upload
platformio run --target uploadfs
```

Online-capable build:

```powershell
$env:WIFI_STA_SSID="YourWiFi"
$env:WIFI_STA_PASSWORD="YourWiFiPassword"
$env:SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co"
$env:SUPABASE_ANON_KEY="your-publishable-or-anon-key"
$env:CLOUD_DEVICE_ID="esp32-main"
$env:CLOUD_COMMAND_TOKEN="strong-random-device-token"
platformio run
```

If the online variables are missing or internet is unavailable, the firmware runs offline local mode.

## Online Frontend

The online dashboard is static and lives in `online/`.

GitHub Pages deployment is handled by `.github/workflows/deploy-online.yml`. It writes `online/config.js` from repository secrets and publishes the `online/` directory.

Required GitHub secrets:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

## Supabase

Run `supabase/smart_home_schema.sql` in the Supabase SQL Editor. It creates:

- profiles
- devices
- memberships
- device states
- device events
- remote commands
- RLS policies
- token-checked RPC
- realtime publication entries

The browser uses Supabase Auth and RLS. The ESP uses token-checked RPC. Offline MAC users are not stored in Supabase.
=======
# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
>>>>>>> 23cbd899ed2d2bcfdff3e881f5e04b651946a9c2
