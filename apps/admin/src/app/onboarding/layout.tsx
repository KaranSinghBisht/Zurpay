'use client';

import { SolanaProviders } from '../../components/SolanaProviders';
import '../globals.css';

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-slate-950 text-white font-sans">
        <SolanaProviders>
          {children}
        </SolanaProviders>
      </body>
    </html>
  );
}
