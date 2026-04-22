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
import { supabase } from '../../lib/supabase';
import { CATEGORY_COLORS, CATEGORY_LABELS } from '../../types';

const MAX_IMPRESSION = 150;

const CATEGORY_EMOJI: Record<string, string> = {
  food: '🍽️',
  bar: '🍸',
  beauty: '✂️',
  experience: '🎯',
  retail: '🛍️',
};

type PinStatus = 'visited' | 'want_to_go';

export default function PinConfirmScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    place_id: string;
    name: string;
    address: string;
    category: string;
    lat: string;
    lng: string;
    photo_url: string;
  }>();

  const [status, setStatus] = useState<PinStatus | null>(null);
  const [impression, setImpression] = useState('');
  const [saving, setSaving] = useState(false);

  const color = CATEGORY_COLORS[params.category as keyof typeof CATEGORY_COLORS] ?? '#888';
  const label = CATEGORY_LABELS[params.category as keyof typeof CATEGORY_LABELS] ?? params.category;
  const emoji = CATEGORY_EMOJI[params.category] ?? '📍';
  const charsLeft = MAX_IMPRESSION - impression.length;

  function fmtErr(label: string, err: any): string {
    return `${label}\ncode: ${err?.code ?? '—'}\nmessage: ${err?.message ?? '—'}\ndetails: ${err?.details ?? '—'}\nhint: ${err?.hint ?? '—'}`;
  }

  async function handlePin() {
    if (!status) return;
    setSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // 1. Upsert the place
      const placePayload = {
        google_place_id: params.place_id,
        name: params.name,
        address: params.address,
        category: params.category,
        lat: parseFloat(params.lat),
        lng: parseFloat(params.lng),
        photo_url: params.photo_url || null,
      };
      console.log('[pin/confirm] upserting place:', JSON.stringify(placePayload));

      const { data: place, error: placeErr } = await supabase
        .from('places')
        .upsert(placePayload, { onConflict: 'google_place_id' })
        .select('id')
        .single();

      if (placeErr) {
        console.error('[pin/confirm] place upsert error:', JSON.stringify(placeErr));
        Alert.alert('Place upsert failed', fmtErr('places.upsert', placeErr));
        return;
      }
      console.log('[pin/confirm] place id:', place.id);

      // 2. Check if pin already exists for this user + place
      const { data: existing } = await supabase
        .from('pins')
        .select('id')
        .eq('user_id', user.id)
        .eq('place_id', place.id)
        .single();

      const pinPayload = {
        user_id: user.id,
        place_id: place.id,
        status,
        impression: impression.trim() || null,
        is_public: true,
        updated_at: new Date().toISOString(),
      };
      console.log('[pin/confirm] pin payload:', JSON.stringify(pinPayload), 'existing:', existing?.id ?? null);

      let pinId: string;

      if (existing) {
        const { error: updateErr } = await supabase
          .from('pins')
          .update(pinPayload)
          .eq('id', existing.id);
        if (updateErr) {
          console.error('[pin/confirm] pin update error:', JSON.stringify(updateErr));
          Alert.alert('Pin update failed', fmtErr('pins.update', updateErr));
          return;
        }
        pinId = existing.id;
      } else {
        const { data: newPin, error: insertErr } = await supabase
          .from('pins')
          .insert(pinPayload)
          .select('id')
          .single();
        if (insertErr) {
          console.error('[pin/confirm] pin insert error:', JSON.stringify(insertErr));
          Alert.alert('Pin insert failed', fmtErr('pins.insert', insertErr));
          return;
        }
        pinId = newPin.id;
      }

      console.log('[pin/confirm] pin saved, id:', pinId);

      router.replace({
        pathname: '/pin/add-to-board',
        params: {
          pin_id: pinId,
          place_name: params.name,
          is_update: existing ? 'true' : 'false',
        },
      });
    } catch (e: any) {
      console.error('[pin/confirm] unexpected error:', e);
      Alert.alert('Error', e.message ?? 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          {/* Back */}
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>← Search</Text>
          </TouchableOpacity>

          {/* Place card */}
          <View style={styles.placeCard}>
            {params.photo_url ? (
              <Image source={{ uri: params.photo_url }} style={styles.placePhoto} />
            ) : (
              <View style={[styles.photoPlaceholder, { backgroundColor: color + '22' }]}>
                <Text style={styles.photoEmoji}>{emoji}</Text>
              </View>
            )}
            <View style={styles.placeInfo}>
              <View style={[styles.catBadge, { borderColor: color, backgroundColor: color + '12' }]}>
                <Text style={[styles.catBadgeText, { color }]}>{emoji} {label}</Text>
              </View>
              <Text style={styles.placeName}>{params.name}</Text>
              <Text style={styles.placeAddress}>{params.address}</Text>
            </View>
          </View>

          {/* Status buttons */}
          <Text style={styles.sectionLabel}>Have you been?</Text>
          <View style={styles.statusRow}>
            <TouchableOpacity
              style={[
                styles.statusBtn,
                status === 'visited' && { backgroundColor: '#22c55e', borderColor: '#22c55e' },
              ]}
              onPress={() => setStatus('visited')}
              activeOpacity={0.8}
            >
              <Text style={[styles.statusBtnText, status === 'visited' && styles.statusBtnTextActive]}>
                ✓ Visited
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.statusBtn,
                status === 'want_to_go' && { backgroundColor: '#f59e0b', borderColor: '#f59e0b' },
              ]}
              onPress={() => setStatus('want_to_go')}
              activeOpacity={0.8}
            >
              <Text style={[styles.statusBtnText, status === 'want_to_go' && styles.statusBtnTextActive]}>
                ♡ Want to go
              </Text>
            </TouchableOpacity>
          </View>

          {/* Impression */}
          <Text style={styles.sectionLabel}>Impression <Text style={styles.optional}>(optional)</Text></Text>
          <View style={styles.impressionContainer}>
            <TextInput
              style={[
                styles.impressionInput,
                charsLeft < 20 && charsLeft >= 0 && styles.impressionInputWarning,
                charsLeft < 0 && styles.impressionInputError,
              ]}
              placeholder="What made it worth pinning?"
              placeholderTextColor="#bbb"
              value={impression}
              onChangeText={(t) => {
                if (t.length <= MAX_IMPRESSION) setImpression(t);
              }}
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
            style={[styles.pinBtn, { backgroundColor: color }, (!status || saving) && styles.pinBtnDisabled]}
            onPress={handlePin}
            disabled={!status || saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.pinBtnText}>
                {status ? 'PIN THIS PLACE' : 'SELECT VISITED OR WANT TO GO'}
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  container: { paddingHorizontal: 20, paddingBottom: 40, gap: 20 },
  backBtn: { paddingVertical: 16 },
  backText: { fontSize: 15, color: '#E63946', fontWeight: '600' },

  placeCard: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#eee',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  placePhoto: { width: '100%', height: 160, resizeMode: 'cover' },
  photoPlaceholder: {
    width: '100%',
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoEmoji: { fontSize: 48 },
  placeInfo: { padding: 16, gap: 6 },
  catBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 4,
  },
  catBadgeText: { fontSize: 12, fontWeight: '700' },
  placeName: { fontSize: 20, fontWeight: '800', color: '#111' },
  placeAddress: { fontSize: 13, color: '#888' },

  sectionLabel: { fontSize: 14, fontWeight: '700', color: '#111' },
  optional: { color: '#aaa', fontWeight: '400' },

  statusRow: { flexDirection: 'row', gap: 12 },
  statusBtn: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#ddd',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBtnText: { fontSize: 15, fontWeight: '700', color: '#999' },
  statusBtnTextActive: { color: '#fff' },

  impressionContainer: { position: 'relative' },
  impressionInput: {
    borderWidth: 1.5,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 14,
    paddingBottom: 30,
    fontSize: 15,
    color: '#111',
    minHeight: 90,
    textAlignVertical: 'top',
    backgroundColor: '#fafafa',
  },
  impressionInputWarning: { borderColor: '#f59e0b' },
  impressionInputError: { borderColor: '#E63946' },
  charCount: {
    position: 'absolute',
    bottom: 10,
    right: 12,
    fontSize: 12,
    color: '#bbb',
    fontWeight: '600',
  },
  charCountWarning: { color: '#f59e0b' },
  charCountError: { color: '#E63946' },

  pinBtn: {
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 8,
  },
  pinBtnDisabled: { opacity: 0.45 },
  pinBtnText: { color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: 0.5 },
});
