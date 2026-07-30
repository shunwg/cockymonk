import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../../config/theme";

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({ title, onPress, variant = "primary", disabled, style }: ButtonProps) {
  const { tokens } = useTheme();
  const bg =
    variant === "primary" ? tokens.colorAccentTurn : variant === "danger" ? tokens.colorAccentBluff : tokens.colorSurface;
  const color = variant === "secondary" ? tokens.colorTextOnSurface : tokens.colorInkNight;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        {
          backgroundColor: bg,
          borderColor: tokens.colorBorder,
          opacity: disabled ? 0.5 : 1,
          transform: pressed ? [{ translateY: 4 }] : [{ translateY: 0 }],
        },
        style,
      ]}
    >
      <Text style={[styles.label, { color, fontFamily: tokens.fontDisplay }]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderWidth: 2,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: "center",
    width: "100%",
  },
  label: {
    fontWeight: "600",
    fontSize: 17,
  },
});
