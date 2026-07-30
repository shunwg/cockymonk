import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../config/theme";
import { Button } from "../shared/Button";
import { Card } from "../shared/Card";
import { Mascot } from "../shared/Mascot";

export function HowToPlayScreen({ onDone }: { onDone: () => void }) {
  const { tokens } = useTheme();
  return (
    <View style={styles.screen}>
      <Mascot />
      <Card>
        <Text style={[styles.h2, { color: tokens.colorTextOnSurface, fontFamily: tokens.fontDisplay }]}>
          Slik spiller du
        </Text>
        <Text style={{ color: tokens.colorTextOnSurface, lineHeight: 22 }}>
          Hver dag skriver du falske definisjoner på 3 nye ord, og gjetter den ekte definisjonen blant andres bløffer
          på gårsdagens ord. Du får poeng for riktige gjett og for å lure andre — og en liten bonus for å være med
          flere dager på rad.
        </Text>
      </Card>
      <Button title="Skjønner, sett i gang" onPress={onDone} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, gap: 20, justifyContent: "center" },
  h2: { fontSize: 22, fontWeight: "600", marginBottom: 12 },
});
