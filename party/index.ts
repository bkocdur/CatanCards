import type * as Party from "partykit/server";

type Card = { id: string; type: string; acquiredPhase?: number; playedAt?: number };
type Player = {
  name: string;
  color: string;
  hand: Card[];
  played: Card[];
  turnPhase: number;
};
type GameState = {
  deck: string[];
  players: Record<string, Player>;
  log: Array<{
    t: number;
    playerId: string;
    name: string;
    color: string;
    message: string;
    detail: string;
  }>;
  createdAt: number;
};

type ConnState = { playerId: string; username: string; color: string };

function buildDeck(): string[] {
  const d: string[] = [];
  for (let i = 0; i < 14; i++) d.push("knight");
  for (let i = 0; i < 5; i++) d.push("victory_point");
  for (let i = 0; i < 2; i++) d.push("road_building");
  for (let i = 0; i < 2; i++) d.push("year_of_plenty");
  for (let i = 0; i < 2; i++) d.push("monopoly");
  return d;
}

function shuffle(arr: string[]): string[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function uid(): string {
  return "c" + Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
}

function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

function emptyRoom(): GameState {
  return {
    deck: shuffle(buildDeck()),
    players: {},
    log: [],
    createdAt: Date.now(),
  };
}

function pushLog(game: GameState, playerId: string, message: string, detail: string) {
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

export default class CatanParty implements Party.Server {
  game!: GameState;

  constructor(readonly room: Party.Room) {}

  async onStart() {
    const saved = await this.room.storage.get<GameState>("game");
    if (saved && Array.isArray(saved.deck) && saved.players && typeof saved.players === "object") {
      this.game = saved;
    } else {
      this.game = emptyRoom();
      await this.room.storage.put("game", this.game);
    }
  }

  private async persist() {
    await this.room.storage.put("game", this.game);
  }

  private getPresence(): Array<{ playerId: string; username: string; color: string }> {
    const byPid = new Map<string, { playerId: string; username: string; color: string }>();
    for (const c of this.room.getConnections()) {
      const st = c.state as ConnState | null;
      if (st?.playerId) {
        byPid.set(st.playerId, {
          playerId: st.playerId,
          username: st.username || "Guest",
          color: st.color || "#999",
        });
      }
    }
    return Array.from(byPid.values());
  }

  /** DiceNow-style flat list of display names (unique, sorted). */
  private getUsernames(): string[] {
    const names = this.getPresence().map((p) => p.username);
    return [...new Set(names)].sort();
  }

  async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    const url = new URL(ctx.request.url);
    const username = (url.searchParams.get("username") || "Guest").trim().slice(0, 64);
    let playerId = (url.searchParams.get("playerId") || "").trim().slice(0, 80);
    if (!playerId) playerId = uid();
    const color = (url.searchParams.get("color") || "#9c4300").slice(0, 32);

    conn.setState({ playerId, username, color } satisfies ConnState);

    const isNew = !this.game.players[playerId];
    if (isNew) {
      this.game.players[playerId] = {
        name: username,
        color,
        hand: [],
        played: [],
        turnPhase: 0,
      };
      pushLog(this.game, playerId, `${username} joined the table.`, "");
    } else {
      this.game.players[playerId].name = username;
      this.game.players[playerId].color = color;
      if (typeof this.game.players[playerId].turnPhase !== "number") this.game.players[playerId].turnPhase = 0;
      if (!Array.isArray(this.game.players[playerId].hand)) this.game.players[playerId].hand = [];
      if (!Array.isArray(this.game.players[playerId].played)) this.game.players[playerId].played = [];
    }

    await this.persist();

    const history = {
      type: "history" as const,
      game: clone(this.game),
      users: this.getUsernames(),
      presence: this.getPresence(),
    };
    conn.send(JSON.stringify(history));

    const joined = {
      type: "user_joined" as const,
      username,
      users: this.getUsernames(),
      presence: this.getPresence(),
      game: clone(this.game),
    };
    this.room.broadcast(JSON.stringify(joined), [conn.id]);
  }

  async onMessage(message: string, sender: Party.Connection) {
    let msg: { action?: string; cardId?: string };
    try {
      msg = JSON.parse(String(message));
    } catch {
      return;
    }
    if (!msg || typeof msg !== "object") return;

    const st = sender.state as ConnState | null;
    const playerId = st?.playerId;
    if (!playerId || !this.game.players[playerId]) return;

    const me = this.game.players[playerId];

    if (msg.action === "draw") {
      if (this.game.deck.length === 0) return;
      const type = this.game.deck.shift()!;
      const card: Card = { id: uid(), type, acquiredPhase: me.turnPhase };
      me.hand.push(card);
      pushLog(this.game, playerId, `${me.name} drew a development card.`, "");
      await this.persist();
      this.broadcastSync();
      return;
    }

    if (msg.action === "play") {
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

      const titles: Record<string, string> = {
        knight: "Knight",
        road_building: "Road Building",
        year_of_plenty: "Year of Plenty",
        monopoly: "Monopoly",
      };
      const descs: Record<string, string> = {
        knight: "Move the robber. Steal 1 resource from a player adjacent to the new hex.",
        road_building: "Place 2 roads as if you just built them (follow normal road rules).",
        year_of_plenty: "Take any 2 resource cards from the bank (they can be the same or different).",
        monopoly: "Name 1 resource; all players must give you all of that resource they hold.",
      };

      me.hand.splice(idx, 1);
      if (!Array.isArray(me.played)) me.played = [];
      me.played.push({ ...card, playedAt: Date.now() });
      pushLog(this.game, playerId, `${me.name} played ${titles[card.type]}.`, descs[card.type] || "");
      await this.persist();
      this.broadcastSync();
      return;
    }

    if (msg.action === "endTurn") {
      me.turnPhase = (typeof me.turnPhase === "number" ? me.turnPhase : 0) + 1;
      pushLog(this.game, playerId, `${me.name} ended their turn.`, "");
      await this.persist();
      this.broadcastSync();
      return;
    }

    if (msg.action === "resetDeck") {
      this.game.deck = shuffle(buildDeck());
      for (const p of Object.values(this.game.players)) {
        p.hand = [];
        p.played = [];
        p.turnPhase = 0;
      }
      this.game.log = [];
      pushLog(this.game, playerId, "New shuffled deck (25 cards). Players unchanged.", "");
      await this.persist();
      this.broadcastSync();
    }
  }

  async onClose(conn: Party.Connection) {
    const st = conn.state as ConnState | null;
    const username = st?.username ?? "Someone";
    const left = {
      type: "user_left" as const,
      username,
      users: this.getUsernames(),
      presence: this.getPresence(),
      game: clone(this.game),
    };
    this.room.broadcast(JSON.stringify(left));
  }

  private broadcastSync() {
    const payload = JSON.stringify({
      type: "sync" as const,
      game: clone(this.game),
      users: this.getUsernames(),
      presence: this.getPresence(),
    });
    this.room.broadcast(payload);
  }
}

CatanParty satisfies Party.Worker;
