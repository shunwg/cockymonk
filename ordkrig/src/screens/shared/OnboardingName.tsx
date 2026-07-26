import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { useDesign } from '../../config/designs';
import { useLeague, useStrings } from '../../config/i18n';
import { claimSpecificUsername } from '../../services/roomService';
import { markOnboarded, setUsername } from '../../services/profileStore';
import { Button } from './Button';

/**
 * NAVNEVALG-SLØR ved første oppstart: minimalistisk lag over hjemskjermen.
 * Det tildelte navnet står i grått og viker når man skriver sitt eget.
 * Egne navn sjekkes mot claimed_usernames (ingen dubletter). Valget her
 * bruker IKKE opp den ene endringen man har i profilmenyen.
 */
export function OnboardingName({ assigned, onDone }: { assigned: string; onDone: (name: string) => void }) {
  const design = useDesign();
  const league = useLeague();
  const t = useStrings();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [taken, setTaken] = useState(false);

  const submit = async () => {
    const wanted = typed.trim();
    setTaken(false);
    // Tomt felt (eller samme navn) → behold det tildelte
    if (!wanted || wanted === assigned) {
      await markOnboarded();
      onDone(assigned);
      return;
    }
    setBusy(true);
    const res = await claimSpecificUsername(wanted);
    if (res === 'taken') {
      setBusy(false);
      setTaken(true);
      return;
    }
    await setUsername(wanted, league, false); // låser IKKE – én endring gjenstår
    await markOnboarded();
    setBusy(false);
    onDone(wanted);
  };

  return (
    <View style={[StyleSheet.absoluteFill, styles.veil, { backgroundColor: design.background }]}>
      <KeyboardAvoidingView
        style={styles.center}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Text style={[styles.label, { color: design.textDim }]}>{t.chooseName}</Text>
        <TextInput
          style={[styles.input, { color: design.text, borderBottomColor: design.outline }]}
          value={typed}
          onChangeText={(v) => {
            setTyped(v);
            setTaken(false);
          }}
          placeholder={assigned}
          placeholderTextColor={design.textDim}
          autoFocus
          maxLength={16}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="done"
          onSubmitEditing={submit}
        />
        <Text style={[styles.note, taken ? styles.noteError : null, { color: taken ? '#e5484d' : design.textDim }]}>
          {taken ? t.nameTaken : t.nameNote}
        </Text>
        <View style={styles.btn}>
          <Button label={t.continueLabel} onPress={submit} loading={busy} />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  veil: { zIndex: 50 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 },
  label: { fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 18 },
  input: {
    width: '100%',
    borderBottomWidth: 1.5,
    fontSize: 26,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 10,
  },
  note: { fontSize: 12.5, marginTop: 14, textAlign: 'center' },
  noteError: { fontWeight: '600' },
  btn: { width: '70%', marginTop: 28 },
});
