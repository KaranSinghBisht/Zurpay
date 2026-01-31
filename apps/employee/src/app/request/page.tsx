'use client';

import { useState, useEffect } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Keypair, SystemProgram, Transaction } from '@solana/web3.js';
import {
  INCO_TOKEN_PROGRAM_ID,
  DEFAULT_INCO_PROGRAM_ID,
  fetchIncoAccount,
  buildInitializeAccountInstruction,
  INCO_ACCOUNT_SIZE,
} from '@zurpay/sdk';
import { employeeApi } from '../../lib/api';

// Inco USDC mint on devnet - must match the mint used in pay/[id]/page.tsx
const INCO_MINT = 'FGSe7zNdqqthJrJLmZ2dDTmJjLKdVrXJVAGxMuVoPqhC';

export default function RequestPaymentPage() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { publicKey, signMessage, signTransaction, connected } = wallet;

  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdRequest, setCreatedRequest] = useState<{
    id: string;
    payUrl: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [confAccount, setConfAccount] = useState<string | null>(null);
  const [checkingAccount, setCheckingAccount] = useState(false);
  const [creatingAccount, setCreatingAccount] = useState(false);

  useEffect(() => {
    if (publicKey && connected) {
      checkConfAccount();
    }
  }, [publicKey, connected]);

  const checkConfAccount = async () => {
    if (!publicKey) return;

    setCheckingAccount(true);
    try {
      const storedAccount = localStorage.getItem(`inco_account_${publicKey.toBase58()}`);
      if (storedAccount) {
        const accountInfo = await fetchIncoAccount(
          connection,
          new (await import('@solana/web3.js')).PublicKey(storedAccount)
        );
        if (accountInfo && accountInfo.state === 'initialized') {
          setConfAccount(storedAccount);
          return;
        }
      }
      setConfAccount(null);
    } catch (err) {
      console.error('Error checking conf account:', err);
      setConfAccount(null);
    } finally {
      setCheckingAccount(false);
    }
  };

  const handleCreateConfAccount = async () => {
    if (!publicKey || !signTransaction) return;

    setCreatingAccount(true);
    setError(null);

    try {
      const { PublicKey: PK } = await import('@solana/web3.js');
      const mintPubkey = new PK(INCO_MINT);
      const newAccount = Keypair.generate();

      const lamports = await connection.getMinimumBalanceForRentExemption(INCO_ACCOUNT_SIZE);

      const createAccountIx = SystemProgram.createAccount({
        fromPubkey: publicKey,
        newAccountPubkey: newAccount.publicKey,
        lamports,
        space: INCO_ACCOUNT_SIZE,
        programId: INCO_TOKEN_PROGRAM_ID,
      });

      const initAccountIx = buildInitializeAccountInstruction(
        newAccount.publicKey,
        mintPubkey,
        publicKey,
        publicKey,
        INCO_TOKEN_PROGRAM_ID,
        DEFAULT_INCO_PROGRAM_ID
      );

      const transaction = new Transaction().add(createAccountIx, initAccountIx);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;
      transaction.partialSign(newAccount);

      const signedTx = await signTransaction(transaction);
      const signature = await connection.sendRawTransaction(signedTx.serialize());
      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        'confirmed'
      );

      const accountAddress = newAccount.publicKey.toBase58();
      localStorage.setItem(`inco_account_${publicKey.toBase58()}`, accountAddress);
      setConfAccount(accountAddress);
    } catch (err) {
      console.error('Error creating conf account:', err);
      setError(err instanceof Error ? err.message : 'Failed to create confidential account');
    } finally {
      setCreatingAccount(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!publicKey || !signMessage || !confAccount) return;

    setLoading(true);
    setError(null);

    try {
      const amountInMicroUsdc = Math.round(parseFloat(amount) * 1_000_000).toString();
      const message = `Create Zurpay payment request for ${amountInMicroUsdc} USDC`;
      const messageBytes = new TextEncoder().encode(message);
      const signatureBytes = await signMessage(messageBytes);

      const bs58Module = await import('bs58');
      const signatureB58 = bs58Module.default.encode(signatureBytes);

      const result = await employeeApi.paymentRequests.create({
        recipientWallet: publicKey.toBase58(),
        recipientConfAccount: confAccount,
        amount: amountInMicroUsdc,
        currency: 'USDC',
        memo: memo || undefined,
        signature: signatureB58,
        message,
      });

      if (!result.ok) {
        throw new Error(result.error || 'Failed to create request');
      }

      setCreatedRequest({
        id: result.data!.id,
        payUrl: result.data!.payUrl,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create request');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!createdRequest) return;
    await navigator.clipboard.writeText(createdRequest.payUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (!createdRequest) return;
    if (navigator.share) {
      await navigator.share({
        title: 'Payment Request',
        text: memo || 'You have a payment request',
        url: createdRequest.payUrl,
      });
    } else {
      handleCopy();
    }
  };

  const handleCreateAnother = () => {
    setCreatedRequest(null);
    setAmount('');
    setMemo('');
  };

  if (createdRequest) {
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
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold mb-2 text-emerald-400">Request Created!</h1>
            <p className="text-zinc-400">Share this link to receive payment</p>
          </div>

          <div className="bg-zinc-800/50 rounded-lg p-4 mb-6">
            <div className="text-sm text-zinc-400 mb-2">Payment Link</div>
            <div className="text-sm break-all font-mono bg-zinc-900 p-3 rounded">
              {createdRequest.payUrl}
            </div>
          </div>

          <div className="flex gap-3 mb-6">
            <button
              onClick={handleCopy}
              className="flex-1 px-4 py-3 bg-zinc-700 hover:bg-zinc-600 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button
              onClick={handleShare}
              className="flex-1 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                />
              </svg>
              Share
            </button>
          </div>

          <button
            onClick={handleCreateAnother}
            className="w-full px-4 py-3 border border-zinc-700 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400"
          >
            Create Another Request
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="glass-card rounded-xl p-8 max-w-md w-full">
        <div className="text-center mb-8">
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
          <h1 className="text-2xl font-bold mb-2">Request Payment</h1>
          <p className="text-zinc-400">Create a private payment request link</p>
        </div>

        {!connected ? (
          <div className="text-center">
            <p className="text-zinc-400 mb-4">Connect your wallet to create a payment request</p>
            <p className="text-sm text-zinc-500">
              Your wallet address will receive the confidential payment
            </p>
          </div>
        ) : checkingAccount ? (
          <div className="text-center py-8">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-zinc-400">Checking confidential account...</p>
          </div>
        ) : !confAccount ? (
          <div className="text-center space-y-6">
            <div className="p-4 bg-yellow-900/20 border border-yellow-700/50 rounded-lg">
              <p className="text-yellow-300 mb-2">Confidential Account Required</p>
              <p className="text-sm text-zinc-400">
                To receive private payments, you need to create a confidential token account first.
              </p>
            </div>
            <button
              onClick={handleCreateConfAccount}
              disabled={creatingAccount}
              className="w-full px-4 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-700 rounded-lg transition-colors font-medium"
            >
              {creatingAccount ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Creating Account...
                </span>
              ) : (
                'Create Confidential Account'
              )}
            </button>
            {error && (
              <div className="p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm">
                {error}
              </div>
            )}
            <p className="text-xs text-zinc-500">
              This creates an on-chain account to hold your encrypted balances. Small SOL fee
              required.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">Amount (USDC)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  required
                  className="w-full pl-8 pr-16 py-3 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-lg"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500">
                  USDC
                </span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">
                Memo (optional)
              </label>
              <input
                type="text"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="What's this for? e.g., Hackathon prize"
                maxLength={500}
                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>

            <div className="bg-zinc-800/50 rounded-lg p-4">
              <div className="text-sm text-zinc-400 mb-1">Payment will be sent to</div>
              <div className="font-mono text-sm break-all">{publicKey?.toBase58()}</div>
            </div>

            {error && (
              <div className="p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !amount}
              className="w-full px-4 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-700 disabled:cursor-not-allowed rounded-lg transition-colors font-medium"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Creating...
                </span>
              ) : (
                'Create Payment Request'
              )}
            </button>

            <p className="text-xs text-zinc-500 text-center">
              You&apos;ll sign a message to prove wallet ownership. No transaction will be sent.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
