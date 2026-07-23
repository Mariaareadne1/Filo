import { ViewStyle, TextStyle } from 'react-native';

/**
 * FILO design tokens — Paper palette, red thread.
 * See `Filo UI Kit Spec.md` for the full system.
 *
 * Migration notes:
 * - The original COLORS keys (bg, primary, accent, etc.) are preserved as
 *   aliases so existing screens keep compiling. New screens should pull
 *   from PALETTE / ACCENT / TYPE / RADII / SHADOWS / GLASS_STYLE directly.
 * - `accent` previously meant blue (#4361EE); it's now an alias for the
 *   electric-blue secondary thread, NOT the primary brand color. Use
 *   `primary` (red thread) for CTAs.
 */

// ─── Palettes ────────────────────────────────────────────────────────────

export type PaletteName = 'paper' | 'concrete' | 'midnight' | 'sky';

export interface Palette {
  bg: string;
  surface: string;
  ink: string;
  inkSoft: string;   // ink @ 0.6
  inkMute: string;   // ink @ 0.55 — meets ~4.5:1 for muted text
  inkLine: string;   // ink @ 0.18 — borders
  zone1: string;
  zone2: string;
  zone3: string;
  zone4: string;
  park: string;
  water: string;
}

export const PALETTES: Record<PaletteName, Palette> = {
  paper: {
    bg:      '#fafaf8',
    surface: '#ffffff',
    ink:     '#0a0a0a',
    inkSoft: 'rgba(10,10,10,0.6)',
    inkMute: 'rgba(10,10,10,0.55)',
    inkLine: 'rgba(10,10,10,0.18)',
    zone1: '#f5f3ee',
    zone2: '#efece5',
    zone3: '#eae6dd',
    zone4: '#e5e0d4',
    park:  '#cdd8c0',
    water: '#c8d2db',
  },
  concrete: {
    bg:      '#ececec',
    surface: '#f5f5f5',
    ink:     '#2a1f2e',
    inkSoft: 'rgba(42,31,46,0.6)',
    inkMute: 'rgba(42,31,46,0.55)',
    inkLine: 'rgba(42,31,46,0.18)',
    zone1: '#e6e6e6',
    zone2: '#dedede',
    zone3: '#d4d4d4',
    zone4: '#cacaca',
    park:  '#cdd6c4',
    water: '#c8cfd6',
  },
  midnight: {
    bg:      '#1a1a1f',
    surface: '#26262d',
    ink:     '#f1efea',
    inkSoft: 'rgba(241,239,234,0.65)',
    inkMute: 'rgba(241,239,234,0.55)',
    inkLine: 'rgba(241,239,234,0.18)',
    zone1: '#1f1f25',
    zone2: '#23232a',
    zone3: '#27272f',
    zone4: '#2b2b34',
    park:  '#3a4233',
    water: '#2a3239',
  },
  sky: {
    bg:      '#e2e8ee',
    surface: '#edf1f5',
    ink:     '#1f2233',
    inkSoft: 'rgba(31,34,51,0.6)',
    inkMute: 'rgba(31,34,51,0.55)',
    inkLine: 'rgba(31,34,51,0.18)',
    zone1: '#dae1e9',
    zone2: '#d2dae4',
    zone3: '#cad3df',
    zone4: '#c2ccda',
    park:  '#c5d0c2',
    water: '#bcc8d4',
  },
};

export const PALETTE: Palette = PALETTES.paper; // active default

// ─── Accent (the thread) ────────────────────────────────────────────────

export const ACCENT = {
  red:      '#d8423a', // primary brand thread
  electric: '#3a5cff', // secondary / dark-mode option
} as const;

export const FRIEND_COLORS = {
  maya:  '#ff6b4a',
  amir:  '#5b8def',
  jules: '#f4c542',
  sasha: '#7d5fff',
  kai:   '#2ec27e',
  rae:   '#e6739f',
} as const;

// ─── Typography ─────────────────────────────────────────────────────────

export const FONTS = {
  display: 'Fraunces',     // page titles, place names
  body:    'Inter',        // UI / body
  mono:    'DMMono',       // tiny meta labels (DM Mono)
} as const;

/** Common composed text styles — drop these straight into <Text style={...}>. */
export const TYPE: Record<string, TextStyle> = {
  // section label — uppercase tiny mono
  metaLabel: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 2,
    color: PALETTE.inkSoft,
    textTransform: 'uppercase',
  },
  // page title
  pageTitle: {
    fontFamily: FONTS.display,
    fontSize: 32,
    lineHeight: 34,
    color: PALETTE.ink,
    fontWeight: '400',
  },
  pageTitleLg: {
    fontFamily: FONTS.display,
    fontSize: 36,
    lineHeight: 38,
    color: PALETTE.ink,
    fontWeight: '400',
  },
  // place / card title
  placeTitle: {
    fontFamily: FONTS.display,
    fontSize: 22,
    lineHeight: 24,
    color: PALETTE.ink,
    fontWeight: '400',
  },
  // body
  body: {
    fontFamily: FONTS.body,
    fontSize: 14,
    lineHeight: 20,
    color: PALETTE.ink,
  },
  bodySm: {
    fontFamily: FONTS.body,
    fontSize: 12,
    lineHeight: 16,
    color: PALETTE.ink,
  },
  // chips, button labels
  uiLabel: {
    fontFamily: FONTS.body,
    fontSize: 11,
    fontWeight: '600',
    color: PALETTE.ink,
    letterSpacing: 0.2,
  },
  // tiny mono — dates, ranks, n° codes
  monoSm: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    color: PALETTE.ink,
    letterSpacing: 1,
  },
};

// ─── Radii ──────────────────────────────────────────────────────────────

export const RADII = {
  none: 0,        // sticker cards, pin chips
  sm: 4,
  md: 14,         // toast
  lg: 18,         // tab bar, glass panels
  pill: 999,      // chips, toggles, avatars when forced
} as const;

// ─── Shadows ────────────────────────────────────────────────────────────

/** Sticker drop — offset, no blur. Use on pin chips and cards. */
export const STICKER_SHADOW: ViewStyle = {
  shadowColor: PALETTE.ink,
  shadowOffset: { width: 1.5, height: 1.5 },
  shadowOpacity: 1,
  shadowRadius: 0,
  elevation: 2,
};

export const STICKER_SHADOW_LG: ViewStyle = {
  shadowColor: PALETTE.ink,
  shadowOffset: { width: 2, height: 2 },
  shadowOpacity: 1,
  shadowRadius: 0,
  elevation: 3,
};

/** Floating glass — soft, for the tab bar / sheets. */
export const FLOAT_SHADOW: ViewStyle = {
  shadowColor: 'rgba(40,40,60,1)',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.10,
  shadowRadius: 24,
  elevation: 6,
};

// ─── Glass surface ──────────────────────────────────────────────────────

export const GLASS_STYLE: ViewStyle = {
  backgroundColor: 'rgba(255,255,255,0.85)',
  borderWidth: 1,
  borderColor: PALETTE.inkLine,
  borderRadius: RADII.lg,
  ...FLOAT_SHADOW,
};

export const GLASS_STYLE_SM: ViewStyle = {
  backgroundColor: 'rgba(255,255,255,0.85)',
  borderWidth: 1,
  borderColor: PALETTE.inkLine,
  borderRadius: RADII.md,
  ...FLOAT_SHADOW,
};

// ─── Spacing ────────────────────────────────────────────────────────────

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const SCREEN_PAD = 20;       // standard screen edge padding
export const TAB_CLEARANCE = 100;   // BAR_HEIGHT (64) + worst-case bottom inset (~34); covers home-indicator phones

// ─── Visibility (kept from original) ────────────────────────────────────

export const VISIBILITY_COLOR: Record<string, string> = {
  public:  '#22c55e',
  friends: '#3b82f6',
  private: PALETTE.inkMute,
};

export const VISIBILITY_LABEL: Record<string, string> = {
  public:  'Public',
  friends: 'Friends',
  private: 'Private',
};

// Legacy COLORS/GLASS/GLASS_SM/INPUT_STYLE aliases were removed once the last
// three screens migrated to PALETTE/ACCENT/GLASS_STYLE. Use those directly.
