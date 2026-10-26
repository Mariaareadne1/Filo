import { useEffect, useMemo, useRef } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StyleSheet, View } from 'react-native';
import BottomSheet, { BottomSheetBackgroundProps, BottomSheetScrollView, useBottomSheetSpringConfigs, useBottomSheetTimingConfigs } from '@gorhom/bottom-sheet';
import { Glass } from '../../design/Glass';
import { makeStyles, useTheme } from '../../design/theme';
import { MOTION, RADIUS } from '../../design/tokens';
import { PlaceDetail } from './PlaceDetail';

interface Props {
  placeId: string | null;
  /** Bumped to re-open the sheet for the same place (e.g. a repeated deep link). */
  focusKey?: number;
  onClose: () => void;
}

/** The sheet's own material: glass that continues the map chrome. */
function SheetBackground({ style }: BottomSheetBackgroundProps) {
  return <Glass radius={RADIUS.xl} style={style} />;
}

/**
 * Three detents: preview (name + relationship), detail (actions, your
 * note, friends' takes), full (everything). Closed when nothing selected.
 */
export function PlaceSheet({ placeId, focusKey = 0, onClose }: Props) {
  const s = useStyles();
  const { colors, reduceMotion } = useTheme();
  const ref = useRef<BottomSheet>(null);
  const insets = useSafeAreaInsets();
  // Detached glass card; its parent box ends above the dock (MapScreen).
  const snapPoints = useMemo(() => [168, '50%', '86%'], []);
  const spring = useBottomSheetSpringConfigs(MOTION.sheet);
  const fade = useBottomSheetTimingConfigs({ duration: 180 });

  useEffect(() => {
    if (placeId) ref.current?.snapToIndex(1);
    else ref.current?.close();
  }, [placeId, focusKey]);

  return (
    <BottomSheet
      ref={ref}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      onClose={onClose}
      detached
      topInset={insets.top + 8}
      animationConfigs={reduceMotion ? fade : spring}
      backgroundComponent={SheetBackground}
      handleIndicatorStyle={{ backgroundColor: colors.inkTertiary, width: 40 }}
      accessibilityLabel="Place details"
    >
      <BottomSheetScrollView contentContainerStyle={s.content}>
        {placeId ? <PlaceDetail placeId={placeId} onRemoved={onClose} /> : <View />}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

const useStyles = makeStyles(() =>
  StyleSheet.create({
    content: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 32 },
  }),
);
