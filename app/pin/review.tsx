import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useState, useMemo, useEffect, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import {
  PALETTE,
  ACCENT,
  FONTS,
  RADII,
  STICKER_SHADOW,
  STICKER_SHADOW_LG,
  SCREEN_PAD,
} from '../../constants/theme';

type Bucket = 'loved' | 'okay' | 'meh';

interface Ranked {
  /** place_id used as the React key and as the foreign key on save. */
  id: string;
  name: string;
  /** Absolute rank in the user's category list, 1-indexed. */
  rank: number;
}

const BUCKETS: { key: Bucket; label: string; sub: string }[] = [
  { key: 'loved', label: 'liked it',        sub: 'going back' },
  { key: 'okay',  label: 'it was okay',     sub: 'maybe' },
  { key: 'meh',   label: "didn't like it",  sub: 'not again' },
];

type Step = 'bucket' | 'compare' | 'done';

export default function ReviewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    placeId?: string;
    placeName?: string;
    category?: string;
    returnTo?: string;
  }>();

  const placeName = params.placeName || 'this place';
  const category  = (params.category as string) || 'cafes';

  const [step, setStep]     = useState<Step>('bucket');
  const [bucket, setBucket] = useState<Bucket | null>(null);

  const [lo, setLo]                 = useState(0);
  const [hi, setHi]                 = useState(0);
  const [finalRank, setFinalRank]   = useState<number | null>(null);

  // ─── Real ranking pool ─────────────────────────────────────────────
  const [userId, setUserId] = useState<string | null>(null);
  const [rankings, setRankings] = useState<Ranked[]>([]);
  const [loadingRankings, setLoadingRankings] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoadingRankings(false); return; }
      setUserId(user.id);

      const { data, error } = await supabase
        .from('rankings')
        .select('position, place_id, places!inner(name)')
        .eq('user_id', user.id)
        .eq('category', category)
        .order('position', { ascending: true });

      if (!error && data) {
        const mapped: Ranked[] = data.map((row: any) => {
          const place = Array.isArray(row.places) ? row.places[0] : row.places;
          return {
            id: row.place_id,
            name: place?.name ?? '(unknown)',
            rank: row.position,
          };
        });
        setRankings(mapped);
      }
      setLoadingRankings(false);
    })();
  }, [category]);

  /** Pool = full list. Bucket is preserved as UI metadata only; the binary
   * search will converge to the right slot regardless of which bucket the
   * user picked, so no slicing is needed. */
  const pool = rankings;

  const totalAfter = pool.length + 1;

  useEffect(() => {
    if (bucket && step === 'bucket') {
      if (pool.length === 0) {
        setFinalRank(1);
        setStep('done');
      } else {
        setLo(0);
        setHi(pool.length);
        setStep('compare');
      }
    }
  }, [bucket, pool.length]);

  const mid = Math.floor((lo + hi) / 2);
  const candidate = pool[mid];

  function answerCompare(answer: 'better' | 'worse' | 'tie' | 'skip') {
    if (!candidate) return;
    let nextLo = lo;
    let nextHi = hi;

    if (answer === 'better')      nextHi = mid;
    else if (answer === 'worse')  nextLo = mid + 1;
    else if (answer === 'tie')    { setFinalRank(mid + 1); setStep('done'); return; }
    else if (answer === 'skip')   { nextLo = mid + 1; }

    if (nextLo >= nextHi) {
      setFinalRank(nextLo + 1);
      setStep('done');
      return;
    }
    setLo(nextLo);
    setHi(nextHi);
  }

  const saveRanking = useCallback(async (): Promise<{ ok: boolean; message?: string }> => {
    if (finalRank == null) return { ok: false, message: 'No rank chosen.' };
    if (!params.placeId)   return { ok: false, message: 'Missing place id.' };
    if (!userId)           return { ok: false, message: 'Not signed in.' };

    // Idempotent re-rank: if this place is already ranked in this category,
    // delete the old row and shift everything below it up by one before we
    // bump for the new insert. Otherwise the second rank attempt would hit
    // a unique-constraint error or leave duplicate place rows.
    const { data: existing, error: existingErr } = await supabase
      .from('rankings')
      .select('id, position')
      .eq('user_id', userId)
      .eq('place_id', params.placeId)
      .eq('category', category)
      .maybeSingle();

    if (existingErr && existingErr.code !== 'PGRST116') {
      return { ok: false, message: existingErr.message };
    }

    if (existing) {
      const { error: delErr } = await supabase
        .from('rankings')
        .delete()
        .eq('id', existing.id);
      if (delErr) return { ok: false, message: delErr.message };

      const { data: laterRows } = await supabase
        .from('rankings')
        .select('id, position')
        .eq('user_id', userId)
        .eq('category', category)
        .gt('position', existing.position)
        .order('position', { ascending: true });

      // Shift down ascending — each row vacates its slot before the next
      // row claims it, so we never collide with the unique constraint on
      // (user_id, category, position).
      for (const row of laterRows ?? []) {
        const { error } = await supabase
          .from('rankings')
          .update({ position: row.position - 1 })
          .eq('id', row.id);
        if (error) return { ok: false, message: error.message };
      }
    }

    // Bump existing rankings >= finalRank by +1, in DESCENDING order so
    // the highest position moves first and never collides with a row
    // we're about to update.
    const { data: bumpRows, error: bumpErr } = await supabase
      .from('rankings')
      .select('id, position')
      .eq('user_id', userId)
      .eq('category', category)
      .gte('position', finalRank)
      .order('position', { ascending: false });

    if (bumpErr) return { ok: false, message: bumpErr.message };

    for (const row of bumpRows ?? []) {
      const { error } = await supabase
        .from('rankings')
        .update({ position: row.position + 1 })
        .eq('id', row.id);
      if (error) return { ok: false, message: error.message };
    }

    // Insert new ranking at finalRank.
    const { error: insertErr } = await supabase.from('rankings').insert({
      user_id: userId,
      place_id: params.placeId,
      category,
      position: finalRank,
    });
    if (insertErr) return { ok: false, message: insertErr.message };

    return { ok: true };
  }, [finalRank, params.placeId, userId, category]);

  async function handleConfirm() {
    if (saving) return;
    setSaving(true);
    const result = await saveRanking();
    setSaving(false);
    if (!result.ok) {
      Alert.alert('could not save rank', result.message ?? 'please try again.');
      return;
    }
    if (params.returnTo) {
      router.replace(params.returnTo as never);
    } else {
      router.back();
    }
  }

  if (loadingRankings) {
    return (
      <View style={styles.safe}>
        <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={ACCENT.red} />
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.safe}>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <Text style={styles.backText}>← cancel</Text>
          </TouchableOpacity>

          <Text style={styles.metaLabel}>RANK · {category.toUpperCase()}</Text>
          <Text style={styles.placeName}>{placeName}</Text>

          <View style={styles.dotsRow}>
            <View style={[styles.dot, styles.dotActive]} />
            <View style={[styles.dot, step !== 'bucket' && styles.dotActive]} />
            <View style={[styles.dot, step === 'done' && styles.dotActive]} />
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          {step === 'bucket' && (
            <BucketStep onPick={setBucket} />
          )}

          {step === 'compare' && candidate && bucket && (
            <CompareStep
              candidate={candidate}
              bucket={bucket}
              category={category}
              poolLength={pool.length}
              onAnswer={answerCompare}
            />
          )}

          {step === 'done' && finalRank && bucket && (
            <DoneStep
              rank={finalRank}
              total={totalAfter}
              category={category}
              bucket={bucket}
              placeName={placeName}
              pool={pool}
              saving={saving}
              onConfirm={handleConfirm}
            />
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function BucketStep({ onPick }: { onPick: (b: Bucket) => void }) {
  return (
    <View style={styles.stepWrap}>
      <Text style={styles.stepKicker}>STEP 1 / 3</Text>
      <Text style={styles.stepTitle}>
        what did you <Text style={styles.stepTitleItalic}>think?</Text>
      </Text>
      <Text style={styles.stepSub}>
        we'll only compare it against places in the same bucket.
      </Text>

      <View style={styles.bucketsCol}>
        {BUCKETS.map((b, i) => (
          <Pressable
            key={b.key}
            onPress={() => onPick(b.key)}
            style={({ pressed }) => [
              styles.bucketCard,
              { opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={styles.bucketIndex}>0{i + 1}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.bucketLabel}>{b.label}</Text>
              <Text style={styles.bucketSub}>{b.sub}</Text>
            </View>
            <Text style={styles.bucketArrow}>→</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function CompareStep({
  candidate,
  bucket: _bucket,
  category,
  poolLength,
  onAnswer,
}: {
  candidate: Ranked;
  bucket: Bucket;
  category: string;
  poolLength: number;
  onAnswer: (a: 'better' | 'worse' | 'tie' | 'skip') => void;
}) {
  return (
    <View style={styles.stepWrap}>
      <Text style={styles.stepKicker}>STEP 2 / 3 · max ~{Math.ceil(Math.log2(poolLength + 1))} taps</Text>
      <Text style={styles.stepTitle}>
        better than{'\n'}
        <Text style={styles.stepTitleItalic}>{candidate.name}?</Text>
      </Text>
      <Text style={styles.stepSub}>
        comparing only inside {category} · #{candidate.rank} / {poolLength}
      </Text>

      <View style={styles.choicesRow}>
        <TouchableOpacity
          style={[styles.choiceBtn, styles.choiceWorse]}
          onPress={() => onAnswer('worse')}
          activeOpacity={0.85}
        >
          <Text style={styles.choiceText}>worse</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.choiceBtn, styles.choiceBetter]}
          onPress={() => onAnswer('better')}
          activeOpacity={0.85}
        >
          <Text style={[styles.choiceText, styles.choiceTextBetter]}>better</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.subChoicesRow}>
        <TouchableOpacity
          style={styles.subChoiceBtn}
          onPress={() => onAnswer('tie')}
        >
          <Text style={styles.subChoiceText}>about the same</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.subChoiceBtn}
          onPress={() => onAnswer('skip')}
        >
          <Text style={styles.subChoiceText}>haven't been</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function DoneStep({
  rank,
  total,
  category,
  bucket,
  placeName,
  pool,
  saving,
  onConfirm,
}: {
  rank: number;
  total: number;
  category: string;
  bucket: Bucket;
  placeName: string;
  pool: Ranked[];
  saving: boolean;
  onConfirm: () => void;
}) {
  const ordered: { id: string; name: string; isNew?: boolean }[] = useMemo(() => {
    const list: { id: string; name: string; isNew?: boolean }[] = pool.map(
      (p) => ({ id: p.id, name: p.name }),
    );
    list.splice(rank - 1, 0, { id: 'new', name: placeName, isNew: true });
    return list;
  }, [pool, rank, placeName]);

  const bucketLabel = BUCKETS.find((b) => b.key === bucket)!.label;

  return (
    <View style={styles.stepWrap}>
      <Text style={styles.stepKicker}>STEP 3 / 3 · ranked</Text>
      <Text style={styles.stepTitle}>
        your <Text style={styles.stepTitleItalic}>#{rank}</Text>{' '}
        {category}.
      </Text>
      <Text style={styles.stepSub}>
        out of {total} ranked · "{bucketLabel}" bucket
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsScroll}
      >
        {ordered.map((p, i) => {
          const isNew = !!p.isNew;
          return (
            <View
              key={p.id + i}
              style={[
                styles.rankChip,
                isNew && styles.rankChipNew,
              ]}
            >
              <Text
                style={[
                  styles.rankChipNum,
                  isNew && styles.rankChipNumNew,
                ]}
              >
                #{i + 1}
              </Text>
              <Text
                style={[
                  styles.rankChipName,
                  isNew && styles.rankChipNameNew,
                ]}
                numberOfLines={1}
              >
                {p.name}
              </Text>
            </View>
          );
        })}
      </ScrollView>

      <TouchableOpacity
        style={[styles.confirmBtn, saving && styles.confirmBtnDisabled]}
        onPress={onConfirm}
        disabled={saving}
        activeOpacity={0.85}
      >
        {saving ? (
          <ActivityIndicator color={PALETTE.bg} />
        ) : (
          <Text style={styles.confirmBtnText}>save rank</Text>
        )}
      </TouchableOpacity>

      <Text style={styles.privacyLine}>
        only you and your followers can see your rankings.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: PALETTE.bg },

  header: {
    paddingHorizontal: SCREEN_PAD,
    paddingTop: 8,
    paddingBottom: 14,
    gap: 8,
  },
  backText: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    letterSpacing: 1.5,
    color: PALETTE.inkSoft,
    textTransform: 'lowercase',
  },
  metaLabel: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 2,
    color: PALETTE.inkSoft,
    marginTop: 4,
  },
  placeName: {
    fontFamily: FONTS.display,
    fontSize: 24,
    color: PALETTE.ink,
    fontWeight: '400',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
  },
  dot: {
    width: 16,
    height: 4,
    backgroundColor: PALETTE.inkLine,
  },
  dotActive: {
    backgroundColor: ACCENT.red,
  },

  body: {
    paddingHorizontal: SCREEN_PAD,
    paddingBottom: 40,
  },
  stepWrap: {
    paddingTop: 12,
    gap: 8,
  },
  stepKicker: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 2,
    color: PALETTE.inkSoft,
  },
  stepTitle: {
    fontFamily: FONTS.display,
    fontSize: 36,
    lineHeight: 38,
    color: PALETTE.ink,
    fontWeight: '400',
  },
  stepTitleItalic: {
    fontStyle: 'italic',
    color: ACCENT.red,
  },
  stepSub: {
    fontFamily: FONTS.body,
    fontSize: 13,
    lineHeight: 18,
    color: PALETTE.inkSoft,
    marginTop: 2,
    marginBottom: 8,
  },

  bucketsCol: {
    gap: 10,
    marginTop: 10,
  },
  bucketCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: PALETTE.surface,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    paddingHorizontal: 16,
    paddingVertical: 18,
    ...STICKER_SHADOW_LG,
  },
  bucketIndex: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    letterSpacing: 1.5,
    color: PALETTE.inkSoft,
  },
  bucketLabel: {
    fontFamily: FONTS.display,
    fontSize: 22,
    color: PALETTE.ink,
    fontWeight: '400',
  },
  bucketSub: {
    fontFamily: FONTS.body,
    fontSize: 11,
    color: PALETTE.inkSoft,
    marginTop: 2,
  },
  bucketArrow: {
    fontFamily: FONTS.body,
    fontSize: 18,
    color: PALETTE.ink,
  },

  choicesRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  choiceBtn: {
    flex: 1,
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: PALETTE.ink,
    ...STICKER_SHADOW_LG,
  },
  choiceWorse: {
    backgroundColor: PALETTE.surface,
  },
  choiceBetter: {
    backgroundColor: ACCENT.red,
    borderColor: ACCENT.red,
  },
  choiceText: {
    fontFamily: FONTS.display,
    fontSize: 22,
    color: PALETTE.ink,
    fontWeight: '400',
  },
  choiceTextBetter: {
    color: PALETTE.surface,
    fontStyle: 'italic',
  },
  subChoicesRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    justifyContent: 'center',
  },
  subChoiceBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADII.pill,
    borderWidth: 1,
    borderColor: PALETTE.inkLine,
  },
  subChoiceText: {
    fontFamily: FONTS.body,
    fontSize: 11,
    color: PALETTE.inkSoft,
  },

  chipsScroll: {
    gap: 6,
    paddingVertical: 16,
    paddingRight: 16,
  },
  rankChip: {
    minWidth: 72,
    backgroundColor: PALETTE.surface,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    paddingHorizontal: 8,
    paddingVertical: 10,
    gap: 4,
    ...STICKER_SHADOW,
  },
  rankChipNew: {
    backgroundColor: ACCENT.red,
    borderColor: ACCENT.red,
  },
  rankChipNum: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 1,
    color: PALETTE.inkSoft,
  },
  rankChipNumNew: {
    color: PALETTE.surface,
  },
  rankChipName: {
    fontFamily: FONTS.body,
    fontSize: 11,
    fontWeight: '600',
    color: PALETTE.ink,
  },
  rankChipNameNew: {
    color: PALETTE.surface,
  },

  confirmBtn: {
    marginTop: 16,
    backgroundColor: PALETTE.ink,
    paddingVertical: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: PALETTE.ink,
    ...STICKER_SHADOW_LG,
  },
  confirmBtnDisabled: {
    opacity: 0.6,
  },
  confirmBtnText: {
    fontFamily: FONTS.display,
    fontSize: 18,
    color: PALETTE.bg,
    fontWeight: '400',
  },
  privacyLine: {
    fontFamily: FONTS.body,
    fontSize: 11,
    color: PALETTE.inkMute,
    textAlign: 'center',
    marginTop: 14,
  },
});
