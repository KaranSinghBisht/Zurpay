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
          <div className="text-5xl mb-4">🔗</div>
          <h3 className="text-xl font-semibold mb-2">Connect Your Wallet</h3>
          <p className="text-zinc-400 max-w-md mx-auto">
            Connect your wallet to view pending salary claims. If you have a claim link,
            you can use it directly without connecting.
          </p>
        </div>

        <div className="mt-8 p-6 bg-zinc-900/50 border border-zinc-800 rounded-xl">
          <h2 className="text-lg font-semibold mb-4">🔒 How Zurpay Protects Your Privacy</h2>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="p-4 bg-zinc-800/50 rounded-lg">
              <div className="text-2xl mb-2">🔐</div>
              <h3 className="font-medium mb-1">Encrypted Amounts</h3>
              <p className="text-sm text-zinc-400">
                Your salary is encrypted on-chain. Only you know how much you received.
              </p>
            </div>
            <div className="p-4 bg-zinc-800/50 rounded-lg">
              <div className="text-2xl mb-2">🎭</div>
              <h3 className="font-medium mb-1">Zero-Knowledge Proofs</h3>
              <p className="text-sm text-zinc-400">
                Claim eligibility is verified without revealing your identity or amount.
              </p>
            </div>
            <div className="p-4 bg-zinc-800/50 rounded-lg">
              <div className="text-2xl mb-2">🔗</div>
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

  const pendingClaims = claims.filter(c => c.status === 'PENDING');
  const claimedHistory = claims.filter(c => c.status === 'CLAIMED');
  const expiredClaims = claims.filter(c => c.status === 'EXPIRED');

  return (
    <div className="py-12">
      <h1 className="text-2xl font-bold mb-6">Your Claims</h1>

      {claims.length === 0 ? (
        <div className="space-y-6">
          <div className="bg-gradient-to-br from-zinc-900 to-zinc-800 border border-zinc-700 rounded-xl p-8 text-center">
            <div className="text-5xl mb-4">📭</div>
            <h3 className="text-xl font-semibold mb-2">No Claims Found</h3>
            <p className="text-zinc-400 max-w-md mx-auto mb-4">
              No pending claims were found for this wallet. If you received a claim link
              from your employer, use that link directly to claim your salary.
            </p>
            <div className="inline-flex items-center gap-2 text-sm text-emerald-400">
              <span>💡</span>
              <span>Claim links look like: zurpay.app/claims/...?token=...</span>
            </div>
          </div>

          <div className="p-4 bg-zinc-800/30 border border-zinc-800 rounded-lg">
            <p className="text-sm text-zinc-400 text-center">
              <strong className="text-zinc-300">Connected:</strong>{' '}
              <span className="font-mono">{wallet?.slice(0, 8)}...{wallet?.slice(-8)}</span>
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Pending Claims */}
          {pendingClaims.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span className="text-amber-400">⏳</span> Pending Claims
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
                <span className="text-emerald-400">✓</span> Claim History
              </h2>
              <div className="space-y-3">
                {claimedHistory.map((claim) => (
                  <div
                    key={claim.id}
                    className="bg-zinc-900 border border-zinc-800 rounded-xl p-4"
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="font-medium">{claim.orgName}</div>
                        <div className="text-sm text-zinc-400">
                          Claimed: {claim.claimedAt && new Date(claim.claimedAt).toLocaleDateString()}
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
        <h2 className="text-lg font-semibold mb-4">🔒 Your Privacy is Protected</h2>
        <div className="grid md:grid-cols-3 gap-4">
          <div className="p-4 bg-zinc-800/50 rounded-lg">
            <div className="text-2xl mb-2">🔐</div>
            <h3 className="font-medium mb-1">Encrypted Amounts</h3>
            <p className="text-sm text-zinc-400">
              Salaries are encrypted using Inco Lightning. No one can see how much you earn.
            </p>
          </div>
          <div className="p-4 bg-zinc-800/50 rounded-lg">
            <div className="text-2xl mb-2">🎭</div>
            <h3 className="font-medium mb-1">Zero-Knowledge Proofs</h3>
            <p className="text-sm text-zinc-400">
              Your claim eligibility is proven mathematically without revealing any data.
            </p>
          </div>
          <div className="p-4 bg-zinc-800/50 rounded-lg">
            <div className="text-2xl mb-2">🛡️</div>
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
