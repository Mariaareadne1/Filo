import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useEffect, useMemo, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { QueryClientProvider } from '@tanstack/react-query';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { queryClient } from '../lib/queryClient';
import { SessionContext } from '../lib/session';
import { OnboardingContext } from '../contexts/onboarding';
import { ThemeProvider, useTheme } from '../design/theme';

// Keep the splash up until fonts + the persisted session have resolved.
SplashScreen.preventAutoHideAsync().catch(() => { /* no-op on web/simulator */ });

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Stores the Expo push token ONLY if the person already granted permission
 * (asked contextually at the end of onboarding). Never prompts on sign-in.
 */
async function syncPushToken(userId: string) {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;
    const token = await Notifications.getExpoPushTokenAsync();
    await supabase.from('users').update({ expo_push_token: token.data }).eq('id', userId);
  } catch (e) {
    if (__DEV__) console.warn('[filo] push token sync skipped', e);
  }
}

type ProfileState = 'unknown' | 'missing' | 'onboarding' | 'ready';

function AppCore({ session, loading }: { session: Session | null; loading: boolean }) {
  const router = useRouter();
  const segments = useSegments();
  const { dark } = useTheme();
  const [profile, setProfile] = useState<ProfileState>('unknown');
  const userId = session?.user?.id ?? null;

  useEffect(() => {
    if (!userId) {
      setProfile('unknown');
      queryClient.clear(); // never show the previous account's cached data
      return;
    }
    let active = true;
    supabase
      .from('users')
      .select('onboarding_complete')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          // Fail toward the app (not a dead end); screens show their own errors.
          if (__DEV__) console.warn('[filo] profile lookup failed', error.message);
          setProfile('ready');
          return;
        }
        if (!data) setProfile('missing');
        else setProfile(data.onboarding_complete ? 'ready' : 'onboarding');
      });
    syncPushToken(userId);
    return () => { active = false; };
  }, [userId]);

  useEffect(() => {
    if (loading) return;
    const top = segments[0] as string | undefined;
    const inAuth = top === 'auth';
    const inOnboarding = top === 'onboarding';

    if (!session) {
      if (!inAuth) router.replace('/auth/email');
      return;
    }
    if (profile === 'unknown') return;
    if (profile === 'missing') {
      if (!(inAuth && (segments as string[])[1] === 'profile-setup')) router.replace('/auth/profile-setup');
      return;
    }
    if (profile === 'onboarding') {
      if (!inOnboarding) router.replace('/onboarding/welcome');
      return;
    }
    if (inAuth || inOnboarding || !top) router.replace('/(app)/map');
  }, [session, loading, profile, segments, router]);

  const onboardingValue = useMemo(
    () => ({
      onboardingComplete: profile === 'ready',
      setOnboardingComplete: (v: boolean) => setProfile(v ? 'ready' : 'onboarding'),
      markProfileCreated: () => setProfile('onboarding'),
    }),
    [profile],
  );

  return (
    <OnboardingContext.Provider value={onboardingValue}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(app)" />
        <Stack.Screen name="auth" />
        <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
        <Stack.Screen name="pin" options={{ presentation: 'modal' }} />
        <Stack.Screen name="board-modal" options={{ presentation: 'formSheet', sheetAllowedDetents: [0.6, 1], sheetGrabberVisible: true }} />
      </Stack>
    </OnboardingContext.Provider>
  );
}

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const [fontsLoaded, fontError] = useFonts({
    'Fraunces':          require('../assets/fonts/Fraunces-Regular.ttf'),
    'Fraunces-Italic':   require('../assets/fonts/Fraunces-Italic.ttf'),
    'Fraunces-SemiBold': require('../assets/fonts/Fraunces-SemiBold.ttf'),
    'Inter':             require('../assets/fonts/Inter-Regular.ttf'),
    'Inter-Medium':      require('../assets/fonts/Inter-Medium.ttf'),
    'Inter-SemiBold':    require('../assets/fonts/Inter-SemiBold.ttf'),
    'Inter-Bold':        require('../assets/fonts/Inter-Bold.ttf'),
    'DMMono':            require('../assets/fonts/DMMono-Regular.ttf'),
    'DMMono-Medium':     require('../assets/fonts/DMMono-Medium.ttf'),
  });

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => setSession(session))
      .catch((e: unknown) => {
        // Unreadable/corrupt persisted session → treat as signed out rather
        // than leaving the app stuck behind the splash.
        if (__DEV__) console.warn('[filo] session restore failed', e);
        setSession(null);
      })
      .finally(() => setLoading(false));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Hide the splash once fonts AND the persisted session have resolved. This
  // must be an effect, not the root view's onLayout: onLayout fires once, on
  // first layout, usually before the encrypted session read completes — the
  // splash then never hid and the app sat on it forever.
  useEffect(() => {
    if ((fontsLoaded || fontError) && !loading) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError, loading]);

  const sessionValue = useMemo(
    () => ({ session, userId: session?.user?.id ?? null, email: session?.user?.email ?? null }),
    [session],
  );

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <QueryClientProvider client={queryClient}>
            <SessionContext.Provider value={sessionValue}>
              <AppCore session={session} loading={loading} />
            </SessionContext.Provider>
          </QueryClientProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
