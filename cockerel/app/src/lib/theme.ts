// AsyncStorage-backed theme preference — same key/values as
// cockerel/js/storage.js's loadTheme/saveTheme ("light" default,
// "dark" opt-in), async because AsyncStorage is Promise-based.
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Theme } from "./types";

const THEME_KEY = "cockerel.theme.v1";

export async function loadTheme(): Promise<Theme> {
  try {
    return (await AsyncStorage.getItem(THEME_KEY)) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export async function saveTheme(theme: Theme): Promise<void> {
  try {
    await AsyncStorage.setItem(THEME_KEY, theme);
  } catch {
    // ignore
  }
}
