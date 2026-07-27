// net.js — the transport seam (PRD §2.1, LANES.md contract 7). Segment 5.
//
// THE ONLY FILE that may touch `Peer`, WebRTC, or the broker. Everything else
// talks to the object returned by netLoopback()/netHost()/netJoin(), and cannot
// tell which one it is holding.
//
// Two rules make online play safe rather than merely working:
//
//   1. ONLY THE HOST ADVANCES THE GAME. Clients send intents and render what
//      they are told. There is no state merge, so there is no desync class we
//      would need a server to debug.
//
//   2. netProject() IS THE ONLY WAY STATE LEAVES THE HOST. A naive broadcast
//      ships card.truth to every player and destroys the game — while looking
//      completely fine in a solo test on one machine. That is why the first
//      test in online.test.mjs is the truth-leak test, not a nice-to-have.
//
// The broker sees a random room id and connection candidates. It never sees a
// card, a lie, or a vote: those go peer-to-peer over the data channel.
//
// BUNDLE NOTE: one IIFE with every other module, so internals are prefixed `nt`.

export const NET = {
  kind: "loopback",     // "loopback" | "peer-host" | "peer-client"
  isHost: true,
  roomCode: null,
  myPid: null,
  skewMs: 0,            // clock offset vs the host (clock.js clockSkew)
  quiet: false,         // suppress broadcasts mid-ceremony (see below)
  seq: 0,
  error: null,          // last human-readable failure, for screen 23
  peers: [],            // [{pid, name, rating, games, nose, connected}]
};

// Pinned in ONE place so switching or self-hosting the broker is a one-line
// change rather than a hunt. No TURN server: a party game does not buy relay
// bandwidth, so a small share of hostile networks simply won't connect, and we
// say so out loud instead of hanging.
export const NET_CONFIG = Object.freeze({
  // Namespaces us on the shared PUBLIC broker, so it has to be ours alone.
  // Changing this invalidates every share-link already in the wild: a room id is
  // PREFIX + code, and a guest on an old link asks the broker for a peer that no
  // longer exists. Done once here, deliberately, at the rename (2026-07-28) and
  // before the open room starts handing out links people keep.
  PREFIX: "sn-",
  CODE_LEN: 6,
  CODE_ALPHABET: "ABCDEFGHJKLMNPQRSTUVWXYZ23456789",  // no 0/O/1/I — read aloud
  CONNECT_TIMEOUT_MS: 8000,
  RECONNECT_MS: 30000,           // PRD §5.5
  ID_RETRIES: 3,
  ICE: [{ urls: "stun:stun.l.google.com:19302" }],
  MIN_PLAYERS: 3,
  MAX_PLAYERS: 8,
});

/**
 * Is the door open? Room policy, so it lives here rather than in the UI — and
 * pure, so it is testable. Only the HOST ever calls this: a client cannot be
 * trusted to judge its own lateness.
 *
 * It used to be a three-minute clock stamped by startGame(). That was the wrong
 * shape for a party game: the whole point is that people wander in — someone
 * parks the car, someone arrives at half past nine — and a door that slams at
 * minute three turns a normal social arrival into "sorry, we already started".
 * A game runs 20 minutes and a friend with the link should be able to sit down
 * at minute eighteen.
 *
 * The only thing that closes it is the game being OVER. Everything else that
 * used to matter — is a round in flight, is there a chair free — is handled
 * where it belongs, by seating rather than by refusing (see netSeatLate).
 *
 * Still not matchmaking: the code or the link is required, so PRD §2's "no
 * matchmaking with strangers" holds and no moderation surface opens. `now` is
 * kept in the signature because callers pass it and a future policy (a host
 * toggle, a quiet-hours rule) would want it back.
 */
export function netJoinOpen(g, now = Date.now()) {   // eslint-disable-line no-unused-vars
  if (!g) return false;
  return g.phase !== "winner";                       // nothing left to join
}

/**
 * WHICH way into a running game? Room policy, so it lives here with the rest of
 * it — and pure, so the arithmetic that makes it non-obvious is testable without
 * a browser. ui.js netSeatLate() carries it out.
 *
 *   "bot"     — a bot is sitting; take its chair now, inherit its score.
 *               G.players.length does not move, which is the whole point.
 *   "pending" — no bot to displace. Wait for the round boundary.
 *   "full"    — eight is eight, counting the people already queued.
 *
 * Why "pending" rather than just pushing a chair: three engine functions read
 * players.length and all three change meaning if it moves mid-round —
 * gmForRound() re-maps every remaining GM, winCheck() gates on
 * `round % playerCount`, and scoreRound() sizes Array(playerCount) for the
 * deltas. So a new chair may only appear between rounds. The waiting room the
 * player experiences and the invariant the engine needs are the same rule.
 */
export function netSeatKind(g, max = NET_CONFIG.MAX_PLAYERS) {
  if (!g?.players?.length) return "full";
  if (g.players.some((p) => p.kind === "bot" && !p.dropped)) return "bot";
  if (g.players.length + (g.pendingSeats?.length ?? 0) >= max) return "full";
  return "pending";
}

/**
 * What a newcomer's pawn starts on when they get a fresh chair (no bot to
 * inherit from). Level with the current last place, not zero.
 *
 * Zero is the honest-looking answer and the wrong one: join a 15-space game at
 * round nine on zero and you are not playing, you are watching with extra steps
 * — the table is eight points up and cannot be caught. Last place is the honest
 * floor instead. Nobody already playing is overtaken by someone who just walked
 * in, and the newcomer has a real game. The banner says so out loud, the same
 * way taking a bot's chair announces the inherited score.
 */
export function netStartScore(players = []) {
  const scores = players.map((p) => p?.score ?? 0);
  return scores.length ? Math.min(...scores) : 0;
}

export function netRoomCode(rng = Math.random) {
  const a = NET_CONFIG.CODE_ALPHABET;
  let s = "";
  for (let i = 0; i < NET_CONFIG.CODE_LEN; i++) s += a[Math.floor(rng() * a.length)];
  return s;
}

// The share link. Someone reading a code aloud is the fallback, not the plan.
export function netShareLink(code, loc = globalThis.location) {
  if (!loc || loc.protocol === "file:") return null;   // no URL to share from disk
  return `${loc.origin}${loc.pathname}?room=${code}`;
}

export function netRoomFromUrl(loc = globalThis.location) {
  try {
    const c = new URLSearchParams(loc.search).get("room");
    return c && /^[A-Z0-9]{4,10}$/i.test(c) ? c.toUpperCase() : null;
  } catch { return null; }
}

/* ---------------- state projection — the load-bearing function --------------
 * What a given seat is allowed to know, right now. Called once per recipient
 * per broadcast. Everything it strips is something that, if leaked, either ends
 * the round (the truth) or quietly ruins it (who voted for what, mid-vote).
 */
export function netProject(G, seat) {
  if (!G) return null;
  // A watcher with no chair yet (seat -1, waiting in G.pendingSeats) is never the
  // GM. Written as an explicit floor rather than relying on -1 !== G.gm, because
  // this one comparison is the only thing standing between a spectator and the
  // truth, and it should not depend on G.gm never being undefined.
  const seated = Number.isInteger(seat) && seat >= 0;
  const isGm = seated && seat === G.gm;
  const phase = G.phase ?? "card";
  const preReveal = phase === "card" || phase === "bluffing" || phase === "voting";
  const p = { ...G };

  // 1. The truth. Only the GM, and only until the reveal opens.
  if (!isGm && preReveal) p.card = G.card ? { prompt: G.card.prompt, truth: null } : null;

  // 2. The GM's decoy drafts are private working text, not state.
  if (!isGm) p.decoys = [];

  // 3. Before voting opens, other people's lies must not be readable. Ship only
  //    WHO is done, which is all the tick-in chips need.
  if (phase === "card" || phase === "bluffing") {
    p.bluffs = {};
    p.bluffsIn = Object.keys(G.bluffs ?? {}).map(Number).sort((a, b) => a - b);
  }

  // 4. During voting the tally is anonymous (PRD §5.2#4). Counts, never voters —
  //    except your own vote, so your screen can show that you have voted.
  if (phase === "voting") {
    const counts = {};
    for (const optId of Object.values(G.votes ?? {})) counts[optId] = (counts[optId] ?? 0) + 1;
    p.voteCounts = counts;
    p.votesIn = Object.keys(G.votes ?? {}).length;
    p.votes = G.votes?.[seat] === undefined ? {} : { [seat]: G.votes[seat] };
  }

  return p;
}

// Vote tally that works from either the full votes map (host) or the projected
// counts (client). One helper so the screens don't branch on who they are.
export function netTally(G, optionId) {
  if (G?.voteCounts) return G.voteCounts[optionId] ?? 0;
  return Object.values(G?.votes ?? {}).filter((id) => id === optionId).length;
}
export function netVotesIn(G) {
  return G?.votesIn ?? Object.keys(G?.votes ?? {}).length;
}

/* ---------------- transports ---------------- */

const ntNoop = () => {};

// Local play: hotseat and practice. `send` goes nowhere, which is the point —
// from ui.js's side this is indistinguishable from being the host of a room
// nobody has joined, so the same code path runs in every mode.
export function netLoopback() {
  Object.assign(NET, {
    kind: "loopback", isHost: true, roomCode: null, skewMs: 0,
    quiet: false, seq: 0, error: null, peers: [],
  });
  return Object.assign(NET, {
    send: ntNoop, sendTo: ntNoop, onMessage: ntNoop, onPeerChange: ntNoop, close: ntNoop,
  });
}

function ntPeerCtor() {
  const P = globalThis.Peer;
  if (typeof P !== "function") {
    throw new Error("PeerJS is not loaded — Lab/vendor/peerjs.min.js must be in the page");
  }
  return P;
}

/**
 * Host a room. The host's peer id IS the room code (prefixed), so there is
 * nothing to look up and no host migration — if the host leaves, the room is
 * over, which we tell people rather than hide.
 */
export function netHost({ pid, name, profile, onMessage, onPeerChange, onReady, onError, rng = Math.random }) {
  const Peer = ntPeerCtor();
  let attempt = 0;
  const conns = new Map();     // pid -> DataConnection

  const start = () => {
    const code = netRoomCode(rng);
    const peer = new Peer(NET_CONFIG.PREFIX + code, { config: { iceServers: NET_CONFIG.ICE } });
    const timeout = setTimeout(() => {
      peer.destroy();
      onError?.("timeout");
    }, NET_CONFIG.CONNECT_TIMEOUT_MS);

    peer.on("open", () => {
      clearTimeout(timeout);
      Object.assign(NET, {
        kind: "peer-host", isHost: true, roomCode: code, myPid: pid, error: null,
        peers: [{ pid, name, rating: profile?.rating, games: profile?.games, nose: profile?.nose, connected: true }],
      });
      onReady?.(code);
      onPeerChange?.(NET.peers);
    });

    peer.on("connection", (conn) => {
      conn.on("data", (msg) => {
        if (!msg || typeof msg !== "object") return;
        if (msg.t === "hello") {
          const seated = NET.peers.find((x) => x.pid === msg.pid);
          // A pid we already have AND still have a live channel to is not a
          // reconnect — it's a second person carrying the same identity. That
          // happens whenever a browser profile is shared (two tabs on one
          // machine share localStorage, so they share a pid) and it must not
          // let the newcomer take over someone else's row — least of all the
          // host's. Give them a distinct seat instead of merging them.
          const collision = seated && (seated.pid === pid || conns.get(msg.pid)?.open);
          if (collision) {
            msg.pid = `${msg.pid}~${NET.peers.length}`;
            ntSafeSend(conn, { t: "rebind", pid: msg.pid });   // so the client agrees who it is
          }
          // Rebinding by pid is what makes reconnect free: the seat is already
          // in the game, so we just point it at the new connection and resend.
          conns.set(msg.pid, conn);
          const existing = NET.peers.find((x) => x.pid === msg.pid);
          if (existing) Object.assign(existing, { name: msg.name, connected: true });
          else if (NET.peers.length < NET_CONFIG.MAX_PLAYERS) {
            NET.peers.push({
              pid: msg.pid, name: msg.name, rating: msg.rating,
              games: msg.games, nose: msg.nose, connected: true,
            });
          } else { ntSafeSend(conn, { t: "bye", reason: "full" }); return; }
          onPeerChange?.(NET.peers);
        }
        onMessage?.(msg, conn);
      });
      conn.on("close", () => {
        for (const [k, v] of conns) if (v === conn) conns.delete(k);
        const seatOf = NET.peers.find((x) => !conns.has(x.pid) && x.pid !== pid);
        if (seatOf) seatOf.connected = false;
        onPeerChange?.(NET.peers);
      });
    });

    peer.on("error", (err) => {
      clearTimeout(timeout);
      // A taken id is a collision on the shared broker, not a real failure.
      if (err?.type === "unavailable-id" && ++attempt < NET_CONFIG.ID_RETRIES) { peer.destroy(); start(); return; }
      NET.error = err?.type ?? "error";
      onError?.(NET.error);
    });

    Object.assign(NET, {
      send: (msg) => { if (NET.quiet) return; for (const c of conns.values()) ntSafeSend(c, { ...msg, seq: ++NET.seq, t0: Date.now() }); },
      sendTo: (toPid, msg) => ntSafeSend(conns.get(toPid), { ...msg, seq: ++NET.seq, t0: Date.now() }),
      onMessage: (fn) => { onMessage = fn; },
      onPeerChange: (fn) => { onPeerChange = fn; },
      close: () => { for (const c of conns.values()) ntSafeClose(c); peer.destroy(); netLoopback(); },
    });
  };

  start();
  return NET;
}

/** Join a room by code. */
export function netJoin({ code, pid, name, profile, onMessage, onPeerChange, onReady, onError }) {
  const Peer = ntPeerCtor();
  const peer = new Peer(undefined, { config: { iceServers: NET_CONFIG.ICE } });
  let conn = null;

  const timeout = setTimeout(() => {
    peer.destroy();
    onError?.("timeout");
  }, NET_CONFIG.CONNECT_TIMEOUT_MS);

  peer.on("open", () => {
    conn = peer.connect(NET_CONFIG.PREFIX + code.toUpperCase(), { reliable: true });
    conn.on("open", () => {
      clearTimeout(timeout);
      Object.assign(NET, {
        kind: "peer-client", isHost: false, roomCode: code.toUpperCase(), myPid: pid, error: null,
      });
      // The same pid every time, so a reconnect lands back in our own seat.
      ntSafeSend(conn, {
        t: "hello", pid, name,
        rating: profile?.rating, games: profile?.games, nose: profile?.nose,
      });
      onReady?.(code.toUpperCase());
    });
    conn.on("data", (msg) => {
      if (!msg || typeof msg !== "object") return;
      if (msg.t === "lobby") { NET.peers = msg.roster ?? []; onPeerChange?.(NET.peers); }
      onMessage?.(msg, conn);
    });
    conn.on("close", () => { NET.error = "host-gone"; onError?.("host-gone"); });
    conn.on("error", () => { NET.error = "conn"; onError?.("conn"); });
  });

  peer.on("error", (err) => {
    clearTimeout(timeout);
    // peer-unavailable = the code is wrong or that room has closed. Say which.
    NET.error = err?.type === "peer-unavailable" ? "no-room" : (err?.type ?? "error");
    onError?.(NET.error);
  });

  Object.assign(NET, {
    send: (msg) => ntSafeSend(conn, msg),
    sendTo: (_pid, msg) => ntSafeSend(conn, msg),
    onMessage: (fn) => { onMessage = fn; },
    onPeerChange: (fn) => { onPeerChange = fn; },
    close: () => { ntSafeClose(conn); peer.destroy(); netLoopback(); },
    reconnect: () => { try { peer.reconnect(); } catch { /* already gone */ } },
  });
  return NET;
}

// A dead data channel throws on send. Losing a peer must never take the room
// down with it — the close handler will notice and mark the seat disconnected.
function ntSafeSend(conn, msg) {
  try { if (conn && conn.open) conn.send(msg); } catch { /* peer went away */ }
}
function ntSafeClose(conn) {
  try { conn?.close(); } catch { /* already closed */ }
}

// Broadcast the game, redacted per recipient. `quiet` exists because the board
// ceremony mutates scores as an animation side effect (ui.js animateBoard) — a
// broadcast mid-hop would clobber clients halfway through their own identical
// animation. Both sides animate the same deltas, then the host sends one
// authoritative state at the end.
export function netBroadcastState(G, U) {
  if (!NET.isHost || NET.kind === "loopback" || NET.quiet) return;
  for (const p of NET.peers) {
    if (p.pid === NET.myPid || !p.connected) continue;
    const seat = G.players.findIndex((x) => x.pid === p.pid);
    // seat < 0 used to `continue`, which was right when the only seatless peer
    // was a bug. Now it is a person waiting for the next round (G.pendingSeats),
    // and skipping them rebuilds the exact dead end late join was written to
    // kill: connected, told nothing, staring at a stale screen. They get the
    // same redacted projection as any non-GM — netProject floors seat < 0 to
    // "not the GM", so the truth still cannot reach them.
    NET.sendTo(p.pid, { t: "state", g: netProject(G, seat), screenHint: U?.screen ?? null });
  }
}

export function netBroadcastLobby() {
  if (!NET.isHost || NET.kind === "loopback") return;
  NET.send({ t: "lobby", roster: NET.peers });
}
