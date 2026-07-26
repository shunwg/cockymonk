import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SCORING } from '../../config/gameConfig';
import { colors, radius, sizes, spacing, typography } from '../../config/theme';
import { useDesign } from '../../config/designs';
import { useStrings } from '../../config/i18n';
import { pickWord, recordWordUsed } from '../../services/wordUsage';
import { Word } from '../../game-engine/types';
import { Button } from '../shared/Button';
import { UserIcon } from '../shared/UserIcon';

/**
 * SPILL HJEMME – alle på ÉN skjerm (pass-og-spill med gamemaster).
 *
 * Flyt: CHOOSER → SETUP (3–8 spillere, rekkefølge, tid per spiller 30–90 s)
 *  → per runde (én per spiller; gamemaster roterer):
 *    WRITE (GM først, så resten i rekkefølge; hver med egen nedtelling)
 *    LOCK  (send telefonen videre – neste holder inne 3 s for å åpne)
 *    READ  (GM blar gjennom svarene, inkl. fasit, i stokket rekkefølge og leser høyt)
 *    VOTE  (GM fører stemmene i spillerekkefølge; egen bløff kan ikke velges)
 *    SCORE (fasit + poeng; standard poengsatser fra gameConfig)
 *  → FINAL (sluttresultat). Hjemmespill rører ALDRI online-rating/statistikk.
 */

type Step = 'CHOOSER' | 'SETUP' | 'WRITE' | 'LOCK' | 'READ' | 'VOTE' | 'SCORE' | 'FINAL';

interface HomeAnswer {
  id: string;
  authorSeat: number | null; // null = fasit
  text: string;
  isCorrect: boolean;
}

const MIN_PLAYERS = 3;
const MAX_PLAYERS = 8;
const TIME_MIN = 30;
const TIME_MAX = 90;
const TIME_STEP = 5;
const TIME_DEFAULT = 60;
const HOLD_MS = 2_000;
const ROUNDS_DEFAULT = 5;
const ROUNDS_MIN = 3;
const ROUNDS_MAX = 10;
const ROW_H = 50; // navnerad (44) + margin (6) – brukes av dra-og-slipp

const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function shuffle<T>(arr: T[]): T[] {
  const c = [...arr];
  for (let i = c.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [c[i], c[j]] = [c[j], c[i]];
  }
  return c;
}

export function HomeGameScreen({ onExit }: { onExit: () => void }) {
  const design = useDesign();
  const t = useStrings();

  const [step, setStep] = useState<Step>('CHOOSER');

  // ---- Oppsett ----
  const [names, setNames] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [perTime, setPerTime] = useState(TIME_DEFAULT);
  const [roundsTotal, setRoundsTotal] = useState(ROUNDS_DEFAULT);
  const [confirmExit, setConfirmExit] = useState(false);
  const [showIntro, setShowIntro] = useState(false); // kjapp regelboks før start

  // ---- Kamp ----
  const [round, setRound] = useState(1); // 1..names.length (GM roterer)
  const [word, setWord] = useState<Word | null>(null);
  const [writeIdx, setWriteIdx] = useState(0); // index i skriverekkefølgen (0 = GM)
  const [answerText, setAnswerText] = useState('');
  const [answers, setAnswers] = useState<HomeAnswer[]>([]);
  const [shuffled, setShuffled] = useState<HomeAnswer[]>([]);
  const [readIdx, setReadIdx] = useState(0);
  const [voterIdx, setVoterIdx] = useState(0); // index blant IKKE-GM i seterekkefølge
  const [votes, setVotes] = useState<Record<number, string>>({}); // seat → answerId
  const [totals, setTotals] = useState<number[]>([]);
  const [roundPts, setRoundPts] = useState<number[]>([]);

  const n = names.length;
  const gmSeat = (round - 1) % Math.max(1, n);
  // Skriverekkefølge: GM først, deretter setene i rekkefølge rundt bordet
  const writeOrder = useMemo(
    () => Array.from({ length: n }, (_, i) => (gmSeat + i) % n),
    [n, gmSeat]
  );
  const currentWriterSeat = writeOrder[writeIdx] ?? 0;
  const voterSeats = useMemo(
    () => Array.from({ length: n }, (_, i) => (gmSeat + 1 + i) % n).filter((s) => s !== gmSeat),
    [n, gmSeat]
  );

  // ---- Skrive-nedtelling ----
  const barAnim = useRef(new Animated.Value(1)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const answerRef = useRef('');
  answerRef.current = answerText;

  const commitAnswer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const text = answerRef.current.replace(/\s*\n+\s*/g, ' ').trim();
    setAnswers((prev) => [
      ...prev,
      { id: `a${prev.length}`, authorSeat: writeOrder[writeIdx], text, isCorrect: false },
    ]);
    setAnswerText('');
    setStep('LOCK');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [writeIdx, writeOrder]);

  useEffect(() => {
    if (step !== 'WRITE') return;
    barAnim.setValue(1);
    const anim = Animated.timing(barAnim, {
      toValue: 0,
      duration: perTime * 1000,
      useNativeDriver: true,
    });
    anim.start();
    timerRef.current = setTimeout(commitAnswer, perTime * 1000);
    return () => {
      anim.stop();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, writeIdx, round]);

  // ---- Rundeliv ----
  const startRound = (r: number, seatCount: number) => {
    setRound(r);
    // NORSK først – engelsk hjemmespill aktiveres når alt er testet.
    // Bruks-styrt valg: minst brukte ord først, og bruken telles med en gang.
    const w = pickWord('no');
    recordWordUsed(w.word, 'no');
    setWord(w);
    setWriteIdx(0);
    setAnswers([]);
    setVotes({});
    setVoterIdx(0);
    setRoundPts(Array(seatCount).fill(0));
    setAnswerText('');
    setStep('WRITE');
  };

  const startGame = () => {
    setTotals(Array(n).fill(0));
    startRound(1, n);
  };

  const afterLockOpened = () => {
    if (writeIdx + 1 < n) {
      setWriteIdx((i) => i + 1);
      setStep('WRITE');
    } else {
      // Alle har skrevet → tilbake hos GM → opplesing
      const bluffs = answers.filter((a) => a.text);
      const fasit: HomeAnswer = {
        id: 'fasit',
        authorSeat: null,
        text: word?.definition ?? '',
        isCorrect: true,
      };
      setShuffled(shuffle([...bluffs, fasit]));
      setReadIdx(0);
      setStep('READ');
    }
  };

  // LOCK: hvem skal ha telefonen nå?
  const lockTarget =
    writeIdx + 1 < n ? names[writeOrder[writeIdx + 1]] : `${names[gmSeat]} (${t.gamemaster})`;

  const castVote = (answerId: string) => {
    const seat = voterSeats[voterIdx];
    setVotes((v) => ({ ...v, [seat]: answerId }));
    if (voterIdx + 1 < voterSeats.length) {
      setVoterIdx((i) => i + 1);
    } else {
      finishRound({ ...votes, [seat]: answerId });
    }
  };

  const finishRound = (allVotes: Record<number, string>) => {
    const pts = Array(n).fill(0);
    for (const [seatStr, aid] of Object.entries(allVotes)) {
      const seat = Number(seatStr);
      const ans = shuffled.find((a) => a.id === aid);
      if (!ans) continue;
      if (ans.isCorrect) pts[seat] += SCORING.correctGuess;
      else if (ans.authorSeat != null) pts[ans.authorSeat] += SCORING.perVoteReceived;
    }
    setRoundPts(pts);
    setTotals((prev) => prev.map((v, i) => v + pts[i]));
    setStep('SCORE');
  };

  const nextRound = () => {
    if (round < roundsTotal) startRound(round + 1, n);
    else setStep('FINAL');
  };

  // ---- Oppsett-hjelpere ----
  const addName = () => {
    const nm = draft.trim();
    if (!nm || names.length >= MAX_PLAYERS) return;
    setNames((p) => [...p, nm]);
    setDraft('');
    Keyboard.dismiss(); // ned så lista og innstillingene synes; trykk feltet for neste navn
  };
  const [listDragging, setListDragging] = useState(false);
  const removeName = (i: number) => setNames((p) => p.filter((_, k) => k !== i));

  const votesFor = (aid: string) => Object.values(votes).filter((v) => v === aid).length;

  // ---------------------------------------------------------------------------
  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: design.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* CHOOSER */}
      {step === 'CHOOSER' && (
        <View style={styles.center}>
          <Text style={[styles.title, { color: design.text }]}>{t.playHome}</Text>
          <View style={styles.chooserBtns}>
            <Button label={t.homeOneScreen} onPress={() => setStep('SETUP')} />
            <View>
              <Button label={t.homeOwnScreens} disabled />
              <Text style={[styles.soon, { color: design.textDim }]}>{t.comingSoon}</Text>
            </View>
          </View>
          <Pressable onPress={onExit} hitSlop={10}>
            <Text style={[styles.backLink, { color: design.textDim }]}>‹ {t.back}</Text>
          </Pressable>
        </View>
      )}

      {/* SETUP */}
      {step === 'SETUP' && (
        <ScrollView
          style={styles.fill}
          contentContainerStyle={styles.setupScroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          scrollEnabled={!listDragging}
        >
          <Text style={[styles.title, { color: design.text }]}>{t.players}</Text>
          <View style={styles.addRow}>
            <TextInput
              style={[styles.nameInput, { color: design.text, borderColor: design.outline }]}
              value={draft}
              onChangeText={setDraft}
              placeholder={t.addPlayerPlaceholder}
              placeholderTextColor={design.textDim}
              maxLength={14}
              returnKeyType="done"
              onSubmitEditing={addName}
            />
            <Button label={t.add} style={styles.addBtn} onPress={addName} disabled={!draft.trim() || n >= MAX_PLAYERS} />
          </View>

          <DraggableNameList
            names={names}
            onDraggingChange={setListDragging}
            onReorder={(from, to) =>
              setNames((p) => {
                const c = [...p];
                const [m] = c.splice(from, 1);
                c.splice(to, 0, m);
                return c;
              })
            }
            onRemove={removeName}
          />
          <Text style={[styles.hint, { color: design.textDim }]}>{t.orderHint}</Text>

          <View style={styles.roundsRow}>
            <Text style={[styles.timeLabel, { color: design.text }]}>{t.timePerPlayer}</Text>
            <View style={styles.stepper}>
              <Pressable
                onPress={() => setPerTime((v) => Math.max(TIME_MIN, v - TIME_STEP))}
                hitSlop={10}
                style={[styles.stepBtn, { borderColor: design.outline }]}
              >
                <Text style={[styles.stepTxt, { color: design.text }]}>−</Text>
              </Pressable>
              <Text style={[styles.stepVal, styles.stepValWide, { color: design.text }]}>{perTime}</Text>
              <Pressable
                onPress={() => setPerTime((v) => Math.min(TIME_MAX, v + TIME_STEP))}
                hitSlop={10}
                style={[styles.stepBtn, { borderColor: design.outline }]}
              >
                <Text style={[styles.stepTxt, { color: design.text }]}>+</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.roundsRow}>
            <Text style={[styles.timeLabel, { color: design.text }]}>{t.roundsLabel}</Text>
            <View style={styles.stepper}>
              <Pressable
                onPress={() => setRoundsTotal((r) => Math.max(ROUNDS_MIN, r - 1))}
                hitSlop={10}
                style={[styles.stepBtn, { borderColor: design.outline }]}
              >
                <Text style={[styles.stepTxt, { color: design.text }]}>−</Text>
              </Pressable>
              <Text style={[styles.stepVal, { color: design.text }]}>{roundsTotal}</Text>
              <Pressable
                onPress={() => setRoundsTotal((r) => Math.min(ROUNDS_MAX, r + 1))}
                hitSlop={10}
                style={[styles.stepBtn, { borderColor: design.outline }]}
              >
                <Text style={[styles.stepTxt, { color: design.text }]}>+</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.setupFooter}>
            <Button label={t.startGame} onPress={() => setShowIntro(true)} disabled={n < MIN_PLAYERS || n > MAX_PLAYERS} />
            {n < MIN_PLAYERS && <Text style={[styles.soon, { color: design.textDim }]}>{t.needPlayers}</Text>}
          </View>
        </ScrollView>
      )}

      {/* WRITE */}
      {step === 'WRITE' && word && (
        <View style={styles.fillFlush}>
          {/* Topprad som på online-sidene: baren ligger til høyre for brukerikonet */}
          <View style={styles.topRow}>
            <View style={styles.iconSpace} />
            <View style={[styles.track, { backgroundColor: design.track }]}>
              <Animated.View
                style={[
                  styles.fillBar,
                  {
                    backgroundColor: design.fill,
                    transform: [
                      { translateX: barAnim.interpolate({ inputRange: [0, 1], outputRange: [-500, 0] }) },
                      { scaleX: barAnim },
                    ],
                  },
                ]}
              />
            </View>
          </View>
          <Text style={[styles.writerTag, { color: design.textDim }]}>
            {names[currentWriterSeat]}
            {currentWriterSeat === gmSeat ? ` · ${t.gamemaster}` : ''} · {round}/{roundsTotal}
          </Text>
          <Text style={[styles.word, { color: design.text }]}>{capitalize(word.word)}</Text>
          <View style={[styles.fieldShell, { borderColor: design.outline }]}>
            <TextInput
              style={[styles.fieldInput, { color: design.text }]}
              value={answerText}
              onChangeText={setAnswerText}
              placeholder={t.writeHint}
              placeholderTextColor={design.textDim}
              multiline
              autoFocus
              blurOnSubmit
              returnKeyType="done"
              onSubmitEditing={commitAnswer}
            />
          </View>
          <View style={styles.footerBtn}>
            <Button label={t.next} onPress={commitAnswer} disabled={!answerText.trim()} />
          </View>
        </View>
      )}

      {/* LOCK */}
      {step === 'LOCK' && (
        <View style={styles.center}>
          <Text style={[styles.passTitle, { color: design.text }]}>{t.passTo(lockTarget)}</Text>
          <HoldButton label={t.holdToOpen} onDone={afterLockOpened} />
        </View>
      )}

      {/* READ */}
      {step === 'READ' && (
        <View style={styles.fill}>
          <Text style={[styles.writerTag, { color: design.textDim }]}>
            {names[gmSeat]} · {t.gamemaster}
          </Text>
          <Text style={[styles.wordSmall, { color: design.text }]}>{capitalize(word?.word ?? '')}</Text>
          <Text style={[styles.hint, { color: design.textDim }]}>{t.readAloud}</Text>
          <View style={[styles.readCard, { backgroundColor: design.soft }]}>
            <Text style={[styles.readNo, { color: design.textDim }]}>
              {t.answerXofY(readIdx + 1, shuffled.length)}
            </Text>
            <Text style={[styles.readText, { color: design.text }]}>
              {capitalize(shuffled[readIdx]?.text ?? '')}
            </Text>
          </View>
          <View style={styles.readNav}>
            <Pressable onPress={() => setReadIdx((i) => Math.max(0, i - 1))} hitSlop={12} disabled={readIdx === 0}>
              <Text style={[styles.navArrow, { color: readIdx === 0 ? design.textDim : design.text }]}>‹</Text>
            </Pressable>
            <Pressable
              onPress={() => setReadIdx((i) => Math.min(shuffled.length - 1, i + 1))}
              hitSlop={12}
              disabled={readIdx === shuffled.length - 1}
            >
              <Text
                style={[styles.navArrow, { color: readIdx === shuffled.length - 1 ? design.textDim : design.text }]}
              >
                ›
              </Text>
            </Pressable>
          </View>
          {readIdx === shuffled.length - 1 && (
            <View style={styles.footerBtn}>
              <Button label={t.startVoting} onPress={() => setStep('VOTE')} />
            </View>
          )}
        </View>
      )}

      {/* VOTE */}
      {step === 'VOTE' && (
        <View style={styles.fill}>
          <Text style={[styles.writerTag, { color: design.textDim }]}>
            {names[gmSeat]} · {t.gamemaster}
          </Text>
          <Text style={[styles.passTitle, { color: design.text }]}>
            {t.whoVotes(names[voterSeats[voterIdx]] ?? '')}
          </Text>
          {/* INGEN avsløring av hvem som skrev hva – alle rader er like og
              trykkbare. GM leser lappene og fører stemmene muntlig. */}
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.voteList}>
            {shuffled.map((a, i) => (
              <Pressable
                key={a.id}
                onPress={() => castVote(a.id)}
                style={[styles.voteRow, { backgroundColor: design.fill }]}
              >
                <Text style={[styles.voteNo, { color: design.fillText }]}>{i + 1}</Text>
                <Text style={[styles.voteText, { color: design.fillText }]} numberOfLines={3}>
                  {capitalize(a.text)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          {voterIdx > 0 && (
            <Pressable onPress={() => setVoterIdx((i) => Math.max(0, i - 1))} hitSlop={10}>
              <Text style={[styles.backLink, { color: design.textDim }]}>‹ {names[voterSeats[voterIdx - 1]]}</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* SCORE */}
      {step === 'SCORE' && (
        <View style={styles.fill}>
          <Text style={[styles.wordSmall, { color: design.text }]}>{t.roundResults}</Text>
          <Text style={[styles.fasitLine, { color: design.text }]}>
            {t.answerLabel}: {capitalize(word?.definition ?? '')}
          </Text>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scoreList}>
            {shuffled
              .filter((a) => !a.isCorrect)
              .map((a) => (
                <View key={a.id} style={[styles.scoreCard, { backgroundColor: design.soft }]}>
                  <Text style={[styles.scoreAuthor, { color: design.textDim }]}>
                    {a.authorSeat != null ? names[a.authorSeat] : ''} · {votesFor(a.id)} {t.votes}
                  </Text>
                  <Text style={[styles.scoreText, { color: design.text }]}>{capitalize(a.text)}</Text>
                </View>
              ))}
            <View style={[styles.totalsCard, { backgroundColor: design.soft }]}>
              {names
                .map((nm, i) => ({ nm, i, total: totals[i] ?? 0, pts: roundPts[i] ?? 0 }))
                .sort((a, b) => b.total - a.total)
                .map((r) => (
                  <View key={r.i} style={styles.totalRow}>
                    <Text style={[styles.totalName, { color: design.text }]}>{r.nm}</Text>
                    <Text style={[styles.totalPts, { color: design.textDim }]}>+{r.pts}</Text>
                    <Text style={[styles.totalSum, { color: design.text }]}>{r.total}</Text>
                  </View>
                ))}
            </View>
          </ScrollView>
          <View style={styles.footerBtn}>
            <Button label={round < roundsTotal ? t.nextRoundLabel : t.finalResults} onPress={nextRound} />
          </View>
        </View>
      )}

      {/* BRUKERIKONET: fast på ALLE sider – fungerer som avbryt-knapp overalt */}
      <Pressable
        onPress={() => {
          if (step === 'CHOOSER' || step === 'FINAL' || (step === 'SETUP' && names.length === 0)) onExit();
          else setConfirmExit(true);
        }}
        hitSlop={12}
        style={styles.homeBtn}
      >
        <UserIcon size={22} />
      </Pressable>

      {showIntro && (
        <View style={styles.overlay}>
          <View style={[styles.confirm, { backgroundColor: design.background, borderColor: design.outline }]}>
            <Text style={[styles.confirmTitle, { color: design.text }]}>{t.homeIntroTitle}</Text>
            <Text style={[styles.introBody, { color: design.textDim }]}>{t.homeIntroBody}</Text>
            <Button
              label={t.homeIntroOk}
              onPress={() => {
                setShowIntro(false);
                startGame();
              }}
            />
          </View>
        </View>
      )}

      {confirmExit && (
        <View style={styles.overlay}>
          <View style={[styles.confirm, { backgroundColor: design.background, borderColor: design.outline }]}>
            <Text style={[styles.confirmTitle, { color: design.text }]}>{t.endGameConfirm}</Text>
            <View style={styles.confirmRow}>
              <Button label={t.no} style={styles.confirmBtn} onPress={() => setConfirmExit(false)} />
              <Button label={t.yes} style={styles.confirmBtn} onPress={onExit} />
            </View>
          </View>
        </View>
      )}

      {/* FINAL */}
      {step === 'FINAL' && (
        <View style={styles.fill}>
          <Text style={[styles.title, { color: design.text }]}>{t.finalResults}</Text>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scoreList}>
            {names
              .map((nm, i) => ({ nm, total: totals[i] ?? 0 }))
              .sort((a, b) => b.total - a.total)
              .map((r, idx) => (
                <View key={`${r.nm}-${idx}`} style={[styles.totalsCard, styles.finalRow, { backgroundColor: design.soft }]}>
                  <Text style={[styles.totalName, { color: design.text }]}>
                    {idx + 1}. {r.nm}
                  </Text>
                  <Text style={[styles.totalSum, { color: design.text }]}>{r.total}</Text>
                </View>
              ))}
          </ScrollView>
          <Pressable onPress={onExit} style={[styles.finalX, { borderColor: design.outline }]} hitSlop={10}>
            <Text style={[styles.finalXText, { color: design.text }]}>✕</Text>
          </Pressable>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

/** Hold inne i 2 sek for å åpne – enkelt strek-tegnet låsesymbol (bøyle + kropp). */
function HoldButton({ label, onDone }: { label: string; onDone: () => void }) {
  const design = useDesign();
  const fill = useRef(new Animated.Value(0)).current;
  const doneRef = useRef(false);

  const start = () => {
    doneRef.current = false;
    Animated.timing(fill, { toValue: 1, duration: HOLD_MS, useNativeDriver: true }).start(({ finished }) => {
      if (finished && !doneRef.current) {
        doneRef.current = true;
        onDone();
      }
    });
  };
  const cancel = () => {
    fill.stopAnimation();
    fill.setValue(0);
  };

  return (
    <View style={holdStyles.wrap}>
      <Pressable onPressIn={start} onPressOut={cancel} style={[holdStyles.btn, { borderColor: design.outline }]}>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            holdStyles.fill,
            { backgroundColor: design.fill, opacity: fill.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.85] }), transform: [{ scale: fill }] },
          ]}
        />
        {/* Låsesymbol i ren strek: bøyle + kropp */}
        <View style={[holdStyles.shackle, { borderColor: design.text }]} />
        <View style={[holdStyles.body, { backgroundColor: design.text }]} />
      </Pressable>
      <Text style={[holdStyles.label, { color: design.textDim }]}>{label}</Text>
    </View>
  );
}

/**
 * Dra-og-slipp på spillerlista (Spotify-kø-følelse): dra i ≡-håndtaket, raden
 * følger fingeren, slippes på ny plass. Slot-faste nøkler + én PanResponder per
 * plass (callbacks via refs) → gesten overlever re-render.
 */
function DraggableNameList({
  names,
  onReorder,
  onRemove,
  onDraggingChange,
}: {
  names: string[];
  onReorder: (from: number, to: number) => void;
  onRemove: (i: number) => void;
  onDraggingChange: (dragging: boolean) => void;
}) {
  const design = useDesign();
  // dragYs = den dratte radens fingerfølging; shiftYs = de ANDRE radenes
  // unnamanøver (±ROW_H) så det åpner seg en lomme der raden skal lande.
  const dragYs = useRef(Array.from({ length: MAX_PLAYERS }, () => new Animated.Value(0))).current;
  const shiftYs = useRef(Array.from({ length: MAX_PLAYERS }, () => new Animated.Value(0))).current;
  const lenRef = useRef(names.length);
  lenRef.current = names.length;
  const reorderRef = useRef(onReorder);
  reorderRef.current = onReorder;
  const dragChangeRef = useRef(onDraggingChange);
  dragChangeRef.current = onDraggingChange;
  const hoveredRef = useRef(0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pansRef = useRef<any[]>([]);

  const settleShifts = (slot: number, hovered: number) => {
    for (let i = 0; i < MAX_PLAYERS; i++) {
      if (i === slot) continue;
      let target = 0;
      if (slot < hovered && i > slot && i <= hovered) target = -ROW_H; // drar nedover → de imellom opp
      else if (slot > hovered && i >= hovered && i < slot) target = ROW_H; // drar oppover → de imellom ned
      Animated.timing(shiftYs[i], { toValue: target, duration: 130, useNativeDriver: true }).start();
    }
  };

  const resetAll = () => {
    for (let i = 0; i < MAX_PLAYERS; i++) {
      dragYs[i].setValue(0);
      shiftYs[i].stopAnimation();
      shiftYs[i].setValue(0);
    }
  };

  const getPan = (slot: number) => {
    if (!pansRef.current[slot]) {
      pansRef.current[slot] = PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_e, gs) => Math.abs(gs.dy) > 4,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: () => {
          hoveredRef.current = slot;
          dragChangeRef.current(true);
        },
        onPanResponderMove: (_e, gs) => {
          dragYs[slot].setValue(gs.dy);
          const hovered = Math.min(lenRef.current - 1, Math.max(0, slot + Math.round(gs.dy / ROW_H)));
          if (hovered !== hoveredRef.current) {
            hoveredRef.current = hovered;
            settleShifts(slot, hovered);
          }
        },
        onPanResponderRelease: (_e, gs) => {
          const target = Math.min(lenRef.current - 1, Math.max(0, slot + Math.round(gs.dy / ROW_H)));
          // SNAPP: gli raden inn i lomma før listen bokføres i ny rekkefølge
          Animated.timing(dragYs[slot], {
            toValue: (target - slot) * ROW_H,
            duration: 100,
            useNativeDriver: true,
          }).start(() => {
            resetAll();
            dragChangeRef.current(false);
            if (target !== slot) reorderRef.current(slot, target);
          });
        },
        onPanResponderTerminate: () => {
          resetAll();
          dragChangeRef.current(false);
        },
      });
    }
    return pansRef.current[slot];
  };

  return (
    <View style={styles.nameList}>
      {names.map((nm, i) => (
        <Animated.View
          key={`slot-${i}`}
          style={[
            styles.nameRow,
            {
              backgroundColor: design.soft,
              transform: [{ translateY: Animated.add(dragYs[i], shiftYs[i]) }],
            },
          ]}
        >
          <Text style={[styles.nameNo, { color: design.textDim }]}>{i + 1}</Text>
          <Text style={[styles.nameText, { color: design.text }]} numberOfLines={1}>
            {nm}
          </Text>
          <Pressable onPress={() => onRemove(i)} hitSlop={8}>
            <Text style={[styles.arrow, { color: design.textDim }]}>✕</Text>
          </Pressable>
          <View {...getPan(i).panHandlers} style={styles.dragHandle} hitSlop={8}>
            <Text style={[styles.dragGlyph, { color: design.textDim }]}>≡</Text>
          </View>
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, paddingHorizontal: sizes.edge - 2, paddingBottom: spacing.lg },
  fill: { flex: 1, paddingTop: spacing.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  title: { ...typography.title, fontSize: 30, textAlign: 'center', marginBottom: spacing.sm, marginTop: spacing.md },
  chooserBtns: { width: '100%', gap: 16 },
  soon: { ...typography.caption, textAlign: 'center', marginTop: 6 },
  backLink: { fontSize: 15, marginTop: spacing.md },

  addRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  nameInput: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: radius.field,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
  },
  addBtn: { width: 110, height: 44 },
  nameList: { marginTop: spacing.md },
  setupScroll: { paddingBottom: 40 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 12, marginBottom: 6 },
  nameNo: { width: 18, fontSize: 13, fontVariant: ['tabular-nums'] },
  nameText: { flex: 1, fontSize: 15, fontWeight: '600' },
  arrow: { fontSize: 17, paddingHorizontal: 4 },
  dragHandle: { paddingHorizontal: 8, paddingVertical: 4 },
  dragGlyph: { fontSize: 20, fontWeight: '700' },
  roundsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.lg },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  stepTxt: { fontSize: 20, fontWeight: '700', lineHeight: 22 },
  stepVal: { fontSize: 18, fontWeight: '700', minWidth: 26, textAlign: 'center', fontVariant: ['tabular-nums'] },
  stepValWide: { minWidth: 34 },
  // Samme plassering som topp-raden på online-sidene (ikon 22px, topp spacing.sm)
  homeBtn: { position: 'absolute', top: spacing.sm, left: sizes.edge - 2, width: 40, height: 22, alignItems: 'flex-start', justifyContent: 'center', zIndex: 20 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg, zIndex: 30 },
  confirm: { width: '100%', borderWidth: sizes.borderWidth, borderRadius: radius.card, padding: spacing.lg, gap: spacing.md },
  confirmTitle: { ...typography.heading, textAlign: 'center' },
  confirmRow: { flexDirection: 'row', gap: spacing.md },
  introBody: { fontSize: 15, lineHeight: 22, textAlign: 'center' },
  confirmBtn: { flex: 1 },
  hint: { fontSize: 12, marginTop: 6, textAlign: 'center' },
  timeLabel: { fontSize: 15, fontWeight: '600' },
  setupFooter: { marginTop: spacing.xl, gap: 6 },

  fillFlush: { flex: 1 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: spacing.sm, marginBottom: spacing.md },
  iconSpace: { width: 22 },
  track: { flex: 1, height: 6, borderRadius: 999, overflow: 'hidden' },
  fillBar: { height: '100%', width: 1000, borderRadius: 999 },
  writerTag: { fontSize: 12.5, textAlign: 'center', marginTop: 10 },
  word: { ...typography.title, textAlign: 'center', textTransform: 'capitalize', marginTop: spacing.lg, marginBottom: spacing.lg },
  wordSmall: { ...typography.heading, fontSize: 24, textAlign: 'center', marginTop: spacing.sm, marginBottom: 4 },
  fieldShell: { minHeight: 96, borderWidth: sizes.borderWidth, borderRadius: radius.field, justifyContent: 'center' },
  fieldInput: { minHeight: 92, fontSize: 17, textAlign: 'center', textAlignVertical: 'top', paddingTop: 14, paddingHorizontal: spacing.md },
  footerBtn: { marginTop: spacing.md },

  passTitle: { ...typography.heading, fontSize: 22, textAlign: 'center', paddingHorizontal: spacing.lg },

  readCard: { borderRadius: radius.card, padding: spacing.lg, marginTop: spacing.md, minHeight: 140, justifyContent: 'center', gap: 8 },
  readNo: { fontSize: 12.5, textAlign: 'center' },
  readText: { fontSize: 18, lineHeight: 26, textAlign: 'center', fontWeight: '600' },
  readNav: { flexDirection: 'row', justifyContent: 'center', gap: 64, marginTop: spacing.md },
  navArrow: { fontSize: 40, lineHeight: 44, paddingHorizontal: 10 },

  voteList: { gap: 8, paddingTop: spacing.md, paddingBottom: spacing.lg },
  voteRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.pill, paddingVertical: 10, paddingHorizontal: 16 },
  voteOwn: { opacity: 0.35 },
  voteNo: { fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'] },
  voteText: { flex: 1, fontSize: 14, fontWeight: '500' },

  fasitLine: { fontSize: 15, fontWeight: '600', textAlign: 'center', marginBottom: spacing.sm, paddingHorizontal: spacing.md },
  scoreList: { gap: 8, paddingBottom: 90 },
  scoreCard: { borderRadius: radius.card, padding: spacing.md, gap: 4 },
  scoreAuthor: { fontSize: 12.5 },
  scoreText: { fontSize: 14.5 },
  totalsCard: { borderRadius: radius.card, padding: spacing.md, gap: 7, marginTop: 4 },
  totalRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  totalName: { flex: 1, fontSize: 14.5, fontWeight: '600' },
  totalPts: { fontSize: 12.5, fontVariant: ['tabular-nums'] },
  totalSum: { fontSize: 15, fontWeight: '700', minWidth: 44, textAlign: 'right', fontVariant: ['tabular-nums'] },
  finalRow: { flexDirection: 'row', alignItems: 'center' },

  finalX: {
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
  finalXText: { fontSize: 20, fontWeight: '600' },
});

const holdStyles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 14 },
  btn: { width: 110, height: 110, borderRadius: 55, borderWidth: 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  fill: { borderRadius: 55 },
  // Strek-tegnet lås: bøyle (åpen bue) + kropp (fylt avrundet firkant)
  shackle: {
    width: 26,
    height: 18,
    borderWidth: 3.5,
    borderBottomWidth: 0,
    borderTopLeftRadius: 13,
    borderTopRightRadius: 13,
    marginBottom: -2,
  },
  body: { width: 40, height: 28, borderRadius: 6 },
  label: { fontSize: 13.5 },
});
