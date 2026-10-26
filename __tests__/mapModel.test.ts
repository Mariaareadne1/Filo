import { buildPlaceMarkers, filterMarkers, socialLine, toFeatureCollection, boundsOf } from '../features/map/mapModel';
import type { PinRow } from '../lib/api/pins';

const ME = 'me';

function pin(over: Partial<PinRow> & { user_id: string; place_id: string }): PinRow {
  const placeId = over.place_id;
  return {
    id: `${over.user_id}-${placeId}`,
    status: 'visited',
    impression: null,
    photo_url: null,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: null,
    user: { id: over.user_id, username: over.user_id, display_name: over.user_id, avatar_url: null },
    place: {
      id: placeId, google_place_id: `g-${placeId}`, source: 'mapbox', name: `Place ${placeId}`,
      address: '', category: 'cafe', lat: 40.8, lng: -73.96, photo_url: null, tags: [], neighborhood: null,
    },
    ...over,
  };
}

describe('buildPlaceMarkers', () => {
  test('collapses several pins at one venue into one marker with a friend count', () => {
    const markers = buildPlaceMarkers(
      [pin({ user_id: 'ada', place_id: 'p1' }), pin({ user_id: 'cal', place_id: 'p1' }), pin({ user_id: 'dee', place_id: 'p1' })],
      ME,
    );
    expect(markers).toHaveLength(1);
    expect(markers[0]).toMatchObject({ kind: 'friend', friendCount: 3, myStatus: null });
  });

  test('your own pin decides the marker kind, friends still counted', () => {
    const [m] = buildPlaceMarkers(
      [pin({ user_id: ME, place_id: 'p1', status: 'want_to_go' }), pin({ user_id: 'ada', place_id: 'p1' })],
      ME,
    );
    expect(m.kind).toBe('mine_saved');
    expect(m.friendCount).toBe(1);
    expect(m.myPinId).toBe('me-p1');
  });

  test('visited beats saved for your own marker', () => {
    const [m] = buildPlaceMarkers([pin({ user_id: ME, place_id: 'p1', status: 'visited' })], ME);
    expect(m.kind).toBe('mine_visited');
  });

  test('drops rows with invalid coordinates instead of placing them at 0,0', () => {
    const bad = pin({ user_id: 'ada', place_id: 'p9' });
    bad.place = { ...bad.place, lat: Number.NaN };
    expect(buildPlaceMarkers([bad], ME)).toHaveLength(0);
  });

  test('friend names are most-recent first and de-duplicated', () => {
    const [m] = buildPlaceMarkers(
      [
        pin({ user_id: 'ada', place_id: 'p1', created_at: '2026-10-01T00:00:00Z' }),
        pin({ user_id: 'cal', place_id: 'p1', created_at: '2026-10-05T00:00:00Z' }),
      ],
      ME,
    );
    expect(m.friendNames).toEqual(['cal', 'ada']);
  });
});

describe('filterMarkers', () => {
  const markers = buildPlaceMarkers(
    [
      pin({ user_id: ME, place_id: 'mine' }),
      pin({ user_id: 'ada', place_id: 'theirs', place: { ...pin({ user_id: 'x', place_id: 'theirs' }).place, category: 'bar' } }),
    ],
    ME,
  );
  test('scope mine keeps only places you pinned', () => {
    expect(filterMarkers(markers, 'mine', new Set()).map((m) => m.placeId)).toEqual(['mine']);
  });
  test('scope friends keeps places with at least one friend', () => {
    expect(filterMarkers(markers, 'friends', new Set()).map((m) => m.placeId)).toEqual(['theirs']);
  });
  test('category filter applies on top of scope', () => {
    expect(filterMarkers(markers, 'all', new Set(['bar'])).map((m) => m.placeId)).toEqual(['theirs']);
  });
});

describe('socialLine', () => {
  test('null when no friends — never invents social proof', () => {
    expect(socialLine({ friendCount: 0, friendNames: [] })).toBeNull();
  });
  test('names one, two, or summarises many', () => {
    expect(socialLine({ friendCount: 1, friendNames: ['ada'] })).toBe('Pinned by @ada');
    expect(socialLine({ friendCount: 2, friendNames: ['ada', 'cal'] })).toBe('Pinned by @ada and @cal');
    expect(socialLine({ friendCount: 5, friendNames: ['ada', 'cal', 'dee'] })).toBe('Pinned by @ada and 4 friends');
  });
});

test('feature collection uses [lng, lat] order and place ids', () => {
  const fc = toFeatureCollection(buildPlaceMarkers([pin({ user_id: ME, place_id: 'p1' })], ME));
  expect(fc.features[0].geometry.coordinates).toEqual([-73.96, 40.8]);
  expect(fc.features[0].id).toBe('p1');
});

test('boundsOf returns null for empty and a box otherwise', () => {
  expect(boundsOf([])).toBeNull();
  expect(boundsOf([{ lat: 1, lng: 2 }, { lat: 3, lng: -4 }])).toEqual([-4, 1, 2, 3]);
});
