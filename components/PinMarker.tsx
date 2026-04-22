import { View, StyleSheet } from 'react-native';
import { CATEGORY_COLORS, Category } from '../types';

interface Props {
  category: Category;
  selected?: boolean;
}

export function PinMarker({ category, selected = false }: Props) {
  const color = CATEGORY_COLORS[category] ?? '#888';
  return (
    <View style={[styles.outer, { borderColor: color }, selected && styles.outerSelected]}>
      <View style={[styles.inner, { backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2.5,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 4,
  },
  outerSelected: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 3,
  },
  inner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
