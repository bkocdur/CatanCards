(function () {
  "use strict";

  const STORAGE_KEY = "catan_dev_games_v1";
  const PROFILE_KEY = "catan_dev_profile_v1";

  const COLORS = [
    { id: "orange", hex: "#9c4300", label: "Orange" },
    { id: "blue", hex: "#4fa6eb", label: "Blue" },
    { id: "green", hex: "#517d19", label: "Green" },
    { id: "yellow", hex: "#f0ad00", label: "Yellow" },
  ];

  const CARD_META = {
    knight: {
      title: "Knight",
      icon: "swords",
      desc: "Move the robber. Steal 1 resource from a player adjacent to the new hex.",
      playable: true,
      accent: "text-primary",
    },
    road_building: {
      title: "Road Building",
      icon: "add_road",
      desc: "Place 2 roads as if you just built them (follow normal road rules).",
      playable: true,
      accent: "text-secondary",
    },
    year_of_plenty: {
      title: "Year of Plenty",
      icon: "psychology",
      desc: "Take any 2 resource cards from the bank (they can be the same or different).",
      playable: true,
      accent: "text-emerald-700",
    },
    monopoly: {
      title: "Monopoly",
      icon: "monetization_on",
      desc: "Name 1 resource; all players must give you all of that resource they hold.",
      playable: true,
      accent: "text-amber-700",
    },
    victory_point: {
      title: "Victory Point",
      icon: "workspace_premium",
      desc: "Worth 1 victory point. Do not play; keep secret until you win or must reveal.",
      playable: false,
      accent: "text-tertiary-container",
    },
  };

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

  function slugify(name) {
    return (
      name
        .trim()
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .slice(0, 64) || "game"
    );
  }

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function saveStore(store) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }

  function loadProfile() {
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function saveProfile(p) {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  }

  function clearProfile() {
    localStorage.removeItem(PROFILE_KEY);
  }

  function emptyGameState() {
    return {
      deck: shuffle(buildDeck()),
      players: {},
      log: [],
      createdAt: Date.now(),
    };
  }

  let store = loadStore();
  let profile = loadProfile();
  let selectedColor = COLORS[0].hex;
  let view = "hand";

  const $ = (id) => document.getElementById(id);

  function currentGame() {
    if (!profile) return null;
    return store[profile.gameSlug] || null;
  }

  function currentPlayer() {
    const g = currentGame();
    if (!g || !profile) return null;
    return g.players[profile.playerId] || null;
  }

  function persist() {
    saveStore(store);
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

  function renderColorPicker() {
    const el = $("color-picker");
    el.innerHTML = COLORS.map(
      (c) => `
      <button type="button" data-color="${c.hex}" aria-label="${c.label}" title="${c.label}"
        class="color-swatch w-12 h-12 rounded-full border-4 transition-transform active:scale-90 shadow-md
        ${c.hex === selectedColor ? "border-primary-container ring-4 ring-amber-200 scale-105" : "border-surface"}"
        style="background-color:${c.hex}"></button>`
    ).join("");
    el.querySelectorAll(".color-swatch").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedColor = btn.getAttribute("data-color");
        renderColorPicker();
      });
    });
  }

  function showSetup(error) {
    $("game-name").readOnly = false;
    $("screen-setup").classList.remove("hidden");
    $("screen-app").classList.add("hidden");
    $("panel-log").classList.add("hidden");
    $("setup-error").textContent = error || "";
    const gn = $("game-name");
    const pn = $("player-name");
    if (profile) {
      gn.value = profile.gameName || "";
      pn.value = profile.lastName || "";
    }
    renderColorPicker();
  }

  function showApp() {
    $("screen-setup").classList.add("hidden");
    $("screen-app").classList.remove("hidden");
    closeDrawer();
    renderApp();
  }

  function openDrawer() {
    $("drawer-overlay").classList.remove("hidden");
    $("drawer").classList.remove("-translate-x-full");
  }

  function closeDrawer() {
    $("drawer-overlay").classList.add("hidden");
    $("drawer").classList.add("-translate-x-full");
  }

  function renderPlayerChips(game) {
    const el = $("player-chips");
    const ids = Object.keys(game.players);
    el.innerHTML = ids
      .map((id) => {
        const p = game.players[id];
        const n = p.hand ? p.hand.length : 0;
        return `<div class="flex items-center bg-surface-container-high px-2 py-1 rounded-lg gap-1" title="${escapeAttr(p.name)}">
          <div class="w-2 h-2 rounded-full shrink-0" style="background:${p.color}"></div>
          <span class="font-label text-[10px] font-bold">${n}</span>
        </div>`;
      })
      .join("");
  }

  function cardBlock(type, small) {
    const m = CARD_META[type];
    const iconSize = small ? "text-lg" : "text-3xl";
    const pad = small ? "p-3" : "p-5";
    return `<div class="rounded-lg bg-surface ${pad} flex flex-col items-center justify-center gap-2 min-h-[4rem]">
      <span class="material-symbols-outlined filled ${m.accent} ${iconSize}">${m.icon}</span>
      <span class="font-headline font-bold ${small ? "text-xs" : "text-base"} text-center leading-tight">${m.title}</span>
    </div>`;
  }

  function escapeAttr(s) {
    return String(s).replace(/"/g, "&quot;");
  }

  function renderHand() {
    const game = currentGame();
    const me = currentPlayer();
    const grid = $("hand-grid");
    const countEl = $("hand-count");
    if (!game || !me) return;

    countEl.textContent = `${me.hand.length} card${me.hand.length === 1 ? "" : "s"}`;

    if (me.hand.length === 0) {
      grid.innerHTML = `<p class="col-span-2 font-body text-sm text-on-surface-variant text-center py-8 bg-surface-container-low rounded-xl">No cards yet. Buy a development card on your turn, then tap Draw.</p>`;
      return;
    }

    grid.innerHTML = me.hand
      .map((c) => {
        const m = CARD_META[c.type];
        const canPlay = m.playable;
        const playBtn = canPlay
          ? `<button type="button" class="play-card w-full py-2 bg-surface-container text-primary font-headline font-bold text-xs rounded-lg active:scale-95 transition-transform" data-id="${c.id}">Play card</button>`
          : `<p class="font-label text-[10px] uppercase tracking-widest text-tertiary text-center py-2">Secret — do not play</p>`;

        return `<div class="bg-surface-container-highest rounded-xl p-4 flex flex-col shadow-sm">
        <div class="mb-3">${cardBlock(c.type, false)}</div>
        <p class="font-body text-xs text-on-surface-variant mb-3 flex-grow">${m.desc}</p>
        ${playBtn}
      </div>`;
      })
      .join("");

    grid.querySelectorAll(".play-card").forEach((btn) => {
      btn.addEventListener("click", () => playCard(btn.getAttribute("data-id")));
    });
  }

  function renderOthers() {
    const game = currentGame();
    const el = $("others-list");
    if (!game || !profile) return;

    const others = Object.entries(game.players).filter(([id]) => id !== profile.playerId);

    if (others.length === 0) {
      el.innerHTML = `<p class="font-body text-sm text-on-surface-variant bg-surface-container-low rounded-xl p-4">No other players yet. Use the menu to add another player on this device.</p>`;
      return;
    }

    el.innerHTML = others
      .map(([id, p]) => {
        const hidden = p.hand.length;
        const played = (p.played || []).slice().reverse();
        const mini = played
          .map(
            (c) => `<div class="w-12 h-16 rounded-md bg-white overflow-hidden shrink-0 shadow-sm flex items-center justify-center" title="${CARD_META[c.type].title}">
            <span class="material-symbols-outlined filled text-on-surface-variant text-xl">${CARD_META[c.type].icon}</span>
          </div>`
          )
          .join("");

        return `<div class="bg-surface-container-low rounded-2xl p-4 shadow-sm pl-4" style="border-left: 4px solid ${p.color}">
        <div class="flex items-center gap-3 mb-3">
          <div class="w-10 h-10 rounded-full flex items-center justify-center text-white shadow-inner shrink-0" style="background:${p.color}">
            <span class="material-symbols-outlined text-lg">person</span>
          </div>
          <div>
            <h4 class="font-headline font-bold">${escapeHtml(p.name)}</h4>
            <p class="font-label text-[10px] font-bold uppercase tracking-wider" style="color:${p.color}">${hidden} hidden</p>
          </div>
        </div>
        <p class="font-label text-[10px] text-on-surface-variant mb-2 uppercase tracking-widest">Played</p>
        <div class="flex gap-2 overflow-x-auto hide-scrollbar pb-1">${mini || '<span class="text-xs text-on-surface-variant">None yet</span>'}</div>
      </div>`;
      })
      .join("");
  }

  function escapeHtml(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function renderLog() {
    const game = currentGame();
    const el = $("log-entries");
    if (!game) return;

    if (game.log.length === 0) {
      el.innerHTML = '<p class="font-body text-sm text-on-surface-variant">No actions yet.</p>';
      return;
    }

    el.innerHTML = game.log
      .map(
        (e) => `<div class="relative pl-10">
        <div class="absolute left-0 top-1 w-6 h-6 rounded-full border-4 border-surface z-10" style="background:${e.color}"></div>
        <div class="bg-surface-container-low p-4 rounded-xl">
          <p class="font-body text-sm leading-relaxed">${escapeHtml(e.message)}</p>
          ${e.detail ? `<p class="font-body text-xs text-on-surface-variant mt-1">${escapeHtml(e.detail)}</p>` : ""}
          <p class="font-label text-[10px] text-on-surface-variant mt-2 uppercase tracking-wider">${new Date(e.t).toLocaleString()}</p>
        </div>
      </div>`
      )
      .join("");
  }

  function renderSwitchList() {
    const game = currentGame();
    const el = $("switch-player-list");
    if (!game) return;

    el.innerHTML = Object.entries(game.players)
      .map(([id, p]) => {
        const active = profile && id === profile.playerId;
        return `<button type="button" data-player-id="${id}" class="switch-to w-full text-left px-4 py-3 rounded-xl font-headline text-sm flex items-center gap-3 ${
          active ? "bg-surface-container-highest ring-2 ring-primary-container/30" : "bg-surface-container-high hover:bg-surface-container"
        }">
          <span class="w-4 h-4 rounded-full shrink-0" style="background:${p.color}"></span>
          <span>${escapeHtml(p.name)}${active ? " (you)" : ""}</span>
        </button>`;
      })
      .join("");

    el.querySelectorAll(".switch-to").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-player-id");
        profile.playerId = id;
        saveProfile(profile);
        closeDrawer();
        renderApp();
      });
    });
  }

  function renderApp() {
    const game = currentGame();
    const me = currentPlayer();
    if (!game || !me) {
      showSetup("");
      return;
    }

    $("header-title").textContent = profile.gameName || "Game";
    $("header-sub").textContent = `${me.name} · deck helper`;
    $("deck-remaining").textContent = String(game.deck.length);

    const drawBtn = $("btn-draw");
    drawBtn.disabled = game.deck.length === 0;
    drawBtn.classList.toggle("opacity-50", game.deck.length === 0);
    drawBtn.classList.toggle("cursor-not-allowed", game.deck.length === 0);

    renderPlayerChips(game);
    renderHand();
    renderOthers();
    renderLog();
    renderSwitchList();

    $("panel-log").classList.toggle("hidden", view !== "log");
    $("nav-hand").classList.toggle("bg-surface-container-highest", view === "hand");
    $("nav-hand").classList.toggle("text-primary", view === "hand");
    $("nav-log").classList.toggle("bg-surface-container-highest", view === "log");
    $("nav-log").classList.toggle("text-primary", view === "log");
    $("nav-hand").classList.toggle("text-slate", view !== "hand");
    $("nav-log").classList.toggle("text-slate", view !== "log");

    const main = document.querySelector("#screen-app main");
    if (main) main.classList.toggle("hidden", view === "log");
  }

  function startOrJoin() {
    const gameName = $("game-name").value.trim();
    const playerName = $("player-name").value.trim();
    $("setup-error").textContent = "";

    if (!gameName || !playerName) {
      $("setup-error").textContent = "Enter a game name and your name.";
      return;
    }

    const slug = slugify(gameName);
    if (!store[slug]) {
      store[slug] = emptyGameState();
    }

    const game = store[slug];
    let playerId = null;
    for (const [id, p] of Object.entries(game.players)) {
      if (p.name === playerName && p.color === selectedColor) {
        playerId = id;
        break;
      }
    }
    if (!playerId) {
      playerId = uid();
      game.players[playerId] = {
        name: playerName,
        color: selectedColor,
        hand: [],
        played: [],
      };
      pushLog(game, playerId, `${playerName} joined the table.`);
    }

    profile = {
      gameSlug: slug,
      gameName,
      playerId,
      lastName: playerName,
    };
    saveProfile(profile);
    persist();
    $("game-name").readOnly = false;
    showApp();
  }

  function drawCard() {
    const game = currentGame();
    const me = currentPlayer();
    if (!game || !me || game.deck.length === 0) return;

    const type = game.deck.shift();
    const card = { id: uid(), type };
    me.hand.push(card);
    pushLog(game, profile.playerId, `${me.name} drew a development card.`, "");
    persist();
    $("modal-draw-card").innerHTML = cardBlock(type, false);
    $("modal-draw").classList.remove("hidden");
    renderApp();
  }

  function playCard(cardId) {
    const game = currentGame();
    const me = currentPlayer();
    if (!game || !me) return;

    const idx = me.hand.findIndex((c) => c.id === cardId);
    if (idx === -1) return;

    const card = me.hand[idx];
    const m = CARD_META[card.type];
    if (!m.playable) return;

    me.hand.splice(idx, 1);
    me.played = me.played || [];
    me.played.push({ ...card, playedAt: Date.now() });
    pushLog(game, profile.playerId, `${me.name} played ${m.title}.`, m.desc);
    persist();
    renderApp();
  }

  function newShuffledDeck() {
    const game = currentGame();
    if (!game) return;
    if (
      !confirm(
        "Start a fresh deck? All hands and played piles reset to empty; players stay. Log clears."
      )
    )
      return;
    game.deck = shuffle(buildDeck());
    Object.values(game.players).forEach((p) => {
      p.hand = [];
      p.played = [];
    });
    game.log = [];
    pushLog(game, profile.playerId, "New shuffled deck (25 cards). Players unchanged.");
    persist();
    renderApp();
  }

  function leaveGame() {
    clearProfile();
    profile = null;
    persist();
    showSetup("");
  }

  function addPlayerFlow() {
    closeDrawer();
    $("screen-app").classList.add("hidden");
    $("screen-setup").classList.remove("hidden");
    $("panel-log").classList.add("hidden");
    $("game-name").value = profile ? profile.gameName : "";
    $("game-name").readOnly = !!profile;
    $("player-name").value = "";
    $("setup-error").textContent = profile
      ? "Add another seat: use a unique name + color combo for this game."
      : "";
    renderColorPicker();
  }

  function init() {
    $("btn-start").addEventListener("click", startOrJoin);
    $("btn-draw").addEventListener("click", drawCard);
    $("modal-draw-ok").addEventListener("click", () => $("modal-draw").classList.add("hidden"));
    $("btn-menu").addEventListener("click", openDrawer);
    $("btn-settings").addEventListener("click", openDrawer);
    $("drawer-close").addEventListener("click", closeDrawer);
    $("drawer-overlay").addEventListener("click", closeDrawer);
    $("btn-new-game").addEventListener("click", () => {
      newShuffledDeck();
      closeDrawer();
    });
    $("btn-leave").addEventListener("click", () => {
      closeDrawer();
      leaveGame();
    });
    $("btn-add-player").addEventListener("click", addPlayerFlow);

    $("nav-hand").addEventListener("click", () => {
      view = "hand";
      renderApp();
    });
    $("nav-log").addEventListener("click", () => {
      view = "log";
      renderApp();
    });

    store = loadStore();
    profile = loadProfile();

    if (profile && store[profile.gameSlug] && store[profile.gameSlug].players[profile.playerId]) {
      Object.values(store[profile.gameSlug].players).forEach((p) => {
        if (!Array.isArray(p.hand)) p.hand = [];
        if (!Array.isArray(p.played)) p.played = [];
      });
      showApp();
    } else {
      if (profile && (!store[profile.gameSlug] || !store[profile.gameSlug].players[profile.playerId])) {
        clearProfile();
        profile = null;
      }
      showSetup("");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
