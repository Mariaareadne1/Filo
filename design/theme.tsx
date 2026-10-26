import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, useColorScheme } from 'react-native';
import { ColorScheme, DARK, LIGHT } from './tokens';

export interface ThemeValue {
  colors: ColorScheme;
  dark: boolean;
  /** iOS "Reduce Transparency": glass must render as solid surfaces. */
  reduceTransparency: boolean;
  /** iOS "Reduce Motion": springs become short fades, no parallax. */
  reduceMotion: boolean;
}

const ThemeContext = createContext<ThemeValue>({
  colors: LIGHT,
  dark: false,
  reduceTransparency: false,
  reduceMotion: false,
});

function useAccessibilityFlag(
  read: () => Promise<boolean>,
  event: 'reduceTransparencyChanged' | 'reduceMotionChanged',
): boolean {
  const [value, setValue] = useState(false);
  useEffect(() => {
    let active = true;
    read().then((v) => active && setValue(v)).catch(() => {});
    const sub = AccessibilityInfo.addEventListener(event, (v: boolean) => setValue(v));
    return () => {
      active = false;
      sub.remove();
    };
  }, [read, event]);
  return value;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const reduceTransparency = useAccessibilityFlag(
    AccessibilityInfo.isReduceTransparencyEnabled,
    'reduceTransparencyChanged',
  );
  const reduceMotion = useAccessibilityFlag(
    AccessibilityInfo.isReduceMotionEnabled,
    'reduceMotionChanged',
  );
  const dark = scheme === 'dark';
  const value = useMemo<ThemeValue>(
    () => ({ colors: dark ? DARK : LIGHT, dark, reduceTransparency, reduceMotion }),
    [dark, reduceTransparency, reduceMotion],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}

/**
 * Themed StyleSheet factory: styles are built once per color scheme and
 * memoized, so components keep the StyleSheet-at-module-scope discipline
 * while supporting light/dark.
 *
 *   const useStyles = makeStyles((c) => ({ root: { backgroundColor: c.bg } }));
 *   const s = useStyles();
 */
export function makeStyles<T>(factory: (c: ColorScheme) => T): () => T {
  const cache = new Map<ColorScheme, T>();
  return function useStyles() {
    const { colors } = useTheme();
    let styles = cache.get(colors);
    if (!styles) {
      styles = factory(colors);
      cache.set(colors, styles);
    }
    return styles;
  };
}
