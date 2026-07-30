// Ports ui.js's renderWriteWordStep/renderWriteWordMarkup. One word at a
// time, 60s timer. skippedIds accumulates across repeated timeouts within
// the same write session — lifted into App.tsx's screen state (see
// services/gameSession.ts's ScreenState) rather than owned locally here.
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { TIMERS } from "../../engine/config.js";
import { useTheme } from "../../config/theme";
import type { Store } from "../../lib/storageRemote";
import type { TodayState } from "../../lib/types";
import { CountdownBar } from "../shared/CountdownBar";

interface Props {
  state: TodayState;
  skippedIds: string[];
  store: Store;
  userId: string;
  onSubmitted: (freshState: TodayState) => void;
  onTimeout: (wordId: string) => void;
  onAllWritten: () => void;
}

export function WriteWordScreen({ state, skippedIds, store, userId, onSubmitted, onTimeout, onAllWritten }: Props) {
  const { tokens } = useTheme();
  const skipped = new Set(skippedIds);
  const remaining = state.writeWords.filter((w) => !w.alreadySubmitted && !skipped.has(w.wordId));
  const word = remaining[0];
  const position = state.writeWords.length - remaining.length + 1;

  const [text, setText] = useState("");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!word) {
      onAllWritten();
      return;
    }
    setText("");
    timeoutRef.current = setTimeout(() => onTimeout(word.wordId), TIMERS.writeSeconds * 1000);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word?.wordId]);

  if (!word) return null;

  async function handleSubmit() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const res = await store.submitDefinition(userId, word.wordId, text);
    if (!res.ok) return;
    onSubmitted(await store.getToday(userId));
  }

  return (
    <View style={styles.screen} key={word.wordId}>
      <CountdownBar seconds={TIMERS.writeSeconds} key={word.wordId} />
      <Text style={[styles.eyebrow, { color: tokens.colorTextSecondary }]}>
        Skriv dagens ord ({position}/{state.writeWords.length})
      </Text>
      <Text style={[styles.wordTitle, { color: tokens.colorTextOnBg, fontFamily: tokens.fontDisplay }]}>
        {word.word}
      </Text>
      <TextInput
        value={text}
        onChangeText={setText}
        multiline
        maxLength={140}
        placeholder="Skriv en troverdig (falsk) definisjon..."
        placeholderTextColor={tokens.colorTextSecondary}
        style={[styles.input, { borderColor: tokens.colorBorder, color: tokens.colorTextOnSurface, backgroundColor: tokens.colorSurface }]}
      />
      <Pressable onPress={handleSubmit} style={[styles.submitBtn, { backgroundColor: tokens.colorAccentTurn, borderColor: tokens.colorBorder }]}>
        <Text style={{ color: tokens.colorInkNight, fontWeight: "600" }}>Send inn</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, gap: 12 },
  eyebrow: { textTransform: "uppercase", letterSpacing: 1, fontSize: 12, fontWeight: "700" },
  wordTitle: { fontSize: 40, fontWeight: "700" },
  input: { borderWidth: 2, borderRadius: 16, padding: 12, fontSize: 17, minHeight: 60, textAlignVertical: "top" },
  submitBtn: { alignSelf: "flex-start", borderWidth: 2, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 18 },
});
