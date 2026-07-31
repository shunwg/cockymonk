import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../config/theme";

export function StatRow({ label, value, bold, style }: { label: string; value: string; bold?: boolean; style?: object }) {
  const { tokens } = useTheme();
  return (
    <View style={[styles.row, style]}>
      <Text style={{ color: tokens.colorTextOnSurface }}>{label}</Text>
      <Text style={{ color: tokens.colorTextOnSurface, fontWeight: bold ? "700" : "400" }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
});
