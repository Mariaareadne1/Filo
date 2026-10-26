import { notFound } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Metadata } from 'next';
import { BoardViewTracker } from '@/components/BoardViewTracker';

const CATEGORY_COLORS: Record<string, string> = {
  cafe:       '#9C6B3F',
  food:       '#E85D04',
  bar:        '#7209B7',
  beauty:     '#F72585',
  experience: '#4CC9F0',
  retail:     '#4361EE',
};

const CATEGORY_LABELS: Record<string, string> = {
  cafe:       'Cafe & Coffee',
  food:       'Food & Drink',
  bar:        'Bar & Nightlife',
  beauty:     'Beauty & Grooming',
  experience: 'Experience',
  retail:     'Taste Retail',
};

const CATEGORY_EMOJI: Record<string, string> = {
  cafe: '☕', food: '🍽️', bar: '🍸', beauty: '✂️', experience: '🎯', retail: '🛍️',
};

interface PageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ from?: string }>;
}

interface SharedPin {
  place_name: string;
  category: string;
  address: string;
  status: 'visited' | 'want_to_go';
  impression: string | null;
}

interface SharedBoard {
  id: string;
  name: string;
  description: string | null;
  owner: { username: string; display_name: string; avatar_url: string | null } | null;
  pins: SharedPin[];
}

/**
 * Anonymous visitors can't read boards/pins tables (RLS is authenticated-
 * only), so shared links resolve through the narrow get_shared_board()
 * SECURITY DEFINER RPC: public boards only, public authors only, no emails.
 */
async function getBoardData(token: string) {
  const { data, error } = await supabase.rpc('get_shared_board', { p_token: token });
  if (error || !data) return null;
  const board = data as SharedBoard;
  return {
    id: board.id,
    name: board.name,
    description: board.description,
    username: board.owner?.username ?? '',
    display_name: board.owner?.display_name ?? '',
    avatar_url: board.owner?.avatar_url ?? null,
    pins: board.pins.map((p, i) => ({ ...p, id: `${i}` })),
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const board = await getBoardData(token);
  if (!board) return { title: 'Board not found — Filo' };
  return {
    title: `${board.name} by @${board.username} — Filo`,
    description: board.description ?? `See where @${board.username} has been on Filo.`,
    openGraph: {
      title: `${board.name} by @${board.username}`,
      description: board.description ?? `${board.pins.length} places curated by @${board.username} on Filo.`,
      siteName: 'Filo',
    },
  };
}

export default async function BoardPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const { from } = await searchParams;
  const board = await getBoardData(token);

  if (!board) {
    notFound();
  }

  const source = from ?? 'direct';

  const initials = board.display_name
    .split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div className="min-h-screen bg-gray-50">
      <BoardViewTracker boardId={board.id} source={source} />
      {/* Top bar */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <span className="text-2xl font-black text-red-500 tracking-tight">Filo</span>
        <span className="text-gray-300">·</span>
        <span className="text-sm text-gray-500">The map your friends would draw.</span>
      </div>

      <div className="max-w-xl mx-auto px-4 py-8">
        {/* Board header */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6">
          {/* Creator */}
          <div className="flex items-center gap-3 mb-5">
            {board.avatar_url ? (
              <img
                src={board.avatar_url}
                alt={board.display_name}
                className="w-10 h-10 rounded-full object-cover"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center font-bold text-gray-500 text-sm">
                {initials}
              </div>
            )}
            <div>
              <p className="text-xs text-gray-400">Board by</p>
              <p className="font-bold text-gray-900">@{board.username}</p>
            </div>
          </div>

          <h1 className="text-2xl font-black text-gray-900 mb-1">{board.name}</h1>
          {board.description && (
            <p className="text-gray-500 text-sm leading-relaxed">{board.description}</p>
          )}
          <p className="text-xs text-gray-400 mt-3">{board.pins.length} place{board.pins.length !== 1 ? 's' : ''}</p>
        </div>

        {/* Pins list */}
        {board.pins.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">📍</p>
            <p className="font-semibold">No pins yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {board.pins.map((pin, i) => {
              const color = CATEGORY_COLORS[pin.category] ?? '#888';
              const label = CATEGORY_LABELS[pin.category] ?? pin.category;
              const emoji = CATEGORY_EMOJI[pin.category] ?? '📍';
              return (
                <div
                  key={pin.id || i}
                  className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex gap-4"
                >
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                    style={{ backgroundColor: color + '18' }}
                  >
                    {emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 truncate">{pin.place_name}</p>
                    <span
                      className="inline-block text-xs font-semibold rounded-full px-2 py-0.5 border mt-1 mb-1"
                      style={{ color, borderColor: color }}
                    >
                      {label}
                    </span>
                    {pin.impression && (
                      <p className="text-sm text-gray-500 italic leading-snug">
                        "{pin.impression}"
                      </p>
                    )}
                    <p className="text-xs text-gray-400 mt-1 truncate">{pin.address}</p>
                  </div>
                  <div className="flex-shrink-0 pt-1">
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: pin.status === 'visited' ? '#d1fae5' : '#fef3c7',
                        color: pin.status === 'visited' ? '#065f46' : '#92400e',
                      }}
                    >
                      {pin.status === 'visited' ? '✓ Been' : '♡ Want'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* CTA */}
        <div className="mt-10 bg-red-500 rounded-2xl p-6 text-center">
          <p className="text-white font-black text-xl mb-1">
            See @{board.username}'s full map
          </p>
          <p className="text-red-100 text-sm mb-5">
            Filo shows you everywhere your friends have been — on a map.
          </p>
          <p className="inline-block bg-white text-red-500 font-bold text-sm px-8 py-3 rounded-xl">
            Invite-only for Columbia &amp; Barnard
          </p>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Filo · The map your friends would draw · Columbia & Barnard
        </p>
      </div>
    </div>
  );
}
