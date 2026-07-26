import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '../shared/Button';
import { UserIcon } from '../shared/UserIcon';
import { colors, sizes, spacing, typography } from '../../config/theme';
import { joinableGameExists } from '../../services/roomService';
import { useDesign } from '../../config/designs';
import { useLeague, useStrings } from '../../config/i18n';

interface HomeScreenProps {
  username: string;
  onOpenProfile: () => void;
  onPlayOnline: () => void;
  onPlayHome: () => void;
  onJoinOngoing: () => void;
}

export function HomeScreen({ username, onOpenProfile, onPlayOnline, onPlayHome, onJoinOngoing }: HomeScreenProps) {
  // Puls: fins et pågående spill man kan hoppe inn i? (bot å overta + ikke helt
  // på tampen av en fase). Knappen nederst lyser opp når svaret er ja.
  const design = useDesign();
  const league = useLeague();
  const t = useStrings();
  const [canHopIn, setCanHopIn] = useState(false);
  useEffect(() => {
    let alive = true;
    const check = () =>
      joinableGameExists(league)
        .then((v) => alive && setCanHopIn(v))
        .catch(() => {});
    check();
    const id = setInterval(check, 4_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [league]);

  return (
    <View style={[styles.container, { backgroundColor: design.background }]}>
      <Pressable style={styles.userbar} onPress={onOpenProfile} hitSlop={10}>
        <UserIcon size={22} />
        <Text style={[styles.username, { color: design.text }]}>{username}</Text>
      </Pressable>

      <Text style={[styles.brand, { color: design.text }]}>Word War 1</Text>

      <View style={styles.buttons}>
        <Button label={t.playOnline} onPress={onPlayOnline} />
        <Button label={t.playHome} onPress={onPlayHome} />
      </View>

      <View style={styles.spacer} />

      <Pressable
        disabled={!canHopIn}
        onPress={onJoinOngoing}
        style={[styles.hopin, { backgroundColor: design.soft }, canHopIn && { backgroundColor: design.track }]}
        hitSlop={8}
      >
        <Text style={[styles.hopinText, { color: design.textDim }, canHopIn && { color: design.text }]}>
          {t.hopIn}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  userbar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: spacing.sm, paddingLeft: sizes.edge - spacing.lg },
  username: { ...typography.caption, color: colors.text, fontWeight: '600' },
  brand: { ...typography.title, fontSize: 42, textAlign: 'center', marginTop: 92 },
  buttons: { width: '100%', gap: 16, marginTop: 120 },
  comingSoon: { ...typography.caption, color: colors.textSecondary, textAlign: 'center', marginTop: 6 },
  spacer: { flex: 1 },
  // Liten, nedtonet knapp nederst: mørk grå når inaktiv, lysere når et spill kan tas
  hopin: {
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  hopinActive: { backgroundColor: 'rgba(255,255,255,0.18)' },
  hopinText: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.30)' },
  hopinTextActive: { color: colors.text },
});
