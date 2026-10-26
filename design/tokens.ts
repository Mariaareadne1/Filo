import { Platform, TextStyle } from 'react-native';

/**
 * Filo 2.0 design tokens — "city glass".
 *
 * The map is the canvas; chrome floats above it as glass. Surfaces are clean
 * off-white (not beige) or near-black, type is charcoal, and the red thread
 * is reserved for meaning: selection, your relationship to a place, primary
 * actions, small highlights. Never a background wash.
 */

export const THREAD = '#D8423A';

export interface ColorScheme {
  /** App background behind non-map screens. */
  bg: string;
  /** Opaque card / sheet surface (also the Reduce-Transparency fallback). */
  surface: string;
  /** Slightly recessed surface (inputs, grouped rows). */
  surfaceSunk: string;
  ink: string;
  inkSecondary: string;
  inkTertiary: string;
  hairline: string;
  /** The red thread. */
  thread: string;
  /** Thread at low alpha — selected chip fills, halos. */
  threadSoft: string;
  /** Text/icons placed on the thread color. */
  onThread: string;
  /** Tint layered into blur fallback glass. */
  glassTint: string;
  /** Top-edge specular highlight on fallback glass. */
  glassEdge: string;
  /** Map marker inks. */
  pinFriend: string;
  pinCluster: string;
  success: string;
  danger: string;
  scrim: string;
}

export const LIGHT: ColorScheme = {
  bg: '#F6F6F4',
  surface: '#FFFFFF',
  surfaceSunk: '#EFEFEC',
  ink: '#17181A',
  inkSecondary: 'rgba(23,24,26,0.64)',
  inkTertiary: 'rgba(23,24,26,0.44)',
  hairline: 'rgba(23,24,26,0.10)',
  thread: THREAD,
  threadSoft: 'rgba(216,66,58,0.12)',
  onThread: '#FFFFFF',
  glassTint: 'rgba(255,255,255,0.55)',
  glassEdge: 'rgba(255,255,255,0.85)',
  pinFriend: '#2B2D31',
  pinCluster: '#17181A',
  success: '#2F7D5B',
  danger: '#C2362F',
  scrim: 'rgba(10,10,12,0.32)',
};

export const DARK: ColorScheme = {
  bg: '#0E0F11',
  surface: '#1A1B1E',
  surfaceSunk: '#232428',
  ink: '#F3F3F1',
  inkSecondary: 'rgba(243,243,241,0.68)',
  inkTertiary: 'rgba(243,243,241,0.46)',
  hairline: 'rgba(243,243,241,0.12)',
  thread: '#E5554C',
  threadSoft: 'rgba(229,85,76,0.20)',
  onThread: '#FFFFFF',
  glassTint: 'rgba(28,29,32,0.55)',
  glassEdge: 'rgba(255,255,255,0.18)',
  pinFriend: '#E8E8E6',
  pinCluster: '#F3F3F1',
  success: '#5FBF94',
  danger: '#F06A62',
  scrim: 'rgba(0,0,0,0.5)',
};

// ─── Type ──────────────────────────────────────────────────────────────
// Fraunces carries editorial moments (place names, screen titles, boards);
// functional UI uses the platform face so it feels native and scales with
// Dynamic Type; DM Mono is kept for small counts/ranks only.

export const FONT = {
  display: 'Fraunces',
  displayItalic: 'Fraunces-Italic',
  displaySemi: 'Fraunces-SemiBold',
  ui: Platform.select({ ios: 'System', default: 'Inter' }) as string,
  uiMedium: Platform.select({ ios: 'System', default: 'Inter-Medium' }) as string,
  uiSemi: Platform.select({ ios: 'System', default: 'Inter-SemiBold' }) as string,
  mono: 'DMMono',
  monoMedium: 'DMMono-Medium',
};

type TypeRamp =
  | 'hero' | 'title' | 'placeName' | 'heading' | 'body' | 'bodyStrong'
  | 'callout' | 'label' | 'caption' | 'count';

export const TYPE: Record<TypeRamp, TextStyle> = {
  hero:       { fontFamily: FONT.display, fontSize: 40, lineHeight: 44, letterSpacing: -0.8 },
  title:      { fontFamily: FONT.display, fontSize: 30, lineHeight: 34, letterSpacing: -0.5 },
  placeName:  { fontFamily: FONT.displaySemi, fontSize: 26, lineHeight: 30, letterSpacing: -0.3 },
  heading:    { fontFamily: FONT.uiSemi, fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body:       { fontFamily: FONT.ui, fontSize: 16, lineHeight: 22 },
  bodyStrong: { fontFamily: FONT.uiSemi, fontSize: 16, lineHeight: 22, fontWeight: '600' },
  callout:    { fontFamily: FONT.ui, fontSize: 14, lineHeight: 19 },
  label:      { fontFamily: FONT.uiMedium, fontSize: 13, lineHeight: 17, fontWeight: '500' },
  caption:    { fontFamily: FONT.ui, fontSize: 12, lineHeight: 16 },
  count:      { fontFamily: FONT.monoMedium, fontSize: 12, lineHeight: 16, letterSpacing: 0.2 },
};

// ─── Space, shape ─────────────────────────────────────────────────────
export const SPACE = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, xxxl: 40 } as const;
export const GUTTER = 16;

/** Continuous-corner radii; glass capsules use RADIUS.capsule. */
export const RADIUS = { sm: 10, md: 16, lg: 22, xl: 30, capsule: 999 } as const;

/** Minimum interactive size (Apple HIG). */
export const HIT = 44;

// ─── Motion ───────────────────────────────────────────────────────────
// Springs are Reanimated `withSpring` configs. Durations are for the
// reduced-motion path, which swaps springs for short opacity fades.
export const MOTION = {
  press: { damping: 18, stiffness: 420, mass: 0.6 },
  snappy: { damping: 22, stiffness: 300, mass: 0.8 },
  sheet: { damping: 26, stiffness: 240, mass: 0.9 },
  gentle: { damping: 30, stiffness: 160, mass: 1 },
  pressScale: 0.96,
  fadeMs: 160,
} as const;

// ─── Elevation (soft, single shadow; glass gets none on iOS 26) ───────
export const SHADOW = {
  float: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 8,
  },
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
} as const;

/** Floating dock geometry, shared so screens can clear it. */
export const DOCK = { height: 62, bottomGap: 10 } as const;
