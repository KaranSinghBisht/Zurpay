'use client';

import { ReactNode } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import { SolanaProviders } from './SolanaProviders';
import AuthProvider from './AuthProvider';

interface ClientLayoutProps {
  children: ReactNode;
}

function UserMenu() {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return <div className="w-8 h-8 rounded-full bg-zinc-700 animate-pulse" />;
  }

  if (!session) {
    return (
      <button
        onClick={() => signIn('google')}
        className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm transition-colors"
      >
        Sign In
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-zinc-400">{session.user?.email}</span>
      <button
        onClick={() => signOut()}
        className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs transition-colors"
      >
        Sign Out
      </button>
    </div>
  );
}

export function ClientLayout({ children }: ClientLayoutProps) {
  return (
    <AuthProvider>
      <SolanaProviders>
        <header className="h-16 border-b border-zinc-800 flex items-center justify-between px-6">
          <div className="text-xl font-bold text-emerald-400">Zurpay</div>
          <UserMenu />
        </header>
        <main className="max-w-4xl mx-auto p-6">{children}</main>
      </SolanaProviders>
    </AuthProvider>
  );
}
