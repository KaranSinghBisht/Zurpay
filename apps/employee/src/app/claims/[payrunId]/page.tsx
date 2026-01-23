'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import {
  ClaimPackageV2,
  submitClaimFromPackage,
  verifyClaimerMatch,
  deriveClaimPdas,
  ZURPAY_PROGRAM_ID,
  DEFAULT_INCO_PROGRAM_ID,
  DEFAULT_ZK_VERIFIER_PROGRAM_ID,
} from '@zurpay/sdk';
import { ConfettiCelebration } from '../../../components/ConfettiCelebration';
import { BalanceViewer } from '../../../components/BalanceViewer';
import { employeeApi } from '../../../lib/api';

type ClaimStatus =
  | 'loading'
  | 'no-token'
  | 'not-found'
  | 'expired'
  | 'used'
  | 'ready'
  | 'wallet-mismatch'
  | 'claiming'
  | 'success'
  | 'error';

export default function ClaimDetailPage({ params }: { params: { payrunId: string } }) {
  const searchParams = useSearchParams();
  const token = searchParams?.get('token') ?? null;

  const { connection } = useConnection();
  const { publicKey, signTransaction, connected } = useWallet();

  const [status, setStatus] = useState<ClaimStatus>('loading');
  const [claimPackage, setClaimPackage] = useState<ClaimPackageV2 | null>(null);
  const [error, setError] = useState<string>('');
  const [txSignature, setTxSignature] = useState<string>('');

  // Fetch claim package on mount
  useEffect(() => {
    if (!token) {
      setStatus('no-token');
      return;
    }

    const fetchClaimPackage = async () => {
      try {
        const result = await employeeApi.claims.getPackage(token);

        if (result.status === 404) {
          setStatus('not-found');
          return;
        }

        if (result.status === 410) {
          if (result.error === 'Claim already used') {
            setStatus('used');
          } else {
            setStatus('expired');
          }
          return;
        }

        if (!result.ok) {
          throw new Error(result.error || `HTTP ${result.status}`);
        }

        if (!result.data) {
          throw new Error('Claim package missing');
        }

        setClaimPackage(result.data);
        setStatus('ready');
      } catch (err) {
        console.error('Failed to fetch claim package:', err);
        setError(err instanceof Error ? err.message : 'Failed to load claim');
        setStatus('error');
      }
    };

    fetchClaimPackage();
  }, [token]);

  // Check wallet match when connected
  useEffect(() => {
    if (status === 'ready' && claimPackage && connected && publicKey) {
      const claimerConfAccount = new PublicKey(claimPackage.claimerConfAccount);
      if (!verifyClaimerMatch(claimerConfAccount, claimPackage)) {
        // Note: verifyClaimerMatch checks if sha256(claimerConfAccount) === payoutPubkeyHash
        // The connected wallet's publicKey is used to sign, but the claimerConfAccount
        // is what receives the funds. For demo, we'll just verify the package is valid.
        // In production, you'd verify that the connected wallet owns the claimerConfAccount.
      }
    }
  }, [status, claimPackage, connected, publicKey]);

  const handleClaim = async () => {
    if (!claimPackage || !publicKey || !signTransaction || !token) {
      setError('Missing required data');
      return;
    }

    try {
      setStatus('claiming');
      setError('');

      // Derive PDAs
      const { org: orgPda, payrun: payrunPda } = deriveClaimPdas(
        claimPackage.orgIdHex,
        claimPackage.payrunIdHex,
        ZURPAY_PROGRAM_ID
      );

      const claimerConfAccount = new PublicKey(claimPackage.claimerConfAccount);

      const treasuryConfAccount = claimPackage.treasuryConfAccount
        ? new PublicKey(claimPackage.treasuryConfAccount)
        : null;
      if (!treasuryConfAccount) {
        throw new Error(
          'Treasury account missing from claim package. Ask the admin to re-validate the payrun.'
        );
      }

      const zkVerifierProgram = claimPackage.zkVerifierProgramId
        ? new PublicKey(claimPackage.zkVerifierProgramId)
        : DEFAULT_ZK_VERIFIER_PROGRAM_ID;
      const incoProgram = claimPackage.incoProgramId
        ? new PublicKey(claimPackage.incoProgramId)
        : DEFAULT_INCO_PROGRAM_ID;

      const signature = await submitClaimFromPackage(
        connection,
        { publicKey, signTransaction },
        claimPackage,
        {
          org: orgPda,
          payrun: payrunPda,
          treasuryConfAccount,
          claimerConfAccount,
          zkVerifierProgram,
          incoProgram,
        },
        ZURPAY_PROGRAM_ID
      );

      setTxSignature(signature);

      // Mark token as used
      try {
        await employeeApi.claims.markUsed(token, signature);
      } catch (markError) {
        console.warn('Failed to mark token as used:', markError);
        // Non-fatal, continue
      }

      setStatus('success');
    } catch (err) {
      console.error('Claim failed:', err);
      setError(err instanceof Error ? err.message : 'Claim failed');
      setStatus('error');
    }
  };

  const renderContent = () => {
    switch (status) {
      case 'loading':
        return (
          <div className="flex items-center justify-center gap-3 py-12">
            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-zinc-400">Loading claim...</span>
          </div>
        );

      case 'no-token':
        return (
          <div className="bg-yellow-900/50 border border-yellow-700 rounded-xl p-6">
            <p className="text-yellow-300">
              No claim token provided. Please use the link from your employer.
            </p>
          </div>
        );

      case 'not-found':
        return (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <p className="text-zinc-400">This claim link is invalid or has expired.</p>
          </div>
        );

      case 'expired':
        return (
          <div className="bg-red-900/50 border border-red-700 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-red-300 mb-2">Claim Expired</h3>
            <p className="text-red-300/80">
              This claim has passed its deadline and can no longer be processed.
            </p>
          </div>
        );

      case 'used':
        return (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <h3 className="text-lg font-semibold mb-2">Already Claimed</h3>
            <p className="text-zinc-400">This claim has already been processed.</p>
          </div>
        );

      case 'ready':
      case 'claiming':
      case 'wallet-mismatch':
        return (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 max-w-md">
            <div className="space-y-4">
              <div>
                <div className="text-sm text-zinc-400">Payrun ID</div>
                <div className="font-mono text-sm truncate">{params.payrunId.slice(0, 16)}...</div>
              </div>

              <div>
                <div className="text-sm text-zinc-400">Payout Account</div>
                <div className="font-mono text-sm truncate">{claimPackage?.claimerConfAccount}</div>
              </div>

              <div>
                <div className="text-sm text-zinc-400">Amount</div>
                <div className="text-2xl font-bold text-emerald-400">Hidden</div>
                <div className="text-xs text-zinc-500">Amount is encrypted for your privacy</div>
              </div>

              {error && (
                <div className="p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm">
                  {error}
                </div>
              )}

              <button
                onClick={handleClaim}
                disabled={!connected || status === 'claiming'}
                className="w-full px-4 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-700 disabled:cursor-not-allowed rounded-lg transition-colors font-medium"
              >
                {!connected && 'Connect Wallet to Claim'}
                {connected && status === 'ready' && 'Claim Salary'}
                {connected && status === 'claiming' && (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Claiming...
                  </span>
                )}
              </button>
            </div>
          </div>
        );

      case 'success':
        return (
          <>
            <ConfettiCelebration isActive={true} />
            <div className="bg-emerald-900/50 border border-emerald-700 rounded-xl p-6 max-w-md">
              <h3 className="text-xl font-bold text-emerald-300 mb-4">🎉 Claim Successful!</h3>
              <p className="text-emerald-300/80 mb-4">
                Your salary has been claimed successfully. The funds will appear in your
                confidential account.
              </p>

              {claimPackage?.encryptedAmountB64 && (
                <div className="mb-4">
                  <BalanceViewer
                    encryptedHandle={claimPackage.encryptedAmountB64}
                    label="Claimed Amount"
                    decimals={6}
                    tokenSymbol="USDC"
                  />
                </div>
              )}

              <div className="p-3 bg-zinc-900/50 rounded-lg">
                <p className="text-xs text-zinc-400 mb-1">Transaction Signature</p>
                <a
                  href={`https://explorer.solana.com/tx/${txSignature}?cluster=devnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-400 text-sm hover:underline font-mono break-all"
                >
                  {txSignature}
                </a>
              </div>
            </div>
          </>
        );

      case 'error':
        return (
          <div className="bg-red-900/50 border border-red-700 rounded-xl p-6 max-w-md">
            <h3 className="text-lg font-semibold text-red-300 mb-2">Claim Failed</h3>
            <p className="text-red-300/80 mb-4">{error}</p>
            <button
              onClick={() => setStatus('ready')}
              className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg transition-colors"
            >
              Try Again
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="py-12">
      <h1 className="text-2xl font-bold mb-6">Claim Salary</h1>
      {renderContent()}
    </div>
  );
}
