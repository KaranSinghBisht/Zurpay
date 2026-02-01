'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signIn, signOut } from 'next-auth/react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { SolanaProviders } from './SolanaProviders';
import AuthProvider from './AuthProvider';
import { APP_URLS } from '../lib/app-urls';

interface ClientLayoutProps {
  children: ReactNode;
}

function WalletButton() {
  const { publicKey, disconnect, connected } = useWallet();
  const { setVisible } = useWalletModal();

  if (!connected) {
    return (
      <button
        onClick={() => setVisible(true)}
        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-sm transition-colors font-medium"
      >
        Connect Wallet
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-zinc-400 font-mono">
        {publicKey?.toBase58().slice(0, 4)}...{publicKey?.toBase58().slice(-4)}
      </span>
      <button
        onClick={() => disconnect()}
        className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs transition-colors"
      >
        Disconnect
      </button>
    </div>
  );
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
        Sign In with Google
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

function Navigation() {
  const pathname = usePathname();

  const links = [
    { href: '/', label: 'Home' },
    { href: '/request', label: 'Request Payment' },
  ];

  return (
    <nav className="flex items-center gap-4">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={`text-sm transition-colors ${
            pathname === link.href
              ? 'text-emerald-400 font-medium'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          {link.label}
        </Link>
      ))}
      <span className="text-zinc-700">|</span>
      <a
        href={APP_URLS.admin}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm text-zinc-400 hover:text-white transition-colors"
      >
        Admin
      </a>
      <a
        href={APP_URLS.docs}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm text-zinc-400 hover:text-white transition-colors"
      >
        Docs
      </a>
    </nav>
  );
}

function HeaderContent() {
  return (
    <header className="h-16 border-b border-zinc-800 flex items-center justify-between px-6">
      <div className="flex items-center gap-8">
        <Link href="/" className="text-xl font-bold text-emerald-400">
          Zurpay
        </Link>
        <Navigation />
      </div>
      <div className="flex items-center gap-4">
        <WalletButton />
        <UserMenu />
      </div>
    </header>
  );
}

export function ClientLayout({ children }: ClientLayoutProps) {
  return (
    <AuthProvider>
      <SolanaProviders>
        <HeaderContent />
        <main className="max-w-4xl mx-auto p-6">{children}</main>
      </SolanaProviders>
    </AuthProvider>
  );
}
