import { ViewStyle } from 'react-native';

export const COLORS = {
  bg: '#F5F0EB',
  primary: '#E63946',
  accent: '#4361EE',
  white: '#FFFFFF',
  textPrimary: '#1A1A1A',
  textSecondary: 'rgba(26,26,26,0.6)',
  textMuted: 'rgba(26,26,26,0.4)',
  glass: 'rgba(255,255,255,0.7)',
  glassBorder: 'rgba(255,255,255,0.9)',
  tabBg: 'rgba(245,240,235,0.95)',
  separator: 'rgba(26,26,26,0.08)',
  inputBg: 'rgba(255,255,255,0.7)',
  inputBorder: 'rgba(26,26,26,0.15)',
};

export const GLASS: ViewStyle = {
  backgroundColor: 'rgba(255,255,255,0.7)',
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.9)',
  borderRadius: 24,
};

export const GLASS_SM: ViewStyle = {
  backgroundColor: 'rgba(255,255,255,0.7)',
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.9)',
  borderRadius: 16,
};

export const INPUT_STYLE: ViewStyle = {
  backgroundColor: 'rgba(255,255,255,0.7)',
  borderWidth: 1.5,
  borderColor: 'rgba(26,26,26,0.15)',
  borderRadius: 14,
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const VISIBILITY_COLOR: Record<string, string> = {
  public: '#22c55e',
  friends: '#3b82f6',
  private: 'rgba(26,26,26,0.4)',
};

export const VISIBILITY_LABEL: Record<string, string> = {
  public: 'Public',
  friends: 'Friends',
  private: 'Private',
};
