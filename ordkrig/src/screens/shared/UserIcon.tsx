import { StyleSheet, View } from 'react-native';
import { sizes } from '../../config/theme';
import { useDesign } from '../../config/designs';

interface UserIconProps {
  size?: number;
  /** Vis ringen rundt (false når ikonet ligger inne i en pille – unngår ring-i-ring). */
  ring?: boolean;
  color?: string;
}

/**
 * Generisk brukerikon (avatar) bygget av View-er – hode + skuldre inne i en ring.
 * Brukes både i toppfeltet og som stemme-markør. (SVG-versjon når vi tar et native-bygg.)
 */
export function UserIcon({ size = 22, ring = true, color }: UserIconProps) {
  const design = useDesign();
  const c = color ?? design.text;
  return (
    <View
      style={[
        styles.frame,
        { width: size, height: size, borderRadius: size / 2 },
        ring && { borderWidth: Math.max(1.3, size * 0.07), borderColor: c },
      ]}
    >
      <View
        style={{
          width: size * 0.34,
          height: size * 0.34,
          borderRadius: size * 0.17,
          backgroundColor: c,
          marginTop: size * 0.17,
        }}
      />
      <View
        style={{
          width: size * 0.62,
          height: size * 0.5,
          borderTopLeftRadius: size * 0.31,
          borderTopRightRadius: size * 0.31,
          backgroundColor: c,
          marginTop: size * 0.05,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden', alignItems: 'center' },
});

export const ICON_BORDER = sizes.borderWidth;
