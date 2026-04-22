// PostHog React Native client
// Usage: import { usePostHog } from 'posthog-react-native'
// Provider is mounted in app/_layout.tsx

export const POSTHOG_API_KEY = process.env.EXPO_PUBLIC_POSTHOG_API_KEY ?? '';
export const POSTHOG_HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';
