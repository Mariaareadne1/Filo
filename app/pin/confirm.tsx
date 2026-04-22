import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useState } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../lib/supabase';
import { CATEGORY_COLORS, CATEGORY_LABELS } from '../../types';
import { COLORS, GLASS, GLASS_SM } from '../../constants/theme';

const MAX_IMPRESSION = 150;

const CATEGORY_EMOJI: Record<string, string> = {
  food: '🍽️', bar: '🍸', beauty: '✂️', experience: '🎯', retail: '🛍️',
};

type PinStatus = 'visited' | 'want_to_go';

type UIStatus = 'want_to_go' | 'been' | 'going_again';

const STATUS_OPTIONS: { key: UIStatus; label: string; icon: string; pinStatus: PinStatus; unlockRating: boolean }[] = [
  { key: 'want_to_go', label: 'Want to go',   icon: '♡', pinStatus: 'want_to_go', unlockRating: false },
  { key: 'been',       label: 'Been',          icon: '✓', pinStatus: 'visited',    unlockRating: true  },
  { key: 'going_again',label: 'Going again',   icon: '↺', pinStatus: 'visited',    unlockRating: true  },
];

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <View style={styles.starRow}>
      {Array.from({ length: 5 }).map((_, i) => (
        <TouchableOpacity key={i} onPress={() => onChange(i + 1)} activeOpacity={0.7}>
          <Text style={[styles.star, i < value ? styles.starFilled : styles.starEmpty]}>
            {i < value ? '★' : '☆'}
          </Text>
        </TouchableOpacity>
      ))}
      {value > 0 && (
        <TouchableOpacity onPress={() => onChange(0)} style={styles.clearStars}>
          <Text style={styles.clearStarsText}>Clear</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function PinConfirmScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    place_id: string; name: string; address: string;
    category: string; lat: string; lng: string; photo_url: string;
  }>();

  const [uiStatus, setUiStatus] = useState<UIStatus | null>(null);
  const [impression, setImpression] = useState('');
  const [rating, setRating] = useState(0);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const color = CATEGORY_COLORS[params.category as keyof typeof CATEGORY_COLORS] ?? '#888';
  const label = CATEGORY_LABELS[params.category as keyof typeof CATEGORY_LABELS] ?? params.category;
  const emoji = CATEGORY_EMOJI[params.category] ?? '📍';
  const charsLeft = MAX_IMPRESSION - impression.length;

  const selectedOption = STATUS_OPTIONS.find((o) => o.key === uiStatus) ?? null;
  const pinStatus = selectedOption?.pinStatus ?? null;
  const showRating = selectedOption?.unlockRating ?? false;

  function fmtErr(label: string, err: any): string {
    return `${label}\ncode: ${err?.code ?? '—'}\nmessage: ${err?.message ?? '—'}\ndetails: ${err?.details ?? '—'}\nhint: ${err?.hint ?? '—'}`;
  }

  async function pickPhoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo access to add a photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });
    if (!result.canceled) setPhotoUri(result.assets[0].uri);
  }

  async function handlePin() {
    if (!pinStatus) return;
    setSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const placePayload = {
        google_place_id: params.place_id,
        name: params.name,
        address: params.address,
        category: params.category,
        lat: parseFloat(params.lat),
        lng: parseFloat(params.lng),
        photo_url: params.photo_url || null,
      };

      const { data: place, error: placeErr } = await supabase
        .from('places')
        .upsert(placePayload, { onConflict: 'google_place_id' })
        .select('id')
        .single();

      if (placeErr) {
        Alert.alert('Place upsert failed', fmtErr('places.upsert', placeErr));
        return;
      }

      const { data: existing } = await supabase
        .from('pins')
        .select('id')
        .eq('user_id', user.id)
        .eq('place_id', place.id)
        .single();

      const pinPayload = {
        user_id: user.id,
        place_id: place.id,
        status: pinStatus,
        impression: impression.trim() || null,
        is_public: true,
        updated_at: new Date().toISOString(),
      };

      let pinId: string;

      if (existing) {
        const { error: updateErr } = await supabase.from('pins').update(pinPayload).eq('id', existing.id);
        if (updateErr) {
          Alert.alert('Pin update failed', fmtErr('pins.update', updateErr));
          return;
        }
        pinId = existing.id;
      } else {
        const { data: newPin, error: insertErr } = await supabase.from('pins').insert(pinPayload).select('id').single();
        if (insertErr) {
          Alert.alert('Pin insert failed', fmtErr('pins.insert', insertErr));
          return;
        }
        pinId = newPin.id;
      }

      router.replace({
        pathname: '/pin/add-to-board',
        params: { pin_id: pinId, place_name: params.name, is_update: existing ? 'true' : 'false' },
      });
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.safe}>
      <View style={styles.orbRed} pointerEvents="none" />
      <View style={styles.orbBlue} pointerEvents="none" />

      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Text style={styles.backText}>← Search</Text>
            </TouchableOpacity>

            {/* Place card */}
            <View style={[styles.placeCard, GLASS]}>
              {params.photo_url ? (
                <Image source={{ uri: params.photo_url }} style={styles.placePhoto} />
              ) : (
                <View style={[styles.photoPlaceholder, { backgroundColor: color + '18' }]}>
                  <Text style={styles.photoEmoji}>{emoji}</Text>
                </View>
              )}
              <View style={styles.placeInfo}>
                <View style={[styles.catBadge, { borderColor: color + '55', backgroundColor: color + '18' }]}>
                  <Text style={[styles.catBadgeText, { color }]}>{emoji}  {label}</Text>
                </View>
                <Text style={styles.placeName}>{params.name}</Text>
                <Text style={styles.placeAddress}>{params.address}</Text>
              </View>
            </View>

            {/* Status buttons */}
            <Text style={styles.sectionLabel}>Have you been?</Text>
            <View style={styles.statusRow}>
              {STATUS_OPTIONS.map((opt) => {
                const active = uiStatus === opt.key;
                const activeColor = opt.key === 'want_to_go' ? '#F59E0B' : COLORS.primary;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[
                      styles.statusBtn,
                      active && { backgroundColor: activeColor + '20', borderColor: activeColor },
                    ]}
                    onPress={() => setUiStatus(opt.key)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.statusIcon, active && { color: activeColor }]}>{opt.icon}</Text>
                    <Text style={[styles.statusBtnText, active && { color: activeColor }]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Star rating — only for 'been' or 'going_again' */}
            {showRating && (
              <View style={[styles.ratingCard, GLASS_SM]}>
                <Text style={styles.sectionLabel}>How was it?</Text>
                <StarRating value={rating} onChange={setRating} />
              </View>
            )}

            {/* Photo upload */}
            <Text style={styles.sectionLabel}>
              Photo <Text style={styles.optional}>(optional)</Text>
            </Text>
            {photoUri ? (
              <View style={styles.photoPreviewWrap}>
                <Image source={{ uri: photoUri }} style={styles.photoPreview} />
                <TouchableOpacity style={styles.removePhoto} onPress={() => setPhotoUri(null)}>
                  <Text style={styles.removePhotoText}>✕</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={[styles.photoBtn, GLASS_SM]} onPress={pickPhoto} activeOpacity={0.8}>
                <Text style={styles.photoBtnIcon}>＋</Text>
                <Text style={styles.photoBtnText}>Add photo</Text>
              </TouchableOpacity>
            )}

            {/* Impression */}
            <Text style={styles.sectionLabel}>
              Impression <Text style={styles.optional}>(optional)</Text>
            </Text>
            <View style={styles.impressionContainer}>
              <TextInput
                style={[
                  styles.impressionInput,
                  charsLeft < 20 && charsLeft >= 0 && styles.impressionInputWarning,
                  charsLeft < 0 && styles.impressionInputError,
                ]}
                placeholder="What made it worth pinning?"
                placeholderTextColor="rgba(26,26,26,0.35)"
                value={impression}
                onChangeText={(t) => { if (t.length <= MAX_IMPRESSION) setImpression(t); }}
                multiline
                maxLength={MAX_IMPRESSION}
                returnKeyType="done"
              />
              <Text style={[
                styles.charCount,
                charsLeft < 20 && styles.charCountWarning,
                charsLeft < 5 && styles.charCountError,
              ]}>
                {charsLeft}
              </Text>
            </View>

            {/* PIN button */}
            <TouchableOpacity
              style={[
                styles.pinBtn,
                { backgroundColor: uiStatus ? color : 'rgba(255,255,255,0.1)' },
                (!uiStatus || saving) && styles.pinBtnDisabled,
              ]}
              onPress={handlePin}
              disabled={!uiStatus || saving}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.pinBtnText}>
                  {uiStatus ? 'PIN THIS PLACE' : 'SELECT A STATUS ABOVE'}
                </Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  orbRed: {
    position: 'absolute', width: 280, height: 280, borderRadius: 140,
    backgroundColor: 'rgba(230,57,70,0.15)', top: -60, right: -60,
  },
  orbBlue: {
    position: 'absolute', width: 240, height: 240, borderRadius: 120,
    backgroundColor: 'rgba(67,97,238,0.10)', bottom: 80, left: -70,
  },
  container: { paddingHorizontal: 20, paddingBottom: 48, gap: 18 },
  backBtn: { paddingVertical: 14 },
  backText: { fontSize: 15, color: COLORS.primary, fontWeight: '600' },

  placeCard: { overflow: 'hidden' },
  placePhoto: { width: '100%', height: 170, resizeMode: 'cover' },
  photoPlaceholder: { width: '100%', height: 120, alignItems: 'center', justifyContent: 'center' },
  photoEmoji: { fontSize: 48 },
  placeInfo: { padding: 16, gap: 6 },
  catBadge: {
    alignSelf: 'flex-start', borderWidth: 1,
    borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 2,
  },
  catBadgeText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
  placeName: { fontSize: 20, fontWeight: '800', color: COLORS.textPrimary, letterSpacing: -0.3 },
  placeAddress: { fontSize: 13, color: COLORS.textSecondary },

  sectionLabel: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary, letterSpacing: 0.2 },
  optional: { color: COLORS.textMuted, fontWeight: '400' },

  statusRow: { flexDirection: 'row', gap: 8 },
  statusBtn: {
    flex: 1, borderWidth: 1.5,
    borderColor: 'rgba(26,26,26,0.15)',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  statusIcon: { fontSize: 18, color: COLORS.textSecondary },
  statusBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, letterSpacing: 0.2 },

  ratingCard: { padding: 16, gap: 10 },
  starRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  star: { fontSize: 28 },
  starFilled: { color: '#F59E0B' },
  starEmpty: { color: 'rgba(26,26,26,0.18)' },
  clearStars: { marginLeft: 8 },
  clearStarsText: { fontSize: 12, color: COLORS.textSecondary },

  photoPreviewWrap: { position: 'relative', borderRadius: 16, overflow: 'hidden' },
  photoPreview: { width: '100%', height: 160, resizeMode: 'cover' },
  removePhoto: {
    position: 'absolute', top: 10, right: 10,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  removePhotoText: { color: COLORS.textPrimary, fontSize: 12, fontWeight: '700' },
  photoBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 18, gap: 8,
    borderStyle: 'dashed',
  },
  photoBtnIcon: { fontSize: 20, color: COLORS.textSecondary },
  photoBtnText: { fontSize: 14, color: COLORS.textSecondary, fontWeight: '600' },

  impressionContainer: { position: 'relative' },
  impressionInput: {
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1.5,
    borderColor: 'rgba(26,26,26,0.15)',
    borderRadius: 14,
    padding: 14,
    paddingBottom: 32,
    fontSize: 15,
    color: COLORS.textPrimary,
    minHeight: 90,
    textAlignVertical: 'top',
  },
  impressionInputWarning: { borderColor: '#F59E0B' },
  impressionInputError: { borderColor: COLORS.primary },
  charCount: { position: 'absolute', bottom: 10, right: 12, fontSize: 12, color: COLORS.textMuted, fontWeight: '600' },
  charCountWarning: { color: '#F59E0B' },
  charCountError: { color: COLORS.primary },

  pinBtn: {
    borderRadius: 16, paddingVertical: 18, alignItems: 'center', marginTop: 4,
  },
  pinBtnDisabled: { opacity: 0.45 },
  pinBtnText: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '800', letterSpacing: 0.5 },
});
