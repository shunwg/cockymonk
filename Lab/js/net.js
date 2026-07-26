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
  PREFIX: "cm-",                 // namespaces us on the shared public broker
  CODE_LEN: 6,
  CODE_ALPHABET: "ABCDEFGHJKLMNPQRSTUVWXYZ23456789",  // no 0/O/1/I — read aloud
  CONNECT_TIMEOUT_MS: 8000,
  RECONNECT_MS: 30000,           // PRD §5.5
  ID_RETRIES: 3,
  ICE: [{ urls: "stun:stun.l.google.com:19302" }],
  MIN_PLAYERS: 3,
  MAX_PLAYERS: 8,
});

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
  const isGm = seat === G.gm;
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
          } else { conn.send({ t: "bye", reason: "full" }); return; }
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
    if (seat < 0) continue;
    NET.sendTo(p.pid, { t: "state", g: netProject(G, seat), screenHint: U?.screen ?? null });
  }
}

export function netBroadcastLobby() {
  if (!NET.isHost || NET.kind === "loopback") return;
  NET.send({ t: "lobby", roster: NET.peers });
}
