// Kind-agnostic, same as ui.js's renderTimeoutStep — the guess-vs-write
// asymmetry (guess timeout auto-records a skip; write timeout records
// nothing) lives in the CALLERS (GuessWordScreen/WriteWordScreen), not here.
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../config/theme";
import { Button } from "./Button";
import { Card } from "./Card";

export function TimeoutScreen({ kind, onNext }: { kind: "guess" | "write"; onNext: () => void }) {
  const { tokens } = useTheme();
  const text = kind === "guess" ? "Du rakk ikke å gjette" : "Du rakk ikke å skrive";

  return (
    <View style={styles.screen}>
      <Card style={styles.box}>
        <Text style={[styles.h2, { color: tokens.colorTextOnSurface, fontFamily: tokens.fontDisplay }]}>{text}</Text>
        <Text style={{ color: tokens.colorTextSecondary, fontStyle: "italic" }}>Tiden løp ut for dette ordet.</Text>
      </Card>
      <Button title="Neste" onPress={onNext} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, gap: 20, justifyContent: "center" },
  box: { alignItems: "center", gap: 8 },
  h2: { fontSize: 22, fontWeight: "600" },
});
