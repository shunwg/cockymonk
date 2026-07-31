// Persistent footer, rendered once at the App.tsx root and always visible on
// every screen — mirrors cockerel/css/app.css's .app-footer (a
// full-width fixed bar, NOT a floating corner button, which on the web
// version got hidden behind mobile browser chrome / the home-indicator safe
// area). useSafeAreaInsets() is the RN equivalent of that CSS's
// env(safe-area-inset-bottom).
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../config/theme";

export function FooterSettingsBar({ onPress }: { onPress: () => void }) {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: tokens.colorSurface, borderTopColor: tokens.colorBorder, paddingBottom: 8 + insets.bottom },
      ]}
    >
      <Pressable onPress={onPress} style={styles.btn} accessibilityLabel="Innstillinger">
        <Text style={styles.icon}>⚙</Text>
        <Text style={[styles.label, { color: tokens.colorTextOnSurface }]}>Innstillinger</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderTopWidth: 2,
    paddingTop: 8,
    paddingHorizontal: 20,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  btn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, paddingHorizontal: 4 },
  icon: { fontSize: 20, lineHeight: 20 },
  label: { fontWeight: "600", fontSize: 15 },
});
