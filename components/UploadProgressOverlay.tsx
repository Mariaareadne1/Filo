import { ActivityIndicator, StyleSheet, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUploads } from '../contexts/UploadContext';
import { Glass } from '../design/Glass';
import { Icon, PressableScale, Text } from '../design/primitives';
import { useTheme } from '../design/theme';
import { SPACE } from '../design/tokens';

/**
 * Background photo-upload status as a glass toast under the status bar.
 * Uploads keep running while the person navigates; a failed upload stays
 * visible with a retry until it succeeds.
 */
export function UploadProgressOverlay() {
  const insets = useSafeAreaInsets();
  const { colors, reduceMotion } = useTheme();
  const { uploads, retryUpload } = useUploads();
  const items = Array.from(uploads.values());
  if (items.length === 0) return null;

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + SPACE.xs }]} accessibilityLiveRegion="polite">
      {items.map((u) => (
        <Animated.View key={u.pinId} entering={reduceMotion ? undefined : FadeInUp} exiting={reduceMotion ? undefined : FadeOutUp}>
          <PressableScale
            disabled={u.status !== 'failed'}
            onPress={() => retryUpload(u.pinId)}
            accessibilityLabel={u.status === 'failed' ? 'Photo upload failed. Tap to retry.' : u.status === 'success' ? 'Photo saved' : 'Uploading photo'}
          >
            <Glass radius={22} style={styles.toast}>
              {u.status === 'uploading' ? <ActivityIndicator size="small" color={colors.ink} /> : null}
              {u.status === 'success' ? <Icon name="checkmark.circle.fill" fallback="✓" size={16} color={colors.success} /> : null}
              {u.status === 'failed' ? <Icon name="arrow.clockwise" fallback="↻" size={16} color={colors.danger} /> : null}
              <Text variant="label" tone={u.status === 'failed' ? 'danger' : 'primary'}>
                {u.status === 'uploading' ? 'Uploading photo…' : u.status === 'success' ? 'Photo saved' : 'Upload failed — tap to retry'}
              </Text>
            </Glass>
          </PressableScale>
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: SPACE.xs },
  toast: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, paddingHorizontal: SPACE.lg, minHeight: 40 },
});
