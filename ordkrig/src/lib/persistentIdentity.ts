import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabaseClient';

/**
 * IDENTITET SOM OVERLEVER RE-INSTALLASJON (iOS Keychain via expo-secure-store).
 *
 * AsyncStorage slettes når appen avinstalleres – Keychain gjør IKKE det. Vi
 * speiler derfor (1) Supabase-øktens tokens og (2) profilen (navn/statistikk)
 * dit. Ved første oppstart etter en re-installasjon gjenopprettes begge → samme
 * bruker-id, samme brukernavn, samme statistikk.
 *
 * Alt er VAKTET: på bygg uten expo-secure-store er hver funksjon et stille no-op.
 */

const KEY_SESSION = 'ordkrig.identity.session.v1';
const KEY_PROFILE = 'ordkrig.identity.profile.v1';
// Holdes i sync med profileStore.ts (kan ikke importeres – ville gitt sirkel)
const ASYNC_PROFILE_KEY = 'wordwar.profile.v1';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function store(): any {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-secure-store');
  } catch {
    return null;
  }
}

/** Speil profil-JSON til Keychain (kalles fra profileStore ved hver lagring). */
export function backupProfile(profileJson: string): void {
  const S = store();
  if (!S?.setItemAsync) return;
  S.setItemAsync(KEY_PROFILE, profileJson).catch(() => {});
}

/** Speil øktens tokens til Keychain (kalles etter innlogging). */
export async function backupSession(): Promise<void> {
  const S = store();
  if (!S?.setItemAsync) return;
  try {
    const { data } = await supabase.auth.getSession();
    const s = data.session;
    if (s?.access_token && s.refresh_token) {
      await S.setItemAsync(
        KEY_SESSION,
        JSON.stringify({ access_token: s.access_token, refresh_token: s.refresh_token })
      );
    }
  } catch {
    // stille
  }
}

/**
 * Kjøres FØRST ved oppstart: er dette en fersk installasjon (tom AsyncStorage),
 * hentes profil + økt tilbake fra Keychain før noe annet får kjøre.
 */
export async function restoreIdentity(): Promise<void> {
  const S = store();
  if (!S?.getItemAsync) return;
  try {
    // 1) Profil: bare hvis lokal profil mangler (aldri overskriv aktiv data)
    const local = await AsyncStorage.getItem(ASYNC_PROFILE_KEY);
    if (!local) {
      const backed = await S.getItemAsync(KEY_PROFILE);
      if (backed) await AsyncStorage.setItem(ASYNC_PROFILE_KEY, backed);
    }
    // 2) Økt: bare hvis ingen aktiv økt (ellers beholdes den som er)
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const raw = await S.getItemAsync(KEY_SESSION);
      if (raw) {
        const { access_token, refresh_token } = JSON.parse(raw);
        if (access_token && refresh_token) {
          await supabase.auth.setSession({ access_token, refresh_token });
        }
      }
    }
  } catch {
    // stille – anonym ny bruker er fallback
  }
}
