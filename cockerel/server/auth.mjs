// auth.mjs — Google Sign-In verification. The one module that reaches the
// network at request time (db.mjs stays filesystem-only, see its own top
// comment) — kept separate on purpose so that split stays visible.
//
// Verifies the ID token via Google's own tokeninfo endpoint instead of
// reimplementing JWKS/RS256 verification by hand. Google's docs steer
// high-volume production apps toward a client library for that, but at this
// app's scale (~10 users, infrequent sign-ins) the extra network round trip
// is a fine trade for staying zero-dependency — same "simple, not hardened"
// stance already taken for ADMIN_TOKEN in dev-server.mjs.
export async function verifyGoogleIdToken(idToken, clientId) {
  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  if (!res.ok) return null; // bad signature, expired, malformed — tokeninfo itself rejects all of these
  const claims = await res.json();
  if (claims.aud !== clientId) return null; // token was issued for a different Google client entirely
  if (claims.iss !== "accounts.google.com" && claims.iss !== "https://accounts.google.com") return null;
  return { sub: claims.sub, email: claims.email ?? null, name: claims.name ?? null };
}
