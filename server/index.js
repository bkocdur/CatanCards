"use strict";

const http = require("http");
const { WebSocketServer } = require("ws");

const PORT = Number(process.env.PORT) || 3210;

function buildDeck() {
  const d = [];
  for (let i = 0; i < 14; i++) d.push("knight");
  for (let i = 0; i < 5; i++) d.push("victory_point");
  for (let i = 0; i < 2; i++) d.push("road_building");
  for (let i = 0; i < 2; i++) d.push("year_of_plenty");
  for (let i = 0; i < 2; i++) d.push("monopoly");
  return d;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function uid() {
  return "c" + Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function pushLog(game, playerId, message, detail) {
  const p = game.players[playerId];
  const name = p ? p.name : "Unknown";
  game.log.unshift({
    t: Date.now(),
    playerId,
    name,
    color: p ? p.color : "#999",
    message,
    detail: detail || "",
  });
  if (game.log.length > 200) game.log.length = 200;
}

function emptyRoom() {
  return {
    deck: shuffle(buildDeck()),
    players: {},
    log: [],
    createdAt: Date.now(),
  };
}

/** @type {Map<string, ReturnType<typeof emptyRoom>>} */
const rooms = new Map();

function getOrCreateRoom(slug) {
  if (!slug || typeof slug !== "string") return null;
  const key = slug.slice(0, 64);
  if (!rooms.has(key)) {
    rooms.set(key, emptyRoom());
  }
  return rooms.get(key);
}

function broadcast(slug, game) {
  const payload = JSON.stringify({ type: "sync", gameSlug: slug, game: clone(game) });
  for (const client of wss.clients) {
    if (client.readyState === 1 && client.catanSlug === slug) {
      client.send(payload);
    }
  }
}

function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

const server = http.createServer((req, res) => {
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  ws.catanSlug = null;
  ws.catanPlayerId = null;

  ws.on("message", (raw) => {
    const msg = safeJsonParse(String(raw));
    if (!msg || typeof msg !== "object") return;

    if (msg.type === "join") {
      const slug = typeof msg.gameSlug === "string" ? msg.gameSlug.slice(0, 64) : "";
      const playerId = typeof msg.playerId === "string" ? msg.playerId : "";
      const name = typeof msg.name === "string" ? msg.name.trim().slice(0, 64) : "";
      const color = typeof msg.color === "string" ? msg.color.slice(0, 32) : "#999";
      if (!slug || !playerId || !name) {
        ws.send(JSON.stringify({ type: "error", message: "Invalid join" }));
        return;
      }

      const game = getOrCreateRoom(slug);
      if (!game) return;

      ws.catanSlug = slug;
      ws.catanPlayerId = playerId;

      if (!game.players[playerId]) {
        game.players[playerId] = {
          name,
          color,
          hand: [],
          played: [],
          turnPhase: 0,
        };
        pushLog(game, playerId, `${name} joined the table.`, "");
      } else {
        game.players[playerId].name = name;
        game.players[playerId].color = color;
        if (typeof game.players[playerId].turnPhase !== "number") game.players[playerId].turnPhase = 0;
        if (!Array.isArray(game.players[playerId].hand)) game.players[playerId].hand = [];
        if (!Array.isArray(game.players[playerId].played)) game.players[playerId].played = [];
      }

      broadcast(slug, game);
      return;
    }

    if (msg.type === "rebind") {
      const slug = typeof msg.gameSlug === "string" ? msg.gameSlug.slice(0, 64) : "";
      const playerId = typeof msg.playerId === "string" ? msg.playerId : "";
      const game = rooms.get(slug);
      if (!game || !game.players[playerId]) {
        ws.send(JSON.stringify({ type: "error", message: "Invalid rebind" }));
        return;
      }
      ws.catanSlug = slug;
      ws.catanPlayerId = playerId;
      return;
    }

    if (msg.type === "action") {
      const slug = ws.catanSlug;
      const boundId = ws.catanPlayerId;
      if (!slug || !boundId || boundId !== msg.playerId) {
        ws.send(JSON.stringify({ type: "error", message: "Not authorized" }));
        return;
      }

      const game = rooms.get(slug);
      if (!game) return;

      const playerId = msg.playerId;
      const me = game.players[playerId];
      if (!me) return;

      const action = msg.action;

      if (action === "draw") {
        if (game.deck.length === 0) return;
        const type = game.deck.shift();
        const card = { id: uid(), type, acquiredPhase: me.turnPhase };
        me.hand.push(card);
        pushLog(game, playerId, `${me.name} drew a development card.`, "");
        broadcast(slug, game);
        return;
      }

      if (action === "play") {
        const cardId = typeof msg.cardId === "string" ? msg.cardId : "";
        const idx = me.hand.findIndex((c) => c.id === cardId);
        if (idx === -1) return;
        const card = me.hand[idx];
        const playable =
          card.type === "knight" ||
          card.type === "road_building" ||
          card.type === "year_of_plenty" ||
          card.type === "monopoly";
        if (!playable) return;
        const ap = typeof card.acquiredPhase === "number" ? card.acquiredPhase : 0;
        if (!(me.turnPhase > ap)) return;

        const titles = {
          knight: "Knight",
          road_building: "Road Building",
          year_of_plenty: "Year of Plenty",
          monopoly: "Monopoly",
        };
        const descs = {
          knight: "Move the robber. Steal 1 resource from a player adjacent to the new hex.",
          road_building: "Place 2 roads as if you just built them (follow normal road rules).",
          year_of_plenty: "Take any 2 resource cards from the bank (they can be the same or different).",
          monopoly: "Name 1 resource; all players must give you all of that resource they hold.",
        };

        me.hand.splice(idx, 1);
        if (!Array.isArray(me.played)) me.played = [];
        me.played.push({ ...card, playedAt: Date.now() });
        pushLog(game, playerId, `${me.name} played ${titles[card.type]}.`, descs[card.type] || "");
        broadcast(slug, game);
        return;
      }

      if (action === "endTurn") {
        me.turnPhase = (typeof me.turnPhase === "number" ? me.turnPhase : 0) + 1;
        pushLog(game, playerId, `${me.name} ended their turn.`, "");
        broadcast(slug, game);
        return;
      }

      if (action === "resetDeck") {
        game.deck = shuffle(buildDeck());
        for (const p of Object.values(game.players)) {
          p.hand = [];
          p.played = [];
          p.turnPhase = 0;
        }
        game.log = [];
        pushLog(game, playerId, "New shuffled deck (25 cards). Players unchanged.", "");
        broadcast(slug, game);
        return;
      }
    }
  });

  ws.on("close", () => {
    ws.catanSlug = null;
    ws.catanPlayerId = null;
  });
});

server.listen(PORT, () => {
  console.log(`CatanCards WS listening on ${PORT}`);
});
