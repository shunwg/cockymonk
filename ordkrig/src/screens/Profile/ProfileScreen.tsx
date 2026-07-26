import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, opacity, radius, sizes, spacing, typography } from '../../config/theme';
import { GOOD_ANSWER_MIN_VOTES } from '../../config/gameConfig';
import { currentRating, displayName, ensureAutoUsername, loadProfile, Profile, setUsername, statsForLeague } from '../../services/profileStore';
import { claimSpecificUsername, currentUserId, fetchRatings, RatingRow, upsertMyRating } from '../../services/roomService';
import { DESIGNS, setDesign, useDesign } from '../../config/designs';
import { League, setLeague, STRINGS, useLeague, useStrings } from '../../config/i18n';
import { UserIcon } from '../shared/UserIcon';
import { Button } from '../shared/Button';

export function ProfileScreen({ onBack, onUsernameChange }: { onBack: () => void; onUsernameChange: (name: string) => void }) {
  const design = useDesign();
  const league = useLeague();
  const t = useStrings();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [nameTaken, setNameTaken] = useState(false);
  // Rangliste-vinduet (åpnes ved å trykke på egen rating)
  const [showBoard, setShowBoard] = useState(false);
  const [board, setBoard] = useState<RatingRow[] | null>(null);
  const boardScrollRef = useRef<ScrollView | null>(null);
  const me = currentUserId();

  useEffect(() => {
    loadProfile().then((p) => {
      setProfile(p);
      // Sørg for at egen rating ligger i LIGAENS liste
      const r = currentRating(p, league);
      if (r != null) void upsertMyRating(displayName(p, league), r, statsForLeague(p, league).rounds, league);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [league]);

  // Hent ranglisten når vinduet åpnes, og rull automatisk til egen rad
  useEffect(() => {
    if (!showBoard) return;
    setBoard(null);
    fetchRatings(league)
      .then((rows) => {
        setBoard(rows);
        const idx = rows.findIndex((r) => r.user_id === me);
        if (idx > 3) {
          setTimeout(() => boardScrollRef.current?.scrollTo({ y: idx * 44 - 140, animated: false }), 60);
        }
      })
      .catch(() => setBoard([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showBoard, league]);

  const shownName = profile ? displayName(profile, league) : '';
  const nameLocked = league === 'en' ? !!profile?.usernameChangedEn : !!profile?.usernameChanged;

  const startEdit = () => {
    setDraft(shownName);
    setEditing(true);
  };

  const saveName = async () => {
    const wanted = draft.trim();
    if (!wanted) return;
    setNameTaken(false);
    if (wanted !== shownName) {
      const res = await claimSpecificUsername(wanted);
      if (res === 'taken') {
        setNameTaken(true);
        return;
      }
    }
    const p = await setUsername(wanted, league);
    setProfile(p);
    setEditing(false);
    onUsernameChange(displayName(p, league));
  };

  const switchLeague = (l: League) => {
    if (l === league) return;
    setLeague(l);
    setEditing(false);
    // Engelsk liga første gang → krev engelsk kallenavn, oppdater visningen
    ensureAutoUsername(l)
      .then(() => loadProfile().then((p) => {
        setProfile({ ...p });
        onUsernameChange(displayName(p, l));
      }))
      .catch(() => {});
  };

  if (!profile) {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={styles.dim}>{t.loadingProfile}</Text>
      </View>
    );
  }

  const rating = currentRating(profile, league);
  const S = statsForLeague(profile, league); // liga-skopede tall til boblene

  return (
    <View style={[styles.root, { backgroundColor: design.background }]}>
      <View style={styles.topbar}>
        <Pressable onPress={onBack} hitSlop={12} style={styles.back}>
          <Text style={[styles.backChevron, { color: design.text }]}>‹</Text>
          <Text style={[styles.backText, { color: design.text }]}>{t.back}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Identitet */}
        <View style={styles.identity}>
          <View style={styles.avatar}>
            <UserIcon size={44} ring={false} />
          </View>

          {editing ? (
            <View style={styles.editWrap}>
              <TextInput
                style={[styles.nameInput, { color: design.text, borderColor: design.outline }]}
                value={draft}
                onChangeText={setDraft}
                autoFocus
                maxLength={16}
                placeholder="Brukernavn"
                placeholderTextColor={colors.textSecondary}
                returnKeyType="done"
                onSubmitEditing={saveName}
              />
              <Text style={[styles.warn, nameTaken && { color: '#e5484d', fontWeight: '600' }]}>
                {nameTaken ? t.nameTaken : t.usernameOnce}
              </Text>
              <View style={styles.editButtons}>
                <Button label={t.cancel} style={styles.editBtn} onPress={() => setEditing(false)} />
                <Button label={t.save} style={styles.editBtn} onPress={saveName} disabled={!draft.trim()} />
              </View>
            </View>
          ) : (
            <>
              <Text style={[styles.username, { color: design.text }]}>{shownName}</Text>
              {nameLocked ? (
                <Text style={styles.dim}>{t.usernameLocked}</Text>
              ) : (
                <Pressable onPress={startEdit} hitSlop={8}>
                  <Text style={styles.editLink}>{t.changeUsername}</Text>
                </Pressable>
              )}
            </>
          )}

          {/* LIGA: rett under brukernavnet – norsk og engelsk er helt atskilt */}
          <View style={styles.leagueRow}>
            {(['no', 'en'] as const).map((l) => {
              const sel = l === league;
              return (
                <Pressable
                  key={l}
                  onPress={() => switchLeague(l)}
                  style={[
                    styles.leaguePill,
                    { borderColor: design.outline },
                    sel && { backgroundColor: design.fill },
                  ]}
                  hitSlop={6}
                >
                  <Text style={[styles.leagueText, { color: sel ? design.fillText : design.textDim }]}>
                    {l === 'no' ? '🇳🇴 ' : '🇬🇧 '}
                    {STRINGS[l].leagueName}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.leagueSub}>{t.leagueSub}</Text>
        </View>

        {/* 2×2-rutenett: gjett | rating (trykkbar) / runder | poeng */}
        <View style={styles.statGrid}>
          <View style={[styles.stat, { borderColor: design.outline }]}>
            <Text style={[styles.statNum, { color: design.text }]}>
              {S.correct}/{S.guessRounds}
            </Text>
            <Text style={styles.statLabel}>{t.statCorrect}</Text>
            <Text style={[styles.statSub, { color: design.textDim }]}>
              {S.votes} {t.votes}
            </Text>
          </View>

          <Pressable
            onPress={() => rating != null && setShowBoard(true)}
            style={[styles.stat, { borderColor: design.outline }]}
          >
            <Text style={[styles.statNum, { color: design.text }]}>{rating ?? '–'}</Text>
            <Text style={styles.statLabel}>{t.rating}</Text>
            <Text style={[styles.statSub, { color: design.textDim }]}>
              {rating != null ? t.ratingSub(S.rounds) : t.ratingNone}
            </Text>
          </Pressable>

          <View style={[styles.stat, { borderColor: design.outline }]}>
            <Text style={[styles.statNum, { color: design.text }]}>{S.played}</Text>
            <Text style={styles.statLabel}>{t.roundsPlayed}</Text>
          </View>
          <View style={[styles.stat, { borderColor: design.outline }]}>
            <Text style={[styles.statNum, { color: design.text }]}>{S.points.toLocaleString('no')}</Text>
            <Text style={styles.statLabel}>{t.totalPoints}</Text>
          </View>
        </View>

        {/* Gode forklaringer */}
        <Text style={[styles.sectionTitle, { color: design.text }]}>{t.goodAnswers}</Text>
        <Text style={styles.sectionSub}>{t.goodAnswersSub(GOOD_ANSWER_MIN_VOTES)}</Text>

        {profile.goodExplanations.length === 0 ? (
          <View style={[styles.emptyCard, { borderColor: design.outline }]}>
            <Text style={styles.dim}>{t.goodAnswersEmpty}</Text>
          </View>
        ) : (
          profile.goodExplanations.map((g, i) => (
            <View key={`${g.at}-${i}`} style={styles.goodCard}>
              <View style={styles.goodHeader}>
                <Text style={styles.goodWord}>{g.word}</Text>
                <View style={[styles.votePill, { backgroundColor: design.fill }]}>
                  <Text style={[styles.voteText, { color: design.fillText }]}>{g.votes} {t.votes}</Text>
                </View>
              </View>
              <Text style={styles.goodText}>{g.text}</Text>
            </View>
          ))
        )}

        {/* Design – helt nederst i innstillingene */}
        <Text style={[styles.sectionTitle, { color: design.text }, styles.designTitle]}>{t.design}</Text>
        <Text style={styles.sectionSub}>{t.designSub}</Text>
        <View style={styles.designRow}>
          {DESIGNS.map((d) => {
            const selected = d.key === design.key;
            return (
              <Pressable key={d.key} onPress={() => setDesign(d.key)} style={styles.designItem} hitSlop={6}>
                <View
                  style={[
                    styles.swatch,
                    { backgroundColor: d.background },
                    selected && { borderColor: d.accent, borderWidth: 3 },
                  ]}
                >
                  <View style={[styles.swatchDot, { backgroundColor: d.fill }]} />
                  <View style={[styles.swatchBar, { backgroundColor: d.accent }]} />
                </View>
                <Text style={[styles.designName, selected && [styles.designNameSel, { color: design.text }]]}>{d.name}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.footNote}>{t.globalNote}</Text>
      </ScrollView>

      {/* RANGLISTE-VINDU: legger seg over profilen, auto-rullet til egen rad */}
      {showBoard && (
        <View style={styles.boardScrim}>
          <View style={[styles.boardPanel, { backgroundColor: design.background, borderColor: design.outline }]}>
            <View style={styles.boardHead}>
              <Text style={[styles.boardTitle, { color: design.text }]}>{t.leaderboard}</Text>
              <Pressable onPress={() => setShowBoard(false)} hitSlop={10} style={[styles.boardX, { borderColor: design.outline }]}>
                <Text style={[styles.boardXText, { color: design.text }]}>✕</Text>
              </Pressable>
            </View>
            {board === null ? (
              <Text style={[styles.dim, styles.boardMsg]}>…</Text>
            ) : board.length === 0 ? (
              <Text style={[styles.dim, styles.boardMsg]}>{t.leaderboardEmpty}</Text>
            ) : (
              <ScrollView ref={boardScrollRef} showsVerticalScrollIndicator={false}>
                {board.map((r, i) => {
                  const isMe = r.user_id === me;
                  return (
                    <View
                      key={r.user_id}
                      style={[styles.boardRow, isMe && { backgroundColor: design.fill, borderRadius: 12 }]}
                    >
                      <Text style={[styles.boardRank, { color: isMe ? design.fillText : design.textDim }]}>
                        {i + 1}
                      </Text>
                      <Text style={[styles.boardName, { color: isMe ? design.fillText : design.text }]} numberOfLines={1}>
                        {r.username}
                      </Text>
                      <Text style={[styles.boardRating, { color: isMe ? design.fillText : design.text }]}>
                        {r.rating}
                      </Text>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, paddingHorizontal: sizes.edge - 2 },
  center: { alignItems: 'center', justifyContent: 'center' },
  topbar: { paddingTop: spacing.sm, height: 44, justifyContent: 'center' },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  backChevron: { color: colors.text, fontSize: 30, lineHeight: 30, marginTop: -3 },
  backText: { color: colors.text, fontSize: 17 },
  content: { paddingBottom: spacing.xl },

  identity: { alignItems: 'center', marginTop: spacing.md, marginBottom: spacing.xl },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: radius.pill,
    borderWidth: sizes.borderWidth,
    borderColor: colors.outline,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  username: { ...typography.title, fontSize: 30, marginBottom: 4 },
  editLink: { color: colors.accent, fontSize: 15, fontWeight: '600' },
  dim: { color: colors.textSecondary, fontSize: 13 },

  editWrap: { width: '100%', alignItems: 'center', gap: spacing.sm },
  nameInput: {
    width: '100%',
    borderWidth: sizes.borderWidth,
    borderColor: colors.outline,
    borderRadius: radius.field,
    color: colors.text,
    fontSize: 22,
    textAlign: 'center',
    paddingVertical: spacing.sm,
  },
  warn: { color: colors.textSecondary, fontSize: 12.5, textAlign: 'center' },
  editButtons: { flexDirection: 'row', gap: spacing.md, width: '100%' },
  editBtn: { flex: 1 },

  rankCard: {
    borderWidth: sizes.borderWidth,
    borderColor: colors.outline,
    borderRadius: radius.card,
    padding: spacing.lg,
    gap: 8,
    marginBottom: spacing.lg,
  },
  rankLabel: { color: colors.textSecondary, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 },
  ratingNum: { fontSize: 44, fontWeight: '800', fontVariant: ['tabular-nums'], lineHeight: 48 },

  boardScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  boardPanel: {
    width: '100%',
    maxHeight: '78%',
    borderWidth: sizes.borderWidth,
    borderRadius: radius.card,
    padding: spacing.md,
    gap: spacing.sm,
  },
  boardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  boardTitle: { ...typography.heading, fontSize: 20 },
  boardX: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  boardXText: { fontSize: 15, fontWeight: '600' },
  boardMsg: { textAlign: 'center', paddingVertical: 24 },
  boardRow: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 44, paddingHorizontal: 10 },
  boardRank: { width: 34, fontSize: 13, fontVariant: ['tabular-nums'], textAlign: 'right' },
  boardName: { flex: 1, fontSize: 15, fontWeight: '600' },
  boardRating: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },

  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.xl },
  stat: {
    flexBasis: '46%',
    flexGrow: 1,
    borderWidth: sizes.borderWidth,
    borderColor: colors.outline,
    borderRadius: radius.card,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    gap: 3,
  },
  statSub: { fontSize: 11, textAlign: 'center' },
  statNum: { ...typography.title, fontSize: 28 },
  statLabel: { color: colors.textSecondary, fontSize: 12.5 },

  sectionTitle: { ...typography.heading, fontSize: 19, marginBottom: 2 },
  sectionSub: { color: colors.textSecondary, fontSize: 13, marginBottom: spacing.md },

  leagueRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  leaguePill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  leagueText: { fontSize: 14, fontWeight: '700' },
  leagueSub: { color: colors.textSecondary, fontSize: 12, textAlign: 'center', marginTop: 8, paddingHorizontal: spacing.lg },

  designTitle: { marginTop: spacing.lg },
  designRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.xl, flexWrap: 'wrap' },
  designItem: { alignItems: 'center', gap: 6 },
  swatch: {
    width: 52,
    height: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  swatchDot: { width: 18, height: 10, borderRadius: 999 },
  swatchBar: { width: 26, height: 4, borderRadius: 999 },
  designName: { color: colors.textSecondary, fontSize: 12 },
  designNameSel: { color: colors.text, fontWeight: '700' },
  emptyCard: {
    borderWidth: sizes.borderWidth,
    borderColor: colors.outline,
    borderRadius: radius.card,
    borderStyle: 'dashed',
    padding: spacing.lg,
    alignItems: 'center',
  },
  goodCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: radius.card,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: 6,
  },
  goodHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  goodWord: { ...typography.heading, fontSize: 17, textTransform: 'capitalize' },
  votePill: {
    backgroundColor: colors.fill,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  voteText: { color: '#000', fontSize: 12, fontWeight: '700' },
  goodText: { color: colors.text, fontSize: 15, opacity: opacity.tonet },

  footNote: { color: colors.textSecondary, fontSize: 12, textAlign: 'center', marginTop: spacing.lg },
});
