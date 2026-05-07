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
import { CATEGORY_LABELS } from '../../types';
import {
  PALETTE,
  ACCENT,
  FONTS,
  RADII,
  STICKER_SHADOW,
  STICKER_SHADOW_LG,
  SCREEN_PAD,
} from '../../constants/theme';

const MAX_IMPRESSION = 150;

const CATEGORY_GLYPH: Record<string, string> = {
  food: '◆',
  bar: '○',
  beauty: '◇',
  experience: '✦',
  retail: '◉',
};

type PinStatus = 'visited' | 'want_to_go';
type UIStatus = 'want_to_go' | 'been' | 'going_again';

const STATUS_OPTIONS: { key: UIStatus; label: string; pinStatus: PinStatus; unlockRating: boolean }[] = [
  { key: 'want_to_go',  label: 'want to go',   pinStatus: 'want_to_go', unlockRating: false },
  { key: 'been',        label: 'been',         pinStatus: 'visited',    unlockRating: true  },
  { key: 'going_again', label: 'going again',  pinStatus: 'visited',    unlockRating: true  },
];

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <View style={styles.starRow}>
      {Array.from({ length: 5 }).map((_, i) => (
        <TouchableOpacity key={i} onPress={() => onChange(i + 1)} activeOpacity={0.7} hitSlop={4}>
          <Text style={[styles.star, i < value ? styles.starFilled : styles.starEmpty]}>★</Text>
        </TouchableOpacity>
      ))}
      {value > 0 && (
        <TouchableOpacity onPress={() => onChange(0)} style={styles.clearStars} hitSlop={6}>
          <Text style={styles.clearStarsText}>clear</Text>
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

  const label = CATEGORY_LABELS[params.category as keyof typeof CATEGORY_LABELS] ?? params.category;
  const glyph = CATEGORY_GLYPH[params.category] ?? '◉';
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
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

            {/* Nav */}
            <View style={styles.nav}>
              <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={12} activeOpacity={0.7}>
                <Text style={styles.backText}>← back</Text>
              </TouchableOpacity>
            </View>

            {/* Place header */}
            <View style={styles.placeHeader}>
              {params.photo_url ? (
                <View style={styles.photoFrame}>
                  <Image source={{ uri: params.photo_url }} style={styles.placePhoto} />
                </View>
              ) : (
                <View style={styles.photoFrame}>
                  <View style={styles.placePlaceholder}>
                    <Text style={styles.placeGlyph}>{glyph}</Text>
                  </View>
                </View>
              )}
              <View style={styles.placeInfo}>
                <View style={styles.catBadge}>
                  <Text style={styles.catBadgeGlyph}>{glyph}</Text>
                  <Text style={styles.catBadgeText}>{label.toLowerCase()}</Text>
                </View>
                <Text style={styles.placeName}>{params.name}</Text>
                <Text style={styles.placeAddress} numberOfLines={1}>{params.address}</Text>
              </View>
            </View>

            {/* Status selection */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>HAVE YOU BEEN?</Text>
              <View style={styles.statusRow}>
                {STATUS_OPTIONS.map((opt) => {
                  const active = uiStatus === opt.key;
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      style={[styles.statusBtn, active && styles.statusBtnActive]}
                      onPress={() => setUiStatus(opt.key)}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.statusBtnText, active && styles.statusBtnTextActive]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Star rating */}
            {showRating && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>RATING</Text>
                <StarRating value={rating} onChange={setRating} />
              </View>
            )}

            {/* Photo upload */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>
                PHOTOS <Text style={styles.optional}>· optional</Text>
              </Text>
              {photoUri ? (
                <View style={styles.photoPreviewWrap}>
                  <Image source={{ uri: photoUri }} style={styles.photoPreview} />
                  <TouchableOpacity style={styles.removePhoto} onPress={() => setPhotoUri(null)} hitSlop={6}>
                    <Text style={styles.removePhotoText}>×</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.photoUploadBox} onPress={pickPhoto} activeOpacity={0.8}>
                  <Text style={styles.cameraIcon}>+</Text>
                  <Text style={styles.addPhotosText}>add a photo</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Impression */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>
                IMPRESSION <Text style={styles.optional}>· optional</Text>
              </Text>
              <View style={styles.impressionWrap}>
                <TextInput
                  style={styles.impressionInput}
                  placeholder="what made it worth pinning?"
                  placeholderTextColor={PALETTE.inkMute}
                  value={impression}
                  onChangeText={(t) => { if (t.length <= MAX_IMPRESSION) setImpression(t); }}
                  multiline
                  maxLength={MAX_IMPRESSION}
                  returnKeyType="done"
                />
                <Text style={[
                  styles.charCount,
                  charsLeft < 20 && styles.charCountWarn,
                  charsLeft < 5 && styles.charCountError,
                ]}>
                  {charsLeft}
                </Text>
              </View>
            </View>

            {/* PIN button */}
            <TouchableOpacity
              style={[styles.pinBtn, !uiStatus && styles.pinBtnDisabled]}
              onPress={handlePin}
              disabled={!uiStatus || saving}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator color={PALETTE.surface} />
              ) : (
                <Text style={[styles.pinBtnText, !uiStatus && styles.pinBtnTextDisabled]}>
                  {uiStatus ? 'pin this place →' : 'select a status above'}
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
  safe: { flex: 1, backgroundColor: PALETTE.bg },
  container: { paddingBottom: 40 },

  nav: { paddingHorizontal: SCREEN_PAD, paddingTop: 12, paddingBottom: 4 },
  backBtn: { paddingVertical: 8, alignSelf: 'flex-start' },
  backText: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    letterSpacing: 1.5,
    color: PALETTE.inkSoft,
    textTransform: 'lowercase',
  },

  placeHeader: { paddingHorizontal: SCREEN_PAD, paddingTop: 8, paddingBottom: 22 },
  photoFrame: {
    backgroundColor: PALETTE.surface,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    marginBottom: 16,
    ...STICKER_SHADOW_LG,
  },
  placePhoto: {
    width: '100%',
    height: 200,
    resizeMode: 'cover',
  },
  placePlaceholder: {
    width: '100%',
    height: 140,
    backgroundColor: PALETTE.zone1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeGlyph: {
    fontSize: 44,
    color: ACCENT.red,
  },

  placeInfo: { gap: 6 },
  catBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: PALETTE.ink,
    backgroundColor: PALETTE.surface,
    paddingHorizontal: 8,
    paddingVertical: 3,
    ...STICKER_SHADOW,
  },
  catBadgeGlyph: {
    fontSize: 10,
    color: ACCENT.red,
  },
  catBadgeText: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 1,
    color: PALETTE.ink,
    fontWeight: '600',
  },
  placeName: {
    fontFamily: FONTS.display,
    fontSize: 26,
    color: PALETTE.ink,
    fontWeight: '400',
    marginTop: 6,
  },
  placeAddress: {
    fontFamily: FONTS.body,
    fontSize: 13,
    color: PALETTE.inkSoft,
  },

  section: {
    paddingHorizontal: SCREEN_PAD,
    paddingTop: 16,
    paddingBottom: 4,
    gap: 10,
  },
  sectionLabel: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 2,
    color: PALETTE.inkSoft,
  },
  optional: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    color: PALETTE.inkMute,
    letterSpacing: 1,
    textTransform: 'lowercase',
  },

  statusRow: { flexDirection: 'row', gap: 8 },
  statusBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    borderRadius: RADII.pill,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PALETTE.surface,
  },
  statusBtnActive: {
    backgroundColor: PALETTE.ink,
  },
  statusBtnText: {
    fontFamily: FONTS.body,
    fontSize: 12,
    fontWeight: '600',
    color: PALETTE.ink,
  },
  statusBtnTextActive: { color: PALETTE.bg },

  starRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  star: { fontSize: 28 },
  starFilled: { color: ACCENT.red },
  starEmpty: { color: PALETTE.inkLine },
  clearStars: { marginLeft: 6, paddingVertical: 4 },
  clearStarsText: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    letterSpacing: 1,
    color: PALETTE.inkSoft,
    textTransform: 'lowercase',
  },

  photoPreviewWrap: {
    position: 'relative',
    borderWidth: 1,
    borderColor: PALETTE.ink,
    backgroundColor: PALETTE.surface,
    ...STICKER_SHADOW,
  },
  photoPreview: { width: '100%', height: 180, resizeMode: 'cover' },
  removePhoto: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 26,
    height: 26,
    backgroundColor: PALETTE.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removePhotoText: {
    color: PALETTE.bg,
    fontSize: 16,
    lineHeight: 18,
    fontWeight: '600',
  },
  photoUploadBox: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: PALETTE.ink,
    paddingVertical: 26,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: PALETTE.surface,
  },
  cameraIcon: {
    fontSize: 24,
    color: PALETTE.inkSoft,
    fontWeight: '300',
  },
  addPhotosText: {
    fontFamily: FONTS.body,
    fontSize: 13,
    color: PALETTE.inkSoft,
    fontWeight: '600',
  },

  impressionWrap: { position: 'relative' },
  impressionInput: {
    backgroundColor: PALETTE.surface,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    padding: 14,
    paddingBottom: 30,
    fontFamily: FONTS.body,
    fontSize: 14,
    color: PALETTE.ink,
    minHeight: 92,
    textAlignVertical: 'top',
  },
  charCount: {
    position: 'absolute',
    bottom: 10,
    right: 12,
    fontFamily: FONTS.mono,
    fontSize: 10,
    color: PALETTE.inkMute,
    letterSpacing: 0.5,
  },
  charCountWarn: { color: '#f59e0b' },
  charCountError: { color: ACCENT.red },

  pinBtn: {
    marginHorizontal: SCREEN_PAD,
    marginTop: 24,
    backgroundColor: ACCENT.red,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    paddingVertical: 16,
    alignItems: 'center',
    ...STICKER_SHADOW_LG,
  },
  pinBtnDisabled: {
    backgroundColor: PALETTE.zone2,
  },
  pinBtnText: {
    fontFamily: FONTS.body,
    color: PALETTE.surface,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  pinBtnTextDisabled: {
    color: PALETTE.inkMute,
  },
});
