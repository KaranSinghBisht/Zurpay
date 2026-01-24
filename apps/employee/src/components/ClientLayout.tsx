'use client';

import { ReactNode } from 'react';
import { SolanaProviders } from './SolanaProviders';
import { WalletButton } from './WalletButton';
import AuthProvider from './AuthProvider';

interface ClientLayoutProps {
  children: ReactNode;
}

export function ClientLayout({ children }: ClientLayoutProps) {
  return (
    <AuthProvider>
      <SolanaProviders>
        <header className="h-16 border-b border-zinc-800 flex items-center justify-between px-6">
          <div className="text-xl font-bold text-emerald-400">Zurpay</div>
          <WalletButton />
        </header>
        <main className="max-w-4xl mx-auto p-6">{children}</main>
      </SolanaProviders>
    </AuthProvider>
  );
}
