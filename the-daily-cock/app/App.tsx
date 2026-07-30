import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ThemeProvider, useTheme } from "./src/config/theme";
import { clearIdentity, hasStoredIdentity, loadOrCreateIdentity, saveIdentity } from "./src/lib/identity";
import { storageRemote } from "./src/lib/storageRemote";
import type { Identity, Profile, TodayState } from "./src/lib/types";
import { resumeFlowFromState, suggestName, type ScreenState } from "./src/services/gameSession";

import { NameScreen } from "./src/screens/Onboarding/NameScreen";
import { HowToPlayScreen } from "./src/screens/Onboarding/HowToPlayScreen";
import { WelcomeScreen } from "./src/screens/Onboarding/WelcomeScreen";
import { ReadyScreen } from "./src/screens/Ready/ReadyScreen";
import { WriteRecapScreen } from "./src/screens/Ready/WriteRecapScreen";
import { GuessWordScreen } from "./src/screens/Guess/GuessWordScreen";
import { ScoreScreen } from "./src/screens/Guess/ScoreScreen";
import { WriteWordScreen } from "./src/screens/Write/WriteWordScreen";
import { DoneScreen } from "./src/screens/Done/DoneScreen";
import { TimeoutScreen } from "./src/screens/shared/TimeoutScreen";
import { Header } from "./src/screens/shared/Header";
import { FooterSettingsBar } from "./src/screens/shared/FooterSettingsBar";
import { SettingsModal } from "./src/screens/shared/SettingsModal";

const store = storageRemote();

// A JS error must never be able to kill the app at boot — same defensive
// pattern as ordkrig/App.tsx's RootErrorBoundary.
class RootErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <SafeAreaView style={styles.errRoot}>
          <ScrollView contentContainerStyle={styles.errWrap}>
            <Text style={styles.errHead}>Noe gikk galt 🛠</Text>
            <Text style={styles.errBody}>{String(this.state.error?.message ?? this.state.error)}</Text>
          </ScrollView>
        </SafeAreaView>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [fontsLoaded] = useFonts({ Fredoka: require("./assets/fonts/Fredoka.ttf") });
  const [bootKey, setBootKey] = useState(0);

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <RootErrorBoundary>
          <AppInner key={bootKey} onRequestFullReset={() => setBootKey((k) => k + 1)} />
        </RootErrorBoundary>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function AppInner({ onRequestFullReset }: { onRequestFullReset: () => void }) {
  const { tokens } = useTheme();
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [screen, setScreen] = useState<ScreenState>({ kind: "boot" });
  const [headerProfile, setHeaderProfile] = useState<Profile | null>(null);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const sessionGenRef = useRef(0);

  useEffect(() => {
    boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function boot() {
    sessionGenRef.current += 1;
    const hadIdentity = await hasStoredIdentity();
    const id = await loadOrCreateIdentity(suggestName());
    setIdentity(id);

    if (!hadIdentity) {
      setScreen({ kind: "name", suggestedName: id.displayName });
      return;
    }
    await store.ensureProfile(id.userId, id.displayName);
    await enterApp(id);
  }

  async function enterApp(id: Identity) {
    const state = await store.getToday(id.userId);
    setHeaderProfile(state.profile);
    if (state.recap) {
      setScreen({ kind: "writeRecap", recap: state.recap, profile: state.profile });
    } else {
      setScreen({ kind: "ready", state });
    }
  }

  // Shared by Welcome/Ready's onStart — mirrors ui.js's
  // `resumeFlowFromState`, which sets the header immediately (not deferred)
  // before deciding the next screen.
  function goToResumedScreen(state: TodayState) {
    setHeaderProfile(state.profile);
    setScreen(resumeFlowFromState(state));
  }

  async function handleNameDone(displayName: string) {
    if (!identity) return;
    const updated: Identity = { ...identity, displayName };
    setIdentity(updated);
    await saveIdentity(updated);
    await store.ensureProfile(updated.userId, displayName);
    setScreen({ kind: "howToPlay", displayName });
  }

  async function handleHowToPlayDone(displayName: string) {
    if (!identity) return;
    const state = await store.getToday(identity.userId);
    setScreen({ kind: "welcome", displayName, state });
  }

  async function handleWriteRecapContinue() {
    if (!identity) return;
    await store.ackRecap(identity.userId);
    const fresh = await store.getToday(identity.userId);
    setHeaderProfile(fresh.profile);
    setScreen({ kind: "ready", state: fresh });
  }

  async function handleResetConfirmed() {
    if (!identity) return;
    await store.resetPlayer(identity.userId);
    await clearIdentity();
    setSettingsVisible(false);
    onRequestFullReset();
  }

  if (!identity || screen.kind === "boot") return null;

  return (
    <View style={[styles.app, { backgroundColor: tokens.colorBg }]}>
      <StatusBar style="auto" />
      <Header profile={headerProfile} />
      <View style={styles.content}>
        {screen.kind === "name" && <NameScreen startingName={screen.suggestedName} onDone={handleNameDone} />}

        {screen.kind === "howToPlay" && (
          <HowToPlayScreen onDone={() => handleHowToPlayDone(screen.displayName)} />
        )}

        {screen.kind === "welcome" && (
          <WelcomeScreen
            displayName={screen.displayName}
            profile={screen.state.profile}
            onStart={() => goToResumedScreen(screen.state)}
          />
        )}

        {screen.kind === "ready" && (
          <ReadyScreen profile={screen.state.profile} onStart={() => goToResumedScreen(screen.state)} />
        )}

        {screen.kind === "writeRecap" && (
          <WriteRecapScreen recap={screen.recap} profile={screen.profile} onContinue={handleWriteRecapContinue} />
        )}

        {screen.kind === "guess" && (
          <GuessWordScreen
            state={screen.state}
            store={store}
            userId={identity.userId}
            onActionResult={async (res) => {
              if (res.guessResult) {
                setScreen({ kind: "score", result: res.guessResult });
              } else {
                const fresh = await store.getToday(identity.userId);
                setScreen({ kind: "guess", state: fresh });
              }
            }}
            onTimeout={(wordId) => setScreen({ kind: "timeoutGuess", state: screen.state, wordId })}
            onAllGuessed={async () => {
              const fresh = await store.getToday(identity.userId);
              setScreen({ kind: "write", state: fresh, skippedIds: [] });
            }}
          />
        )}

        {screen.kind === "timeoutGuess" && (
          <TimeoutScreen
            kind="guess"
            onNext={async () => {
              const res = await store.skipGuess(identity.userId, screen.wordId);
              if (!res.ok) return;
              if (res.guessResult) {
                setScreen({ kind: "score", result: res.guessResult });
              } else {
                const fresh = await store.getToday(identity.userId);
                setScreen({ kind: "guess", state: fresh });
              }
            }}
          />
        )}

        {screen.kind === "score" && (
          <ScoreScreen
            result={screen.result}
            sessionGen={sessionGenRef.current}
            getSessionGen={() => sessionGenRef.current}
            onRevealComplete={setHeaderProfile}
            onContinue={async () => {
              const fresh = await store.getToday(identity.userId);
              setScreen({ kind: "write", state: fresh, skippedIds: [] });
            }}
          />
        )}

        {screen.kind === "write" && (
          <WriteWordScreen
            state={screen.state}
            skippedIds={screen.skippedIds}
            store={store}
            userId={identity.userId}
            onSubmitted={(fresh) => setScreen({ kind: "write", state: fresh, skippedIds: screen.skippedIds })}
            onTimeout={(wordId) => setScreen({ kind: "timeoutWrite", state: screen.state, skippedIds: screen.skippedIds, wordId })}
            onAllWritten={async () => {
              const fresh = await store.getToday(identity.userId);
              setScreen({ kind: "done", state: fresh });
            }}
          />
        )}

        {screen.kind === "timeoutWrite" && (
          <TimeoutScreen
            kind="write"
            onNext={() =>
              setScreen({ kind: "write", state: screen.state, skippedIds: [...screen.skippedIds, screen.wordId] })
            }
          />
        )}

        {screen.kind === "done" && (
          <DoneScreen
            state={screen.state}
            sessionGen={sessionGenRef.current}
            getSessionGen={() => sessionGenRef.current}
            onRevealComplete={setHeaderProfile}
          />
        )}
      </View>
      <FooterSettingsBar onPress={() => setSettingsVisible(true)} />
      <SettingsModal
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
        onResetConfirmed={handleResetConfirmed}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1 },
  content: { flex: 1, padding: 20 },
  errRoot: { flex: 1 },
  errWrap: { padding: 20, gap: 12 },
  errHead: { fontSize: 22, fontWeight: "700" },
  errBody: { fontSize: 14 },
});
