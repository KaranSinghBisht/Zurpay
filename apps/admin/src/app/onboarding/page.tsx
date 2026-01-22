import dynamic from 'next/dynamic';

// Dynamic import with SSR disabled for wallet components
const OnboardingWizard = dynamic(
    () => import('@/components/OnboardingWizard'),
    { ssr: false }
);

export default function OnboardingPage() {
    return <OnboardingWizard />;
}
