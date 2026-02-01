'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import Link from 'next/link';

interface ClaimHistory {
  id: string;
  payrunId: string;
  amount: string;
  status: 'PENDING' | 'CLAIMED' | 'EXPIRED';
  claimedAt: string | null;
  expiresAt: string;
  orgName: string;
  txSig: string | null;
}

export default function ClaimsPage() {
  const { publicKey, connected } = useWallet();
  const wallet = publicKey?.toBase58();

  const [claims, setClaims] = useState<ClaimHistory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (connected && wallet) {
      loadClaims();
    } else {
      setLoading(false);
    }
  }, [connected, wallet]);

  const loadClaims = async () => {
    try {
      setLoading(true);
      // In production, this would fetch claims for the connected wallet
      // For demo, we'll show a helpful message
      setClaims([]);
    } catch (err) {
      console.error('Failed to load claims:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!connected) {
    return (
      <div className="py-12">
        <h1 className="text-2xl font-bold mb-6">Your Claims</h1>
        <div className="bg-gradient-to-br from-zinc-900 to-zinc-800 border border-zinc-700 rounded-xl p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-lg bg-zinc-800 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-zinc-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.658 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
              />
            </svg>
          </div>
          <h3 className="text-xl font-semibold mb-2">Connect Your Wallet</h3>
          <p className="text-zinc-400 max-w-md mx-auto">
            Connect your wallet to view pending salary claims. If you have a claim link, you can use
            it directly without connecting.
          </p>
        </div>

        <div className="mt-8 p-6 bg-zinc-900/50 border border-zinc-800 rounded-xl">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18 8h-1V6c0-2.76-2.24-5-5-5s-5 2.24-5 5v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6zm9 14H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z" />
            </svg>
            How Zurpay Protects Your Privacy
          </h2>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="p-4 bg-zinc-800/50 rounded-lg">
              <div className="w-8 h-8 mb-2 flex items-center justify-center">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18 8h-1V6c0-2.76-2.24-5-5-5s-5 2.24-5 5v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6zm9 14H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z" />
                </svg>
              </div>
              <h3 className="font-medium mb-1">Encrypted Amounts</h3>
              <p className="text-sm text-zinc-400">
                Your salary is encrypted on-chain. Only you know how much you received.
              </p>
            </div>
            <div className="p-4 bg-zinc-800/50 rounded-lg">
              <div className="w-8 h-8 mb-2 flex items-center justify-center">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z" />
                </svg>
              </div>
              <h3 className="font-medium mb-1">Zero-Knowledge Proofs</h3>
              <p className="text-sm text-zinc-400">
                Claim eligibility is verified without revealing your identity or amount.
              </p>
            </div>
            <div className="p-4 bg-zinc-800/50 rounded-lg">
              <div className="w-8 h-8 mb-2 flex items-center justify-center">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.658 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </div>
              <h3 className="font-medium mb-1">Unguessable Links</h3>
              <p className="text-sm text-zinc-400">
                Claim links use secure tokens. No one can find claims by wallet address.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="py-12">
        <h1 className="text-2xl font-bold mb-6">Your Claims</h1>
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  const pendingClaims = claims.filter((c) => c.status === 'PENDING');
  const claimedHistory = claims.filter((c) => c.status === 'CLAIMED');
  const expiredClaims = claims.filter((c) => c.status === 'EXPIRED');

  return (
    <div className="py-12">
      <h1 className="text-2xl font-bold mb-6">Your Claims</h1>

      {claims.length === 0 ? (
        <div className="space-y-6">
          <div className="bg-gradient-to-br from-emerald-900/20 to-zinc-900 border border-emerald-800/50 rounded-xl p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-lg bg-emerald-900/30 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-emerald-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
            </div>
            <h3 className="text-xl font-semibold mb-2">Check Your Email</h3>
            <p className="text-zinc-400 max-w-md mx-auto mb-4">
              For your privacy, claims are not linked to wallet addresses. When your employer
              creates a payrun, you&apos;ll receive a secure claim link via email.
            </p>
            <div className="inline-flex items-center gap-2 text-sm text-emerald-400 bg-emerald-900/20 px-4 py-2 rounded-lg">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
              <span>This protects your wallet identity from your employer</span>
            </div>
          </div>

          <div className="p-4 bg-zinc-800/30 border border-zinc-800 rounded-lg">
            <p className="text-sm text-zinc-400 text-center">
              <strong className="text-zinc-300">Connected:</strong>{' '}
              <span className="font-mono">
                {wallet?.slice(0, 8)}...{wallet?.slice(-8)}
              </span>
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Pending Claims */}
          {pendingClaims.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z" />
                </svg>
                Pending Claims
              </h2>
              <div className="space-y-3">
                {pendingClaims.map((claim) => (
                  <div
                    key={claim.id}
                    className="bg-gradient-to-r from-amber-900/20 to-zinc-900 border border-amber-700/50 rounded-xl p-4"
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="font-medium">{claim.orgName}</div>
                        <div className="text-sm text-zinc-400">
                          Expires: {new Date(claim.expiresAt).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-emerald-400">Hidden</div>
                        <div className="text-xs text-zinc-500">Encrypted Amount</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Claimed History */}
          {claimedHistory.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-emerald-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                </svg>
                Claim History
              </h2>
              <div className="space-y-3">
                {claimedHistory.map((claim) => (
                  <div key={claim.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="font-medium">{claim.orgName}</div>
                        <div className="text-sm text-zinc-400">
                          Claimed:{' '}
                          {claim.claimedAt && new Date(claim.claimedAt).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="px-2 py-1 bg-emerald-900/50 text-emerald-300 text-xs rounded-full">
                          Claimed
                        </span>
                        {claim.txSig && (
                          <a
                            href={`https://explorer.solana.com/tx/${claim.txSig}?cluster=devnet`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block text-xs text-emerald-400 hover:underline mt-1"
                          >
                            View TX
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Privacy Education */}
      <div className="mt-8 p-6 bg-zinc-900/50 border border-zinc-800 rounded-xl">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M18 8h-1V6c0-2.76-2.24-5-5-5s-5 2.24-5 5v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6zm9 14H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z" />
          </svg>
          Your Privacy is Protected
        </h2>
        <div className="grid md:grid-cols-3 gap-4">
          <div className="p-4 bg-zinc-800/50 rounded-lg">
            <div className="w-8 h-8 mb-2 flex items-center justify-center">
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18 8h-1V6c0-2.76-2.24-5-5-5s-5 2.24-5 5v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6zm9 14H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z" />
              </svg>
            </div>
            <h3 className="font-medium mb-1">Encrypted Amounts</h3>
            <p className="text-sm text-zinc-400">
              Salaries are encrypted using Inco Lightning. No one can see how much you earn.
            </p>
          </div>
          <div className="p-4 bg-zinc-800/50 rounded-lg">
            <div className="w-8 h-8 mb-2 flex items-center justify-center">
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z" />
              </svg>
            </div>
            <h3 className="font-medium mb-1">Zero-Knowledge Proofs</h3>
            <p className="text-sm text-zinc-400">
              Your claim eligibility is proven mathematically without revealing any data.
            </p>
          </div>
          <div className="p-4 bg-zinc-800/50 rounded-lg">
            <div className="w-8 h-8 mb-2 flex items-center justify-center">
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
              </svg>
            </div>
            <h3 className="font-medium mb-1">No Public Records</h3>
            <p className="text-sm text-zinc-400">
              Claims cannot be linked to your wallet address by external observers.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
