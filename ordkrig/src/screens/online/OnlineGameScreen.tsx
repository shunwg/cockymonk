import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  AppState,
  Easing,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from 'react-native';
import { DURATIONS, LOBBY_FADE, MATCH, PAGE_FADE } from '../../config/gameConfig';
import { colors, opacity, radius, sizes, spacing, typography, verdict } from '../../config/theme';
import { computeAnswerPoints, computeRoundScores } from '../../game-engine/scoring';
import { currentRating, displayName, estimateQuitDrop, loadProfile, recordMatchComplete, recordQuit, recordRoundResult, statsForLeague } from '../../services/profileStore';
import {
  AnswerRow as DbAnswer,
  castMyVote,
  currentUserId,
  errText,
  joinOngoingRoom,
  joinOpenRoom,
  leaveRoom,
  Room,
  RoomPlayer,
  setMyReady,
  submitMyAnswer,
  subscribeGame,
  upsertMyRating,
  VoteRow,
} from '../../services/roomService';
import { useHostEngine } from './useHostEngine';
import { botSubmitMs, startTypingPattern } from '../../bots/botTiming';
import { supabase } from '../../lib/supabaseClient';
import { hapticSoft, hapticSuccess, hapticWarn, initSfx, keepAwakeOff, keepAwakeOn, playPointsSound } from '../../lib/sfx';
import { recordWordUsed } from '../../services/wordUsage';
import { useDesign } from '../../config/designs';
import { useLeague, useStrings } from '../../config/i18n';
import { UserIcon } from '../shared/UserIcon';
import { TypingDots } from '../shared/TypingDots';
import { Button } from '../shared/Button';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
const softLayout = () => LayoutAnimation.configureNext(LayoutAnimation.create(420, 'easeInEaseOut', 'opacity'));

const NORMALIZE = /\s*\n+\s*/g;
const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// Monoton rangering av en romtilstand (runde↑, deretter fase-rekkefølge). Brukes
// til å IGNORERE forsinkede/utdaterte realtime-oppdateringer som ellers kaster
// fasen bakover et øyeblikk (→ grå ord/boks på skrivesiden).
const PHASE_RANK: Record<string, number> = { MATCHMAKING: 0, WRITING: 1, VOTING: 2, REVEAL: 3, FINISHED: 4 };
const roomRank = (r: Room | null) => (r ? r.round_number * 10 + (PHASE_RANK[r.phase] ?? 0) : -1);

type View_ = 'LOBBY' | 'WRITING' | 'VOTING' | 'REVEAL' | 'FINALE';

/**
 * ONLINE-SPILLET (Fase 1b): samme polerte UI som lokalspillet, men drevet av
 * rommet i Supabase. Matchmaking-siden ER lobbyen; botter fyller tomme plasser
 * (verten legger dem inn som rader – ingen ser forskjell). Verten driver
 * fasene via useHostEngine; alle klienter rendrer samme abonnerte tilstand.
 */
export function OnlineGameScreen({
  username,
  onExit,
  mode = 'match',
}: {
  username: string;
  onExit: () => void;
  /** 'match' = vanlig matchmaking; 'hopin' = hopp inn i pågående spill (venter til neste runde) */
  mode?: 'match' | 'hopin';
}) {
  const design = useDesign();
  const league = useLeague();
  const t = useStrings();
  const [conn, setConn] = useState<'connecting' | 'ingame' | 'error'>('connecting');
  const [connError, setConnError] = useState('');
  const [roomId, setRoomId] = useState<string | null>(null);

  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<RoomPlayer[]>([]);
  const [answers, setAnswers] = useState<DbAnswer[]>([]);
  const [votes, setVotes] = useState<VoteRow[]>([]);
  const [readError, setReadError] = useState('');

  const [answerText, setAnswerText] = useState('');
  const [sentLocally, setSentLocally] = useState(false);
  const [pendingVote, setPendingVote] = useState<string | null>(null);
  const [votedLocally, setVotedLocally] = useState<string | null>(null);
  const [readyPressed, setReadyPressed] = useState(false);
  const [revealedScores, setRevealedScores] = useState(false);
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  const [trackW, setTrackW] = useState(0); // målt bredde på tidsbaren (til scaleX)

  const me = currentUserId();
  const roomRef = useRef(room);
  roomRef.current = room;
  const readyPressedRef = useRef(readyPressed);
  readyPressedRef.current = readyPressed;
  const joinedOnceRef = useRef(false);
  const exitedRef = useRef(false);
  const refreshAllRef = useRef<() => void>(() => {});

  // Skriveprikker: hvem "skriver" nå (uid → sist sett). Mennesker via broadcast,
  // botter via lokalt fake-mønster. Kun kosmetikk – levert-status er sannheten.
  const [typingMap, setTypingMap] = useState<Record<string, number>>({});
  const typingChRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastTypingSentRef = useRef(0);
  const typingOffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Global tilstedeværelse: hvor mange ekte spillere SØKER spill akkurat nå (er i
  // matchmaking). Verten bruker dette til å fylle botter tidlig når INGEN andre er
  // online (solo), men vente hele vinduet hvis noen andre kan koble seg på.
  const [onlineSeekers, setOnlineSeekers] = useState(1);
  const seekerChRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const seekingRef = useRef(true);

  // Varselpuls nær slutt: ALARM-aktig ul – sterk fra start, kontinuerlig
  // sinusbølge (myke overganger) som aldri hviler helt, som en sirene.
  const WARN_WINDOW_MS = 5_000;
  const WARN_PEAK = 0.5; // toppen av ulet
  const WARN_TROUGH = 0.06; // bunnen – slipper aldri helt til sort (alarmfølelse)
  const WARN_HALF_CYCLE_MS = 330; // halv ule-syklus (opp eller ned)
  const flashWarn = useRef(new Animated.Value(0)).current;
  const warnActiveRef = useRef(false);

  const runWarnPulse = useCallback(() => {
    if (!warnActiveRef.current) return;
    const r = roomRef.current;
    const ends = r?.phase_ends_at ? Date.parse(r.phase_ends_at) : null;
    const remaining = ends ? ends - Date.now() : 0;
    if (remaining <= 0) {
      warnActiveRef.current = false;
      Animated.timing(flashWarn, { toValue: 0, duration: 200, useNativeDriver: true }).start();
      return;
    }
    Animated.sequence([
      Animated.timing(flashWarn, { toValue: WARN_PEAK, duration: WARN_HALF_CYCLE_MS, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(flashWarn, { toValue: WARN_TROUGH, duration: WARN_HALF_CYCLE_MS, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]).start(() => runWarnPulse());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const youSubmittedRef = useRef(false);
  const confirmedVoteRef = useRef<string | null>(null);
  const myVoteVibratedRef = useRef(0);
  const revealVibratedRef = useRef(0);
  const guessStreakRef = useRef(0); // riktige gjett PÅ RAD i denne kampen (til rating)
  const myFirstRoundRef = useRef(0); // første runde JEG deltok i (hopp-inn teller fra der)
  const [quitDrop, setQuitDrop] = useState(0); // ratingtap vist i forlat-dialogen

  // Uspilte runder JEG har forpliktet meg til (0 = ingen straff: før kampstart,
  // som ventende, eller etter fullført kamp)
  const remainingRounds = useCallback(() => {
    const r = roomRef.current;
    if (!r || r.phase === 'FINISHED' || r.phase === 'MATCHMAKING') return 0;
    if (myFirstRoundRef.current === 0) return 0; // aldri deltatt (f.eks. ventende)
    const done = Math.max(accountedRef.current, myFirstRoundRef.current - 1);
    return Math.max(0, MATCH.rounds - done);
  }, []);

  const safeExit = useCallback(() => {
    if (exitedRef.current) return;
    exitedRef.current = true;
    // Frafall midt i kampen → straffetrapp × tidlighet (mild, eskalerende)
    const remAtExit = remainingRounds();
    if (remAtExit > 0) {
      void recordQuit(remAtExit, league).then(async () => {
        const p = await loadProfile();
        const r = currentRating(p, league);
        if (r != null) void upsertMyRating(displayName(p, league), r, statsForLeague(p, league).rounds, league);
      });
    }
    if (roomRef.current) leaveRoom(roomRef.current.id).catch(() => {});
    onExit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Bli med i rom + abonner ----
  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | null = null;
    (async () => {
      try {
        // Hopp-inn: prøv pågående spill først; lukket vinduet seg akkurat,
        // fall rolig tilbake til vanlig matchmaking.
        const id =
          mode === 'hopin'
            ? (await joinOngoingRoom(username, league)) ?? (await joinOpenRoom(username, league))
            : await joinOpenRoom(username, league);
        if (cancelled) {
          leaveRoom(id).catch(() => {});
          return;
        }
        setRoomId(id);
        setConn('ingame');
        const sub = subscribeGame(id, {
          // Ignorer eldre rom-snapshots (monoton vakt) – hindrer fase-tilbakehopp
          onRoom: (incoming) => setRoom((prev) => (roomRank(incoming) < roomRank(prev) ? prev : incoming)),
          onPlayers: setPlayers,
          onAnswers: setAnswers,
          onVotes: setVotes,
          onError: (where, msg) => setReadError(`${where}: ${msg}`),
        });
        unsub = sub.unsubscribe;
        refreshAllRef.current = sub.refreshAll;
      } catch (e) {
        if (!cancelled) {
          setConn('error');
          setConnError(errText(e));
        }
      }
    })();
    return () => {
      cancelled = true;
      unsub?.();
      if (roomRef.current && !exitedRef.current) leaveRoom(roomRef.current.id).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hent ferskt når appen våkner fra bakgrunn
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refreshAllRef.current();
    });
    return () => sub.remove();
  }, []);

  // Lyd + våken skjerm mens man er i spillet (no-op på bygg uten modulene)
  useEffect(() => {
    initSfx();
    keepAwakeOn();
    return () => keepAwakeOff();
  }, []);

  // ---- Avledet tilstand (ALT er filtrert til gjeldende runde – hindrer at
  // forrige rundes svar/stemmer lurer motoren ved rundebytte) ----
  // Aktive = i spill (ventende holdes utenfor til de aktiveres ved rundestart)
  const activePlayers = useMemo(() => players.filter((p) => !p.left_at && !p.waiting), [players]);
  // VENTENDE: hoppet inn i et PÅGÅENDE spill – ser en helt vanlig matchmaking-
  // side (bobler som "kobler på", bar som stiger) til neste runde starter.
  const iAmWaiting = useMemo(
    () => players.some((p) => p.user_id === me && !p.left_at && p.waiting),
    [players, me]
  );
  const waitingRef = useRef(iAmWaiting);
  waitingRef.current = iAmWaiting;
  const phase = room?.phase ?? 'MATCHMAKING';
  // «Søker spill» (presence): ventende i pågående spill teller IKKE – de er opptatt
  seekingRef.current = phase === 'MATCHMAKING' && !iAmWaiting;
  const round = room?.round_number ?? 0;
  // Ventende: estimert tid til NESTE rundestart (baren stiger over hele ventetiden)
  const waitEndsAt = useMemo(() => {
    if (!room?.phase_ends_at) return Date.now() + DURATIONS.matchmakingMs;
    const ends = Date.parse(room.phase_ends_at);
    if (room.phase === 'WRITING') return ends + DURATIONS.votingMs + DURATIONS.interludeMs;
    if (room.phase === 'VOTING') return ends + DURATIONS.interludeMs;
    return ends;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.phase, room?.phase_ends_at]);
  const roundAnswers = useMemo(() => answers.filter((a) => a.round_number === round), [answers, round]);
  const roundVotes = useMemo(() => votes.filter((v) => v.round_number === round), [votes, round]);
  const myAnswerRow = useMemo(() => roundAnswers.find((a) => a.author_id === me), [roundAnswers, me]);
  const youSubmitted = sentLocally || (!!myAnswerRow && !myAnswerRow.is_empty);
  const myVoteRow = useMemo(() => roundVotes.find((v) => v.voter_id === me), [roundVotes, me]);
  const confirmedVote = votedLocally ?? myVoteRow?.answer_id ?? null;
  youSubmittedRef.current = youSubmitted;
  confirmedVoteRef.current = confirmedVote;

  const votesByAnswer = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const v of roundVotes) (m[v.answer_id] ??= []).push(v.voter_id);
    return m;
  }, [roundVotes]);
  const roundScores = useMemo(
    () => computeRoundScores(activePlayers.map((p) => p.user_id), roundAnswers, votesByAnswer),
    [activePlayers, roundAnswers, votesByAnswer]
  );
  const answerPoints = useMemo(() => computeAnswerPoints(roundAnswers, votesByAnswer), [roundAnswers, votesByAnswer]);

  // ---- Vertsmotoren (gjør bare noe på vertens telefon; runde-filtrerte data) ----
  useHostEngine({ roomId: roomId ?? '', myUserId: me, room, players, answers: roundAnswers, votes: roundVotes, onlineSeekers });

  // ---- Skriveprikker: broadcast-kanal for menneskers skriving (ingen DB-skriv) ----
  useEffect(() => {
    if (!roomId) return;
    const ch = supabase.channel(`typing:${roomId}`, { config: { broadcast: { self: false } } });
    ch.on('broadcast', { event: 'typing' }, ({ payload }) => {
      const { uid, on } = (payload ?? {}) as { uid?: string; on?: boolean };
      if (!uid) return;
      setTypingMap((m) => {
        const n = { ...m };
        if (on) n[uid] = Date.now();
        else delete n[uid];
        return n;
      });
    }).subscribe();
    typingChRef.current = ch;
    return () => {
      typingChRef.current = null;
      supabase.removeChannel(ch);
    };
  }, [roomId]);

  const sendTyping = (on: boolean) => {
    const ch = typingChRef.current;
    if (!ch || !me) return;
    ch.send({ type: 'broadcast', event: 'typing', payload: { uid: me, on } }).catch?.(() => {});
  };

  // ---- Global presence: tell hvor mange ekte spillere som søker spill nå ----
  useEffect(() => {
    if (!roomId || !me) return;
    const ch = supabase.channel(`seekers:${league}`, { config: { presence: { key: me } } });
    const recount = () => {
      const state = ch.presenceState() as Record<string, Array<{ seeking?: boolean }>>;
      let n = 0;
      for (const k of Object.keys(state)) if (state[k]?.some((m) => m.seeking)) n++;
      setOnlineSeekers(Math.max(1, n));
    };
    ch.on('presence', { event: 'sync' }, recount).subscribe((status) => {
      if (status === 'SUBSCRIBED') ch.track({ seeking: seekingRef.current }).catch(() => {});
    });
    seekerChRef.current = ch;
    return () => {
      seekerChRef.current = null;
      supabase.removeChannel(ch);
    };
  }, [roomId, me]);

  // Oppdater «søker»-status når fasen endres (slutter å søke idet runden starter)
  useEffect(() => {
    seekerChRef.current?.track({ seeking: phase === 'MATCHMAKING' }).catch(() => {});
  }, [phase]);

  // Botter: lokalt fake-skrivemønster mens skrivingen pågår
  useEffect(() => {
    if (phase !== 'WRITING') return;
    const bots = players.filter((p) => p.is_bot && !p.left_at);
    const stops = bots.map((b) =>
      startTypingPattern(botSubmitMs(DURATIONS.writingMs), (typing) =>
        setTypingMap((m) => {
          const n = { ...m };
          if (typing) n[b.user_id] = Date.now();
          else delete n[b.user_id];
          return n;
        })
      )
    );
    return () => stops.forEach((s) => s());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, round, players.length]);

  // Rydd utgåtte skrive-markeringer
  useEffect(() => {
    const id = setInterval(() => {
      setTypingMap((m) => {
        const now = Date.now();
        const stale = Object.keys(m).filter((k) => now - m[k] > 2_500);
        if (!stale.length) return m;
        const n = { ...m };
        for (const k of stale) delete n[k];
        return n;
      });
    }, 1_000);
    return () => clearInterval(id);
  }, []);

  // Lokal totalsum (samme på alle klienter siden alle har samme svar/stemmer)
  const [sessions, setSessions] = useState<Record<string, number>>({});
  const accountedRef = useRef(0);

  // ---- Visning (view) med overganger ----
  const targetView: View_ =
    phase === 'FINISHED'
      ? 'FINALE'
      : iAmWaiting
        ? 'LOBBY' // ventende ser alltid matchmaking-siden til de aktiveres
        : phase === 'MATCHMAKING' ? 'LOBBY' : phase === 'REVEAL' && readyPressed ? 'LOBBY' : (phase as View_);
  const [view, setView] = useState<View_>('LOBBY');
  const viewRef = useRef(view);
  viewRef.current = view;

  // Animasjoner
  const wordFade = useRef(new Animated.Value(0)).current;
  const fieldFade = useRef(new Animated.Value(0)).current;
  const contentFade = useRef(new Animated.Value(1)).current;
  const submitFade = useRef(new Animated.Value(0)).current; // send-knapp fader rolig inn
  const rosterFade = useRef(new Animated.Value(1)).current; // spillerlista fader ut før tastaturet
  const fadeInRef = useRef<Animated.CompositeAnimation | null>(null);
  const fadingRef = useRef(false);
  // Tidsbaren: ÉN sammenhengende animasjon per fase (helt jevn, ingen state-ticks)
  const barAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!room?.phase_ends_at) {
      barAnim.setValue(0);
      return;
    }
    if (room.phase === 'FINISHED') {
      barAnim.setValue(0); // finalesiden har ingen nedtelling
      return;
    }
    const ends = Date.parse(room.phase_ends_at);
    const totals: Record<string, number> = {
      MATCHMAKING: DURATIONS.matchmakingMs,
      WRITING: DURATIONS.writingMs,
      VOTING: DURATIONS.votingMs,
      REVEAL: DURATIONS.interludeMs,
    };
    const total = totals[room.phase] ?? DURATIONS.writingMs;
    const remaining = Math.max(0, Math.min(total, ends - Date.now()));
    // VENTENDE (hoppet inn i pågående spill): baren stiger rolig over HELE den
    // estimerte ventetiden fram til neste rundestart – som en lang matchmaking.
    if (iAmWaiting) {
      const totalWait = Math.max(1_000, waitEndsAt - Date.now());
      const anim = Animated.timing(barAnim, { toValue: 1, duration: totalWait, easing: Easing.linear, useNativeDriver: true });
      anim.start();
      return () => anim.stop();
    }
    // VIKTIG: ingen setValue-HOPP her – alle posisjonsskifter GLIR (~300 ms).
    // Momentane hopp (40 %→full, 50 %→0) leses som blinking.
    const draining = room.phase === 'WRITING' || room.phase === 'VOTING';
    if (draining) {
      // Mens overgangen (blink/fade) fortsatt viser forrige side: baren står
      // HELT STILLE – ingen stigning, ingen blinking.
      if ((room.phase as string) !== view) return;
      const frac = Math.min(1, Math.max(0, remaining / total));
      if (frac > 0.85) {
        // Fersk fase for alle: baren glir fullt opp idet den nye siden vises,
        // hviler et halvt sekund, og teller så ned.
        const anim = Animated.sequence([
          Animated.timing(barAnim, { toValue: 1, duration: 350, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(barAnim, {
            toValue: 0,
            duration: Math.max(200, remaining - 850),
            delay: 500,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
        ]);
        anim.start();
        return () => anim.stop();
      }
      // Hoppet inn midt i fasen: gli til SANN posisjon – identisk bar med alle
      // andre, så man ser nøyaktig hvor mye tid som er igjen.
      const anim = Animated.sequence([
        Animated.timing(barAnim, { toValue: frac, duration: 300, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(barAnim, { toValue: 0, duration: Math.max(200, remaining - 300), easing: Easing.linear, useNativeDriver: true }),
      ]);
      anim.start();
      return () => anim.stop();
    }
    // MATCHMAKING/REVEAL: gli til riktig startpunkt, stig så rolig mot full
    const startFrac = Math.min(1, Math.max(0, 1 - remaining / total));
    const anim = Animated.sequence([
      Animated.timing(barAnim, { toValue: startFrac, duration: 350, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(barAnim, {
        toValue: 1,
        duration: Math.max(200, remaining - 350),
        easing: Easing.linear,
        useNativeDriver: true, // scaleX kan native-drives → helt jevnt selv når JS er travelt
      }),
    ]);
    anim.start();
    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.phase, room?.round_number, room?.phase_ends_at, view, iAmWaiting]);

  const fadeThrough = useCallback(
    (swap: () => void) => {
      if (fadingRef.current) {
        swap();
        return;
      }
      fadingRef.current = true;
      Animated.timing(contentFade, { toValue: 0, duration: PAGE_FADE.outMs, useNativeDriver: true }).start(() => {
        swap();
        Animated.timing(contentFade, { toValue: 1, duration: PAGE_FADE.inMs, useNativeDriver: true }).start(() => {
          fadingRef.current = false;
        });
      });
    },
    [contentFade]
  );

  useEffect(() => {
    if (view === targetView) return;
    if (targetView === 'VOTING' && view === 'WRITING') {
      fadeThrough(() => setView('VOTING'));
    } else if (targetView === 'WRITING') {
      // «Gjør deg klar» skjer i lobby-visningen: ord + boks blinker hvitt (hvit →
      // svak grå → hvit) med bar-flash. Så fader spillerlista rolig ut (2 s), og
      // DERETTER hopper vi til skrivesiden (tastatur popper inn, send-knapp fader inn).
      fadeInRef.current?.stop(); // stopp lobby-faden så blinket eier verdien
      const to = (v: Animated.Value, val: number, dur: number) =>
        Animated.timing(v, { toValue: val, duration: dur, useNativeDriver: true });
      Animated.sequence([
        Animated.parallel([to(wordFade, 1, LOBBY_FADE.snapMs), to(fieldFade, 1, LOBBY_FADE.snapMs)]),
        Animated.parallel([
          to(wordFade, LOBBY_FADE.blinkLowOpacity, LOBBY_FADE.blinkStepMs),
          to(fieldFade, LOBBY_FADE.blinkLowOpacity, LOBBY_FADE.blinkStepMs),
        ]),
        Animated.parallel([
          to(wordFade, 1, LOBBY_FADE.blinkStepMs),
          to(fieldFade, 1, LOBBY_FADE.blinkStepMs),
        ]),
      ]).start(({ finished }) => {
        if (!finished || exitedRef.current) return;
        // Runde 1 (fra matchmaking): lista begynte å fade alt da rommet ble fullt
        // → kort sluttfade. Mellom runder: poengtavla får den rolige 2s-faden.
        const firstRound = (roomRef.current?.round_number ?? 1) === 1;
        Animated.timing(rosterFade, {
          toValue: 0,
          duration: firstRound ? 500 : 2_000,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }).start(({ finished: done }) => {
          if (!done || exitedRef.current) return;
          setView('WRITING');
          submitFade.setValue(0);
          Animated.timing(submitFade, { toValue: 1, duration: 4_000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }).start();
        });
      });
    } else {
      softLayout();
      setView(targetView);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetView]);

  // Sakte innfading av ord + felt i lobbyen. Runde 0: faden FØLGER tiden (hopper
  // du inn halvveis, starter den halvveis). Mellom runder (etter poengscore):
  // fade fra HELT sort igjen – samme rolige oppbygging som på matchmaking-siden.
  useEffect(() => {
    if (view !== 'LOBBY') return;
    rosterFade.setValue(1); // spillerlista er synlig igjen i lobbyen
    const total = round === 0 ? DURATIONS.matchmakingMs : DURATIONS.interludeMs;
    const ends = room?.phase_ends_at ? Date.parse(room.phase_ends_at) : null;
    const remaining = ends ? Math.max(600, ends - Date.now()) : total;
    const elapsedFrac = Math.min(1, Math.max(0, (total - remaining) / total));
    const startOpacity = round === 0 ? LOBBY_FADE.maxOpacity * elapsedFrac : 0;
    wordFade.setValue(startOpacity);
    fieldFade.setValue(startOpacity);
    const anim = Animated.parallel([
      Animated.timing(wordFade, { toValue: LOBBY_FADE.maxOpacity, duration: remaining, easing: Easing.linear, useNativeDriver: true }),
      Animated.timing(fieldFade, { toValue: LOBBY_FADE.maxOpacity, duration: remaining, easing: Easing.linear, useNativeDriver: true }),
    ]);
    fadeInRef.current = anim;
    anim.start();
    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // Første runde JEG deltar i (hopp-inn forplikter bare fra innhopps-runden)
  useEffect(() => {
    if (!iAmWaiting && round > 0 && phase !== 'FINISHED' && myFirstRoundRef.current === 0) {
      myFirstRoundRef.current = round;
    }
  }, [iAmWaiting, round, phase]);

  // FULLFØRT KAMP: mild bonus + frafalls-trappa nullstilles (én gang per kamp)
  const completedMatchRef = useRef(false);
  useEffect(() => {
    if (phase !== 'FINISHED' || completedMatchRef.current || myFirstRoundRef.current === 0) return;
    completedMatchRef.current = true;
    void recordMatchComplete(league).then(async () => {
      const p = await loadProfile();
      const r = currentRating(p, league);
      if (r != null) void upsertMyRating(displayName(p, league), r, statsForLeague(p, league).rounds, league);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Runde 0: idet SISTE spiller kobler på (rommet fullt) begynner spillerlista å
  // fade ut – overgangen kjennes i gang umiddelbart, ikke først etter blinket.
  // Blir rommet u-fullt igjen (bot kastet for et menneske), kommer lista tilbake.
  const lobbyFull = view === 'LOBBY' && round === 0 && !!room && activePlayers.length >= room.max_players;
  useEffect(() => {
    if (view !== 'LOBBY' || round !== 0) return;
    // Liten delay før utfading: lista fader over de siste ~2 sekundene FØR
    // skrivesiden starter (fullt → 1,4s stabil + blink + kort sluttfade ≈ 3,3s
    // → delay 1,5 + 2s fade lander omtrent samtidig med sidebyttet).
    Animated.timing(rosterFade, {
      toValue: lobbyFull ? 0 : 1,
      duration: lobbyFull ? 2_000 : 300,
      delay: lobbyFull ? 1_500 : 0,
      useNativeDriver: true,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lobbyFull]);

  // Logg ordet per runde (til finalesidens "beste forklaringer") + tell bruk
  // (bruks-styrt ordvalg: minst brukte ord velges neste gang)
  const roundWordsRef = useRef<Record<number, string>>({});
  useEffect(() => {
    if (room?.word && round > 0 && !roundWordsRef.current[round]) {
      roundWordsRef.current[round] = room.word;
      recordWordUsed(room.word, room.lang === 'en' ? 'en' : 'no');
    }
  }, [room?.word, round]);

  // ---- Nullstill per runde ----
  const seenRoundRef = useRef(0);
  useEffect(() => {
    if (!room) return;
    if (room.phase === 'WRITING' && room.round_number !== seenRoundRef.current) {
      seenRoundRef.current = room.round_number;
      if (room.round_number === 1) guessStreakRef.current = 0; // ny kamp → ny serie
      setAnswerText('');
      setSentLocally(false);
      setPendingVote(null);
      setVotedLocally(null);
      setReadyPressed(false);
      setRevealedScores(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.phase, room?.round_number]);

  // ---- Reveal: poeng vises etter kort fasit-visning; bokfør lokalt + profil ----
  useEffect(() => {
    if (phase !== 'REVEAL') return;
    const t = setTimeout(() => {
      softLayout();
      setRevealedScores(true);
    }, DURATIONS.revealMs);
    return () => clearTimeout(t);
  }, [phase, round]);

  useEffect(() => {
    if (!revealedScores || !room || accountedRef.current === round) return;
    accountedRef.current = round;
    if (!iAmWaiting) playPointsSound(); // 🪙 pengelyd idet poengene tildeles
    setSessions((prev) => {
      const n = { ...prev };
      for (const p of activePlayers) n[p.user_id] = (n[p.user_id] ?? 0) + (roundScores[p.user_id] ?? 0);
      return n;
    });
    // Lokal profil: poeng, runder, gode forklaringer, RATING (ikke for ventende –
    // de deltok ikke i runden)
    if (!iAmWaiting) {
      const mine = roundAnswers.find((a) => a.author_id === me && !a.is_empty);
      // Gjettet jeg fasit? (teller i rating også mot rene botter)
      const myVote = roundVotes.find((v) => v.voter_id === me);
      const guessedCorrect = !!myVote && !!roundAnswers.find((a) => a.id === myVote.answer_id)?.is_correct;
      guessStreakRef.current = guessedCorrect ? guessStreakRef.current + 1 : 0;
      // Bløff-stemmer fra MENNESKER (botter gir aldri rating-poeng)
      const isHuman = (uid: string) => players.some((pl) => pl.user_id === uid && !pl.is_bot);
      const humanVotes = mine ? (votesByAnswer[mine.id] ?? []).filter(isHuman).length : 0;
      void recordRoundResult({
        points: roundScores[me ?? ''] ?? 0,
        yourWord: room.word ?? '',
        yourText: mine?.text ?? '',
        yourVotes: mine ? (votesByAnswer[mine.id]?.length ?? 0) : 0,
        guessedCorrect,
        humanVotes,
        streakLen: guessStreakRef.current,
      }, league).then(async () => {
        // Speil rating til LIGAENS rangliste
        const p = await loadProfile();
        const r = currentRating(p, league);
        if (r != null) void upsertMyRating(displayName(p, league), r, statsForLeague(p, league).rounds, league);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealedScores]);

  // ---- Frist-håndhevelse + varselpuls (ingen state-ticks → jevn rendering) ----
  useEffect(() => {
    const id = setInterval(() => {
      const r = roomRef.current;
      if (!r?.phase_ends_at) return;
      const ends = Date.parse(r.phase_ends_at);
      const remaining = Math.max(0, ends - Date.now());
      // Varselpuls siste 5 sek – kun hvis du ikke har handlet (aldri for ventende)
      const unacted =
        !waitingRef.current &&
        ((r.phase === 'WRITING' && !youSubmittedRef.current) ||
          (r.phase === 'VOTING' && !confirmedVoteRef.current) ||
          (r.phase === 'REVEAL' && !readyPressedRef.current));
      const inWindow = remaining > 0 && remaining <= WARN_WINDOW_MS;
      if (unacted && inWindow && !warnActiveRef.current) {
        warnActiveRef.current = true;
        hapticWarn(300);
        runWarnPulse();
      } else if (warnActiveRef.current && (!unacted || !inWindow)) {
        warnActiveRef.current = false;
        Animated.timing(flashWarn, { toValue: 0, duration: 200, useNativeDriver: true }).start();
      }
      // (Ikke trykket «Klar» kaster IKKE ut lenger – man blir bare med videre
      // inn i neste runde når verten starter den.)
    }, 120);
    return () => {
      clearInterval(id);
      warnActiveRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Kastet ut / fjernet fra rommet → ut
  useEffect(() => {
    if (!me) return;
    const present = players.some((p) => p.user_id === me && !p.left_at);
    if (present) joinedOnceRef.current = true;
    else if (joinedOnceRef.current) safeExit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players]);

  // Svak vibrering når noen stemmer på DITT svar (under stemmingen)
  useEffect(() => {
    if (phase !== 'VOTING' || !myAnswerRow) return;
    const count = votesByAnswer[myAnswerRow.id]?.length ?? 0;
    if (count > myVoteVibratedRef.current) {
      if (myVoteVibratedRef.current > 0 || count > 0) hapticSoft(120);
      myVoteVibratedRef.current = count;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, votesByAnswer, myAnswerRow?.id]);
  useEffect(() => {
    if (phase === 'WRITING') myVoteVibratedRef.current = 0;
  }, [phase, round]);

  // Svak vibrering ved reveal hvis du stemte på riktig svar
  useEffect(() => {
    if (phase !== 'REVEAL' || revealVibratedRef.current === round) return;
    const myVote = roundVotes.find((v) => v.voter_id === me);
    if (!myVote) return;
    const ans = roundAnswers.find((a) => a.id === myVote.answer_id);
    if (ans?.is_correct) {
      revealVibratedRef.current = round;
      hapticSuccess(150);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, round, roundVotes, roundAnswers]);

  // ---- Handlinger ----
  const onTypeAnswer = (t: string) => {
    setAnswerText(t);
    if (phase !== 'WRITING' || youSubmittedRef.current) return;
    const now = Date.now();
    if (t.length > 0 && now - lastTypingSentRef.current > 700) {
      lastTypingSentRef.current = now;
      sendTyping(true);
    }
    if (typingOffTimerRef.current) clearTimeout(typingOffTimerRef.current);
    typingOffTimerRef.current = setTimeout(() => sendTyping(false), 1_800);
  };

  const sendAnswer = () => {
    const text = answerText.replace(NORMALIZE, ' ').trim();
    if (!text || youSubmitted || !roomId || !room) return;
    softLayout();
    setSentLocally(true);
    sendTyping(false);
    submitMyAnswer(roomId, room.round_number, text).catch(() => setSentLocally(false));
  };

  const confirmVote = () => {
    if (!pendingVote || !roomId || !room) return;
    setVotedLocally(pendingVote);
    castMyVote(roomId, room.round_number, pendingVote).catch(() => setVotedLocally(null));
    setPendingVote(null);
  };

  const pressReady = () => {
    if (!roomId) return;
    softLayout();
    setReadyPressed(true);
    setMyReady(roomId, true).catch(() => {});
  };

  // ---- Render ----
  if (conn === 'connecting' || !room) {
    return (
      <View style={[styles.root, styles.center, { backgroundColor: design.background }]}>
        {conn === 'error' ? (
          <>
            <Text style={[styles.errTitle, { color: design.text }]}>{t.connectFail}</Text>
            <Text style={styles.errMsg}>{connError}</Text>
            <View style={styles.errBtn}>
              <Button label={t.back} onPress={onExit} />
            </View>
          </>
        ) : (
          <>
            <ActivityIndicator color={design.text} />
            <Text style={[styles.dim, { color: design.textDim }]}>{t.connecting}</Text>
          </>
        )}
      </View>
    );
  }

  const inLobby = view === 'LOBBY';
  // Ventende skal IKKE se ordet fra runden som pågår (spoiler) – kun neste ord
  // (settes ved reveal). Tomt fram til da; det fader uansett rolig inn.
  const lobbyWord = iAmWaiting ? room.next_word ?? '' : room.next_word ?? room.word ?? '';
  const showScores = round > 0;
  // Alle vises med brukernavnet sitt – også deg selv (ikke «Du»)
  const nameOf = (uid: string) =>
    activePlayers.find((p) => p.user_id === uid)?.username ?? players.find((p) => p.user_id === uid)?.username ?? 'Spiller';
  // FINALE: én boks per runde – vist bløff (din egen hvis den fikk stemmer,
  // ellers rundens mest stemte), med FASIT under, og din stemte forklaring i
  // tillegg der den ikke alt er den viste. Pluss samlet statistikk.
  const finaleRows: {
    round: number;
    word: string;
    text: string;
    author: string;
    votes: number;
    fasit: string;
    mineExtra: { text: string; votes: number } | null;
  }[] = [];
  const finaleStats = { correct: 0, ofRounds: 0, bluffVotes: 0, bestStreak: 0 };
  if (view === 'FINALE') {
    let streak = 0;
    for (let rd = 1; rd <= round; rd++) {
      const word = roundWordsRef.current[rd];
      const all = answers.filter((a) => a.round_number === rd);
      const votesFor = (id: string) => votes.filter((v) => v.round_number === rd && v.answer_id === id).length;
      const correctAns = all.find((a) => a.is_correct);
      // Statistikk
      finaleStats.ofRounds++;
      const myVote = votes.find((v) => v.round_number === rd && v.voter_id === me);
      const gotIt = !!myVote && !!correctAns && myVote.answer_id === correctAns.id;
      if (gotIt) {
        finaleStats.correct++;
        streak++;
        finaleStats.bestStreak = Math.max(finaleStats.bestStreak, streak);
      } else {
        streak = 0;
      }
      const mine = all.find((a) => a.author_id === me && !a.is_empty);
      const mineVotes = mine ? votesFor(mine.id) : 0;
      finaleStats.bluffVotes += mineVotes;
      if (!word) continue;
      // Vist bløff
      const bluffs = all.filter((a) => !a.is_empty && !a.is_correct && a.text);
      let pick = mine && mineVotes > 0 ? mine : null;
      if (!pick) {
        let best: DbAnswer | null = null;
        let bv = 0;
        for (const a of bluffs) {
          const v = votesFor(a.id);
          if (v > bv) {
            bv = v;
            best = a;
          }
        }
        pick = best;
      }
      if (pick) {
        finaleRows.push({
          round: rd,
          word,
          text: pick.text,
          author: nameOf(pick.author_id ?? ''),
          votes: votesFor(pick.id),
          fasit: correctAns?.text ?? '',
          mineExtra:
            mine && mineVotes > 0 && mine.id !== pick.id ? { text: mine.text, votes: mineVotes } : null,
        });
      }
    }
  }

  // Lobby-roster: hvem som er koblet på nå, i tilkoblingsrekkefølge (nye popper inn)
  const rosterNames = [...activePlayers]
    .sort((a, b) => Date.parse(a.joined_at) - Date.parse(b.joined_at))
    .map((p) => nameOf(p.user_id));

  // Bobler: hver spiller får en TILFELDIG (men stabil) plass blant boblene –
  // hash av bruker-id, likt på alle telefoner. Tomme plasser = grå.
  const slots: (RoomPlayer | null)[] = Array.from({ length: room.max_players }, () => null);
  {
    const hash = (s: string) => {
      let h = 0;
      for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
      return h;
    };
    const placed = [...activePlayers]
      .sort((a, b) => a.user_id.localeCompare(b.user_id))
      .slice(0, room.max_players);
    for (const p of placed) {
      let idx = hash(p.user_id) % room.max_players;
      while (slots[idx]) idx = (idx + 1) % room.max_players;
      slots[idx] = p;
    }
  }
  const slotMode = (p: RoomPlayer | null): Mode => {
    if (inLobby) {
      if (!p) return 'waiting';
      // Runde 0 (matchmaking) OG blink-øyeblikket (fasen er alt WRITING mens vi
      // fortsatt viser lobbyen): alle tilkoblede er hvite – ingen skal gråne igjen.
      // (For VENTENDE gjelder ikke dette: de ser klar-status – boblene hvitner
      // etter hvert som spillerne trykker klar → ser ut som et rom som fylles.)
      if (!iAmWaiting && (round === 0 || phase === 'WRITING')) return 'ready';
      const ready = p.user_id === me ? readyPressed || p.ready : p.ready;
      return ready ? 'ready' : 'waiting';
    }
    if (!p) return 'waiting';
    if (p.user_id === me) return youSubmitted ? 'submitted' : answerText.length > 0 ? 'typing' : 'idle';
    const has = roundAnswers.some((a) => a.author_id === p.user_id && !a.is_empty);
    if (has) return 'submitted';
    const ts = typingMap[p.user_id];
    return ts && Date.now() - ts < 2_500 ? 'typing' : 'idle';
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: design.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.top}>
        <Pressable
          onPress={() => {
            const rem = remainingRounds();
            if (rem > 0) loadProfile().then((p) => setQuitDrop(estimateQuitDrop(p, rem, league)));
            else setQuitDrop(0);
            setLeaveConfirm(true);
          }}
          hitSlop={12}
        >
          <UserIcon size={22} />
        </Pressable>
        <View style={styles.trackCol}>
          <View style={[styles.track, { backgroundColor: design.track }]} onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}>
            {trackW > 0 && (
              <Animated.View
                style={[
                  styles.fill,
                  {
                    backgroundColor: design.fill,
                    width: trackW,
                    // Venstreforankret scaleX: skaleres om midten, så vi kompenserer
                    // med translateX = -W/2·(1−s) slik at venstre kant står i ro.
                    transform: [
                      { translateX: barAnim.interpolate({ inputRange: [0, 1], outputRange: [-trackW / 2, 0] }) },
                      { scaleX: barAnim },
                    ],
                  },
                ]}
              />
            )}
          </View>
          {round > 0 && phase !== 'FINISHED' && (
            <Text style={[styles.roundTag, { color: design.textDim }]}>{round}/{MATCH.rounds}</Text>
          )}
        </View>
      </View>

      <Animated.View style={[styles.content, { opacity: contentFade }]}>
        {(view === 'LOBBY' || view === 'WRITING') && (
          <>
            <Animated.View style={{ opacity: wordFade }}>
              <Text style={[styles.word, { color: design.text }]}>{inLobby ? lobbyWord : room.word ?? ''}</Text>
            </Animated.View>

            <View style={[styles.fieldShell, { backgroundColor: design.background }]}>
              <Animated.View pointerEvents="none" style={[styles.fieldBorder, { borderColor: design.outline, opacity: fieldFade }]} />
              {inLobby ? (
                <View style={styles.waitRow}>
                  <Text style={[styles.fieldPlaceholder, { color: design.textDim }]}>
                    {round === 0 ? t.waitingPlayers : t.waitingNextRound}
                  </Text>
                  <Text style={[styles.staticDots, { color: design.textDim }]}>...</Text>
                </View>
              ) : youSubmitted ? (
                <Text style={[styles.fieldFilled, { color: design.text }]}>{(myAnswerRow?.text ?? answerText).replace(NORMALIZE, ' ').trim()}</Text>
              ) : (
                <View style={styles.inputWrap}>
                  {answerText.length === 0 && (
                    <View pointerEvents="none" style={styles.inputHintWrap}>
                      <Text style={[styles.inputHint, { color: design.textDim }]}>{t.writeHint}</Text>
                    </View>
                  )}
                  <TextInput
                    style={[styles.fieldInput, { color: design.text }]}
                    value={answerText}
                    onChangeText={onTypeAnswer}
                    multiline
                    autoFocus
                    blurOnSubmit
                    returnKeyType="send"
                    onSubmitEditing={sendAnswer}
                  />
                </View>
              )}
            </View>

            <View style={styles.statusRow}>
              {slots.map((p, i) => (
                <StatusPill key={`slot-${i}`} mode={slotMode(p)} />
              ))}
            </View>

            {view === 'WRITING' && !youSubmitted && (
              <Animated.View style={[styles.footer, { opacity: submitFade }]}>
                <Button label={t.submitAnswer} onPress={sendAnswer} disabled={!answerText.trim()} />
              </Animated.View>
            )}

            {inLobby && (
              <Animated.View style={{ opacity: rosterFade }}>
                {showScores ? (
                  <CompactScores
                    rows={activePlayers.map((p) => ({
                      key: p.user_id,
                      name: nameOf(p.user_id),
                      round: roundScores[p.user_id] ?? 0,
                      total: sessions[p.user_id] ?? 0,
                    }))}
                  />
                ) : (
                  <LobbyRoster names={rosterNames} />
                )}
              </Animated.View>
            )}
          </>
        )}

        {(view === 'VOTING' || view === 'REVEAL') && (
          <View style={styles.voteWrap}>
            <Text style={[styles.wordSmall, { color: design.text }]}>{room.word ?? ''}</Text>
            <ScrollView contentContainerStyle={styles.answers} showsVerticalScrollIndicator={false}>
              {roundAnswers.map((a, i) => (
                <AnswerRowView
                  key={a.id}
                  text={capitalize(a.text)}
                  isEmpty={a.is_empty}
                  isCorrect={a.is_correct}
                  isReveal={view === 'REVEAL'}
                  chosen={pendingVote === a.id || confirmedVote === a.id}
                  toned={
                    (confirmedVote !== null || view === 'REVEAL') &&
                    confirmedVote !== a.id &&
                    !(view === 'REVEAL' && a.is_correct)
                  }
                  locked={confirmedVote !== null || view === 'REVEAL'}
                  voterNames={(votesByAnswer[a.id] ?? []).map(nameOf)}
                  showVoterNames={view === 'REVEAL'}
                  points={answerPoints[a.id] ?? 0}
                  fly={revealedScores}
                  flyDelay={i * 140}
                  onPress={() => !a.is_empty && setPendingVote(a.id)}
                />
              ))}
            </ScrollView>

            {view === 'REVEAL' && revealedScores && (
              <View style={styles.revealBottom}>
                <CompactScores
                  animate
                  rows={activePlayers.map((p) => ({
                    key: p.user_id,
                    name: nameOf(p.user_id),
                    round: roundScores[p.user_id] ?? 0,
                    total: sessions[p.user_id] ?? 0,
                  }))}
                />
                <View style={styles.footer}>
                  {/* Siste runde → «Se resultater» i stedet for neste-runde-tekst */}
                  <Button label={round >= MATCH.rounds ? t.seeResults : t.readyNext} onPress={pressReady} />
                </View>
              </View>
            )}
          </View>
        )}

        {view === 'FINALE' && (
          <View style={styles.finaleWrap}>
            <Text style={[styles.wordSmall, { color: design.text }]}>{t.finalResults}</Text>
            <CompactScores
              full
              rows={activePlayers.map((p) => ({
                key: p.user_id,
                name: nameOf(p.user_id),
                round: 0,
                total: sessions[p.user_id] ?? 0,
              }))}
            />
            {/* Din statistikk for kampen */}
            <View style={[styles.finaleStats, { backgroundColor: design.soft }]}>
              <View style={styles.finaleStatRow}>
                <Text style={[styles.finaleStatLabel, { color: design.textDim }]}>{t.statCorrect}</Text>
                <Text style={[styles.finaleStatNum, { color: design.text }]}>
                  {finaleStats.correct}/{finaleStats.ofRounds}
                </Text>
              </View>
              <View style={styles.finaleStatRow}>
                <Text style={[styles.finaleStatLabel, { color: design.textDim }]}>{t.statBluffVotes}</Text>
                <Text style={[styles.finaleStatNum, { color: design.text }]}>{finaleStats.bluffVotes}</Text>
              </View>
              <View style={styles.finaleStatRow}>
                <Text style={[styles.finaleStatLabel, { color: design.textDim }]}>{t.statBestStreak}</Text>
                <Text style={[styles.finaleStatNum, { color: design.text }]}>{finaleStats.bestStreak}</Text>
              </View>
            </View>

            <Text style={[styles.finaleSub, { color: design.textDim }]}>{t.bestExplanations}</Text>
            {/* Kortene tar resten av plassen og scroller – tavla over står fast */}
            <ScrollView style={styles.finaleScroll} showsVerticalScrollIndicator={false} contentContainerStyle={styles.finaleList}>
              {finaleRows.map((f) => (
                <View key={f.round} style={[styles.finaleCard, { backgroundColor: design.soft }]}>
                  <Text style={[styles.finaleWord, { color: design.text }]}>{capitalize(f.word)}</Text>
                  {/* FASIT øverst – uthevet */}
                  {!!f.fasit && (
                    <Text style={[styles.finaleFasitTop, { color: design.text }]}>
                      {t.answerLabel}: {capitalize(f.fasit)}
                    </Text>
                  )}
                  {/* Beste bløff under, med stemmetall */}
                  <Text style={[styles.finaleText, { color: design.textDim }]}>{capitalize(f.text)}</Text>
                  <Text style={[styles.finaleAuthor, { color: design.textDim }]}>
                    — {f.author} · {f.votes} {t.votes}
                  </Text>
                  {f.mineExtra && (
                    <Text style={[styles.finaleMine, { color: design.text }]}>
                      {t.yourBluff}: «{capitalize(f.mineExtra.text)}» · {f.mineExtra.votes} {t.votes}
                    </Text>
                  )}
                </View>
              ))}
            </ScrollView>
            <Pressable onPress={safeExit} style={[styles.finaleX, { borderColor: design.outline }]} hitSlop={10}>
              <Text style={[styles.finaleXText, { color: design.text }]}>✕</Text>
            </Pressable>
          </View>
        )}

        {readError ? <Text style={styles.debug}>Tilkoblingsfeil: {readError}</Text> : null}
      </Animated.View>

      {leaveConfirm && (
        <View style={styles.overlay}>
          <View style={[styles.confirm, { backgroundColor: design.background, borderColor: design.outline }]}>
            <Text style={[styles.confirmTitle, { color: design.text }]}>{t.leaveGame}</Text>
            {quitDrop > 0 && (
              <>
                <Text style={[styles.confirmSub, { color: design.textDim }]}>{t.ratingDrop(quitDrop)}</Text>
                <Text style={[styles.confirmHint, { color: design.textDim }]}>{t.ratingDropHint}</Text>
              </>
            )}
            <View style={styles.confirmRow}>
              <Button label={t.no} style={styles.confirmBtn} onPress={() => setLeaveConfirm(false)} />
              <Button label={t.yes} style={styles.confirmBtn} onPress={safeExit} />
            </View>
          </View>
        </View>
      )}

      {pendingVote && confirmedVote === null && view === 'VOTING' && (
        <View style={styles.overlay}>
          <View style={[styles.confirm, { backgroundColor: design.background, borderColor: design.outline }]}>
            <Text style={[styles.confirmTitle, { color: design.text }]}>{t.finalAnswer}</Text>
            <View style={styles.confirmRow}>
              <Button label={t.no} style={styles.confirmBtn} onPress={() => setPendingVote(null)} />
              <Button label={t.yes} style={styles.confirmBtn} onPress={confirmVote} />
            </View>
          </View>
        </View>
      )}

      {/* Varselpuls: skjermen lyser i designets fill-farge og faller til bakgrunn */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: design.fill, opacity: flashWarn }]} />
    </KeyboardAvoidingView>
  );
}

// ---- delkomponenter (samme visuelle språk som lokalspillet) ----

type Mode = 'waiting' | 'ready' | 'typing' | 'idle' | 'submitted';

function StatusPill({ mode }: { mode: Mode }) {
  const design = useDesign();
  const pillOp = useRef(new Animated.Value(mode === 'waiting' ? opacity.sterkt : 1)).current;
  const iconOp = useRef(new Animated.Value(1)).current;
  const whiteOp = useRef(new Animated.Value(0)).current;
  const prevMode = useRef(mode);
  const isLobby = mode === 'waiting' || mode === 'ready';

  useEffect(() => {
    Animated.timing(iconOp, { toValue: isLobby ? 1 : 0, duration: 350, useNativeDriver: true }).start();
  }, [isLobby, iconOp]);
  useEffect(() => {
    Animated.timing(whiteOp, {
      toValue: mode === 'submitted' ? 1 : 0,
      duration: LOBBY_FADE.submittedFadeMs,
      useNativeDriver: true,
    }).start();
  }, [mode, whiteOp]);
  useEffect(() => {
    if (prevMode.current === 'waiting' && mode === 'ready') {
      Animated.sequence([
        Animated.timing(pillOp, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(pillOp, { toValue: 0.45, duration: 280, useNativeDriver: true }),
        Animated.timing(pillOp, { toValue: 1, duration: 280, useNativeDriver: true }),
      ]).start();
    } else if (mode === 'waiting') {
      pillOp.setValue(opacity.sterkt);
    } else if (prevMode.current === 'waiting') {
      pillOp.setValue(1);
    }
    prevMode.current = mode;
  }, [mode, pillOp]);

  return (
    <Animated.View style={[pillStyles.base, { backgroundColor: design.background, borderColor: design.outline, opacity: pillOp }]}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: design.fill, borderRadius: radius.pill, opacity: whiteOp }]} />
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, pillStyles.center, { opacity: iconOp }]}>
        <UserIcon size={20} ring={false} />
      </Animated.View>
      {mode === 'typing' && <TypingDots active />}
    </Animated.View>
  );
}

interface ScoreRowData {
  key: string;
  name: string;
  round: number;
  total: number;
}

/** Poengtavle: viser stillingen FØR runden, teller opp, omsorterer (Mario Kart). */
function CompactScores({ rows, animate = false, full = false }: { rows: ScoreRowData[]; animate?: boolean; full?: boolean }) {
  const design = useDesign();
  const [countFrac, setCountFrac] = useState(animate ? 0 : 1);
  const [resorted, setResorted] = useState(!animate);
  const timersRef = useRef<{ t?: ReturnType<typeof setTimeout>; id?: ReturnType<typeof setInterval>; t2?: ReturnType<typeof setTimeout> }>({});

  useEffect(() => {
    if (!animate) return;
    const T = timersRef.current;
    T.t = setTimeout(() => {
      const start = Date.now();
      const dur = 1500;
      T.id = setInterval(() => {
        const f = Math.min(1, (Date.now() - start) / dur);
        setCountFrac(f);
        if (f >= 1 && T.id) {
          clearInterval(T.id);
          T.t2 = setTimeout(() => {
            softLayout();
            setResorted(true);
          }, 400);
        }
      }, 50);
    }, 700);
    return () => {
      if (T.t) clearTimeout(T.t);
      if (T.id) clearInterval(T.id);
      if (T.t2) clearTimeout(T.t2);
    };
  }, [animate]);

  const prevTotal = (r: ScoreRowData) => r.total - r.round;
  const sorted = [...rows].sort((a, b) => (resorted ? b.total - a.total : prevTotal(b) - prevTotal(a)));

  return (
    <ScrollView
      style={[csStyles.wrap, full && csStyles.wrapFull]}
      contentContainerStyle={csStyles.content}
      showsVerticalScrollIndicator={false}
      scrollEnabled={!full}
    >
      {sorted.map((r) => {
        const shownRound = Math.round(r.round * countFrac);
        return (
          <View key={r.key} style={[csStyles.row, { backgroundColor: design.soft }]}>
            <UserIcon size={18} />
            <Text style={[csStyles.name, { color: design.text }]}>{r.name}</Text>
            <Text style={[csStyles.round, { color: design.textDim }]}>+{shownRound}</Text>
            <Text style={[csStyles.total, { color: design.text }]}>{prevTotal(r) + shownRound}</Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

/** Lobby-roster: viser hvem som er koblet på nå. Nye navn popper inn (fade + glid)
 *  akkurat idet spilleren kobler seg på – samme plass som poengtavla mellom runder. */
function LobbyRoster({ names }: { names: string[] }) {
  return (
    <ScrollView style={rosterStyles.wrap} contentContainerStyle={rosterStyles.content} showsVerticalScrollIndicator={false}>
      {names.map((n, i) => (
        <RosterRow key={`${n}-${i}`} name={n} />
      ))}
    </ScrollView>
  );
}

function RosterRow({ name }: { name: string }) {
  const design = useDesign();
  const op = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(10)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(op, { toValue: 1, duration: 380, useNativeDriver: true }),
      Animated.timing(ty, { toValue: 0, duration: 380, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [op, ty]);
  return (
    <Animated.View style={[rosterStyles.row, { backgroundColor: design.soft, opacity: op, transform: [{ translateY: ty }] }]}>
      <UserIcon size={18} />
      <Text style={[rosterStyles.name, { color: design.text }]}>{name}</Text>
    </Animated.View>
  );
}

function AnswerRowView({
  text,
  isEmpty,
  isCorrect,
  isReveal,
  chosen,
  toned,
  locked,
  voterNames,
  showVoterNames,
  points,
  fly,
  flyDelay,
  onPress,
}: {
  text: string;
  isEmpty: boolean;
  isCorrect: boolean;
  isReveal: boolean;
  chosen: boolean;
  toned: boolean;
  locked: boolean;
  voterNames: string[];
  showVoterNames: boolean;
  points: number;
  fly: boolean;
  flyDelay: number;
  onPress: () => void;
}) {
  const design = useDesign();
  const blink = useRef(new Animated.Value(1)).current;
  const flyAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isReveal && isCorrect) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(blink, { toValue: opacity.sterkt, duration: 420, useNativeDriver: true }),
          Animated.timing(blink, { toValue: 1, duration: 420, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }
  }, [isReveal, isCorrect, blink]);

  useEffect(() => {
    if (fly && points > 0) {
      Animated.timing(flyAnim, { toValue: 1, duration: 1400, delay: 400 + flyDelay, easing: Easing.in(Easing.quad), useNativeDriver: true }).start();
    }
  }, [fly, points, flyAnim, flyDelay]);

  const staticOpacity = isEmpty ? opacity.sterkt : toned ? opacity.tonet : opacity.active;
  const isBlinking = isReveal && isCorrect;
  // Reveal: fasiten blir grønn (og blinker), ditt feilgjett blir rødt – ellers palettfarge
  const revealTint = isReveal && !isEmpty ? (isCorrect ? verdict.correct : chosen ? verdict.wrong : null) : null;

  return (
    <View style={answerStyles.wrap}>
      <Animated.View style={{ opacity: isBlinking ? blink : staticOpacity, width: '100%' }}>
        <Pressable
          disabled={locked || isEmpty}
          onPress={onPress}
          style={[
            answerStyles.pill,
            { backgroundColor: revealTint ?? design.fill },
            isReveal && answerStyles.pillCompact,
            chosen && [answerStyles.chosen, { borderColor: design.background }],
          ]}
        >
          {!isEmpty && (
            <Text style={[answerStyles.text, { color: revealTint ? verdict.text : design.fillText }, isReveal && answerStyles.textCompact]}>{text}</Text>
          )}
        </Pressable>
      </Animated.View>
      {voterNames.length > 0 && (
        <View style={answerStyles.voters}>
          {voterNames.map((n, i) => (
            <View key={`${n}-${i}`} style={answerStyles.voter}>
              <UserIcon size={16} />
              {showVoterNames && <Text style={[answerStyles.vname, { color: design.textDim }]}>{n}</Text>}
            </View>
          ))}
        </View>
      )}
      {fly && points > 0 && (
        <Animated.Text
          pointerEvents="none"
          style={[
            answerStyles.flyPoints,
            { color: design.text },
            {
              opacity: flyAnim.interpolate({ inputRange: [0, 0.12, 0.75, 1], outputRange: [0, 1, 1, 0] }),
              transform: [{ translateY: flyAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 90] }) }],
            },
          ]}
        >
          +{points}
        </Animated.Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, paddingHorizontal: sizes.edge - 2, paddingBottom: spacing.lg },
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  content: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: spacing.sm, marginBottom: spacing.md },
  trackCol: { flex: 1 },
  track: { height: 6, backgroundColor: colors.track, borderRadius: 999, overflow: 'hidden' },
  roundTag: { alignSelf: 'flex-end', fontSize: 9.5, marginTop: 3, marginBottom: -12, opacity: 0.7, fontVariant: ['tabular-nums'] },
  fill: { height: '100%', backgroundColor: colors.fill, borderRadius: 999 },
  word: { ...typography.title, textAlign: 'center', textTransform: 'capitalize', marginTop: spacing.xl, marginBottom: spacing.lg },
  wordSmall: { ...typography.heading, fontSize: 24, textAlign: 'center', textTransform: 'capitalize', marginTop: spacing.sm, marginBottom: spacing.sm },
  fieldShell: { minHeight: 96, backgroundColor: colors.background, borderRadius: radius.field, justifyContent: 'center' },
  fieldBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: sizes.borderWidth,
    borderColor: colors.outline,
    borderRadius: radius.field,
  },
  inputWrap: { width: '100%', justifyContent: 'center' },
  fieldInput: {
    minHeight: 92,
    color: colors.text,
    fontSize: 17,
    textAlign: 'center',
    textAlignVertical: 'top',
    paddingTop: 14,
    paddingHorizontal: spacing.md,
  },
  inputHintWrap: { position: 'absolute', top: 44, left: 0, right: 0, zIndex: 1 },
  inputHint: { color: colors.textSecondary, fontSize: 16, textAlign: 'center', paddingHorizontal: spacing.md },
  waitRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  fieldPlaceholder: { color: colors.textSecondary, fontSize: 17, textAlign: 'center' },
  staticDots: { color: colors.textSecondary, fontSize: 17, letterSpacing: 2 },
  fieldFilled: { color: colors.text, fontSize: 17, textAlign: 'center', padding: spacing.md },
  statusRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 9, marginTop: spacing.lg },
  footer: { marginTop: spacing.md },
  voteWrap: { flex: 1 },
  answers: { paddingTop: spacing.xs, gap: 9, paddingBottom: spacing.md },
  revealBottom: { marginTop: spacing.sm },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  confirm: { width: '100%', backgroundColor: colors.background, borderWidth: sizes.borderWidth, borderColor: colors.outline, borderRadius: radius.card, padding: spacing.lg, gap: spacing.md },
  confirmTitle: { ...typography.heading, textAlign: 'center' },
  confirmSub: { fontSize: 13.5, textAlign: 'center', marginTop: -8 },
  confirmHint: { fontSize: 12, textAlign: 'center', marginTop: -12, opacity: 0.75 },
  confirmRow: { flexDirection: 'row', gap: spacing.md },
  confirmBtn: { flex: 1 },
  dim: { color: colors.textSecondary, fontSize: 15 },
  finaleWrap: { flex: 1 },
  finaleStats: { borderRadius: radius.card, paddingVertical: 10, paddingHorizontal: spacing.md, gap: 7, marginTop: spacing.md },
  finaleStatRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  finaleStatLabel: { fontSize: 13.5 },
  finaleStatNum: { fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  finaleSub: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginTop: spacing.lg, marginBottom: spacing.sm },
  finaleScroll: { flex: 1 },
  finaleList: { gap: 10, paddingBottom: 84 },
  finaleCard: { borderRadius: radius.card, padding: spacing.md, gap: 6 },
  finaleHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  finaleWord: { fontSize: 17, fontWeight: '700', textTransform: 'capitalize' },
  finaleVotes: { fontSize: 12, fontVariant: ['tabular-nums'] },
  finaleText: { fontSize: 15, lineHeight: 21 },
  finaleAuthor: { fontSize: 12.5 },
  finaleFasitTop: { fontSize: 15, lineHeight: 21, fontWeight: '600' },
  finaleMine: { fontSize: 13.5, marginTop: 2 },
  finaleX: {
    position: 'absolute',
    bottom: 10,
    alignSelf: 'center',
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  finaleXText: { fontSize: 20, fontWeight: '600' },
  errTitle: { ...typography.heading, fontSize: 20 },
  errMsg: { color: colors.textSecondary, fontSize: 14, textAlign: 'center', paddingHorizontal: spacing.lg },
  errBtn: { width: '100%', paddingHorizontal: spacing.lg, marginTop: spacing.md },
  debug: { color: colors.textSecondary, fontSize: 11, textAlign: 'center', marginTop: spacing.md, opacity: 0.7 },
});

const pillStyles = StyleSheet.create({
  base: { width: 58, height: sizes.statusPillHeight, borderRadius: radius.pill, borderWidth: sizes.borderWidth, borderColor: colors.outline, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  center: { alignItems: 'center', justifyContent: 'center' },
});

const rosterStyles = StyleSheet.create({
  wrap: { maxHeight: 210, marginTop: spacing.lg },
  content: { gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12 },
  name: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '600' },
});

const csStyles = StyleSheet.create({
  wrap: { maxHeight: 190, marginTop: spacing.md },
  wrapFull: { maxHeight: 9999, flexGrow: 0 }, // finale: ALLE spillere synlige, ingen intern scroll
  content: { gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, paddingVertical: 7, paddingHorizontal: 12 },
  name: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '600' },
  round: { color: colors.textSecondary, fontSize: 12 },
  total: { color: colors.text, fontSize: 14, fontWeight: '700', minWidth: 42, textAlign: 'right' },
});

const answerStyles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 4 },
  pill: { width: '100%', minHeight: 48, backgroundColor: colors.fill, borderRadius: radius.pill, paddingVertical: 12, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  pillCompact: { minHeight: 38, paddingVertical: 8, paddingHorizontal: 16 },
  chosen: { borderWidth: sizes.borderWidth, borderColor: colors.background },
  text: { color: '#000', fontSize: 15, fontWeight: '500', textAlign: 'center' },
  textCompact: { fontSize: 13 },
  voters: { flexDirection: 'row', gap: 8, alignItems: 'center', minHeight: 18, justifyContent: 'center', flexWrap: 'wrap' },
  voter: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  vname: { color: colors.textSecondary, fontSize: 12 },
  flyPoints: { position: 'absolute', top: 8, right: 14, color: colors.text, fontSize: 15, fontWeight: '800', zIndex: 5 },
});
