'use client';

import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
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
import { employeeApi, PaylinkInfo } from '../../../lib/api';

export default function PaylinkClaimPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const { connection } = useConnection();
  const wallet = useWallet();
  const { publicKey, signTransaction, connected } = wallet;

  const paylinkId = (params?.id as string) ?? '';
  const token = searchParams?.get('token') ?? null;

  const [paylinkInfo, setPaylinkInfo] = useState<PaylinkInfo | null>(null);
  const [claimPackage, setClaimPackage] = useState<ClaimPackageV2 | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [txSig, setTxSig] = useState<string | null>(null);

  useEffect(() => {
    if (token) {
      loadPaylinkData();
    } else {
      setError('Missing claim token');
      setLoading(false);
    }
  }, [token]);

  const loadPaylinkData = async () => {
    try {
      const [infoResult, packageResult] = await Promise.all([
        employeeApi.paylinks.getClaimInfo(token!),
        employeeApi.claims.getPackage(token!),
      ]);

      if (!infoResult.ok) {
        throw new Error(infoResult.error || `HTTP ${infoResult.status}`);
      }

      if (!infoResult.data) {
        throw new Error('Paylink info missing');
      }

      setPaylinkInfo(infoResult.data);

      if (packageResult.ok && packageResult.data) {
        setClaimPackage(packageResult.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load paylink');
    } finally {
      setLoading(false);
    }
  };

  const handleClaim = async () => {
    if (!publicKey || !signTransaction || !token || !claimPackage) {
      setError('Missing required data for claim');
      return;
    }

    setClaiming(true);
    setError(null);

    try {
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
          'Treasury account missing from claim package. Contact your employer to re-validate the payrun.'
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

      setTxSig(signature);

      await employeeApi.paylinks.claim(token, {
        claimerWallet: publicKey.toBase58(),
        claimerConfAccount: claimerConfAccount.toBase58(),
        txSig: signature,
      });

      setSuccess(true);
    } catch (err) {
      console.error('Claim failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to claim paylink');
    } finally {
      setClaiming(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error && !paylinkInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="glass-card rounded-xl p-8 max-w-md w-full text-center">
          <div className="text-5xl mb-4">❌</div>
          <h1 className="text-2xl font-bold mb-2">Unable to Load Paylink</h1>
          <p className="text-zinc-400">{error}</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <>
        <ConfettiCelebration isActive={true} />
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="glass-card rounded-xl p-8 max-w-md w-full text-center">
            <div className="text-5xl mb-4">🎉</div>
            <h1 className="text-2xl font-bold mb-2 text-emerald-400">Payment Claimed!</h1>
            <p className="text-zinc-400 mb-6">
              You have successfully claimed {paylinkInfo?.amountDisplay}
            </p>
            {txSig && (
              <a
                href={`https://explorer.solana.com/tx/${txSig}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-400 hover:underline text-sm"
              >
                View Transaction
              </a>
            )}
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="glass-card rounded-xl p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <div className="text-5xl mb-4">💰</div>
          <h1 className="text-2xl font-bold mb-2">Payment Link</h1>
          <p className="text-zinc-400">From {paylinkInfo?.orgName}</p>
        </div>

        <div className="text-center mb-8">
          <div className="text-4xl font-bold text-emerald-400">{paylinkInfo?.amountDisplay}</div>
          {paylinkInfo?.memo && <p className="text-zinc-400 mt-2">{paylinkInfo.memo}</p>}
        </div>

        <div className="p-4 bg-zinc-800/50 rounded-lg mb-6">
          <div className="flex justify-between text-sm">
            <span className="text-zinc-400">Expires</span>
            <span>{new Date(paylinkInfo?.expiresAt || '').toLocaleString()}</span>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm mb-4">
            {error}
          </div>
        )}

        {!claimPackage && (
          <div className="p-3 bg-yellow-900/50 border border-yellow-700 rounded-lg text-yellow-300 text-sm mb-4">
            Claim package not ready. The payrun may need to be validated first.
          </div>
        )}

        {!connected ? (
          <div className="text-center">
            <p className="text-zinc-400 mb-4">Connect your wallet to claim this payment</p>
          </div>
        ) : (
          <button
            onClick={handleClaim}
            disabled={claiming || !claimPackage}
            className="w-full px-4 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-700 disabled:cursor-not-allowed rounded-lg transition-colors font-medium"
          >
            {claiming ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Claiming...
              </span>
            ) : !claimPackage ? (
              'Claim Not Available'
            ) : (
              'Claim Payment'
            )}
          </button>
        )}

        <p className="text-xs text-zinc-500 text-center mt-4">
          Connected wallet will receive the payment via confidential transfer
        </p>
      </div>
    </div>
  );
}
