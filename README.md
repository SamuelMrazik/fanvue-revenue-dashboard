# OFM Revenue Tracker

Minimal dashboard for tracking model revenue from API snapshots. The app intentionally keeps only the operational surface that matters here:

- add and manage Fanvue models
- sync revenue snapshots
- view total revenue, revenue movement, per-model trends, sync health, and failures

The original dashboard included roles, content workflows, chat, assignments, devices, and admin tools. Those are not part of this app because they add deployment and maintenance overhead without helping revenue tracking.

## Run locally

```bash
cp .env.example .env
npm start
```

Open `http://localhost:4000`.

The app starts empty. Add each real model, then connect Fanvue from the selected model's connection panel.

## Add a Fanvue model

Use **Add Fanvue model** and provide:

- `Display name`
- `Sync interval`

After the model exists, click **Connect Fanvue**. The app stores encrypted OAuth tokens for that model and uses them for sync/test actions.

## Connect Fanvue OAuth

If you have a Fanvue Client ID and Client Secret, put them in `.env`:

```bash
FANVUE_CLIENT_ID=your-client-id
FANVUE_CLIENT_SECRET=your-client-secret
FANVUE_REDIRECT_URI=https://your-domain.com/api/fanvue/callback
FANVUE_SCOPES=openid offline_access offline read:self read:insights
FANVUE_API_VERSION=2025-06-26
FANVUE_API_BASE_URL=https://api.fanvue.com
FANVUE_METRICS_ENDPOINT=/insights/earnings/summary
```

For local testing, the redirect URI must exactly match the URI configured in Fanvue. Fanvue commonly requires HTTPS for OAuth redirects, so a plain `http://127.0.0.1:4000` callback may be rejected. Use an HTTPS tunnel or local HTTPS proxy, then set `FANVUE_REDIRECT_URI` to that public HTTPS callback.

After setting `.env`, restart the server and click **Connect Fanvue** on a model. The app will:

- generate a PKCE authorization URL
- send you through Fanvue authorization
- receive the callback at `/api/fanvue/callback`
- exchange the authorization code server-side
- encrypt and store access/refresh tokens in `data/store.json`
- refresh expired access tokens automatically before sync

`FANVUE_METRICS_ENDPOINT` defaults to Fanvue's earnings summary endpoint. It is intentionally configurable because Fanvue account permissions can expose different API routes. If sync fails with a missing or unrecognized revenue field, verify the exact metrics endpoint Fanvue enabled for your OAuth app and change this env var instead of changing UI code.

## Expected revenue fields

The normalizer accepts common field names for revenue or earnings, including cent-based fields such as `revenue_cents` and money fields such as `revenue`, `earnings`, `total_revenue`, `net_revenue`, and `sales`.

It also stores subscriber, message, tip, and click fields if the API returns them, but the UI is deliberately revenue-first.

If the API returns a different shape, update `src/connector.js`. This is isolated so changing a connector does not require UI changes.

## Deploy online (phone + Supabase)

See **[DEPLOY.md](./DEPLOY.md)** for step-by-step setup:

- **Supabase** — Postgres storage for models, encrypted Fanvue tokens, and revenue snapshots
- **Render** — HTTPS Node host so you can open the dashboard on your phone and complete Fanvue OAuth

## Production notes

- Set `DASHBOARD_SECRET` before deploying. In production the server refuses to boot without it because Fanvue OAuth tokens are encrypted at rest.
- Set `DASHBOARD_PASSWORD` before deploying. In production the server refuses to boot without it because the dashboard contains private revenue data.
- Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for production so data survives deploys and works from one URL on any device.
- Without Supabase env vars, the app falls back to local `data/store.json` (fine for local dev only).
- Host on a long-running Node runtime such as Render, Railway, or Fly.io. Do not use Vercel serverless as the primary app host.
- Monitor `/api/health` and watch sync failures in the dashboard. Real production should also ship logs to the hosting provider.

## Failure points

- Undocumented API changes can break normalization.
- Expired or revoked Fanvue tokens will show as sync failures.
- API rate limits can affect scheduled syncs if intervals are too aggressive.
- Local JSON storage is not safe for horizontally scaled deployments.
- A failed host disk or accidental file overwrite can lose local snapshot history; back up `data/store.json` if this runs in production.
