import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

/**
 * Supabase-klient. `publishable`/anon-nøkkelen er MENT å ligge i klient-appen
 * (offentlig, tilgang styres av RLS), så vi har trygge fallback-verdier her.
 * Da kan aldri appen krasje ved oppstart selv om miljøvariablene ikke skulle
 * følge med i en OTA-oppdatering (eas update inlinet dem ikke alltid).
 * Miljøvariabel vinner hvis den finnes; ellers brukes fallbacken.
 */
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://scaginohmvsfxujjkymx.supabase.co';
const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_onOrJl_kmwO4yhAzh9rNsQ_JrTrk375';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
