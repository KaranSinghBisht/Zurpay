'use client';

import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useAuth } from '../contexts/AuthContext';

export function WalletButton() {
  const { connected, publicKey } = useWallet();
  const { isAuthenticated, isLoading, signIn, signOut } = useAuth();
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setSigningIn(true);
    setError(null);
    try {
      await signIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
  };

  if (!connected) {
    return (
      <div className="wallet-button-wrapper">
        <WalletMultiButton />
        <style jsx>{`
          .wallet-button-wrapper :global(.wallet-adapter-button) {
            background-color: rgb(16, 185, 129) !important;
            height: 36px !important;
            font-size: 14px !important;
            border-radius: 8px !important;
          }
          .wallet-button-wrapper :global(.wallet-adapter-button:hover) {
            background-color: rgb(5, 150, 105) !important;
          }
        `}</style>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center gap-3">
        {error && <span className="text-xs text-red-400">{error}</span>}
        <button
          onClick={handleSignIn}
          disabled={signingIn || isLoading}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-700 rounded-lg text-sm font-medium transition-colors"
        >
          {signingIn ? 'Signing...' : 'Sign In'}
        </button>
        <span className="text-xs text-zinc-500">
          {publicKey?.toBase58().slice(0, 4)}...{publicKey?.toBase58().slice(-4)}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="flex items-center gap-2">
        <span className="w-2 h-2 bg-emerald-500 rounded-full" />
        <span className="text-sm text-zinc-300">
          {publicKey?.toBase58().slice(0, 4)}...{publicKey?.toBase58().slice(-4)}
        </span>
      </span>
      <button
        onClick={handleSignOut}
        className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-sm transition-colors"
      >
        Sign Out
      </button>
    </div>
  );
}
