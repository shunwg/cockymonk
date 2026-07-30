// Shown every time a RETURNING player opens the app and there's no unseen
// write-recap — so the guess timer never starts the instant the app opens
// (see the-daily-cock/CLAUDE.md: "every returning session passes through a
// Ready step... before the guess timer starts").
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../config/theme";
import { streakText } from "../../services/gameSession";
import type { Profile } from "../../lib/types";
import { Button } from "../shared/Button";
import { Card } from "../shared/Card";
import { Mascot } from "../shared/Mascot";
import { StatRow } from "../shared/StatRow";

export function ReadyScreen({ profile, onStart }: { profile: Profile; onStart: () => void }) {
  const { tokens } = useTheme();
  return (
    <View style={styles.screen}>
      <Mascot />
      <Text style={[styles.h1, { color: tokens.colorTextOnBg, fontFamily: tokens.fontDisplay }]}>
        Velkommen tilbake, {profile.displayName}!
      </Text>
      <Card>
        <StatRow label="Poeng" value={String(profile.rating)} bold />
        <StatRow label="Streak" value={streakText(profile.streakDays, profile.streakBonusPct)} bold style={{ marginTop: 8 }} />
      </Card>
      <Button title="Gjett gårsdagens ord" onPress={onStart} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, gap: 20, justifyContent: "center", alignItems: "center" },
  h1: { fontSize: 28, fontWeight: "700", textAlign: "center" },
});
