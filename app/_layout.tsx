import 'react-native-gesture-handler';
import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { supabase } from '../lib/supabase';
import { Session } from '@supabase/supabase-js';
import * as Notifications from 'expo-notifications';
import { OnboardingContext } from '../contexts/onboarding';

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

  // Onboarding state lives here so both the routing guard and onboarding
  // screens (via context) can read and update it.
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);

  // Load onboarding status whenever the authed user changes
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

  // Route guard
  useEffect(() => {
    if (loading) return;

    const inAuth       = segments[0] === 'auth';
    const inOnboarding = segments[0] === 'onboarding';
    const inApp        = segments[0] === '(app)';

    if (!session) {
      if (!inAuth) router.replace('/auth/email');
      return;
    }

    // Waiting for onboarding status to resolve — don't redirect yet
    if (onboardingComplete === null) return;

    if (inAuth) {
      // Auth screens (profile-setup) navigate away explicitly.
      // If a returning fully-set-up user somehow ends up here, send them home.
      if (onboardingComplete) router.replace('/(app)');
      return;
    }

    if (inOnboarding) return; // onboarding screens self-navigate

    // In the main app — if onboarding isn't done, redirect there
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

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppCore session={session} loading={loading} />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
