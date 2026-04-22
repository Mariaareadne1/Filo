const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY!;

// NYC bounding box for location bias
const NYC_BIAS = 'rectangle:40.4774,-74.2591|40.9176,-73.7004';

export interface PlaceResult {
  place_id: string;
  name: string;
  address: string;
  category: string; // our internal category
  lat: number;
  lng: number;
  photo_url: string | null;
}

// Maps Google place types → Filo categories
function inferCategory(types: string[]): string {
  if (types.some((t) => ['bar', 'night_club', 'liquor_store', 'brewery'].includes(t))) return 'bar';
  if (types.some((t) => ['restaurant', 'cafe', 'bakery', 'food', 'meal_takeaway', 'coffee_shop'].includes(t))) return 'food';
  if (types.some((t) => ['beauty_salon', 'hair_care', 'spa', 'nail_salon', 'barber_shop'].includes(t))) return 'beauty';
  if (types.some((t) => ['gym', 'health', 'amusement_park', 'bowling_alley', 'movie_theater', 'museum', 'art_gallery'].includes(t))) return 'experience';
  if (types.some((t) => ['clothing_store', 'book_store', 'store', 'shopping_mall'].includes(t))) return 'retail';
  return 'experience'; // fallback
}

export async function searchPlaces(query: string): Promise<PlaceResult[]> {
  if (!query.trim()) return [];

  const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
  url.searchParams.set('input', query);
  url.searchParams.set('key', API_KEY);
  url.searchParams.set('locationrestriction', NYC_BIAS);
  url.searchParams.set('types', 'establishment');

  const res = await fetch(url.toString());
  const data = await res.json();

  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    throw new Error(data.error_message ?? data.status);
  }

  const predictions: any[] = data.predictions ?? [];

  // Fetch details for each (parallel, limit to 5)
  const top5 = predictions.slice(0, 5);
  const details = await Promise.all(top5.map((p) => fetchPlaceDetails(p.place_id)));
  return details.filter(Boolean) as PlaceResult[];
}

export async function fetchPlaceDetails(googlePlaceId: string): Promise<PlaceResult | null> {
  const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
  url.searchParams.set('place_id', googlePlaceId);
  url.searchParams.set('key', API_KEY);
  url.searchParams.set('fields', 'place_id,name,formatted_address,types,geometry,photos');

  const res = await fetch(url.toString());
  const data = await res.json();

  if (data.status !== 'OK') return null;

  const r = data.result;
  const photoRef = r.photos?.[0]?.photo_reference ?? null;
  const photo_url = photoRef
    ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${photoRef}&key=${API_KEY}`
    : null;

  return {
    place_id: r.place_id,
    name: r.name,
    address: r.formatted_address,
    category: inferCategory(r.types ?? []),
    lat: r.geometry.location.lat,
    lng: r.geometry.location.lng,
    photo_url,
  };
}
