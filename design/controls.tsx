import { ReactNode } from 'react';
import { ActivityIndicator, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Glass } from './Glass';
import { Icon, PressableScale, Text, haptic } from './primitives';
import { makeStyles, useTheme } from './theme';
import { HIT, RADIUS, SPACE } from './tokens';

// ─── GlassChip ────────────────────────────────────────────────────────
interface ChipProps {
  label: string;
  selected?: boolean;
  onPress: () => void;
  symbol?: string;
  fallback?: string;
  testID?: string;
}

/** Filter chip floating over the map. Selected = thread-tinted glass. */
export function GlassChip({ label, selected, onPress, symbol, fallback, testID }: ChipProps) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <PressableScale
      onPress={() => { haptic.select(); onPress(); }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!selected }}
      testID={testID}
    >
      <Glass variant="clear" interactive tint={selected ? colors.thread : undefined} style={s.chip}>
        {symbol ? <Icon name={symbol} fallback={fallback ?? ''} size={13} color={selected ? colors.onThread : colors.ink} /> : null}
        <Text variant="label" tone={selected ? 'onThread' : 'primary'}>{label}</Text>
      </Glass>
    </PressableScale>
  );
}

// ─── Segmented (glass) ────────────────────────────────────────────────
interface SegmentedProps<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  accessibilityLabel: string;
}

export function GlassSegmented<T extends string>({ value, options, onChange, accessibilityLabel }: SegmentedProps<T>) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <Glass style={s.segmented}>
      <View style={s.segmentedRow} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
        {options.map((o) => {
          const active = o.value === value;
          return (
            <PressableScale
              key={o.value}
              style={[s.segment, active && { backgroundColor: colors.surface }]}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              accessibilityLabel={o.label}
              onPress={() => { if (!active) { haptic.select(); onChange(o.value); } }}
            >
              <Text variant="label" tone={active ? 'primary' : 'secondary'}>{o.label}</Text>
            </PressableScale>
          );
        })}
      </View>
    </Glass>
  );
}

// ─── Round glass icon button ──────────────────────────────────────────
interface IconButtonProps {
  symbol: string;
  fallback: string;
  label: string;
  onPress: () => void;
  size?: number;
  tint?: string;
  iconColor?: string;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function GlassIconButton({ symbol, fallback, label, onPress, size = HIT, tint, iconColor, busy, style, testID }: IconButtonProps) {
  const { colors } = useTheme();
  return (
    <PressableScale onPress={onPress} accessibilityLabel={label} testID={testID} style={style}>
      <Glass radius={size / 2} interactive tint={tint} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        {busy ? <ActivityIndicator color={iconColor ?? colors.ink} /> : <Icon name={symbol} fallback={fallback} size={size * 0.42} color={iconColor ?? colors.ink} />}
      </Glass>
    </PressableScale>
  );
}

// ─── Solid buttons (sheets, forms) ────────────────────────────────────
interface ButtonProps {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'quiet' | 'danger';
  symbol?: string;
  fallback?: string;
  busy?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityHint?: string;
  children?: ReactNode;
}

export function Button({ label, onPress, kind = 'primary', symbol, fallback, busy, disabled, style, testID, accessibilityHint }: ButtonProps) {
  const s = useStyles();
  const { colors } = useTheme();
  const bg = { primary: colors.thread, secondary: colors.surfaceSunk, quiet: 'transparent', danger: 'transparent' }[kind];
  const fg = { primary: colors.onThread, secondary: colors.ink, quiet: colors.ink, danger: colors.danger }[kind];
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ busy: !!busy }}
      testID={testID}
      style={[s.button, { backgroundColor: bg }, style]}
    >
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {symbol ? <Icon name={symbol} fallback={fallback ?? ''} size={16} color={fg} /> : null}
          <Text variant="bodyStrong" style={{ color: fg }}>{label}</Text>
        </>
      )}
    </PressableScale>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    chip: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: 14, minHeight: 34, justifyContent: 'center',
    },
    segmented: { padding: 3 },
    segmentedRow: { flexDirection: 'row' },
    segment: {
      minHeight: 32, paddingHorizontal: 14, borderRadius: RADIUS.capsule,
      alignItems: 'center', justifyContent: 'center',
    },
    button: {
      minHeight: 50, borderRadius: RADIUS.md, paddingHorizontal: SPACE.lg,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.sm,
      borderWidth: StyleSheet.hairlineWidth, borderColor: c.hairline,
    },
  }),
);
