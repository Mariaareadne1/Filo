import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { placePhotoUrl } from '../../lib/search';
import { CATEGORY_META, type Category } from '../../lib/categories';
import { Icon, Text } from '../../design/primitives';
import { makeStyles, useTheme } from '../../design/theme';

interface Props {
  covers: string[];
  categories: Category[];
  name: string;
  height: number;
}

/**
 * Board cover from REAL pin/venue photos: 1 photo full-bleed, 2 split,
 * 3–4 as a mosaic. With no photos, a typographic cover (board initial +
 * the categories it holds) — never stock imagery.
 */
export function BoardCover({ covers, categories, name, height }: Props) {
  const s = useStyles();
  const { colors } = useTheme();
  const urls = covers.map((u) => placePhotoUrl(u, 400)).filter((u): u is string => !!u);

  if (urls.length === 0) {
    return (
      <View style={[s.typo, { height, backgroundColor: colors.threadSoft }]} accessibilityElementsHidden>
        <Text variant="hero" tone="thread" style={s.initial}>{name.trim().slice(0, 1).toUpperCase() || '·'}</Text>
        <View style={s.glyphs}>
          {categories.slice(0, 4).map((c) => (
            <Icon key={c} name={CATEGORY_META[c].symbol} fallback={CATEGORY_META[c].glyph} size={14} color={colors.thread} />
          ))}
        </View>
      </View>
    );
  }

  const img = (u: string, style: object) => (
    <Image key={u} source={{ uri: u }} style={style} contentFit="cover" transition={120} recyclingKey={u} />
  );

  return (
    <View style={[s.frame, { height }]} accessibilityElementsHidden>
      {urls.length === 1 ? img(urls[0], s.fill) : null}
      {urls.length === 2 ? (
        <View style={s.row}>{img(urls[0], s.cell)}{img(urls[1], s.cell)}</View>
      ) : null}
      {urls.length >= 3 ? (
        <View style={s.row}>
          {img(urls[0], s.cellLarge)}
          <View style={s.col}>{img(urls[1], s.cell)}{img(urls[2], s.cell)}{urls[3] ? img(urls[3], s.cell) : null}</View>
        </View>
      ) : null}
    </View>
  );
}

const GAP = 2;
const useStyles = makeStyles((c) =>
  StyleSheet.create({
    frame: { overflow: 'hidden', backgroundColor: c.surfaceSunk },
    fill: { flex: 1 },
    row: { flex: 1, flexDirection: 'row', gap: GAP },
    col: { flex: 1, gap: GAP },
    cell: { flex: 1 },
    cellLarge: { flex: 1.6 },
    typo: { justifyContent: 'space-between', padding: 14 },
    initial: { fontSize: 56, lineHeight: 60 },
    glyphs: { flexDirection: 'row', gap: 8 },
  }),
);
