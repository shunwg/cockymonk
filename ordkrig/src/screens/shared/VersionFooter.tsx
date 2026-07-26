import { useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Updates from 'expo-updates';
import { useDesign } from '../../config/designs';
import { APP_VERSION } from '../../config/version';

/**
 * Tynn grå bunnlinje som viser hvilken versjon som kjører (manuelt versjonsnr +
 * publiseringstidspunkt fra expo-updates). Ser etter nye EAS-oppdateringer ved
 * oppstart og hver gang appen kommer i forgrunnen; når en ny er hentet, blir
 * linja et trykkbart «Ny versjon klar» som laster appen på nytt.
 */
function fmt(d?: Date | null): string {
  if (!d) return 'innebygd';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function VersionFooter() {
  const design = useDesign();
  const { currentlyRunning, isUpdateAvailable, isUpdatePending } = Updates.useUpdates();
  const [checking, setChecking] = useState(false);

  const check = useCallback(async () => {
    if (!Updates.isEnabled) return; // av i utviklingsmodus
    try {
      setChecking(true);
      const res = await Updates.checkForUpdateAsync();
      if (res.isAvailable) await Updates.fetchUpdateAsync();
    } catch {
      // stille – nettverk/av, prøver igjen neste forgrunn
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void check();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void check();
    });
    return () => sub.remove();
  }, [check]);

  const applyNow = useCallback(async () => {
    try {
      await Updates.reloadAsync();
    } catch {
      // ignorer – linja blir stående til neste forsøk
    }
  }, []);

  if (isUpdatePending) {
    return (
      <Pressable onPress={applyNow} style={styles.bar} hitSlop={8}>
        <Text style={[styles.newText, { color: design.text }]}>Ny versjon klar – trykk for å oppdatere</Text>
      </Pressable>
    );
  }

  const created = currentlyRunning?.createdAt ?? null;
  const suffix = checking ? ' · ser etter ny…' : isUpdateAvailable ? ' · laster ny…' : '';
  return (
    <View style={styles.bar}>
      <Text style={[styles.text, { color: design.textDim }]}>{`Ordkrig v${APP_VERSION} · ${fmt(created)}${suffix}`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingVertical: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { fontSize: 10, opacity: 0.45 },
  newText: { fontSize: 11, fontWeight: '600', opacity: 0.9 },
});
