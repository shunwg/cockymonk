// Ports ui.js's renderGuessWordStep/renderGuessWordMarkup. One word at a
// time, never a list. 30s timer (TIMERS.guessSeconds) is a real setTimeout
// independent of CountdownBar's own display clock — cleared on unmount/word
// change, same double-clock discipline as the web version. The hint button
// deliberately does NOT clear/restart the timer — only itself.
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { TIMERS } from "../../engine/config.js";
import { useTheme } from "../../config/theme";
import type { Store } from "../../lib/storageRemote";
import type { ActionResult, TodayState } from "../../lib/types";
import { CountdownBar } from "../shared/CountdownBar";

interface Props {
  state: TodayState;
  store: Store;
  userId: string;
  onActionResult: (res: ActionResult) => void;
  onTimeout: (wordId: string) => void;
  onAllGuessed: () => void;
}

export function GuessWordScreen({ state, store, userId, onActionResult, onTimeout, onAllGuessed }: Props) {
  const { tokens } = useTheme();
  const remaining = state.guessWords.filter((w) => !w.alreadyGuessed);
  const word = remaining[0];
  const position = state.guessWords.length - remaining.length + 1;

  const [hintLabel, setHintLabel] = useState("Hint 💡");
  const [hintDisabled, setHintDisabled] = useState(false);
  const [hintPcts, setHintPcts] = useState<Record<string, number>>({});
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!word) {
      onAllGuessed();
      return;
    }
    // This component instance persists across words (App.tsx doesn't remount
    // it), unlike the web version's full DOM replace per word — reset local
    // hint state explicitly or it'd leak into the next word.
    setHintLabel("Hint 💡");
    setHintDisabled(false);
    setHintPcts({});
    timeoutRef.current = setTimeout(() => onTimeout(word.wordId), TIMERS.guessSeconds * 1000);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word?.wordId]);

  if (!word) return null;

  async function handleChoice(choiceId: string) {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const res = await store.submitGuess(userId, word.wordId, choiceId);
    if (!res.ok) return;
    onActionResult(res);
  }

  async function handleHint() {
    setHintDisabled(true);
    const res = await store.getVoteDistribution(userId, word.wordId);
    if (!res.ok) {
      setHintDisabled(false);
      return;
    }
    if (res.noData) {
      setHintLabel("Ingen har gjettet ordet ennå");
      return;
    }
    setHintLabel("Hint vist");
    const next: Record<string, number> = {};
    for (const { id, pct } of res.distribution ?? []) next[id] = pct;
    setHintPcts(next);
  }

  return (
    <View style={styles.screen} key={word.wordId}>
      <CountdownBar seconds={TIMERS.guessSeconds} key={word.wordId} />
      <Text style={[styles.eyebrow, { color: tokens.colorTextSecondary }]}>
        Gjett gårsdagens ord ({position}/{state.guessWords.length})
      </Text>
      <Text style={[styles.wordTitle, { color: tokens.colorTextOnBg, fontFamily: tokens.fontDisplay }]}>
        {word.word}
      </Text>
      <Pressable
        onPress={handleHint}
        disabled={hintDisabled}
        style={[styles.hintBtn, { borderColor: tokens.colorBorder, backgroundColor: tokens.colorSurface, opacity: hintDisabled ? 0.5 : 1 }]}
      >
        <Text style={{ color: tokens.colorTextOnSurface, fontWeight: "600" }}>{hintLabel}</Text>
      </Pressable>
      <View style={styles.options}>
        {word.options.map((opt) => (
          <Pressable
            key={opt.id}
            onPress={() => handleChoice(opt.id)}
            style={[styles.option, { borderColor: tokens.colorBorder, backgroundColor: tokens.colorSurface }]}
          >
            <Text style={{ color: tokens.colorTextOnSurface, flex: 1 }}>{opt.text}</Text>
            {hintPcts[opt.id] != null && (
              <Text style={{ color: tokens.colorTextSecondary, fontWeight: "700" }}>{hintPcts[opt.id]}%</Text>
            )}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, gap: 12 },
  eyebrow: { textTransform: "uppercase", letterSpacing: 1, fontSize: 12, fontWeight: "700" },
  wordTitle: { fontSize: 40, fontWeight: "700" },
  hintBtn: { alignSelf: "flex-start", borderWidth: 2, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 12 },
  options: { gap: 10, marginTop: 8 },
  option: {
    borderWidth: 2,
    borderRadius: 16,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
});
