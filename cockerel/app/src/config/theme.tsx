// Ported from cockerel/css/tokens.css + the css/app.css light-theme
// override block — RN has no CSS custom properties, so this is a plain TS
// object with the SAME semantic names (minus "--", camelCased) for a clean
// mental mapping back to the web version. Curated to only the tokens
// app.css actually references — not the full tokens.css superset, which
// includes Cocky Monk board-theme tokens this app never uses.
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { loadTheme as loadStoredTheme, saveTheme as saveStoredTheme } from "../lib/theme";
import type { Theme } from "../lib/types";

export interface ThemeTokens {
  colorBg: string;
  colorSurface: string;
  colorTextOnBg: string;
  colorTextOnSurface: string;
  colorTextSecondary: string;
  colorBorder: string;
  colorAccentTruth: string;
  colorAccentBluff: string;
  colorAccentTurn: string;
  colorInkNight: string; // text-on-accent-fill — deliberately identical in both themes
  colorTimerCalm: string;
  colorTimerWarn: string;
  colorTimerUrgent: string;
  radiusCard: number;
  radiusButton: number;
  radiusChip: number;
  shadowOffset: number; // shadow-hard's hard offset, no blur (DESIGN.md §2)
  fontDisplay: string;
}

const shared = {
  colorAccentTruth: "#3BD489",
  colorAccentBluff: "#FF5C97",
  colorAccentTurn: "#FFC53D",
  colorInkNight: "#1B1B2E",
  colorTimerCalm: "#8A87B8",
  colorTimerWarn: "#FFC53D",
  colorTimerUrgent: "#FF5C97",
  radiusCard: 22,
  radiusButton: 16,
  radiusChip: 999,
  shadowOffset: 4,
  fontDisplay: "Fredoka",
};

export const darkTheme: ThemeTokens = {
  ...shared,
  colorBg: "#1B1B2E",
  colorSurface: "#FFF6E8",
  colorTextOnBg: "#F4EFE4",
  colorTextOnSurface: "#23233B",
  colorTextSecondary: "#A6A2D4",
  colorBorder: "#23233B",
};

export const lightTheme: ThemeTokens = {
  ...shared,
  colorBg: "#FFFFFF",
  colorSurface: "#F4F4F4",
  colorTextOnBg: "#1A1A1A",
  colorTextOnSurface: "#1A1A1A",
  colorTextSecondary: "#6B6B6B",
  colorBorder: "#1A1A1A",
};

interface ThemeContextValue {
  themeName: Theme;
  tokens: ThemeTokens;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  // "light" matches loadStoredTheme()'s own default (app/src/lib/theme.ts) —
  // this is just the value shown for the one tick before that async
  // AsyncStorage read resolves, so it must agree or a "dark"-preferring
  // returning player would see a flash of light on every cold start.
  const [themeName, setThemeName] = useState<Theme>("light");

  useEffect(() => {
    loadStoredTheme().then(setThemeName);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      themeName,
      tokens: themeName === "dark" ? darkTheme : lightTheme,
      toggleTheme: () => {
        const next: Theme = themeName === "light" ? "dark" : "light";
        setThemeName(next);
        saveStoredTheme(next);
      },
    }),
    [themeName]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme() must be used inside <ThemeProvider>");
  return ctx;
}
