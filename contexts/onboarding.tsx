import { createContext, useContext } from 'react';

interface OnboardingCtx {
  onboardingComplete: boolean;
  setOnboardingComplete: (v: boolean) => void;
  /** Profile row now exists → route into onboarding. */
  markProfileCreated: () => void;
}

export const OnboardingContext = createContext<OnboardingCtx>({
  onboardingComplete: false,
  setOnboardingComplete: () => {},
  markProfileCreated: () => {},
});

export const useOnboarding = () => useContext(OnboardingContext);
