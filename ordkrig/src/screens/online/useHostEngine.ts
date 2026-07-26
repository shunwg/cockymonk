import { useEffect, useRef } from 'react';
import { DURATIONS, MATCH } from '../../config/gameConfig';
import { generateUsername } from '../../config/usernames';
import { pickWord } from '../../services/wordUsage';
import { Word } from '../../game-engine/types';
import { isPlausibleAnswer } from '../../game-engine/answerQuality';
import { computeRoundScores } from '../../game-engine/scoring';
import { getFakeExplanations } from '../../bots/answerPool';
import { pickBotVote } from '../../bots/botBrain';
import { botReadyMs, botSubmitMs, botVoteMs } from '../../bots/botTiming';
import {
  activateWaitingPlayers,
  addSessionScores,
  AnswerRow,
  insertAnswer,
  insertBots,
  insertVote,
  kickPlayer,
  makeUuid,
  resetAllReady,
  Room,
  RoomPlayer,
  setPlayerReady,
  updateRoomWhere,
  VoteRow,
} from '../../services/roomService';

/**
 * VERTSMOTOREN (Fase 1b). Kjøres på ÉN telefon – den der room.host_id ===
 * min bruker-id. Den:
 *  - setter fristene (phase_ends_at) og driver faseskiftene
 *  - fyller rommet med botter når det ikke er nok ekte spillere
 *  - legger inn bot-svar og bot-stemmer til riktig tid (rader i databasen)
 *  - regner og persisterer poeng ved reveal
 *
 * Alle skiftene gjøres med BETINGEDE oppdateringer (updateRoomWhere), så selv
 * om to motorer skulle kjøre samtidig (vertsbytte), vinner nøyaktig én.
 * Faller verten fra, tar en annen klient over (stale-frist → claim host).
 */

const iso = (ms: number) => new Date(ms).toISOString();
const HOST_STALE_MS = 3_500; // frist passert så lenge (KRASJ-fallback) → en annen tar over
const FULL_STABLE_MS = 1_400; // rommet må være fullt så lenge før runden starter (siste ser "koble på")

interface EngineArgs {
  roomId: string;
  myUserId: string | null;
  room: Room | null;
  players: RoomPlayer[];
  answers: AnswerRow[];
  votes: VoteRow[];
  onlineSeekers: number; // antall ekte spillere som søker spill globalt (presence)
}

export function useHostEngine({ roomId, myUserId, room, players, answers, votes, onlineSeekers }: EngineArgs) {
  // Alltid-ferske refs (motoren leser tilstand fra disse i tick/timere)
  const roomRef = useRef(room);
  const playersRef = useRef(players);
  const answersRef = useRef(answers);
  const votesRef = useRef(votes);
  roomRef.current = room;
  playersRef.current = players;
  answersRef.current = answers;
  votesRef.current = votes;
  const onlineSeekersRef = useRef(onlineSeekers);
  onlineSeekersRef.current = onlineSeekers;

  const isHost = !!room && !!myUserId && room.host_id === myUserId;
  const isHostRef = useRef(isHost);
  isHostRef.current = isHost;
  const myIdRef = useRef(myUserId);
  myIdRef.current = myUserId;

  // Pågående overganger (idempotens-lås lokalt; DB-betingelsen er ekte garanti)
  const busyRef = useRef(false);
  // Bot-timere for gjeldende fase
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Ordet for gjeldende runde (med tags til answerPool); mistes ved vertsbytte → fallback
  const wordRef = useRef<Word | null>(null);
  // Når rommet først ble observert fullt (runden starter etter kort stabil periode)
  const fullSinceRef = useRef<number | null>(null);
  // Når siste bot koblet på (til å pace bot-innkoblingen jevnt/tilfeldig)
  const lastBotAtRef = useRef(0);
  // Hvilken fase+runde bot-timerne er satt opp for
  const scheduledForRef = useRef('');

  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  };

  // Aktive = i spill. Ventende (hoppet inn i pågående spill) holdes utenfor
  // rundelogikken til de aktiveres ved neste rundestart.
  const active = () => playersRef.current.filter((p) => !p.left_at && !p.waiting);
  const activeHumans = () => active().filter((p) => !p.is_bot);
  const activeBots = () => active().filter((p) => p.is_bot);
  const waitingPlayers = () => playersRef.current.filter((p) => !p.left_at && p.waiting);

  const currentWord = (): Word => {
    const r = roomRef.current!;
    if (wordRef.current && wordRef.current.word === r.word) return wordRef.current;
    return { id: 'online', word: r.word ?? '', definition: r.definition ?? '', tags: [] } as Word;
  };

  // ---------------------------------------------------------------------------
  // Faseoverganger (vinneren av den betingede oppdateringen gjør etterarbeidet)
  // ---------------------------------------------------------------------------

  const roomLang = () => (roomRef.current?.lang === 'en' ? 'en' : 'no');

  const fillBotsToMax = async () => {
    const r = roomRef.current!;
    const missing = r.max_players - active().length;
    if (missing <= 0) return false;
    await insertBots(
      roomId,
      Array.from({ length: missing }, () => ({ user_id: makeUuid(), username: generateUsername(roomLang()) }))
    );
    return true;
  };

  const startRound = async (fromPhase: 'MATCHMAKING' | 'REVEAL', nextRoundNumber: number) => {
    const r = roomRef.current!;
    // Ordet: bruk forhåndsvalgt next_word (vises i lobbyen), ellers trekk nytt
    let word: Word;
    if (r.next_word && r.next_definition) {
      word = { id: 'online', word: r.next_word, definition: r.next_definition, tags: [] } as Word;
    } else {
      word = pickWord(roomLang());
    }
    wordRef.current = word;
    const won = await updateRoomWhere(
      roomId,
      { phase: fromPhase, round_number: r.round_number },
      {
        phase: 'WRITING',
        status: 'playing',
        round_number: nextRoundNumber,
        word: word.word,
        definition: word.definition,
        next_word: null,
        next_definition: null,
        phase_ends_at: iso(Date.now() + DURATIONS.writingMs),
      }
    );
    return won;
  };

  const toVoting = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const r = roomRef.current!;
      const round = r.round_number;
      const won = await updateRoomWhere(
        roomId,
        { phase: 'WRITING', round_number: round },
        { phase: 'VOTING', phase_ends_at: iso(Date.now() + DURATIONS.votingMs) }
      );
      if (!won) return;
      clearTimers();
      // Bot-planer: alle botter uten svar leverer NÅ (garantert levering)
      const answered = new Set(answersRef.current.map((a) => a.author_id));
      const bots = activeBots().filter((b) => !answered.has(b.user_id));
      if (bots.length) {
        const fakes = getFakeExplanations(currentWord(), bots.length, roomLang());
        for (let i = 0; i < bots.length; i++) {
          await insertAnswer({
            room_id: roomId,
            round_number: round,
            author_id: bots[i].user_id,
            text: fakes[i] ?? 'Ukjent forklaring',
            is_correct: false,
            is_empty: false,
          });
        }
      }
      // Mennesker uten svar → fryst (ikke stembart) svar
      for (const p of activeHumans()) {
        if (!answered.has(p.user_id)) {
          await insertAnswer({
            room_id: roomId,
            round_number: round,
            author_id: p.user_id,
            text: '',
            is_correct: false,
            is_empty: true,
          });
        }
      }
      // Fasit
      await insertAnswer({
        room_id: roomId,
        round_number: round,
        author_id: null,
        text: r.definition ?? '',
        is_correct: true,
        is_empty: false,
      });
    } finally {
      busyRef.current = false;
    }
  };

  const toReveal = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const r = roomRef.current!;
      const round = r.round_number;
      // Velg neste ord NÅ så lobbyen mellom rundene kan vise det (tonet)
      const next = pickWord(roomLang());
      const won = await updateRoomWhere(
        roomId,
        { phase: 'VOTING', round_number: round },
        {
          phase: 'REVEAL',
          phase_ends_at: iso(Date.now() + DURATIONS.interludeMs),
          next_word: next.word,
          next_definition: next.definition,
        }
      );
      if (!won) return;
      clearTimers();
      // Bot-planer: botter som ikke rakk å stemme, stemmer NÅ
      const voted = new Set(votesRef.current.map((v) => v.voter_id));
      const pendingVotes: VoteRow[] = [...votesRef.current];
      const fasitNow = answersRef.current.find((a) => a.is_correct)?.text ?? r.definition ?? '';
      for (const b of activeBots()) {
        if (voted.has(b.user_id)) continue;
        const targets = answersRef.current.filter(
          (a) => !a.is_empty && a.author_id !== b.user_id && isPlausibleAnswer(a.text)
        );
        // Bot-hjernen: vektet valg mot svar som ligner fasiten
        const choice = pickBotVote(targets, fasitNow, roomLang());
        if (!choice) continue;
        await insertVote(roomId, round, b.user_id, choice.id);
        pendingVotes.push({ id: makeUuid(), room_id: roomId, round_number: round, voter_id: b.user_id, answer_id: choice.id });
      }
      // Poeng: regn med de nettopp innsatte stemmene medregnet, og persister
      const byAnswer: Record<string, string[]> = {};
      for (const v of pendingVotes) (byAnswer[v.answer_id] ??= []).push(v.voter_id);
      const ids = active().map((p) => p.user_id);
      const scores = computeRoundScores(ids, answersRef.current, byAnswer);
      await addSessionScores(active(), scores);
      // Klar-status nullstilles for alle; bot-klar planlegges i fase-effekten
      await resetAllReady(roomId);
    } finally {
      busyRef.current = false;
    }
  };

  const nextRoundFromReveal = async (kickUnready: boolean) => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const r = roomRef.current!;
      // KAMPSLUTT: etter siste runde → finalesiden (ingen kastes ut; alle får se
      // sluttresultatet og lukker selv med X)
      if (r.round_number >= MATCH.rounds) {
        await updateRoomWhere(
          roomId,
          { phase: 'REVEAL', round_number: r.round_number },
          { phase: 'FINISHED', status: 'finished', phase_ends_at: iso(Date.now() + MATCH.finaleMs) }
        );
        return;
      }
      // (Ikke-klare spillere kastes IKKE ut – de blir med videre i neste runde.)
      void kickUnready;
      // Ventende spillere (hoppet inn i pågående spill) aktiveres NÅ – og de
      // nyeste bottene gir fra seg plassene sine.
      const joiners = waitingPlayers();
      if (joiners.length) {
        const bots = activeBots().sort((a, b) => Date.parse(b.joined_at) - Date.parse(a.joined_at));
        const seatsNeeded = Math.max(0, active().length + joiners.length - r.max_players);
        for (const b of bots.slice(0, seatsNeeded)) await kickPlayer(roomId, b.user_id);
        await activateWaitingPlayers(roomId);
      }
      await fillBotsToMax();
      await startRound('REVEAL', r.round_number + 1);
    } finally {
      busyRef.current = false;
    }
  };

  /**
   * Lobby-styring: mennesker har alltid forrang. Blir rommet overfylt (menneske
   * kom samtidig som siste bot), forlater den sist tilkomne boten rommet.
   * Runden starter når rommet har vært fullt en kort stabil periode.
   */
  const lobbyTick = async (deadlinePassed: boolean) => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const r = roomRef.current!;
      const act = active();
      const humans = act.filter((p) => !p.is_bot).length;
      // Er det ekte spillere UTENFOR rommet som fortsatt kan koble seg på? (globalt
      // antall søkende minus de menneskene som allerede er her). Er det ingen andre,
      // trenger vi ikke vente – da kan bottene fylle rommet og runden starte tidlig.
      const othersSeeking = Math.max(0, onlineSeekersRef.current - humans);
      const soloContext = othersSeeking === 0;
      // ERSTATT BOT: kom et menneske inn i et (nesten) fullt rom, dyttes den SIST
      // tilkomne boten ut så mennesket får plassen (join_open_room teller bare folk).
      if (act.length > r.max_players) {
        const bots = act
          .filter((p) => p.is_bot)
          .sort((a, b) => Date.parse(b.joined_at) - Date.parse(a.joined_at)); // nyeste først
        const excess = act.length - r.max_players;
        for (const b of bots.slice(0, excess)) await kickPlayer(roomId, b.user_id);
        fullSinceRef.current = null;
        return;
      }
      // Bot-innkobling med kontekst-styrt tempo (én om gangen, tilfeldig):
      //  - solo (ingen andre søker): koble på RASKT så baren ikke renner ut
      //  - andre online: spre utover slik at siste bot lander rett før fristen,
      //    så rommet holdes åpent og mennesker kan hoppe inn og dytte ut en bot
      if (act.length < r.max_players) {
        fullSinceRef.current = null;
        if (deadlinePassed) {
          await fillBotsToMax(); // sikkerhet: fyll resten ved fristen
          return;
        }
        // Anker tempoet ved første tick – første bot venter også ett naturlig gap
        if (!lastBotAtRef.current) {
          lastBotAtRef.current = Date.now();
          return;
        }
        const missing = r.max_players - act.length;
        const ends = r.phase_ends_at ? Date.parse(r.phase_ends_at) : Date.now() + DURATIONS.matchmakingMs;
        const remaining = Math.max(0, ends - Date.now());
        let gap: number;
        if (soloContext) {
          gap = 500 + Math.random() * 700; // ~0,5–1,2 s mellom botter → fullt på et par sekund
        } else {
          const window = Math.max(1_000, remaining - 1_800); // sikt: siste bot ~1,8 s før slutt
          gap = (window / missing) * (0.55 + Math.random() * 0.9); // jevnt fordelt med litt slark
        }
        if (Date.now() - lastBotAtRef.current >= gap) {
          lastBotAtRef.current = Date.now();
          await insertBots(roomId, [{ user_id: makeUuid(), username: generateUsername(roomLang()) }]);
        }
        return;
      }
      // Fullt. Start når stabilt OG (nok mennesker ELLER ingen andre søker ELLER
      // frist passert). Venter bare hvis det finnes andre ekte spillere som kan komme.
      if (!fullSinceRef.current) {
        fullSinceRef.current = Date.now();
        return;
      }
      // Start tidlig KUN når ingen andre kan komme: enten søker ingen andre spill,
      // eller rommet er allerede fullt av mennesker (ingen ledig plass til andre).
      // Er det ledige plasser OG andre søker, venter vi til fristen.
      const stable = Date.now() - fullSinceRef.current >= FULL_STABLE_MS;
      if (stable && (soloContext || humans >= r.max_players || deadlinePassed)) await startRound('MATCHMAKING', 1);
    } finally {
      busyRef.current = false;
    }
  };

  // ---------------------------------------------------------------------------
  // Tick (1s): frister, vertsovertakelse, lobby-oppstart. Kjøres OGSÅ straks –
  // ordet + timeren skal ikke vente på første intervall (dukket opp forsinket).
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const tick = () => {
      const r = roomRef.current;
      const me = myIdRef.current;
      if (!r || !me) return;
      const now = Date.now();
      const ends = r.phase_ends_at ? Date.parse(r.phase_ends_at) : null;

      if (!isHostRef.current) {
        // Vertsovertakelse. To tilfeller:
        //  1) Verten forlot rommet pent (left_at satt / borte) → ta roret STRAKS,
        //     så rommet ikke fryser. Betinget update ⇒ nøyaktig én vinner.
        //  2) Verten krasjet (ingen left_at): fristen passert lenge → ta over.
        const hostPresent = playersRef.current.some((p) => p.user_id === r.host_id && !p.left_at);
        const staleCrash = ends && now > ends + HOST_STALE_MS;
        if (!hostPresent || staleCrash) {
          updateRoomWhere(roomId, { host_id: r.host_id }, { host_id: me }).catch(() => {});
        }
        return;
      }

      // SIKKERHETSNETT (maks 5): blir rommet av en eller annen grunn overfullt
      // (racende innhopp, gammel klientversjon…), kastes nyeste bot(er) straks.
      {
        const act = active();
        if (act.length > r.max_players) {
          const excessBots = act
            .filter((p) => p.is_bot)
            .sort((a, b) => Date.parse(b.joined_at) - Date.parse(a.joined_at))
            .slice(0, act.length - r.max_players);
          for (const b of excessBots) kickPlayer(roomId, b.user_id).catch(() => {});
        }
      }

      switch (r.phase) {
        case 'MATCHMAKING': {
          if (!ends || !r.next_word) {
            // Frist OG ord settes i SAMME oppdatering – ellers dukker ordet opp
            // et par sekunder etter resten av siden.
            const w = pickWord(roomLang()); // LIGAENS liste, minst brukte ord først
            updateRoomWhere(roomId, { phase: 'MATCHMAKING' }, {
              phase_ends_at: ends ? r.phase_ends_at : iso(now + DURATIONS.matchmakingMs),
              next_word: r.next_word ?? w.word,
              next_definition: r.next_definition ?? w.definition,
            }).catch(() => {});
          } else {
            void lobbyTick(now >= ends);
          }
          break;
        }
        case 'WRITING':
          if (ends && now >= ends) void toVoting();
          break;
        case 'VOTING':
          if (ends && now >= ends) void toReveal();
          break;
        case 'REVEAL':
          if (ends && now >= ends) void nextRoundFromReveal(true);
          break;
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
    // Re-armes når rommet/fasen/vertsstatus lander → umiddelbar init uten ventetick
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, room?.phase, isHost]);

  // ---------------------------------------------------------------------------
  // Datadrevne tidlig-skift (alle levert / alle stemt / alle klare)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isHost || !room) return;
    const act = players.filter((p) => !p.left_at && !p.waiting);
    if (!act.length) return;

    if (room.phase === 'WRITING') {
      const answered = new Set(answers.filter((a) => a.author_id).map((a) => a.author_id));
      if (act.every((p) => answered.has(p.user_id))) {
        const t = setTimeout(() => void toVoting(), 1_700); // la siste hvit-fade fullføre
        return () => clearTimeout(t);
      }
    } else if (room.phase === 'VOTING') {
      const voted = new Set(votes.map((v) => v.voter_id));
      if (act.every((p) => voted.has(p.user_id))) {
        const t = setTimeout(() => void toReveal(), 700);
        return () => clearTimeout(t);
      }
    } else if (room.phase === 'REVEAL') {
      // Vakt: klar-flagg fra forrige runde kan henge igjen til nullstillingen
      // har landet – godta "alle klare" først etter at poengene er vist.
      const ends = room.phase_ends_at ? Date.parse(room.phase_ends_at) : null;
      const elapsed = ends ? DURATIONS.interludeMs - (ends - Date.now()) : 0;
      if (elapsed > DURATIONS.revealMs + 500 && act.every((p) => p.ready)) {
        const t = setTimeout(() => void nextRoundFromReveal(false), 400);
        return () => clearTimeout(t);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, room?.phase, room?.round_number, players, answers, votes]);

  // ---------------------------------------------------------------------------
  // Bot-oppførsel per fase: leverer/stemmer til naturlige tider
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isHost || !room) return;
    const key = `${room.phase}:${room.round_number}`;
    if (scheduledForRef.current === key) return;
    scheduledForRef.current = key;
    clearTimers();

    if (room.phase === 'WRITING') {
      const round = room.round_number;
      const bots = activeBots();
      const fakes = getFakeExplanations(currentWord(), bots.length, roomLang());
      bots.forEach((b, i) => {
        timersRef.current.push(
          setTimeout(() => {
            // Boten kan ha blitt overtatt av et menneske (hopp-inn) → ikke lever
            if (!activeBots().some((x) => x.user_id === b.user_id)) return;
            insertAnswer({
              room_id: roomId,
              round_number: round,
              author_id: b.user_id,
              text: fakes[i] ?? 'Ukjent forklaring',
              is_correct: false,
              is_empty: false,
            }).catch(() => {});
          }, botSubmitMs(DURATIONS.writingMs))
        );
      });
    } else if (room.phase === 'VOTING') {
      const round = room.round_number;
      activeBots().forEach((b) => {
        timersRef.current.push(
          setTimeout(() => {
            // Boten kan ha blitt overtatt av et menneske (hopp-inn) → ikke stem
            if (!activeBots().some((x) => x.user_id === b.user_id)) return;
            const targets = answersRef.current.filter(
              (a) => !a.is_empty && a.author_id !== b.user_id && isPlausibleAnswer(a.text)
            );
            // Bot-hjernen: vektet valg mot svar som ligner fasiten
            const fasit = answersRef.current.find((a) => a.is_correct)?.text ?? roomRef.current?.definition ?? '';
            const choice = pickBotVote(targets, fasit, roomLang());
            if (!choice) return;
            insertVote(roomId, round, b.user_id, choice.id).catch(() => {});
          }, botVoteMs(DURATIONS.votingMs))
        );
      });
    } else if (room.phase === 'REVEAL') {
      // Bottene trykker "klar til neste runde" til naturlige tider
      activeBots().forEach((b) => {
        timersRef.current.push(
          setTimeout(() => {
            if (!activeBots().some((x) => x.user_id === b.user_id)) return;
            setPlayerReady(roomId, b.user_id, true).catch(() => {});
          }, botReadyMs())
        );
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, room?.phase, room?.round_number]);

  // Rydd ved avmontering
  useEffect(() => clearTimers, []);
}
