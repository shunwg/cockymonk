// The persistent header — rendered once at the App.tsx root, OUTSIDE
// whichever screen is currently active (mirrors cockerel/js/ui.js's
// #header living outside #screen-root). CRITICAL: this component must only
// ever reflect whatever `profile` prop it's given — it must never reach into
// "the current screen's own profile data" on its own. The DISCIPLINE of when
// App.tsx updates the `headerProfile` state that feeds this (immediately vs.
// deliberately deferred until after a reveal animation finishes) is what
// creates the intentional lag on Score/Done screens — see App.tsx.
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../config/theme";
import { streakText } from "../../services/gameSession";
import type { Profile } from "../../lib/types";
import { Mascot } from "./Mascot";

export function Header({ profile }: { profile: Profile | null }) {
  const { tokens } = useTheme();
  if (!profile) return null;

  return (
    <View style={[styles.row, { borderBottomColor: tokens.colorBorder }]}>
      <Mascot size={32} />
      <Text style={[styles.name, { color: tokens.colorTextOnBg, fontFamily: tokens.fontDisplay }]}>
        {profile.displayName}
      </Text>
      <View style={styles.stats}>
        <Text style={[styles.points, { color: tokens.colorTextOnBg }]}>
          {profile.rating} poeng ({profile.rank}. plass)
        </Text>
        <Text style={{ color: tokens.colorTextOnBg, fontSize: 15 }}>
          Streak: {streakText(profile.streakDays, profile.streakBonusPct)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
  },
  name: { fontWeight: "600", fontSize: 15 },
  stats: { marginLeft: "auto", alignItems: "flex-end" },
  points: { fontWeight: "700", fontSize: 15 },
});
