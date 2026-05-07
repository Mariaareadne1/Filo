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
import { COLORS } from '../../constants/theme';

const MAX_IMPRESSION = 150;

const CATEGORY_EMOJI: Record<string, string> = {
  food: '🍽️', bar: '🍸', beauty: '✂️', experience: '🎯', retail: '🛍️',
};

type PinStatus = 'visited' | 'want_to_go';
type UIStatus = 'want_to_go' | 'been' | 'going_again';

const STATUS_OPTIONS: { key: UIStatus; label: string; pinStatus: PinStatus; unlockRating: boolean }[] = [
  { key: 'want_to_go',  label: 'Want to Go',   pinStatus: 'want_to_go', unlockRating: false },
  { key: 'been',        label: 'Been',          pinStatus: 'visited',    unlockRating: true  },
  { key: 'going_again', label: 'Going Again',   pinStatus: 'visited',    unlockRating: true  },
];

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <View style={styles.starRow}>
      {Array.from({ length: 5 }).map((_, i) => (
        <TouchableOpacity key={i} onPress={() => onChange(i + 1)} activeOpacity={0.7}>
          <Text style={[styles.star, i < value ? styles.starFilled : styles.starEmpty]}>★</Text>
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
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

            {/* Nav */}
            <View style={styles.nav}>
              <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
                <Text style={styles.backText}>← Back</Text>
              </TouchableOpacity>
            </View>

            {/* Place header */}
            <View style={styles.placeHeader}>
              {params.photo_url ? (
                <Image source={{ uri: params.photo_url }} style={styles.placePhoto} />
              ) : (
                <View style={[styles.placePlaceholder, { backgroundColor: color + '14' }]}>
                  <Text style={styles.placeEmoji}>{emoji}</Text>
                </View>
              )}
              <View style={styles.placeInfo}>
                <View style={[styles.catBadge, { backgroundColor: color + '15' }]}>
                  <Text style={[styles.catBadgeText, { color }]}>{label}</Text>
                </View>
                <Text style={styles.placeName}>{params.name}</Text>
                <Text style={styles.placeAddress} numberOfLines={1}>{params.address}</Text>
              </View>
            </View>

            <View style={styles.sectionDivider} />

            {/* Status selection */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Have you been?</Text>
              <View style={styles.statusRow}>
                {STATUS_OPTIONS.map((opt) => {
                  const active = uiStatus === opt.key;
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      style={[styles.statusBtn, active && styles.statusBtnActive]}
                      onPress={() => setUiStatus(opt.key)}
                      activeOpacity={0.75}
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
                <Text style={styles.sectionLabel}>Rating</Text>
                <StarRating value={rating} onChange={setRating} />
              </View>
            )}

            <View style={styles.sectionDivider} />

            {/* Photo upload */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>
                Photos <Text style={styles.optional}>· optional</Text>
              </Text>
              {photoUri ? (
                <View style={styles.photoPreviewWrap}>
                  <Image source={{ uri: photoUri }} style={styles.photoPreview} />
                  <TouchableOpacity style={styles.removePhoto} onPress={() => setPhotoUri(null)}>
                    <Text style={styles.removePhotoText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.photoUploadBox} onPress={pickPhoto} activeOpacity={0.7}>
                  <Text style={styles.cameraIcon}>⊕</Text>
                  <Text style={styles.addPhotosText}>Add photos</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.sectionDivider} />

            {/* Impression */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>
                Impression <Text style={styles.optional}>· optional</Text>
              </Text>
              <View style={styles.impressionWrap}>
                <TextInput
                  style={styles.impressionInput}
                  placeholder="What made it worth pinning?"
                  placeholderTextColor="#BBBBBB"
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
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.pinBtnText}>
                  {uiStatus ? 'Pin This Place' : 'Select a status above'}
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
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  container: { paddingBottom: 40 },

  nav: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 },
  backBtn: { paddingVertical: 8 },
  backText: { fontSize: 15, color: COLORS.primary, fontWeight: '600' },

  placeHeader: { paddingHorizontal: 20, paddingBottom: 20 },
  placePhoto: { width: '100%', height: 180, borderRadius: 12, marginBottom: 14, resizeMode: 'cover' },
  placePlaceholder: {
    width: '100%', height: 120, borderRadius: 12,
    marginBottom: 14, alignItems: 'center', justifyContent: 'center',
  },
  placeEmoji: { fontSize: 44 },
  placeInfo: { gap: 6 },
  catBadge: {
    alignSelf: 'flex-start', borderRadius: 50,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  catBadgeText: { fontSize: 11, fontWeight: '700' },
  placeName: { fontSize: 22, fontWeight: '800', color: COLORS.textPrimary, letterSpacing: -0.4 },
  placeAddress: { fontSize: 13, color: COLORS.textSecondary },

  sectionDivider: { height: 1, backgroundColor: '#F5F5F5' },

  section: { paddingHorizontal: 20, paddingVertical: 18, gap: 12 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: COLORS.textPrimary, letterSpacing: 0.3, textTransform: 'uppercase' },
  optional: { fontSize: 12, color: COLORS.textMuted, fontWeight: '400', textTransform: 'none' },

  statusRow: { flexDirection: 'row', gap: 8 },
  statusBtn: {
    flex: 1, borderWidth: 1.5, borderColor: '#E8E8E8', borderRadius: 50,
    paddingVertical: 11, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  statusBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  statusBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.textSecondary },
  statusBtnTextActive: { color: '#FFFFFF' },

  starRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  star: { fontSize: 30 },
  starFilled: { color: COLORS.primary },
  starEmpty: { color: '#E0E0E0' },
  clearStars: { marginLeft: 4 },
  clearStarsText: { fontSize: 12, color: COLORS.textSecondary },

  photoPreviewWrap: { position: 'relative', borderRadius: 12, overflow: 'hidden' },
  photoPreview: { width: '100%', height: 160, resizeMode: 'cover' },
  removePhoto: {
    position: 'absolute', top: 10, right: 10,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  removePhotoText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  photoUploadBox: {
    borderWidth: 1.5, borderColor: '#E0E0E0', borderStyle: 'dashed',
    borderRadius: 12, paddingVertical: 24,
    alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  cameraIcon: { fontSize: 24, color: '#CCCCCC' },
  addPhotosText: { fontSize: 14, color: COLORS.textSecondary, fontWeight: '600' },

  impressionWrap: { position: 'relative' },
  impressionInput: {
    backgroundColor: '#F5F5F5', borderRadius: 10,
    padding: 14, paddingBottom: 32,
    fontSize: 15, color: COLORS.textPrimary,
    minHeight: 90, textAlignVertical: 'top',
    borderWidth: 1, borderColor: '#F0F0F0',
  },
  charCount: { position: 'absolute', bottom: 10, right: 12, fontSize: 12, color: '#CCCCCC', fontWeight: '600' },
  charCountWarn: { color: '#F59E0B' },
  charCountError: { color: COLORS.primary },

  pinBtn: {
    marginHorizontal: 20, marginTop: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 50, paddingVertical: 17, alignItems: 'center',
  },
  pinBtnDisabled: { backgroundColor: '#E8E8E8' },
  pinBtnText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.2 },
});
