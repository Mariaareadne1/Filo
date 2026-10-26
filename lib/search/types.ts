import type { Category } from '../categories';

export type PlaceProvider = 'mapbox' | 'google';

/** A typeahead row — cheap, no coordinates yet. */
export interface PlaceSuggestion {
  provider: PlaceProvider;
  providerId: string;
  name: string;
  address: string;
  /** null when the provider's category is outside Filo's scope. */
  category: Category | null;
  tags: string[];
  neighborhood: string | null;
  distanceM: number | null;
}

/** A fully resolved venue, ready for save_pin. */
export interface PlaceCandidate {
  provider: PlaceProvider;
  providerId: string;
  name: string;
  address: string;
  category: Category;
  lat: number;
  lng: number;
  tags: string[];
  neighborhood: string | null;
  photoUrl: string | null;
}
