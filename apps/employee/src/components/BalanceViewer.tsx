'use client';

import { useState, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { decryptSingleBalance, formatDecryptedAmount } from '@zurpay/sdk';

interface BalanceViewerProps {
  /** The encrypted handle (hex string) from the claim */
  encryptedHandle: string;
  /** Label to show above the balance */
  label?: string;
  /** Number of decimal places for the token (default: 6 for USDC) */
  decimals?: number;
  /** Token symbol (default: USDC) */
  tokenSymbol?: string;
}

type ViewState = 'hidden' | 'loading' | 'revealed' | 'error';

/**
 * BalanceViewer Component
 *
 * Displays an encrypted balance with the ability to decrypt and reveal it.
 * Uses Inco's attested decryption which requires a wallet signature.
 */
export function BalanceViewer({
  encryptedHandle,
  label = 'Balance',
  decimals = 6,
  tokenSymbol = 'USDC',
}: BalanceViewerProps) {
  const { publicKey, signMessage, connected } = useWallet();

  const [viewState, setViewState] = useState<ViewState>('hidden');
  const [decryptedAmount, setDecryptedAmount] = useState<bigint | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleReveal = useCallback(async () => {
    if (!publicKey || !signMessage) {
      setError('Wallet not connected');
      return;
    }

    setViewState('loading');
    setError(null);

    try {
      const result = await decryptSingleBalance(encryptedHandle, {
        publicKey,
        signMessage,
      });

      setDecryptedAmount(result.amount);
      setViewState('revealed');
    } catch (err) {
      console.error('Decryption failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to decrypt balance');
      setViewState('error');
    }
  }, [publicKey, signMessage, encryptedHandle]);

  const handleHide = useCallback(() => {
    setViewState('hidden');
    setDecryptedAmount(null);
  }, []);

  const formattedAmount =
    decryptedAmount !== null ? formatDecryptedAmount(decryptedAmount, decimals) : null;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-zinc-400">{label}</div>
        <div className="flex items-center gap-2">
          {viewState === 'revealed' ? (
            <span className="text-xs text-emerald-400 flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
              </svg>
              Decrypted
            </span>
          ) : (
            <span className="text-xs text-zinc-500 flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
              Encrypted
            </span>
          )}
        </div>
      </div>

      <div className="flex items-end justify-between">
        <div>
          {viewState === 'hidden' && (
            <div className="text-3xl font-bold text-zinc-500">
              ****.**
              <span className="text-lg ml-1">{tokenSymbol}</span>
            </div>
          )}

          {viewState === 'loading' && (
            <div className="text-3xl font-bold text-zinc-500 flex items-center gap-2">
              <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              Decrypting...
            </div>
          )}

          {viewState === 'revealed' && formattedAmount && (
            <div className="text-3xl font-bold text-emerald-400">
              {formattedAmount}
              <span className="text-lg ml-1">{tokenSymbol}</span>
            </div>
          )}

          {viewState === 'error' && (
            <div className="text-red-400">
              <div className="text-sm mb-1">Decryption failed</div>
              <div className="text-xs text-red-400/70">{error}</div>
            </div>
          )}
        </div>

        <div>
          {viewState === 'hidden' && (
            <button
              onClick={handleReveal}
              disabled={!connected}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-700 disabled:cursor-not-allowed rounded-lg transition-colors text-sm font-medium flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
              </svg>
              {connected ? 'Reveal Balance' : 'Connect Wallet'}
            </button>
          )}

          {viewState === 'revealed' && (
            <button
              onClick={handleHide}
              className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg transition-colors text-sm font-medium flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                />
              </svg>
              Hide
            </button>
          )}

          {viewState === 'error' && (
            <button
              onClick={handleReveal}
              className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg transition-colors text-sm font-medium"
            >
              Retry
            </button>
          )}
        </div>
      </div>

      {!connected && viewState === 'hidden' && (
        <p className="text-xs text-zinc-500 mt-4">
          Connect your wallet to reveal your confidential balance
        </p>
      )}

      {viewState === 'revealed' && (
        <p className="text-xs text-zinc-500 mt-4">
          Balance decrypted using Inco attested decryption
        </p>
      )}
    </div>
  );
}

export default BalanceViewer;
