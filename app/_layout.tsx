import 'react-native-gesture-handler';
import { useEffect, useState, useCallback } from 'react';
import { View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { supabase } from '../lib/supabase';
import { Session } from '@supabase/supabase-js';
import * as Notifications from 'expo-notifications';
import { OnboardingContext } from '../contexts/onboarding';

// Keep the splash up until fonts are loaded so first paint is on-brand.
SplashScreen.preventAutoHideAsync().catch(() => { /* no-op on web/simulator */ });

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function registerPushToken(userId: string) {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return;
    const tokenData = await Notifications.getExpoPushTokenAsync();
    await supabase
      .from('users')
      .update({ expo_push_token: tokenData.data })
      .eq('id', userId);
  } catch {
    // Simulator or permissions denied — silent fail
  }
}

function AppCore({ session, loading }: { session: Session | null; loading: boolean }) {
  const router = useRouter();
  const segments = useSegments();

  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);

  useEffect(() => {
    if (!session?.user?.id) {
      setOnboardingComplete(null);
      return;
    }
    supabase
      .from('users')
      .select('onboarding_complete')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        setOnboardingComplete(data?.onboarding_complete ?? false);
      });
  }, [session?.user?.id]);

  useEffect(() => {
    if (loading) return;

    const inAuth       = segments[0] === 'auth';
    const inOnboarding = segments[0] === 'onboarding';
    const inApp        = segments[0] === '(app)';

    if (!session) {
      if (!inAuth) router.replace('/auth/email');
      return;
    }

    if (onboardingComplete === null) return;

    if (inAuth) {
      if (onboardingComplete) router.replace('/(app)');
      return;
    }

    if (inOnboarding) return;

    if (inApp && !onboardingComplete) {
      router.replace('/onboarding/welcome');
    }
  }, [session, loading, onboardingComplete, segments]);

  return (
    <OnboardingContext.Provider
      value={{
        onboardingComplete: onboardingComplete ?? false,
        setOnboardingComplete,
      }}
    >
      <Stack screenOptions={{ headerShown: false }} />
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
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user?.id) {
        registerPushToken(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const onLayoutReady = useCallback(async () => {
    if ((fontsLoaded || fontError) && !loading) {
      await SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError, loading]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }} onLayout={onLayoutReady}>
      <SafeAreaProvider>
        <AppCore session={session} loading={loading} />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}