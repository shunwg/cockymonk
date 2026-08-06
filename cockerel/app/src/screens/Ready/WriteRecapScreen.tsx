// The async "last time you wrote" recap — write-only (fooled-vote credit
// can't be known until the guess window on your words closes, so it waits
// for next login). This screen's own big number is PLAIN — no header sync,
// unlike Score/Done — see cockerel/CLAUDE.md: "by the time it's shown,
// enterApp() already rendered the header from current truth."
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../config/theme";
import { useCountUp } from "../../lib/useCountUp";
import { streakText } from "../../services/gameSession";
import type { Profile, WriteRecap } from "../../lib/types";
import { Button } from "../shared/Button";
import { Card } from "../shared/Card";
import { Mascot } from "../shared/Mascot";
import { StatRow } from "../shared/StatRow";

export function WriteRecapScreen({
  recap,
  profile,
  onContinue,
}: {
  recap: WriteRecap;
  profile: Profile;
  onContinue: () => void;
}) {
  const { tokens } = useTheme();
  const fooledWordCount = (recap.fooledByWord ?? []).length;
  const points = useCountUp(recap.writeBasePoints ?? recap.writePoints ?? 0, { ms: 900 });

  if (fooledWordCount === 0) {
    return (
      <View style={styles.screen}>
        <Mascot />
        <Text style={[styles.eyebrow, { color: tokens.colorTextSecondary }]}>Sist du skrev</Text>
        <Card style={{ alignItems: "center", gap: 12 }}>
          <Text style={{ color: tokens.colorTextOnSurface, textAlign: "center" }}>
            Ingen ble lurt av ordene dine sist, lykke til denne gangen!
          </Text>
          <StatRow label="Streak" value={streakText(profile.streakDays, profile.streakBonusPct)} bold style={{ width: "100%" }} />
          <StatRow label="Poeng i alt" value={String(profile.points)} style={{ width: "100%" }} />
        </Card>
        <Button title="Fortsett" onPress={onContinue} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Mascot />
      <Text style={[styles.eyebrow, { color: tokens.colorTextSecondary }]}>Sist du skrev</Text>
      <Text style={{ color: tokens.colorTextOnBg, fontWeight: "700", fontSize: 18, textAlign: "center" }}>
        {fooledWordCount} av dine ord lurte andre!
      </Text>
      <Text style={[styles.eyebrow, { color: tokens.colorTextSecondary, marginTop: 8 }]}>Du får</Text>
      <Text style={[styles.bigNumber, { color: tokens.colorTextOnBg, fontFamily: tokens.fontDisplay }]}>{points}</Text>
      <Card style={{ gap: 8, width: "100%" }}>
        <StatRow label="Streak-bonus" value={`+${recap.writeStreakPct}%`} />
        <StatRow label="Total" value={String(recap.writePoints)} bold />
        <StatRow label="Streak" value={streakText(profile.streakDays, profile.streakBonusPct)} bold />
        <StatRow label="Poeng i alt" value={String(profile.points)} />
      </Card>
      <Button title="Fortsett" onPress={onContinue} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, gap: 12, justifyContent: "center", alignItems: "center" },
  eyebrow: { textTransform: "uppercase", letterSpacing: 2, fontSize: 12, fontWeight: "700", textAlign: "center" },
  bigNumber: { fontSize: 56, fontWeight: "700" },
});
