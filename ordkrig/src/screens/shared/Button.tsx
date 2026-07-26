import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import { colors, opacity, radius, sizes } from '../../config/theme';
import { useDesign } from '../../config/designs';

interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}

/** Word War 1-knapp: sort fyll, hvit omkrets, hvit tekst, pilleform. */
export function Button({ label, onPress, disabled, loading, style }: ButtonProps) {
  const design = useDesign();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: design.background, borderColor: design.outline },
        (disabled || loading) && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={design.text} />
      ) : (
        <Text style={[styles.label, { color: design.text }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: '100%',
    height: sizes.mainPillHeight,
    borderRadius: radius.pill,
    borderWidth: sizes.borderWidth,
    borderColor: colors.outline,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: opacity.sterkt },
  pressed: { opacity: 0.7 },
  label: { fontSize: 17, fontWeight: '600', color: colors.text },
});
