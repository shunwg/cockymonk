// Same pattern as ordkrig/src/lib/supabaseClient.ts: an EXPO_PUBLIC_* env var
// wins if set, otherwise fall back to a hardcoded value baked into source.
// Not a secret — this is a URL to a friend-group staging API, safe to expose.
export const API_BASE_URL: string =
  process.env.EXPO_PUBLIC_API_URL || "https://cockerel-staging.fly.dev";
