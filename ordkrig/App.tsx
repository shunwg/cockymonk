import { Component, ReactNode, useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, ScrollView, StyleSheet, Text } from 'react-native';
import { HomeScreen } from './src/screens/Home/HomeScreen';
import { OnlineGameScreen } from './src/screens/online/OnlineGameScreen';
import { HomeGameScreen } from './src/screens/homegame/HomeGameScreen';
import { ProfileScreen } from './src/screens/Profile/ProfileScreen';
import { OnboardingName } from './src/screens/shared/OnboardingName';
import { VersionFooter } from './src/screens/shared/VersionFooter';
import { displayName, ensureAutoUsername, loadProfile } from './src/services/profileStore';
import { restoreIdentity } from './src/lib/persistentIdentity';
import { loadWordUsage } from './src/services/wordUsage';
import { loadDesignChoice, useDesign } from './src/config/designs';
import { loadLeagueChoice, useLeague } from './src/config/i18n';
import { colors } from './src/config/theme';

type Screen = 'home' | 'online-game' | 'online-hopin' | 'home-game' | 'profile';

/**
 * FEILMUR: en JS-feil skal ALDRI kunne drepe appen ved oppstart (det utløser
 * expo-updates' feilgjenoppretting som selv krasjer native → SIGABRT, jf.
 * bygg 6/7). I stedet vises feilen på skjermen – og forteller oss nøyaktig
 * hvor den bor.
 */
class RootErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <SafeAreaView style={styles.root}>
          <ScrollView contentContainerStyle={styles.errWrap}>
            <Text style={styles.errHead}>Noe gikk galt 🛠</Text>
            <Text style={styles.errBody}>{String(this.state.error?.message ?? this.state.error)}</Text>
            <Text style={styles.errBody}>{String((this.state.error as Error & { stack?: string })?.stack ?? '').slice(0, 1200)}</Text>
          </ScrollView>
        </SafeAreaView>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <RootErrorBoundary>
      <AppInner />
    </RootErrorBoundary>
  );
}

function AppInner() {
  const [screen, setScreen] = useState<Screen>('home');
  const [username, setUsername] = useState('SuperDuper');
  const design = useDesign();
  const league = useLeague();
  const [bootReady, setBootReady] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  useEffect(() => {
    (async () => {
      // Keychain-gjenoppretting FØRST: etter re-installasjon hentes samme
      // bruker-id + brukernavn + statistikk tilbake før navnelogikken kjører.
      await restoreIdentity();
      void loadDesignChoice();
      void loadLeagueChoice();
      void loadWordUsage();
      setBootReady(true);
    })();
  }, []);

  // Liga-bevisst navn: engelsk liga har eget kallenavn (kreves ved første bytte)
  useEffect(() => {
    if (!bootReady) return;
    loadProfile().then((p) => {
      setUsername(displayName(p, league));
      setNeedsOnboarding(!p.onboarded); // navnevalg-slør ved første oppstart
    });
    ensureAutoUsername(league).then((name) => name && setUsername(name)).catch(() => {});
  }, [bootReady, league]);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: design.background }]}>
      {screen === 'home' && (
        <HomeScreen
          username={username}
          onOpenProfile={() => setScreen('profile')}
          onPlayOnline={() => setScreen('online-game')}
          onPlayHome={() => setScreen('home-game')}
          onJoinOngoing={() => setScreen('online-hopin')}
        />
      )}

      {screen === 'profile' && (
        <ProfileScreen onBack={() => setScreen('home')} onUsernameChange={setUsername} />
      )}

      {screen === 'online-game' && <OnlineGameScreen username={username} onExit={() => setScreen('home')} />}

      {screen === 'online-hopin' && (
        <OnlineGameScreen mode="hopin" username={username} onExit={() => setScreen('home')} />
      )}

      {screen === 'home-game' && <HomeGameScreen onExit={() => setScreen('home')} />}

      {bootReady && needsOnboarding && screen === 'home' && (
        <OnboardingName
          assigned={username}
          onDone={(name) => {
            setUsername(name);
            setNeedsOnboarding(false);
          }}
        />
      )}

      <VersionFooter />
      <StatusBar style={design.statusBar} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  errWrap: { padding: 24, gap: 12 },
  errHead: { color: colors.text, fontSize: 20, fontWeight: '700', marginTop: 40 },
  errBody: { color: colors.textSecondary, fontSize: 12, fontFamily: 'Menlo' },
});
