import { StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './theme';

/**
 * Keeps scrolled content from colliding with the status bar on full-height
 * scroll screens: a soft material strip the height of the top inset
 * (solid under Reduce Transparency). Render it last, above the ScrollView.
 */
export function StatusScrim() {
  const insets = useSafeAreaInsets();
  const { colors, dark, reduceTransparency } = useTheme();
  return (
    <View pointerEvents="none" style={[styles.scrim, { height: insets.top }]}>
      {reduceTransparency ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]} />
      ) : (
        <>
          <BlurView tint={dark ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'} intensity={80} style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg, opacity: 0.5 }]} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', top: 0, left: 0, right: 0 },
});
