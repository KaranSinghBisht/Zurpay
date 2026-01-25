'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { employeeApi, PaymentRequestInfo } from '../../../lib/api';
import { ConfettiCelebration } from '../../../components/ConfettiCelebration';

export default function PayPage() {
  const params = useParams();
  const { connection } = useConnection();
  const wallet = useWallet();
  const { publicKey, signTransaction, connected } = wallet;

  const requestId = (params?.id as string) ?? '';

  const [requestInfo, setRequestInfo] = useState<PaymentRequestInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [txSig, setTxSig] = useState<string | null>(null);

  useEffect(() => {
    if (requestId) {
      loadRequestInfo();
    }
  }, [requestId]);

  const loadRequestInfo = async () => {
    try {
      const result = await employeeApi.paymentRequests.get(requestId);
      if (!result.ok) {
        throw new Error(result.error || 'Failed to load payment request');
      }
      setRequestInfo(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load request');
    } finally {
      setLoading(false);
    }
  };

  const handlePay = async () => {
    if (!publicKey || !signTransaction || !requestInfo) return;

    setPaying(true);
    setError(null);

    try {
      const recipientPubkey = new PublicKey(requestInfo.recipientWallet);

      // For demo: Transfer 0.001 SOL as proof of payment
      // In production, this would be a proper USDC SPL token transfer
      // or Inco confidential transfer
      const demoAmountLamports = 1_000_000; // 0.001 SOL

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: recipientPubkey,
          lamports: demoAmountLamports,
        })
      );

      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      const signedTx = await signTransaction(transaction);
      const signature = await connection.sendRawTransaction(signedTx.serialize());

      await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      });

      const payResult = await employeeApi.paymentRequests.pay(requestId, {
        payerWallet: publicKey.toBase58(),
        txSig: signature,
      });

      if (!payResult.ok) {
        console.warn('Failed to mark request as paid:', payResult.error);
      }

      setTxSig(signature);
      setSuccess(true);
    } catch (err) {
      console.error('Payment failed:', err);
      setError(err instanceof Error ? err.message : 'Payment failed');
    } finally {
      setPaying(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error && !requestInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="glass-card rounded-xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold mb-2">Unable to Load Request</h1>
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
          <div className="glass-card rounded-xl p-8 max-w-md w-full">
            <div className="text-center mb-6">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-500/20 flex items-center justify-center">
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
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h1 className="text-2xl font-bold mb-2 text-emerald-400">Payment Sent!</h1>
              <p className="text-zinc-400">Your payment has been successfully processed</p>
            </div>

            <div className="bg-zinc-800/50 rounded-lg p-4 mb-6">
              <div className="flex justify-between mb-2">
                <span className="text-zinc-400">Amount</span>
                <span className="font-bold">{requestInfo?.amountDisplay}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Recipient</span>
                <span className="font-mono text-sm">
                  {requestInfo?.recipientWallet.slice(0, 4)}...
                  {requestInfo?.recipientWallet.slice(-4)}
                </span>
              </div>
            </div>

            {txSig && (
              <div className="text-center">
                <a
                  href={`https://explorer.solana.com/tx/${txSig}?cluster=devnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-400 hover:underline text-sm"
                >
                  View Transaction on Solana Explorer
                </a>
              </div>
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
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-500/20 flex items-center justify-center">
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
                d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold mb-2">Payment Request</h1>
          <p className="text-zinc-400">Someone requested a payment from you</p>
        </div>

        <div className="text-center mb-8">
          <div className="text-4xl font-bold text-emerald-400">{requestInfo?.amountDisplay}</div>
          {requestInfo?.memo && <p className="text-zinc-400 mt-2">{requestInfo.memo}</p>}
        </div>

        <div className="bg-zinc-800/50 rounded-lg p-4 mb-6 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-zinc-400">Recipient</span>
            <span className="font-mono">
              {requestInfo?.recipientWallet.slice(0, 6)}...
              {requestInfo?.recipientWallet.slice(-6)}
            </span>
          </div>
          {requestInfo?.expiresAt && (
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400">Expires</span>
              <span>{new Date(requestInfo.expiresAt).toLocaleString()}</span>
            </div>
          )}
        </div>

        {error && (
          <div className="p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm mb-4">
            {error}
          </div>
        )}

        {!connected ? (
          <div className="text-center">
            <p className="text-zinc-400 mb-4">Connect your wallet to pay this request</p>
          </div>
        ) : (
          <button
            onClick={handlePay}
            disabled={paying}
            className="w-full px-4 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-700 disabled:cursor-not-allowed rounded-lg transition-colors font-medium"
          >
            {paying ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Processing...
              </span>
            ) : (
              `Pay ${requestInfo?.amountDisplay}`
            )}
          </button>
        )}

        <p className="text-xs text-zinc-500 text-center mt-4">
          Payment will be sent directly to the recipient&apos;s wallet
        </p>
      </div>
    </div>
  );
}
