import { createContext, useContext } from 'react';

interface OnboardingCtx {
  onboardingComplete: boolean;
  setOnboardingComplete: (v: boolean) => void;
}

export const OnboardingContext = createContext<OnboardingCtx>({
  onboardingComplete: false,
  setOnboardingComplete: () => {},
});

export const useOnboarding = () => useContext(OnboardingContext);
