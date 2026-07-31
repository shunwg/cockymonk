// storageRemote() — RN's equivalent of cockerel/js/storage.js's
// storageLocal(): same method names/signatures so screen/orchestration code
// reads the same way ui.js's `store` does. `fetch` behaves the same in RN as
// the browser, so this is a near-verbatim transliteration.
import { API_BASE_URL } from "./apiConfig";
import { detectDevice } from "./detectDevice";
import type {
  ActionResult,
  Profile,
  TodayState,
  VoteDistributionResult,
} from "./types";

export function storageRemote(base: string = API_BASE_URL) {
  async function post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(base + path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.json() as Promise<T>;
  }
  async function get<T>(path: string): Promise<T> {
    const res = await fetch(base + path);
    return res.json() as Promise<T>;
  }

  return {
    getConfig: () => get<{ ok: boolean; devTools: boolean }>("/api/config"),
    ensureProfile: (userId: string, displayName: string) =>
      post<{ ok: boolean; profile: Profile }>("/api/profile", { userId, displayName, device: detectDevice() }),
    getToday: (userId: string) => get<TodayState>(`/api/today?userId=${encodeURIComponent(userId)}`),
    submitDefinition: (userId: string, wordId: string, text: string) =>
      post<ActionResult>("/api/submit-definition", { userId, wordId, text }),
    submitGuess: (userId: string, wordId: string, choiceId: string) =>
      post<ActionResult>("/api/submit-guess", { userId, wordId, choiceId }),
    skipGuess: (userId: string, wordId: string) => post<ActionResult>("/api/skip-guess", { userId, wordId }),
    ackRecap: (userId: string) => post<{ ok: boolean }>("/api/ack-recap", { userId }),
    getVoteDistribution: (userId: string, wordId: string) =>
      get<VoteDistributionResult>(
        `/api/vote-distribution?userId=${encodeURIComponent(userId)}&wordId=${encodeURIComponent(wordId)}`
      ),
    resetPlayer: (userId: string) => post<{ ok: boolean }>("/api/reset-player", { userId }),
    // dev-only test tools — not surfaced in any RN screen this pass (see
    // app/AGENTS.md / the approved plan), kept here for interface parity and
    // so a future debug panel is a small addition, not a new wiring pass.
    listDays: () => get<{ ok: boolean; days: string[]; current: string }>("/api/dev/days"),
    listPlayers: () => get<{ ok: boolean; players: { userId: string; displayName: string }[] }>("/api/dev/players"),
    advanceDay: () => post<{ ok: boolean }>("/api/dev/advance-day", {}),
  };
}

export type Store = ReturnType<typeof storageRemote>;
