// First-time-only: personal welcome before the very first "Gjett gårsdagens
// ord" — rating counts UP into existence, streak counts DOWN to the 0 it
// actually starts at (see the-daily-cock/js/ui.js's renderWelcomeStep).
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../config/theme";
import { useCountUp } from "../../lib/useCountUp";
import type { Profile } from "../../lib/types";
import { Button } from "../shared/Button";
import { Card } from "../shared/Card";
import { Mascot } from "../shared/Mascot";
import { StatRow } from "../shared/StatRow";

export function WelcomeScreen({
  displayName,
  profile,
  onStart,
}: {
  displayName: string;
  profile: Profile;
  onStart: () => void;
}) {
  const { tokens } = useTheme();
  const points = useCountUp(profile.rating, { ms: 900 });
  const streak = useCountUp(0, { from: 5, ms: 900 });

  return (
    <View style={styles.screen}>
      <Mascot />
      <Text style={[styles.h1, { color: tokens.colorTextOnBg, fontFamily: tokens.fontDisplay }]}>
        Heisann, {displayName}!
      </Text>
      <Card>
        <StatRow label="Poeng" value={String(points)} bold />
        <StatRow label="Streak" value={String(streak)} bold style={{ marginTop: 8 }} />
      </Card>
      <Button title="Gi meg dagens kuk!" onPress={onStart} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, gap: 20, justifyContent: "center", alignItems: "center" },
  h1: { fontSize: 28, fontWeight: "700", textAlign: "center" },
});
