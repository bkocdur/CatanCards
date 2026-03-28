# Catan Development Cards

Lightweight web app for the **base game** development deck: 25 cards (14 knights, 5 victory points, 2 road building, 2 year of plenty, 2 monopoly).

- **localStorage** caches the last synced game on each device.
- **WebSocket** (`server/`) is the source of truth when enabled: everyone using the **same game name** joins one room and sees each other under **Other players**.

## Local preview (frontend + sync server)

Terminal 1 — WebSocket server (port **3210** by default):

```bash
cd server
npm install
npm start
```

Terminal 2 — static site:

```bash
cd /path/to/CatanCards
python3 -m http.server 8080
```

Open `http://localhost:8080`. With no extra config, `ws-config.js` points WebSocket to `ws://127.0.0.1:3210`.

If the server is not running, the UI will show an error after a timeout when you try to enter a game (WebSocket mode is on for localhost).

## Production: Vercel + hosted WebSocket

1. Deploy this repo to **Vercel** (static root; no build step).
2. Deploy **`server/`** to any Node host that supports WebSockets (e.g. [Render](https://render.com): New **Web Service**, root `server`, build `npm install`, start `npm start`, set `PORT` from the platform).
3. In `index.html`, **before** `ws-config.js`, set your public `wss://` URL:

```html
<script>window.__CATAN_WS__ = "wss://your-service.onrender.com";</script>
<script src="ws-config.js"></script>
```

Use **`wss://`** (TLS) on HTTPS sites. After deploy, everyone opens the Vercel URL and uses the **exact same game name** to share a room.

**Offline-only mode:** set `window.__CATAN_WS__ = ""` before `ws-config.js` to disable WebSocket and use local-only play (no cross-device sync).

## GitHub → Vercel

1. Push the repo to GitHub.
2. In Vercel, import the repo; framework **Other**; output directory the repo root.

## Notes

- The server keeps rooms in **memory**; restarting it clears in-progress games.
- Pass-and-play on one device: **Menu → Switch player** or **Add another player**.
- Design follows the **Tactile Heritage** Stitch reference (`stitch (2).zip`).
