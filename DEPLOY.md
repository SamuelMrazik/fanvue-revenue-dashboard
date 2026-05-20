# Deploy online (phone + Fanvue OAuth)

This app needs **two services**:

1. **Supabase** — encrypted tokens, models, revenue snapshots (database)
2. **Render** — hosts the Node.js dashboard (HTTPS URL for phone + Fanvue callback)

Supabase alone does not run this Node server; Render (or Railway/Fly) does.

## 1. Supabase database

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** → **New query**.
3. Paste and run the full contents of `supabase/schema.sql`.
4. Go to **Project Settings → API** and copy:
   - **Project URL** → `SUPABASE_URL`
   - **service_role** key (secret) → `SUPABASE_SERVICE_ROLE_KEY`  
     Never put the service role key in the browser or commit it to git.

## 2. Fanvue OAuth app

In the Fanvue developer console for your OAuth app:

1. Create or open your OAuth client.
2. Set **Redirect URI** to your public dashboard URL:
   ```
   https://YOUR-RENDER-APP.onrender.com/api/fanvue/callback
   ```
3. Copy **Client ID** and **Client Secret**.

Required scopes (default in `.env.example`):

`openid offline_access offline read:self read:insights`

## 3. Deploy on Render

1. Push this repo to GitHub (already at `SamuelMrazik/fanvue-revenue-dashboard`).
2. Go to [render.com](https://render.com) → **New → Blueprint** (or **Web Service** from repo).
3. Connect the GitHub repo `fanvue-revenue-dashboard`.
4. Render can read `render.yaml` automatically, or set manually:
   - **Build:** `npm install`
   - **Start:** `npm start`
   - **Health check path:** `/api/health`
5. Add environment variables in Render **Environment**:

| Variable | Value |
|----------|--------|
| `NODE_ENV` | `production` |
| `HOST` | `0.0.0.0` |
| `DASHBOARD_SECRET` | long random string (32+ chars) — encrypts Fanvue tokens at rest |
| `DASHBOARD_PASSWORD` | strong password — you use this on your phone |
| `DASHBOARD_USER` | `owner` (or your choice) |
| `SUPABASE_URL` | from Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | from Supabase (service role) |
| `FANVUE_CLIENT_ID` | from Fanvue |
| `FANVUE_CLIENT_SECRET` | from Fanvue |
| `FANVUE_REDIRECT_URI` | `https://YOUR-RENDER-APP.onrender.com/api/fanvue/callback` |
| `AUTO_SYNC` | `true` |

6. Deploy. Copy your live URL, e.g. `https://fanvue-revenue-dashboard.onrender.com`.

7. Update Fanvue **Redirect URI** if it differs from what you entered earlier.

## Fanvue permissions (Phase 1)

For **read-only** vault, posts, and tracking, enable these scopes in the Fanvue developer app:

- `read:insights`, `read:creator`, `read:media`, `read:post`, `read:fan`, `read:tracking_links`, `read:agency`, `read:self`
- `openid`, `offline_access`, `offline`

You do **not** need `write:media`, `write:post`, or `write:tracking_links` until VA upload features ship.

Set **Redirect URI** to your live Render URL (not `127.0.0.1`):

`https://YOUR-RENDER-APP.onrender.com/api/fanvue/callback`

After changing scopes or redirect URI, click **Reconnect Fanvue** on each model, then **Sync all**.

## 4. Use from your phone

1. Open the Render URL in Safari/Chrome.
2. Log in with `DASHBOARD_USER` / `DASHBOARD_PASSWORD` (browser will remember on iOS after first login).
3. Tap **Add Fanvue model**, then **Connect Fanvue** per model.
4. Complete Fanvue authorization; tokens are encrypted and stored in Supabase.

## Security notes

- Fanvue access/refresh tokens are encrypted with `DASHBOARD_SECRET` before storage.
- Only the server holds `SUPABASE_SERVICE_ROLE_KEY` and `FANVUE_CLIENT_SECRET`.
- Use a unique strong `DASHBOARD_PASSWORD`; anyone with it can see your revenue dashboard.
- Rotate `DASHBOARD_SECRET` only with a migration plan (existing encrypted tokens would need re-connection).

## Local dev with Supabase

```bash
cp .env.example .env
# fill SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, FANVUE_* and DASHBOARD_*
npm install
npm start
```

Health check: `GET /api/health` should show `"storage": "supabase"`.
