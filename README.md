# Catan Development Cards

Lightweight static UI (Vercel-friendly) + **PartyKit** for realtime. Same **game name** = same PartyKit **room id**; each client connects with **`username`** (and `playerId` / `color`) in the query string, matching the DiceNow pattern.

## Architecture

- **Frontend:** `index.html` + `app.js` (ES module). Uses [`PartySocket`](https://docs.partykit.io/reference/partysocket-api) from an import map (`esm.sh`) so Vercel can serve static files only.
- **Realtime + game state:** `party/index.ts` — PartyKit worker per room. On connect it sends **`history`** (`game`, `users`, `presence`); others get **`user_joined`** (and **`user_left`** on disconnect, with a fresh list). Game actions broadcast **`sync`** with the same shape.
- **localStorage:** Still caches the latest `game` blob after each message.

## Local dev

Terminal 1 — PartyKit (default **http://127.0.0.1:1999**):

```bash
npm install
npm run dev:party
```

Terminal 2 — static site:

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080`. On localhost the client defaults `__PARTYKIT_HOST__` to `localhost:1999`. If `partykit dev` prints a different port (e.g. `127.0.0.1:56392`), set `window.__PARTYKIT_HOST__ = "127.0.0.1:56392"` in the page before loading or in DevTools, then reload.

## Deploy (Vercel + PartyKit)

1. **PartyKit** (separate from Vercel, same repo):

   ```bash
   npx partykit login   # once
   npm run deploy:party
   ```

   Note the host like `catancards-party.<your-login>.partykit.dev`.

2. **Vercel:** connect the GitHub repo; framework **Other**; output directory **/** (static).

3. In **`index.html`**, before the import map, set the production host (only needed when not on localhost):

   ```html
   <script>window.__PARTYKIT_HOST__ = "catancards-party.yourlogin.partykit.dev";</script>
   ```

   Optional: `window.__PARTYKIT_PARTY__` only if you add named entries under `partykit.json` → `parties`; the default URL segment is always **`main`** (the project `name` is only the deploy subdomain, not this path).

PartyKit holds room state (deck, players, log) in **durable storage** via `room.storage` so it survives short idle periods; see PartyKit docs for limits.

## Messages (reference)

| Type          | Purpose |
|---------------|---------|
| `history`     | New socket: full `game`, DiceNow-style `users: string[]`, `presence: {playerId,username,color}[]` |
| `user_joined` | Others: joining `username`, updated `users`, `presence`, `game` |
| `user_left`   | Everyone: left `username`, updated `users`, `presence`, `game` |
| `sync`        | After draw / play / end turn / reset deck |

Client → server: JSON `{ action: "draw" | "play" | "endTurn" | "resetDeck", cardId? }` (identity comes from the socket after connect).

## Notes

- **Caveat vs DiceNow:** this app also broadcasts **`user_left`** so the “online” list stays fresh when someone disconnects.
- Pick **unique display names** if you rely on the flat `users` list; `playerId` is authoritative for game seats.
