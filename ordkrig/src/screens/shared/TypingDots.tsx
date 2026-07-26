import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useDesign } from '../../config/designs';

/** Tre animerte prikker – som skrivebobla i Meldinger. Beveger seg mens `active`. */
export function TypingDots({ active = true, color }: { active?: boolean; color?: string }) {
  const design = useDesign();
  const dotColor = color ?? design.text;
  const d0 = useRef(new Animated.Value(0)).current;
  const d1 = useRef(new Animated.Value(0)).current;
  const d2 = useRef(new Animated.Value(0)).current;
  const dots = [d0, d1, d2];

  useEffect(() => {
    if (!active) {
      dots.forEach((d) => d.stopAnimation(() => d.setValue(0)));
      return;
    }
    const anims = dots.map((d, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(d, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(d, { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.delay((2 - i) * 150 + 200),
        ])
      )
    );
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return (
    <View style={styles.row}>
      {dots.map((d, i) => (
        <Animated.View
          key={i}
          style={[
            styles.dot,
            { backgroundColor: dotColor },
            {
              opacity: d.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
              transform: [{ translateY: d.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) }],
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
