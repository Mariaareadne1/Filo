import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
} from 'react-native';
import { useEffect, useRef } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUploads } from '../contexts/UploadContext';
import {
  PALETTE,
  ACCENT,
  FONTS,
  STICKER_SHADOW,
} from '../constants/theme';

/**
 * Floating overlay that mounts at the (app) layout root and surfaces
 * upload progress regardless of which tab/screen the user is on.
 *
 * Layout: a thin red bar pinned just below the safe-area top inset
 * while any upload is in flight, plus a stack of small sticker toasts
 * underneath it (UPLOADING / SAVED / FAILED). The failed toast is
 * tappable and triggers retryUpload(pinId). The container uses
 * pointerEvents="box-none" so taps fall through to the screen below
 * everywhere except the failed-toast hit areas.
 *
 * Note on progress: supabase-js storage .upload() doesn't expose byte
 * progress events, so the bar is decorative (indeterminate translateX
 * loop). Real percentage would require a raw fetch+XHR replacement —
 * out of scope.
 */
export function UploadProgressOverlay() {
  const insets = useSafeAreaInsets();
  const { uploads, retryUpload } = useUploads();

  const active = Array.from(uploads.values());
  const anyUploading = active.some((u) => u.status === 'uploading');

  const translate = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!anyUploading) {
      translate.stopAnimation();
      translate.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(translate, {
        toValue: 1,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [anyUploading, translate]);

  if (active.length === 0) return null;

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top }]}>
      {anyUploading && (
        <View style={styles.bar} pointerEvents="none">
          <Animated.View
            style={[
              styles.barFill,
              {
                transform: [
                  {
                    translateX: translate.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-200, 400],
                    }),
                  },
                ],
              },
            ]}
          />
        </View>
      )}

      <View style={styles.toasts} pointerEvents="box-none">
        {active.map((u) => {
          if (u.status === 'uploading') {
            return (
              <View key={u.pinId} style={styles.toast} pointerEvents="none">
                <Text style={styles.toastText}>UPLOADING PHOTO…</Text>
              </View>
            );
          }
          if (u.status === 'success') {
            return (
              <View key={u.pinId} style={styles.toast} pointerEvents="none">
                <Text style={styles.toastText}>PHOTO SAVED</Text>
              </View>
            );
          }
          return (
            <TouchableOpacity
              key={u.pinId}
              style={[styles.toast, styles.toastFailed]}
              onPress={() => retryUpload(u.pinId)}
              activeOpacity={0.85}
            >
              <Text style={styles.toastText}>PHOTO FAILED · </Text>
              <Text style={styles.retryChipText}>retry ↻</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 1000,
    elevation: 1000,
  },
  bar: {
    height: 3,
    backgroundColor: 'rgba(216, 66, 58, 0.15)',
    overflow: 'hidden',
  },
  barFill: {
    width: 160,
    height: 3,
    backgroundColor: ACCENT.red,
  },
  toasts: {
    alignItems: 'center',
    paddingTop: 8,
    gap: 6,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PALETTE.surface,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    paddingHorizontal: 10,
    paddingVertical: 6,
    ...STICKER_SHADOW,
  },
  toastFailed: {
    borderColor: ACCENT.red,
  },
  toastText: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    letterSpacing: 1.5,
    color: PALETTE.ink,
  },
  retryChipText: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    letterSpacing: 1.5,
    color: ACCENT.red,
    fontWeight: '700',
  },
});
