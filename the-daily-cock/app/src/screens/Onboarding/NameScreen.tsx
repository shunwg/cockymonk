import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { useTheme } from "../../config/theme";
import { Button } from "../shared/Button";
import { Card } from "../shared/Card";
import { Mascot } from "../shared/Mascot";

export function NameScreen({ startingName, onDone }: { startingName: string; onDone: (displayName: string) => void }) {
  const { tokens } = useTheme();
  const [name, setName] = useState(startingName);

  return (
    <View style={styles.screen}>
      <Mascot />
      <Text style={[styles.eyebrow, { color: tokens.colorTextSecondary }]}>Frykt Nesen</Text>
      <Text style={[styles.h1, { color: tokens.colorTextOnBg, fontFamily: tokens.fontDisplay }]}>The Daily Cock</Text>
      <Card>
        <Text style={[styles.h2, { color: tokens.colorTextOnSurface, fontFamily: tokens.fontDisplay }]}>
          Velg brukernavnet ditt
        </Text>
        <TextInput
          value={name}
          onChangeText={setName}
          style={[styles.input, { borderColor: tokens.colorBorder, color: tokens.colorTextOnSurface }]}
        />
        <Text style={[styles.note, { color: tokens.colorTextSecondary }]}>Du kan endre det senere.</Text>
      </Card>
      <Button title="Fortsett" onPress={() => onDone(name.trim() || startingName)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, gap: 20, justifyContent: "center", alignItems: "center" },
  eyebrow: { textTransform: "uppercase", letterSpacing: 2, fontSize: 12, fontWeight: "700" },
  h1: { fontSize: 32, fontWeight: "700" },
  h2: { fontSize: 22, fontWeight: "600", marginBottom: 12 },
  input: { borderWidth: 2, borderRadius: 16, padding: 12, fontSize: 17, width: 240 },
  note: { marginTop: 8, fontStyle: "italic" },
});
