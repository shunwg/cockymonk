// Two independent clocks, same deliberate split as the web version's
// countdown-fill (pure CSS animation) + startCountdownSeconds (separate
// setInterval label) — see cockerel/css/app.css's comment on
// .countdown-fill. Remount this component (key by wordId) to restart both
// for a new word; there is no imperative "reset" method.
import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../config/theme";

export function CountdownBar({ seconds }: { seconds: number }) {
  const { tokens } = useTheme();
  const widthAnim = useRef(new Animated.Value(100)).current;
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: 0,
      duration: seconds * 1000,
      useNativeDriver: false, // animating a percentage `width` isn't supported by the native driver
    }).start();

    const interval = setInterval(() => {
      setRemaining((r) => Math.max(0, r - 1));
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pct = remaining / seconds;
  const color = pct > 0.4 ? tokens.colorTimerCalm : pct > 0.15 ? tokens.colorTimerWarn : tokens.colorTimerUrgent;

  return (
    <View style={styles.row}>
      <View style={styles.track}>
        <Animated.View
          style={[
            styles.fill,
            { backgroundColor: color, width: widthAnim.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] }) },
          ]}
        />
      </View>
      <Text style={[styles.seconds, { color: tokens.colorTextSecondary }]}>{remaining}s</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  track: { flex: 1, height: 6, borderRadius: 999, overflow: "hidden", backgroundColor: "rgba(0,0,0,0.15)" },
  fill: { height: "100%" },
  seconds: { fontVariant: ["tabular-nums"], fontWeight: "700", fontSize: 15, minWidth: 40, textAlign: "right" },
});
