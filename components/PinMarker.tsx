import { View, Text, StyleSheet } from 'react-native';
import { CATEGORY_COLORS, Category } from '../types';
import {
  PALETTE,
  ACCENT,
  FONTS,
  STICKER_SHADOW,
  STICKER_SHADOW_LG,
} from '../constants/theme';

interface Props {
  category: Category;
  selected?: boolean;
  /** 4-char pin id used as the n° label (e.g. "A3K9"). */
  pinId?: string;
}

const CATEGORY_GLYPH: Record<Category, string> = {
  food:       '◆',
  bar:        '○',
  beauty:     '◇',
  experience: '✦',
  retail:     '◉',
};

/**
 * The Filo "sticker" pin marker.
 *
 * - sticker shadow (hard offset, no blur) — matches the prototype map
 * - category glyph centered, red when selected, otherwise muted ink
 * - tiny n° tag underneath (visible when selected) for that map-as-document feel
 *
 * For photo-backed pins, prefer the PhotoPin in app/(app)/index.tsx
 * (which uses the place photo as the marker fill).
 */
export function PinMarker({ category, selected = false, pinId }: Props) {
  const size = selected ? 44 : 36;
  const glyph = CATEGORY_GLYPH[category] ?? '◉';
  const glyphColor = selected ? ACCENT.red : (CATEGORY_COLORS[category] ?? PALETTE.ink);

  return (
    <View style={{ alignItems: 'center', gap: 4 }}>
      <View
        style={[
          styles.outer,
          { width: size, height: size },
          selected && styles.outerSelected,
        ]}
      >
        <Text style={[styles.glyph, { color: glyphColor, fontSize: selected ? 20 : 16 }]}>
          {glyph}
        </Text>
        {selected && <View style={styles.selectedBar} />}
      </View>

      {selected && pinId ? (
        <View style={styles.tag}>
          <Text style={styles.tagText}>n° {pinId.slice(0, 4).toUpperCase()}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    backgroundColor: PALETTE.surface,
    borderWidth: 1.5,
    borderColor: PALETTE.ink,
    alignItems: 'center',
    justifyContent: 'center',
    ...STICKER_SHADOW,
  },
  outerSelected: {
    borderWidth: 2,
    ...STICKER_SHADOW_LG,
  },
  glyph: {
    fontWeight: '500',
    lineHeight: 22,
  },
  selectedBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    backgroundColor: ACCENT.red,
  },
  tag: {
    backgroundColor: PALETTE.surface,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    paddingHorizontal: 5,
    paddingVertical: 1,
    ...STICKER_SHADOW,
  },
  tagText: {
    fontFamily: FONTS.mono,
    fontSize: 8,
    letterSpacing: 1,
    color: PALETTE.ink,
  },
});
