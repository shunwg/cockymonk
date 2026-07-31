import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../../config/theme";

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { tokens } = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: tokens.colorSurface, borderColor: tokens.colorBorder, borderRadius: tokens.radiusCard },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 2,
    padding: 20,
  },
});
