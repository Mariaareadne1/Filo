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
import { CATEGORY_COLORS, CATEGORY_LABELS } from '../../types';

const CATEGORY_EMOJI: Record<string, string> = {
  food: '🍽️',
  bar: '🍸',
  beauty: '✂️',
  experience: '🎯',
  retail: '🛍️',
};

export default function PinSearchScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleQueryChange(text: string) {
    setQuery(text);
    setError('');
    clearTimeout(debounceRef.current);

    if (!text.trim()) {
      setResults([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const places = await searchPlaces(text);
        setResults(places);
      } catch (e: any) {
        setError('Search failed. Check your connection and try again.');
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
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.searchRow}>
            <TextInput
              ref={inputRef}
              style={styles.input}
              placeholder="Search for a place…"
              placeholderTextColor="#999"
              value={query}
              onChangeText={handleQueryChange}
              returnKeyType="search"
              autoCorrect={false}
            />
            {loading && <ActivityIndicator style={styles.spinner} color="#E63946" size="small" />}
          </View>
          <TouchableOpacity onPress={() => router.back()} style={styles.cancelBtn}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>

        {error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : null}

        {/* Results */}
        <FlatList
          data={results}
          keyExtractor={(item) => item.place_id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            !loading && query.length > 1 ? (
              <Text style={styles.emptyText}>No results. Try a different search.</Text>
            ) : null
          }
          renderItem={({ item }) => {
            const color = CATEGORY_COLORS[item.category as keyof typeof CATEGORY_COLORS] ?? '#888';
            const emoji = CATEGORY_EMOJI[item.category] ?? '📍';
            const label = CATEGORY_LABELS[item.category as keyof typeof CATEGORY_LABELS] ?? item.category;
            return (
              <TouchableOpacity style={styles.resultRow} onPress={() => selectPlace(item)} activeOpacity={0.7}>
                <View style={[styles.categoryIcon, { backgroundColor: color + '18' }]}>
                  <Text style={styles.emoji}>{emoji}</Text>
                </View>
                <View style={styles.resultText}>
                  <Text style={styles.placeName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.placeAddress} numberOfLines={1}>{item.address}</Text>
                  <View style={[styles.catBadge, { borderColor: color }]}>
                    <Text style={[styles.catBadgeText, { color }]}>{label}</Text>
                  </View>
                </View>
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
            );
          }}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    gap: 10,
  },
  searchRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f4f4f4',
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#111',
    paddingVertical: 12,
  },
  spinner: { marginLeft: 8 },
  cancelBtn: { paddingHorizontal: 4 },
  cancelText: { fontSize: 15, color: '#E63946', fontWeight: '600' },
  errorText: { fontSize: 13, color: '#E63946', marginHorizontal: 20, marginTop: 10 },
  list: { paddingTop: 8 },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 14,
  },
  categoryIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 20 },
  resultText: { flex: 1, gap: 3 },
  placeName: { fontSize: 15, fontWeight: '700', color: '#111' },
  placeAddress: { fontSize: 12, color: '#888' },
  catBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 2,
  },
  catBadgeText: { fontSize: 11, fontWeight: '600' },
  chevron: { fontSize: 20, color: '#ccc' },
  separator: { height: 1, backgroundColor: '#f5f5f5', marginLeft: 78 },
  emptyText: { fontSize: 14, color: '#aaa', textAlign: 'center', marginTop: 40 },
});
