'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSession, signIn } from 'next-auth/react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import {
  ClaimPackageV2,
  submitClaimFromPackage,
  deriveClaimPdas,
  initEmployeeConf,
  ZURPAY_PROGRAM_ID,
  DEFAULT_INCO_PROGRAM_ID,
  DEFAULT_ZK_VERIFIER_PROGRAM_ID,
} from '@zurpay/sdk';
import { ConfettiCelebration } from '../../../components/ConfettiCelebration';
import { WalletButton } from '../../../components/WalletButton';
import { employeeApi } from '../../../lib/api';

type ClaimStatus =
  | 'loading'
  | 'no-token'
  | 'not-found'
  | 'expired'
  | 'used'
  | 'auth-required'
  | 'email-mismatch'
  | 'ready'
  | 'claiming'
  | 'success'
  | 'error';

export default function ClaimDetailPage({ params }: { params: { payrunId: string } }) {
  const searchParams = useSearchParams();
  const token = searchParams?.get('token') ?? null;
  const { data: session, status: authStatus } = useSession();

  const { connection } = useConnection();
  const { publicKey, signTransaction, connected } = useWallet();

  const [status, setStatus] = useState<ClaimStatus>('loading');
  const [claimPackage, setClaimPackage] = useState<ClaimPackageV2 | null>(null);
  const [expectedEmail, setExpectedEmail] = useState<string | null>(null);
  const [error, setError] = useState<string>('');
  const [txSignature, setTxSignature] = useState<string>('');

  useEffect(() => {
    if (!token) {
      setStatus('no-token');
      return;
    }

    if (authStatus === 'loading') {
      return;
    }

    if (!session) {
      setStatus('auth-required');
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

        const claimData = result.data as ClaimPackageV2 & { expectedEmail?: string };
        setClaimPackage(claimData);

        if (claimData.expectedEmail) {
          setExpectedEmail(claimData.expectedEmail);
          if (session.user?.email?.toLowerCase() !== claimData.expectedEmail.toLowerCase()) {
            setStatus('email-mismatch');
            return;
          }
        }

        setStatus('ready');
      } catch (err) {
        console.error('Failed to fetch claim package:', err);
        setError(err instanceof Error ? err.message : 'Failed to load claim');
        setStatus('error');
      }
    };

    fetchClaimPackage();
  }, [token, session, authStatus]);

  const handleClaim = async () => {
    if (!claimPackage || !publicKey || !signTransaction || !token) {
      setError('Missing required data');
      return;
    }

    try {
      setStatus('claiming');
      setError('');

      const {
        org: orgPda,
        payrun: payrunPda,
        treasury,
        employeeConf,
      } = deriveClaimPdas(
        claimPackage.orgIdHex,
        claimPackage.payrunIdHex,
        publicKey,
        ZURPAY_PROGRAM_ID
      );

      const incoProgram = claimPackage.incoProgramId
        ? new PublicKey(claimPackage.incoProgramId)
        : DEFAULT_INCO_PROGRAM_ID;

      const employeeConfInfo = await connection.getAccountInfo(employeeConf);
      if (!employeeConfInfo) {
        console.log('Initializing employee conf account...');
        await initEmployeeConf(
          connection,
          { publicKey, signTransaction },
          claimPackage.orgIdHex,
          incoProgram,
          ZURPAY_PROGRAM_ID
        );
        console.log('Employee conf account initialized');
      }

      const zkVerifierProgram = claimPackage.zkVerifierProgramId
        ? new PublicKey(claimPackage.zkVerifierProgramId)
        : DEFAULT_ZK_VERIFIER_PROGRAM_ID;

      const signature = await submitClaimFromPackage(
        connection,
        { publicKey, signTransaction },
        claimPackage,
        {
          org: orgPda,
          payrun: payrunPda,
          treasury,
          claimerConfAccount: employeeConf,
          zkVerifierProgram,
          incoProgram,
        },
        ZURPAY_PROGRAM_ID
      );

      setTxSignature(signature);

      try {
        await employeeApi.claims.markUsed(token, signature);
      } catch (markError) {
        console.warn('Failed to mark token as used:', markError);
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

      case 'auth-required':
        return (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 max-w-md">
            <h3 className="text-lg font-semibold mb-2">Sign In Required</h3>
            <p className="text-zinc-400 mb-4">
              Please sign in with Google to verify your identity before claiming.
            </p>
            <button
              onClick={() => signIn('google')}
              className="w-full px-4 py-3 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors font-medium flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Sign in with Google
            </button>
          </div>
        );

      case 'email-mismatch':
        return (
          <div className="bg-red-900/50 border border-red-700 rounded-xl p-6 max-w-md">
            <h3 className="text-lg font-semibold text-red-300 mb-2">Email Mismatch</h3>
            <p className="text-red-300/80 mb-4">
              This claim is for <span className="font-mono">{expectedEmail}</span>, but you&apos;re
              signed in as <span className="font-mono">{session?.user?.email}</span>.
            </p>
            <p className="text-zinc-400 text-sm">
              Please sign in with the correct email address to claim this payment.
            </p>
          </div>
        );

      case 'ready':
      case 'claiming':
        return (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 max-w-md">
            <div className="space-y-4">
              <div>
                <div className="text-sm text-zinc-400">Payrun ID</div>
                <div className="font-mono text-sm truncate">{params.payrunId.slice(0, 16)}...</div>
              </div>

              <div>
                <div className="text-sm text-zinc-400">Amount</div>
                <div className="text-2xl font-bold text-emerald-400">Encrypted</div>
                <div className="text-xs text-zinc-500">Amount is hidden for your privacy</div>
              </div>

              {!connected && (
                <div className="p-4 bg-zinc-800/50 border border-zinc-700 rounded-lg">
                  <p className="text-sm text-zinc-400 mb-3">
                    Connect any wallet to receive your payment. Your employer won&apos;t see which
                    wallet you use.
                  </p>
                  <WalletButton />
                </div>
              )}

              {connected && (
                <div>
                  <div className="text-sm text-zinc-400 mb-1">Receiving Wallet</div>
                  <div className="font-mono text-sm text-emerald-400 truncate">
                    {publicKey?.toBase58()}
                  </div>
                </div>
              )}

              {error && (
                <div className="p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm">
                  {error}
                </div>
              )}

              {connected && (
                <button
                  onClick={handleClaim}
                  disabled={status === 'claiming'}
                  className="w-full px-4 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-700 disabled:cursor-not-allowed rounded-lg transition-colors font-medium"
                >
                  {status === 'ready' && 'Claim Salary'}
                  {status === 'claiming' && (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Claiming...
                    </span>
                  )}
                </button>
              )}
            </div>
          </div>
        );

      case 'success':
        return (
          <>
            <ConfettiCelebration isActive={true} />
            <div className="bg-emerald-900/50 border border-emerald-700 rounded-xl p-6 max-w-md">
              <h3 className="text-xl font-bold text-emerald-300 mb-4">Claim Successful!</h3>
              <p className="text-emerald-300/80 mb-4">
                Your salary has been transferred to your confidential account.
              </p>

              <div className="p-3 bg-zinc-900/50 rounded-lg">
                <p className="text-xs text-zinc-400 mb-1">Transaction</p>
                <a
                  href={`https://explorer.solana.com/tx/${txSignature}?cluster=devnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-400 text-sm hover:underline font-mono break-all"
                >
                  {txSignature.slice(0, 20)}...{txSignature.slice(-20)}
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
