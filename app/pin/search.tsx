import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { searchPlaces, PlaceResult } from '../../lib/places';
import { CATEGORY_LABELS } from '../../types';
import {
  PALETTE,
  ACCENT,
  FONTS,
  SCREEN_PAD,
} from '../../constants/theme';

export default function PinSearchScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => { inputRef.current?.focus(); }, []);

  function handleQueryChange(text: string) {
    setQuery(text);
    setError('');
    clearTimeout(debounceRef.current);
    if (!text.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const places = await searchPlaces(text);
        setResults(places);
      } catch {
        setError('search failed. check your connection and try again.');
      } finally {
        setLoading(false);
      }
    }, 400);
  }

  function selectPlace(place: PlaceResult) {
    router.push({
      pathname: '/pin/confirm',
      params: {
        place_id: place.place_id,
        name: place.name,
        address: place.address,
        category: place.category,
        lat: String(place.lat),
        lng: String(place.lng),
        photo_url: place.photo_url ?? '',
      },
    });
  }

  return (
    <View style={styles.safe}>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.metaLabel}>PIN A PLACE</Text>
            <View style={styles.headerRow}>
              <View style={styles.searchRow}>
                <Text style={styles.searchIcon}>⌕</Text>
                <TextInput
                  ref={inputRef}
                  style={styles.input}
                  placeholder="search for a place…"
                  placeholderTextColor={PALETTE.inkMute}
                  value={query}
                  onChangeText={handleQueryChange}
                  returnKeyType="search"
                  autoCorrect={false}
                />
                {loading && <ActivityIndicator style={styles.spinner} color={ACCENT.red} size="small" />}
              </View>
              <TouchableOpacity onPress={() => router.back()} style={styles.cancelBtn} hitSlop={8}>
                <Text style={styles.cancelText}>cancel</Text>
              </TouchableOpacity>
            </View>
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <FlatList
            data={results}
            keyExtractor={(item) => item.place_id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            ListEmptyComponent={
              !loading && query.length > 1 ? (
                <Text style={styles.emptyText}>no results. try a different search.</Text>
              ) : null
            }
            renderItem={({ item }) => {
              const label =
                CATEGORY_LABELS[item.category as keyof typeof CATEGORY_LABELS] ?? item.category;
              return (
                <TouchableOpacity
                  style={styles.resultRow}
                  onPress={() => selectPlace(item)}
                  activeOpacity={0.7}
                >
                  <View style={styles.resultText}>
                    <Text style={styles.placeName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.placeAddress} numberOfLines={1}>{item.address}</Text>
                    <Text style={styles.catLabel}>{label.toLowerCase()}</Text>
                  </View>
                  <Text style={styles.chevron}>→</Text>
                </TouchableOpacity>
              );
            }}
          />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: PALETTE.bg },

  header: {
    paddingHorizontal: SCREEN_PAD,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 10,
  },
  metaLabel: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 2,
    color: PALETTE.inkSoft,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  searchRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PALETTE.surface,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    paddingHorizontal: 12,
  },
  searchIcon: {
    fontSize: 14,
    color: PALETTE.inkSoft,
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontFamily: FONTS.body,
    fontSize: 15,
    color: PALETTE.ink,
    paddingVertical: 12,
  },
  spinner: { marginLeft: 8 },
  cancelBtn: { paddingHorizontal: 2, paddingVertical: 4 },
  cancelText: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    letterSpacing: 1.5,
    color: ACCENT.red,
    textTransform: 'lowercase',
  },

  errorText: {
    fontFamily: FONTS.body,
    fontSize: 12,
    color: ACCENT.red,
    marginHorizontal: SCREEN_PAD,
    marginTop: 8,
  },

  list: {
    paddingHorizontal: SCREEN_PAD,
    paddingTop: 4,
    paddingBottom: 40,
  },
  separator: {
    height: 1,
    backgroundColor: PALETTE.inkLine,
  },

  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
  },
  resultText: { flex: 1, gap: 3 },
  placeName: {
    fontFamily: FONTS.display,
    fontSize: 17,
    color: PALETTE.ink,
    fontWeight: '400',
  },
  placeAddress: {
    fontFamily: FONTS.body,
    fontSize: 12,
    color: PALETTE.inkSoft,
  },
  catLabel: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 1.5,
    color: PALETTE.inkSoft,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  chevron: {
    fontFamily: FONTS.body,
    fontSize: 16,
    color: PALETTE.ink,
  },

  emptyText: {
    fontFamily: FONTS.body,
    fontSize: 13,
    color: PALETTE.inkSoft,
    textAlign: 'center',
    marginTop: 48,
  },
});
