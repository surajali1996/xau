# Binance Futures TradingView Pro — 24/7 Background Alert System
## Free-First Cloudflare Workers + D1 Database + FCM Web Push Setup Guide

This guide explains how to deploy the server-side trading alert system for your **Binance Futures TradingView Pro** application. 

### Core Guarantee:
Your Android phone will receive instant push notifications when Binance USDⓈ-M Perpetual Futures prices cross your alert levels, **even when your web application is closed, Chrome is not actively open, and the phone screen is locked**.

---

### Architecture Overview (100% Free Tiers)

| Component | Role | Free Tier Limits |
| :--- | :--- | :--- |
| **Cloudflare Workers** | Edge compute evaluating alerts against Binance Futures REST APIs | 100,000 requests / day (only ~1,440 needed for 1-min crons) |
| **Cloudflare D1 Database** | Serverless SQLite database storing user alerts & push tokens | 5 Million reads/day, 100,000 writes/day, 5GB storage |
| **Cloudflare Cron Triggers** | Automated background ticker schedule (`* * * * *` = every 60 seconds) | Unlimited cron invocations within Worker request quota |
| **Binance USDⓈ-M APIs** | Public REST endpoints (`https://fapi.binance.com`) | 2,400 IP weight / minute (batched prices require minimal weight) |
| **Firebase Cloud Messaging** | Web Push HTTP v1 to Chrome / Android background service worker | Unlimited push messages, 100% free |

---

## Quick 5-Step Deployment

All worker source code, D1 SQL schema, and configurations are already pre-built in the `/worker` folder of this repository.

### Step 1: Install Wrangler CLI & Authenticate

Open your terminal and authenticate with your free Cloudflare account:

```bash
npm install -g wrangler
# or use npx without global install:
npx wrangler login
```

### Step 2: Create your Cloudflare D1 Database

Navigate to the `worker` directory and create the D1 database:

```bash
cd worker
npx wrangler d1 create binance-futures-tv-db
```

Wrangler will output configuration information similar to:

```toml
[[d1_databases]]
binding = "DB"
database_name = "binance-futures-tv-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Open `worker/wrangler.toml` and replace the placeholder `database_id` with your actual ID from the command output.

### Step 3: Run Database Schema Migrations

Initialize the D1 tables (`users`, `alerts`, `push_subscriptions`, `alert_events`, `device_settings`):

```bash
# Execute against your remote Cloudflare D1 database:
npx wrangler d1 execute binance-futures-tv-db --remote --file=./schema.sql
```

### Step 4: Configure Firebase Cloud Messaging (FCM) Secrets

1. Go to the [Firebase Console](https://console.firebase.google.com/).
2. Create a free project (or use your existing project).
3. Navigate to **Project Settings** > **Service accounts**.
4. Click **Generate new private key** (downloads a `.json` file).
5. Add these secrets to your Cloudflare Worker using Wrangler:

```bash
# 1. Firebase Project ID:
npx wrangler secret put FIREBASE_PROJECT_ID
# (Paste your project ID when prompted, e.g. "my-binance-alerts")

# 2. Firebase Client Email:
npx wrangler secret put FIREBASE_CLIENT_EMAIL
# (Paste the client_email from the json, e.g. "firebase-adminsdk-xxx@my-binance-alerts.iam.gserviceaccount.com")

# 3. Firebase Private Key:
npx wrangler secret put FIREBASE_PRIVATE_KEY
# (Paste the full private_key string including -----BEGIN PRIVATE KEY----- and -----END PRIVATE KEY-----)
```

*(Note: The Cloudflare Worker uses native Web Crypto `crypto.subtle` to generate RS256 OAuth2 JWT tokens without heavy external npm libraries, running with zero latency on Cloudflare edge).*

### Step 5: Deploy the Worker to Cloudflare

Run the deploy command:

```bash
npm run deploy
```

Wrangler will output your live public worker URL:
```
https://binance-futures-tv-alerts.<your-subdomain>.workers.dev
```

---

## Connecting the Frontend (Vercel / Android App)

### Option A: Set Environment Variable in Vercel (Recommended)
In your Vercel project settings, add the environment variable:
- `VITE_CLOUDFLARE_WORKER_URL`: `https://binance-futures-tv-alerts.<your-subdomain>.workers.dev`

### Option B: Enter Directly in App UI
1. Open your web app or Android PWA.
2. Click any price alert button on the chart price scale or toolbar.
3. Switch to the **"Push 24/7"** tab.
4. Paste your Worker URL into the **Cloudflare Worker Backend URL** field and tap **Save**.
5. Tap **"Enable Background Push on this Phone"** to register your phone's FCM device token.
6. Tap **"Send Instant Test Notification to Phone"** to verify that the phone vibrates and displays the alert!

---

## Android Phone Reliability Checklist (Ensure 24/7 Background Delivery)

To guarantee that Android does not throttle or kill background service workers:

1. **Disable Battery Optimization (Crucial)**:
   - Go to your Android phone's **Settings** > **Apps** > **Chrome** (or your installed **PWA app**).
   - Tap **Battery** (or Battery usage).
   - Change setting from *Optimized* to **Unrestricted**.
2. **Ensure Notifications Are Allowed**:
   - In Chrome, tap the 3-dots menu > **Settings** > **Site settings** > **Notifications** > Ensure your app URL is **Allowed**.
3. **Install as Progressive Web App (PWA)**:
   - In Chrome, tap the 3-dots menu and select **"Add to Home screen"** or **"Install app"**.
   - Running as an installed PWA gives high priority for background push notifications.

---

## Background Alert Features Supported

- **Market Last Price & Mark Price**: All USDT-M perpetual contracts (e.g., `BTCUSDT`, `ETHUSDT`, `SOLUSDT`).
- **Crossing Conditions**: Crossing Up, Crossing Down, Greater Than, Less Than, Entering Channel, Exiting Channel.
- **Repeat Options**:
  - `Once`: Automatically marks alert as triggered after firing.
  - `Once Per Bar`: Evaluates and resets per interval bar.
  - `Once Per Bar Close`: Only evaluates on closed candle data.
- **Auto-Deduplication**: Prevents alert spam by enforcing minimum cooldowns.
- **Audit Logging**: Every alert trigger is recorded in the D1 `alert_events` table and viewable in the app's "Recent Trigger Logs".
