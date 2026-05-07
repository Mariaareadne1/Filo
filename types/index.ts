export type Category = 'food' | 'bar' | 'beauty' | 'experience' | 'retail';

export const CATEGORY_COLORS: Record<Category, string> = {
  food: '#E85D04',
  bar: '#7209B7',
  beauty: '#F72585',
  experience: '#4CC9F0',
  retail: '#4361EE',
};

export const CATEGORY_LABELS: Record<Category, string> = {
  food: 'Food & Drink',
  bar: 'Bar & Nightlife',
  beauty: 'Beauty & Grooming',
  experience: 'Experience',
  retail: 'Taste Retail',
};

export interface FriendRank {
  username: string;
  rank: number;
  total: number;
  categoryLabel?: string;
}

export interface MapPin {
  pin_id: string;
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  place_id: string;
  place_name: string;
  category: Category;
  address: string;
  lat: number;
  lng: number;
  photo_url: string | null;
  status: 'visited' | 'want_to_go';
  impression: string | null;
  created_at: string;
  /** Caller's position for this place in its category, if ranked. */
  myRank?: number;
  /** Total count of caller's rankings in this place's category. */
  myCategoryTotal?: number;
  /** Top friend ranks for this place — sorted ascending by rank, capped at 3. */
  friendRanks?: FriendRank[];
}
