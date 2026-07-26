import { backupSession } from '../lib/persistentIdentity';
import { supabase } from '../lib/supabaseClient';

/**
 * Flerspiller-datalag mot Supabase (Fase 1b). Speiler `app/supabase/schema.sql`.
 *
 * Modell: VERT-STYRT. Verten (rooms.host_id) driver fasene: velger ord, fyller
 * botter (rader i room_players med is_bot=true), setter phase/phase_ends_at,
 * legger inn bot-svar/-stemmer og persisterer poeng. Alle klienter (vert også)
 * RENDRER kun fra abonnert tilstand – ingen ser forskjell på bot og menneske.
 */

export type RoomPhase = 'MATCHMAKING' | 'WRITING' | 'VOTING' | 'REVEAL' | 'FINISHED';

export interface Room {
  id: string;
  status: string;
  phase: RoomPhase;
  round_number: number;
  word: string | null;
  definition: string | null;
  next_word: string | null;
  next_definition: string | null;
  phase_ends_at: string | null;
  host_id: string | null;
  max_players: number;
  lang: 'no' | 'en'; // liga – norsk og engelsk er helt atskilt
}

export interface RoomPlayer {
  id: string;
  room_id: string;
  user_id: string;
  username: string;
  is_host: boolean;
  is_bot: boolean;
  session_score: number;
  ready: boolean;
  waiting: boolean; // hoppet inn i pågående spill – venter til neste runde
  joined_at: string;
  left_at: string | null;
}

export interface AnswerRow {
  id: string;
  room_id: string;
  round_number: number;
  author_id: string | null; // null = fasit
  text: string;
  is_correct: boolean;
  is_empty: boolean;
  sort_key: number;
}

export interface VoteRow {
  id: string;
  room_id: string;
  round_number: number;
  voter_id: string;
  answer_id: string;
}

// Pakk ut Supabase/PostgREST-feil (vanlige objekter, ikke Error-instanser)
export const errText = (e: unknown): string => {
  if (e == null) return 'ukjent';
  if (typeof e === 'string') return e;
  const o = e as { message?: string; code?: string; details?: string; hint?: string };
  const parts = [o.message, o.code, o.details, o.hint].filter(Boolean);
  if (parts.length) return parts.join(' | ');
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
};

/** Enkel uuid v4 (til bot-id-er; Hermes mangler crypto.randomUUID). */
export function makeUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

let cachedUserId: string | null = null;

/** Sørg for at vi er innlogget (anonymt). Returnerer bruker-id (auth.uid). */
export async function ensureSignedIn(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.user) {
    cachedUserId = session.user.id;
    void backupSession(); // Keychain-speil → samme identitet etter re-installasjon
    return cachedUserId;
  }
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  cachedUserId = data.user!.id;
  void backupSession();
  return cachedUserId;
}

export function currentUserId(): string | null {
  return cachedUserId;
}

// ---------------------------------------------------------------------------
// Global rangliste
// ---------------------------------------------------------------------------
export interface RatingRow {
  user_id: string;
  username: string;
  rating: number;
  rounds: number;
}

/** Speil egen rating til LIGAENS rangliste (etter hver runde). */
export async function upsertMyRating(
  username: string,
  rating: number,
  rounds: number,
  lang: 'no' | 'en' = 'no'
): Promise<void> {
  try {
    await ensureSignedIn();
    if (!cachedUserId) return;
    await supabase.from('ratings').upsert(
      {
        user_id: cachedUserId,
        lang,
        username,
        rating,
        rounds,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,lang' }
    );
  } catch {
    // stille – prøves igjen etter neste runde
  }
}

/** Ligaens rangliste, best først. */
export async function fetchRatings(lang: 'no' | 'en' = 'no'): Promise<RatingRow[]> {
  await ensureSignedIn();
  const { data, error } = await supabase
    .from('ratings')
    .select('user_id, username, rating, rounds')
    .eq('lang', lang)
    .order('rating', { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data as RatingRow[]) ?? [];
}

/**
 * Krev et SPESIFIKT brukernavn (onboarding/omdøping). 'taken' = opptatt av en
 * annen; 'offline' = fikk ikke sjekket (nett) – da aksepteres navnet lokalt.
 */
export async function claimSpecificUsername(name: string): Promise<'ok' | 'taken' | 'offline'> {
  try {
    await ensureSignedIn();
    if (!cachedUserId) return 'offline';
    const { error } = await supabase
      .from('claimed_usernames')
      .insert({ username: name.toLowerCase(), display: name, user_id: cachedUserId });
    if (!error) return 'ok';
    if ((error as { code?: string }).code === '23505') return 'taken';
    return 'offline';
  } catch {
    return 'offline';
  }
}

/**
 * Krev et UNIKT brukernavn: først til mølla i claimed_usernames-tabellen.
 * Kolliderer navnet (primary key), genereres et nytt – opptil 12 forsøk.
 * Returnerer navnet som ble vunnet, eller null (offline / alt opptatt).
 */
export async function claimUniqueUsername(generate: () => string): Promise<string | null> {
  await ensureSignedIn();
  if (!cachedUserId) return null;
  for (let i = 0; i < 12; i++) {
    const name = generate();
    const { error } = await supabase
      .from('claimed_usernames')
      .insert({ username: name.toLowerCase(), display: name, user_id: cachedUserId });
    if (!error) return name;
  }
  return null;
}

/** Bli med i et åpent rom i gitt liga (eller lag et nytt). Returnerer rom-id. */
export async function joinOpenRoom(username: string, lang: 'no' | 'en' = 'no'): Promise<string> {
  await ensureSignedIn();
  const { data, error } = await supabase.rpc('join_open_room', { p_username: username, p_lang: lang });
  if (error) throw error;
  return data as string;
}

/** Hopp inn i et pågående spill i gitt liga. null = vinduet lukket seg. */
export async function joinOngoingRoom(username: string, lang: 'no' | 'en' = 'no'): Promise<string | null> {
  await ensureSignedIn();
  const { data, error } = await supabase.rpc('join_ongoing_room', { p_username: username, p_lang: lang });
  if (error) throw error;
  return (data as string | null) ?? null;
}

/** Fins det et pågående spill i ligaen man kan hoppe inn i? (hjemskjerm-puls) */
export async function joinableGameExists(lang: 'no' | 'en' = 'no'): Promise<boolean> {
  await ensureSignedIn();
  const { data, error } = await supabase.rpc('joinable_game_exists', { p_lang: lang });
  if (error) return false;
  return data === true;
}

export async function fetchRoom(roomId: string): Promise<Room | null> {
  const { data, error } = await supabase.from('rooms').select('*').eq('id', roomId).single();
  if (error) throw error;
  return (data as Room) ?? null;
}

/** Aktive spillere i rommet (inkl. botter), i innmeldingsrekkefølge. */
export async function fetchPlayers(roomId: string): Promise<RoomPlayer[]> {
  const { data, error } = await supabase
    .from('room_players')
    .select('*')
    .eq('room_id', roomId)
    .is('left_at', null)
    .order('joined_at', { ascending: true });
  if (error) throw error;
  return (data as RoomPlayer[]) ?? [];
}

// Henter ALLE runder for rommet – klient/vert filtrerer på gjeldende runde.
// (Unngår kappløp der en henting bruker forrige rundes nummer ved rundebytte.)
export async function fetchAnswers(roomId: string): Promise<AnswerRow[]> {
  const { data, error } = await supabase
    .from('answers')
    .select('*')
    .eq('room_id', roomId)
    .order('sort_key', { ascending: true });
  if (error) throw error;
  return (data as AnswerRow[]) ?? [];
}

export async function fetchVotes(roomId: string): Promise<VoteRow[]> {
  const { data, error } = await supabase.from('votes').select('*').eq('room_id', roomId);
  if (error) throw error;
  return (data as VoteRow[]) ?? [];
}

// ---------------------------------------------------------------------------
// Spillerhandlinger (alle klienter)
// ---------------------------------------------------------------------------

/** Send inn mitt svar for runden. */
export async function submitMyAnswer(roomId: string, round: number, text: string): Promise<void> {
  if (!cachedUserId) return;
  const { error } = await supabase.from('answers').insert({
    room_id: roomId,
    round_number: round,
    author_id: cachedUserId,
    text,
    is_correct: false,
    is_empty: false,
  });
  if (error && !`${error.code}`.includes('23505')) throw error; // 23505 = allerede levert
}

/** Lås min stemme for runden. */
export async function castMyVote(roomId: string, round: number, answerId: string): Promise<void> {
  if (!cachedUserId) return;
  const { error } = await supabase.from('votes').insert({
    room_id: roomId,
    round_number: round,
    voter_id: cachedUserId,
    answer_id: answerId,
  });
  if (error && !`${error.code}`.includes('23505')) throw error;
}

/** Marker meg klar / ikke klar til neste runde. */
export async function setMyReady(roomId: string, ready: boolean): Promise<void> {
  if (!cachedUserId) return;
  await supabase.from('room_players').update({ ready }).eq('room_id', roomId).eq('user_id', cachedUserId);
}

/** Forlat rommet (soft-leave). Siste menneske ut STENGER rommet, så gamle rom
 *  med bare botter aldri blir liggende og fange nye spillere i matchmaking. */
export async function leaveRoom(roomId: string): Promise<void> {
  if (!cachedUserId) return;
  await supabase
    .from('room_players')
    .update({ left_at: new Date().toISOString() })
    .eq('room_id', roomId)
    .eq('user_id', cachedUserId);
  try {
    const { data } = await supabase
      .from('room_players')
      .select('id')
      .eq('room_id', roomId)
      .is('left_at', null)
      .eq('is_bot', false)
      .limit(1);
    if (!data || data.length === 0) {
      await supabase.from('rooms').update({ status: 'finished' }).eq('id', roomId);
    }
  } catch {
    // best effort – ferskhetsvakten i join_open_room fanger uansett opp rester
  }
}

// ---------------------------------------------------------------------------
// Vertsoperasjoner (kjøres kun av verten via useHostEngine)
// ---------------------------------------------------------------------------

/**
 * Betinget oppdatering av rommet: skriver `set` KUN hvis raden fortsatt matcher
 * `match`. Returnerer true hvis vi vant (nøyaktig én driver faseskiftet).
 */
export async function updateRoomWhere(
  roomId: string,
  match: Record<string, unknown>,
  set: Record<string, unknown>
): Promise<boolean> {
  let q = supabase.from('rooms').update(set).eq('id', roomId);
  for (const [k, v] of Object.entries(match)) {
    q = v === null ? q.is(k, null) : q.eq(k, v);
  }
  const { data, error } = await q.select('id');
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/** Fyll rommet med botter opp til maks (verten kaller ved rundestart/lobbyslutt). */
export async function insertBots(roomId: string, bots: { user_id: string; username: string }[]): Promise<void> {
  if (!bots.length) return;
  const { error } = await supabase.from('room_players').insert(
    bots.map((b) => ({
      room_id: roomId,
      user_id: b.user_id,
      username: b.username,
      is_host: false,
      is_bot: true,
      ready: true,
    }))
  );
  if (error && !`${error.code}`.includes('23505')) throw error;
}

/** Vert: legg inn et svar på vegne av en bot (eller tomt/fasit-svar). */
export async function insertAnswer(row: {
  room_id: string;
  round_number: number;
  author_id: string | null;
  text: string;
  is_correct: boolean;
  is_empty: boolean;
}): Promise<void> {
  const { error } = await supabase.from('answers').insert(row);
  if (error && !`${error.code}`.includes('23505')) throw error;
}

/** Vert: stemme på vegne av en bot. */
export async function insertVote(roomId: string, round: number, voterId: string, answerId: string): Promise<void> {
  const { error } = await supabase.from('votes').insert({
    room_id: roomId,
    round_number: round,
    voter_id: voterId,
    answer_id: answerId,
  });
  if (error && !`${error.code}`.includes('23505')) throw error;
}

/** Vert: sett klar-status for en gitt spiller (bot-klar i lobbyen). */
export async function setPlayerReady(roomId: string, userId: string, ready: boolean): Promise<void> {
  await supabase.from('room_players').update({ ready }).eq('room_id', roomId).eq('user_id', userId);
}

/** Vert: nullstill klar-status for alle i rommet (ved reveal-start). */
export async function resetAllReady(roomId: string): Promise<void> {
  await supabase.from('room_players').update({ ready: false }).eq('room_id', roomId);
}

/** Vert: aktiver ventende spillere (hoppet inn i pågående spill) ved rundestart. */
export async function activateWaitingPlayers(roomId: string): Promise<void> {
  await supabase
    .from('room_players')
    .update({ waiting: false })
    .eq('room_id', roomId)
    .eq('waiting', true)
    .is('left_at', null);
}

/** Vert: legg rundepoeng til spillernes totalsum. */
export async function addSessionScores(players: RoomPlayer[], scores: Record<string, number>): Promise<void> {
  for (const p of players) {
    const delta = scores[p.user_id] ?? 0;
    if (!delta) continue;
    await supabase
      .from('room_players')
      .update({ session_score: p.session_score + delta })
      .eq('id', p.id);
  }
}

/** Vert: kast ut spiller som ikke trykket klar i tide (bot tar plassen neste runde). */
export async function kickPlayer(roomId: string, userId: string): Promise<void> {
  await supabase
    .from('room_players')
    .update({ left_at: new Date().toISOString() })
    .eq('room_id', roomId)
    .eq('user_id', userId);
}

// ---------------------------------------------------------------------------
// Sanntid
// ---------------------------------------------------------------------------

interface GameSubHandlers {
  onRoom?: (room: Room) => void;
  onPlayers?: (players: RoomPlayer[]) => void;
  onAnswers?: (answers: AnswerRow[]) => void;
  onVotes?: (votes: VoteRow[]) => void;
  onError?: (where: string, msg: string) => void;
}

/**
 * Abonner på hele spilltilstanden for ett rom. Henter først (så initial-data
 * kommer selv om realtime skulle feile), abonnerer så på endringer.
 * Returnerer { unsubscribe, refreshAll }.
 */
export function subscribeGame(
  roomId: string,
  handlers: GameSubHandlers
): { unsubscribe: () => void; refreshAll: () => void } {
  const refreshRoom = () => {
    if (handlers.onRoom)
      fetchRoom(roomId)
        .then((r) => r && handlers.onRoom!(r))
        .catch((e) => handlers.onError?.('room', errText(e)));
  };
  const refreshPlayers = () => {
    if (handlers.onPlayers)
      fetchPlayers(roomId)
        .then(handlers.onPlayers)
        .catch((e) => handlers.onError?.('players', errText(e)));
  };
  const refreshAnswers = () => {
    if (handlers.onAnswers)
      fetchAnswers(roomId)
        .then(handlers.onAnswers)
        .catch((e) => handlers.onError?.('answers', errText(e)));
  };
  const refreshVotes = () => {
    if (handlers.onVotes)
      fetchVotes(roomId)
        .then(handlers.onVotes)
        .catch((e) => handlers.onError?.('votes', errText(e)));
  };
  const refreshAll = () => {
    refreshRoom();
    refreshPlayers();
    refreshAnswers();
    refreshVotes();
  };

  refreshAll();

  let channel: ReturnType<typeof supabase.channel> | null = null;
  try {
    channel = supabase
      .channel(`game:${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, () => {
        refreshRoom();
        // rundebytte → svar/stemmer for ny runde
        refreshAnswers();
        refreshVotes();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_players', filter: `room_id=eq.${roomId}` }, refreshPlayers)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'answers', filter: `room_id=eq.${roomId}` }, refreshAnswers)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'votes', filter: `room_id=eq.${roomId}` }, refreshVotes)
      .subscribe();
  } catch (e) {
    handlers.onError?.('realtime', errText(e));
  }

  return {
    unsubscribe: () => {
      if (channel) supabase.removeChannel(channel);
    },
    refreshAll,
  };
}
