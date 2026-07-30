// AsyncStorage-backed identity — same one-key pattern and key name as
// the-daily-cock/js/storage.js's loadOrCreateIdentity/saveIdentity, EXCEPT
// this interface is async (AsyncStorage is Promise-based; localStorage was
// synchronous) — every call site must await it.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { randomUUID } from "expo-crypto";
import type { Identity } from "./types";

const IDENTITY_KEY = "thedailycock.identity.v1";

export async function loadOrCreateIdentity(suggestedName: string): Promise<Identity> {
  try {
    const raw = await AsyncStorage.getItem(IDENTITY_KEY);
    if (raw) return JSON.parse(raw) as Identity;
  } catch {
    // ignore, fall through to creating a fresh identity
  }
  const identity: Identity = { userId: randomUUID(), displayName: suggestedName };
  try {
    await AsyncStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
  } catch {
    // ignore — worst case we re-create an identity next launch
  }
  return identity;
}

export async function saveIdentity(identity: Identity): Promise<void> {
  try {
    await AsyncStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
  } catch {
    // ignore
  }
}

export async function clearIdentity(): Promise<void> {
  try {
    await AsyncStorage.removeItem(IDENTITY_KEY);
  } catch {
    // ignore
  }
}

export async function hasStoredIdentity(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(IDENTITY_KEY)) !== null;
  } catch {
    return false;
  }
}
