// Ports ui.js's openSettingsPanel/openResetConfirm: two panes (settings,
// then a mandatory confirm step before reset — never a direct-delete
// button). RN has no location.reload(); the reset flow's actual "start
// over" is done by the caller bumping a root remount key (see App.tsx).
import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../config/theme";
import { Button } from "./Button";

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
  onResetConfirmed: () => void;
}

export function SettingsModal({ visible, onClose, onResetConfirmed }: SettingsModalProps) {
  const { tokens, themeName, toggleTheme } = useTheme();
  const [confirming, setConfirming] = useState(false);

  function handleClose() {
    setConfirming(false);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable style={styles.overlay} onPress={handleClose}>
        <Pressable
          style={[styles.card, { backgroundColor: tokens.colorSurface, borderColor: tokens.colorBorder }]}
          onPress={(e) => e.stopPropagation()}
        >
          {!confirming ? (
            <>
              <Text style={[styles.title, { color: tokens.colorTextOnSurface, fontFamily: tokens.fontDisplay }]}>
                Innstillinger
              </Text>
              <Button
                title={themeName === "light" ? "Bytt til mørkt tema" : "Bytt til lyst tema"}
                variant="secondary"
                onPress={toggleTheme}
              />
              <Text style={[styles.note, { color: tokens.colorTextSecondary }]}>
                Dette nullstiller kun din egen spiller på denne enheten — andre som spiller påvirkes ikke.
              </Text>
              <Button title="Nullstill spillet mitt" variant="danger" onPress={() => setConfirming(true)} />
              <Button title="Lukk" variant="secondary" onPress={handleClose} />
            </>
          ) : (
            <>
              <Text style={[styles.title, { color: tokens.colorTextOnSurface, fontFamily: tokens.fontDisplay }]}>
                Er du sikker?
              </Text>
              <Text style={[styles.note, { color: tokens.colorTextSecondary }]}>
                Alle dine poeng, streaken din og bløffene dine forsvinner for godt. Dette kan ikke angres.
              </Text>
              <Button title="Ja, nullstill" variant="danger" onPress={onResetConfirmed} />
              <Button title="Avbryt" variant="secondary" onPress={() => setConfirming(false)} />
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 20 },
  card: { width: "100%", maxWidth: 400, borderWidth: 2, borderRadius: 22, padding: 20, gap: 12 },
  title: { fontSize: 22, fontWeight: "600" },
  note: { fontStyle: "italic" },
});
