// Ports ui.js's renderDoneStep — full-bleed truth-green success screen,
// same revealThenSyncHeader + session-generation guard as ScoreScreen (see
// its comment), animating streakDays this time instead of points.
import { useEffect, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../config/theme";
import { useCountUp } from "../../lib/useCountUp";
import type { TodayState } from "../../lib/types";
import { Mascot } from "../shared/Mascot";

interface Props {
  state: TodayState;
  getSessionGen: () => number;
  sessionGen: number;
  onRevealComplete: (profile: TodayState["profile"]) => void;
}

export function DoneScreen({ state, getSessionGen, sessionGen, onRevealComplete }: Props) {
  const { tokens } = useTheme();
  const capturedGen = useRef(sessionGen);
  const cleanupRef = useRef<() => void>(() => {});
  useEffect(() => () => cleanupRef.current(), []);

  const streak = useCountUp(state.profile.streakDays, {
    ms: 900,
    onComplete: () => {
      const timer = setTimeout(() => {
        if (getSessionGen() === capturedGen.current) onRevealComplete(state.profile);
      }, 450);
      cleanupRef.current = () => clearTimeout(timer);
    },
  });

  return (
    <View style={[styles.screen, { backgroundColor: tokens.colorAccentTruth }]}>
      <Mascot />
      <Text style={[styles.eyebrow, { color: tokens.colorInkNight }]}>Streak</Text>
      <Text style={[styles.bigNumber, { color: tokens.colorInkNight, fontFamily: tokens.fontDisplay }]}>{streak}</Text>
      <Text style={{ color: tokens.colorInkNight }}>dager</Text>
      <Text style={[styles.tagline, { color: tokens.colorInkNight }]}>
        Kom tilbake i morgen og se om noen gjettet ordene dine!
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: 20 },
  eyebrow: { textTransform: "uppercase", letterSpacing: 2, fontSize: 12, fontWeight: "700" },
  bigNumber: { fontSize: 56, fontWeight: "700" },
  tagline: { fontWeight: "700", fontSize: 18, textAlign: "center", marginTop: 12 },
});
