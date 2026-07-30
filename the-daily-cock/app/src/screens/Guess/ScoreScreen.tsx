// Ports ui.js's renderScoreStep/renderReviewRow/wireReviewToggles. The big
// number reveal -> flash -> DELAYED header sync is the single highest-risk
// behavior to get subtly wrong (see the-daily-cock/CLAUDE.md) — header must
// only catch up AFTER the reveal+flash finishes, guarded by a session
// generation check in case a reset/remount happened while the delay was
// still pending (see App.tsx's sessionGenRef).
import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../config/theme";
import { useCountUp } from "../../lib/useCountUp";
import type { GuessScoreResult, ReviewWord } from "../../lib/types";
import { Button } from "../shared/Button";
import { Card } from "../shared/Card";

interface Props {
  result: GuessScoreResult;
  onContinue: () => void;
  getSessionGen: () => number;
  sessionGen: number;
  onRevealComplete: (profile: GuessScoreResult["profile"]) => void;
}

export function ScoreScreen({ result, onContinue, getSessionGen, sessionGen, onRevealComplete }: Props) {
  const { tokens } = useTheme();
  const capturedGen = useRef(sessionGen);
  const flashAnim = useRef(new Animated.Value(1)).current;
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const points = useCountUp(result.points, {
    ms: 900,
    onComplete: () => {
      Animated.sequence([
        Animated.timing(flashAnim, { toValue: 1.15, duration: 200, useNativeDriver: true }),
        Animated.timing(flashAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
      const timer = setTimeout(() => {
        if (getSessionGen() === capturedGen.current) onRevealComplete(result.profile);
      }, 450);
      // best-effort cleanup if the screen unmounts before the delay fires
      cleanupRef.current = () => clearTimeout(timer);
    },
  });
  const cleanupRef = useRef<() => void>(() => {});
  useEffect(() => () => cleanupRef.current(), []);

  const pctSuffix = result.pct ? ` +${result.pct}%` : "";

  return (
    <View style={styles.screen}>
      <Text style={[styles.eyebrow, { color: tokens.colorTextSecondary, textAlign: "center" }]}>Din poengsum</Text>
      <Animated.Text
        style={[styles.bigNumber, { color: tokens.colorTextOnBg, fontFamily: tokens.fontDisplay, transform: [{ scale: flashAnim }] }]}
      >
        {points}
      </Animated.Text>
      <Card style={{ gap: 8 }}>
        <View style={styles.statRow}>
          <Text style={{ color: tokens.colorTextOnSurface }}>Riktige gjett</Text>
          <Text style={{ color: tokens.colorTextOnSurface }}>
            {result.correctCount} / {result.guessTotal}
            {pctSuffix}
          </Text>
        </View>
        <View style={{ gap: 8 }}>
          {result.words.map((w, i) => (
            <ReviewRow key={i} word={w} expanded={!!expanded[i]} onToggle={() => setExpanded((e) => ({ ...e, [i]: !e[i] }))} />
          ))}
        </View>
      </Card>
      <Button title="Fortsett" onPress={onContinue} />
    </View>
  );
}

function ReviewRow({ word, expanded, onToggle }: { word: ReviewWord; expanded: boolean; onToggle: () => void }) {
  const { tokens } = useTheme();
  const stateColor = word.correct ? tokens.colorAccentTruth : tokens.colorAccentBluff;
  return (
    <View>
      <Pressable
        onPress={onToggle}
        style={[styles.reviewToggle, { backgroundColor: stateColor, borderColor: stateColor }]}
      >
        <Text style={{ color: tokens.colorInkNight, flex: 1 }}>{word.word}</Text>
        <Text style={{ color: tokens.colorInkNight }}>{word.correct ? "✓" : "✕"}</Text>
        <Text style={{ color: tokens.colorInkNight, marginLeft: 8 }}>{expanded ? "▴" : "▾"}</Text>
      </Pressable>
      {expanded && (
        <View style={styles.reviewDetail}>
          {word.options.map((o, i) => (
            <View key={i} style={[styles.reviewOption, { borderColor: o.isTruth ? tokens.colorAccentTruth : o.isMine ? tokens.colorAccentBluff : tokens.colorBorder }]}>
              <View style={styles.reviewOptionTop}>
                <Text style={{ color: tokens.colorTextSecondary, fontSize: 11, fontWeight: "700", textTransform: "uppercase" }}>
                  {o.isTruth ? "Riktig svar" : o.isMine ? "Ditt svar" : ""}
                </Text>
                <Text style={{ color: tokens.colorTextSecondary, fontSize: 11, fontWeight: "700" }}>{o.pct}%</Text>
              </View>
              <Text style={{ color: tokens.colorTextOnSurface, fontSize: 15 }}>{o.text}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, gap: 12 },
  eyebrow: { textTransform: "uppercase", letterSpacing: 2, fontSize: 12, fontWeight: "700" },
  bigNumber: { fontSize: 56, fontWeight: "700", textAlign: "center" },
  statRow: { flexDirection: "row", justifyContent: "space-between" },
  reviewToggle: { flexDirection: "row", alignItems: "center", borderWidth: 2, borderRadius: 16, padding: 10 },
  reviewDetail: { gap: 6, paddingTop: 8, paddingHorizontal: 4 },
  reviewOption: { borderWidth: 2, borderRadius: 16, padding: 10 },
  reviewOptionTop: { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 },
});
