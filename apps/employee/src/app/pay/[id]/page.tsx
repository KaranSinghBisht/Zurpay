'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Keypair, SystemProgram, Transaction } from '@solana/web3.js';
import {
  INCO_TOKEN_PROGRAM_ID,
  DEFAULT_INCO_PROGRAM_ID,
  transferIncoTokens,
  fetchIncoAccount,
  buildInitializeAccountInstruction,
  INCO_ACCOUNT_SIZE,
} from '@zurpay/sdk';
import { encryptValue } from '@inco/solana-sdk/encryption';
import { hexToBuffer } from '@inco/solana-sdk/utils';
import { employeeApi, PaymentRequestInfo } from '../../../lib/api';
import { ConfettiCelebration } from '../../../components/ConfettiCelebration';

const INCO_MINT = new PublicKey('FGSe7zNdqqthJrJLmZ2dDTmJjLKdVrXJVAGxMuVoPqhC');
const CONF_ACCOUNT_KEY = 'zurpay_payer_conf_account';

export default function PayPage() {
  const params = useParams();
  const { connection } = useConnection();
  const wallet = useWallet();
  const { publicKey, signTransaction, connected } = wallet;

  const requestId = (params?.id as string) ?? '';

  const [requestInfo, setRequestInfo] = useState<PaymentRequestInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [payStep, setPayStep] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [txSig, setTxSig] = useState<string | null>(null);

  // Payer's confidential account state
  const [payerConfAccount, setPayerConfAccount] = useState<PublicKey | null>(null);
  const [payerConfAccountInitialized, setPayerConfAccountInitialized] = useState(false);
  const [checkingPayerAccount, setCheckingPayerAccount] = useState(false);
  const [creatingPayerAccount, setCreatingPayerAccount] = useState(false);

  const loadRequestInfo = useCallback(async () => {
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
  }, [requestId]);

  useEffect(() => {
    if (requestId) {
      loadRequestInfo();
    }
  }, [requestId, loadRequestInfo]);

  const getStoredConfAccount = useCallback((): PublicKey | null => {
    if (typeof window === 'undefined' || !publicKey) return null;
    const key = `${CONF_ACCOUNT_KEY}_${publicKey.toBase58()}`;
    const stored = localStorage.getItem(key);
    if (stored) {
      try {
        return new PublicKey(stored);
      } catch {
        return null;
      }
    }
    return null;
  }, [publicKey]);

  const storeConfAccount = useCallback(
    (confAccount: PublicKey) => {
      if (typeof window === 'undefined' || !publicKey) return;
      const key = `${CONF_ACCOUNT_KEY}_${publicKey.toBase58()}`;
      localStorage.setItem(key, confAccount.toBase58());
    },
    [publicKey]
  );

  const checkPayerConfAccount = useCallback(async () => {
    if (!publicKey || !connection) return;

    setCheckingPayerAccount(true);
    try {
      // First check localStorage for existing account
      const storedAccount = getStoredConfAccount();
      if (storedAccount) {
        const accountInfo = await fetchIncoAccount(connection, storedAccount);
        if (accountInfo && accountInfo.state === 'initialized') {
          setPayerConfAccount(storedAccount);
          setPayerConfAccountInitialized(true);
          setCheckingPayerAccount(false);
          return;
        }
      }

      // No valid stored account found
      setPayerConfAccount(null);
      setPayerConfAccountInitialized(false);
    } catch (err) {
      console.error('Error checking payer conf account:', err);
    } finally {
      setCheckingPayerAccount(false);
    }
  }, [publicKey, connection, getStoredConfAccount]);

  useEffect(() => {
    if (publicKey && connected && requestInfo) {
      checkPayerConfAccount();
    }
  }, [publicKey, connected, requestInfo, checkPayerConfAccount]);

  const handleCreatePayerAccount = async () => {
    if (!publicKey || !signTransaction) return;

    setCreatingPayerAccount(true);
    setError(null);

    try {
      // Get minimum rent
      const rentLamports = await connection.getMinimumBalanceForRentExemption(INCO_ACCOUNT_SIZE);

      // Create new keypair for the conf account
      const newAccountKeypair = Keypair.generate();

      const createAccountIx = SystemProgram.createAccount({
        fromPubkey: publicKey,
        newAccountPubkey: newAccountKeypair.publicKey,
        lamports: rentLamports,
        space: INCO_ACCOUNT_SIZE,
        programId: INCO_TOKEN_PROGRAM_ID,
      });

      const initIx = buildInitializeAccountInstruction(
        newAccountKeypair.publicKey,
        INCO_MINT,
        publicKey,
        publicKey,
        INCO_TOKEN_PROGRAM_ID,
        DEFAULT_INCO_PROGRAM_ID
      );

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      const tx = new Transaction().add(createAccountIx, initIx);
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;
      tx.partialSign(newAccountKeypair);

      const signedTx = await signTransaction(tx);
      const signature = await connection.sendRawTransaction(signedTx.serialize());
      await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight });

      // Store the new account
      storeConfAccount(newAccountKeypair.publicKey);
      setPayerConfAccount(newAccountKeypair.publicKey);
      setPayerConfAccountInitialized(true);
    } catch (err) {
      console.error('Failed to create payer conf account:', err);
      setError(err instanceof Error ? err.message : 'Failed to create confidential account');
    } finally {
      setCreatingPayerAccount(false);
    }
  };

  const handlePay = async () => {
    if (!publicKey || !signTransaction || !requestInfo || !payerConfAccount) return;

    // Check if recipient has conf account
    if (!requestInfo.recipientConfAccount) {
      setError('Recipient does not have a confidential account. They need to create one first.');
      return;
    }

    setPaying(true);
    setError(null);

    try {
      const recipientConfAccount = new PublicKey(requestInfo.recipientConfAccount);

      // Step 1: Check accounts
      setPayStep('Checking accounts...');
      const [payerInfo, recipientInfo] = await Promise.all([
        fetchIncoAccount(connection, payerConfAccount),
        fetchIncoAccount(connection, recipientConfAccount),
      ]);

      if (!payerInfo || payerInfo.state !== 'initialized') {
        throw new Error('Your confidential account is not initialized. Please create one first.');
      }

      if (!recipientInfo || recipientInfo.state !== 'initialized') {
        throw new Error('Recipient confidential account is not initialized.');
      }

      // Step 2: Encrypt the amount
      setPayStep('Encrypting amount...');
      const amountBigInt = BigInt(requestInfo.amount);
      const encryptedHex = await encryptValue(amountBigInt);
      const encryptedAmount = new Uint8Array(hexToBuffer(encryptedHex));

      // Step 3: Execute confidential transfer
      setPayStep('Executing confidential transfer...');
      const signature = await transferIncoTokens(
        connection,
        { publicKey, signTransaction },
        payerConfAccount,
        recipientConfAccount,
        encryptedAmount,
        INCO_TOKEN_PROGRAM_ID,
        DEFAULT_INCO_PROGRAM_ID
      );

      // Step 4: Record the payment
      setPayStep('Recording payment...');
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
      setPayStep('');
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
              <p className="text-zinc-400">
                Your confidential payment has been successfully processed
              </p>
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

            <div className="p-3 bg-emerald-900/20 border border-emerald-800 rounded-lg mb-4">
              <p className="text-sm text-emerald-300 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
                This payment is encrypted and private
              </p>
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

  const needsConfAccount =
    connected && publicKey && !payerConfAccountInitialized && !checkingPayerAccount;
  const recipientMissingConfAccount = requestInfo && !requestInfo.recipientConfAccount;

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
          <p className="text-zinc-400">Someone requested a confidential payment from you</p>
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
          <div className="flex justify-between text-sm">
            <span className="text-zinc-400">Transfer Type</span>
            <span className="text-emerald-400 flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
              Confidential (Inco)
            </span>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm mb-4">
            {error}
          </div>
        )}

        {recipientMissingConfAccount && (
          <div className="p-3 bg-amber-900/50 border border-amber-700 rounded-lg text-amber-300 text-sm mb-4">
            The recipient hasn&apos;t set up their confidential account yet. They need to create one
            before you can pay this request.
          </div>
        )}

        {!connected ? (
          <div className="text-center">
            <p className="text-zinc-400 mb-4">Connect your wallet to pay this request</p>
          </div>
        ) : checkingPayerAccount ? (
          <div className="text-center py-4">
            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-sm text-zinc-400">Checking your confidential account...</p>
          </div>
        ) : needsConfAccount ? (
          <div className="space-y-4">
            <div className="p-3 bg-amber-900/50 border border-amber-700 rounded-lg text-amber-300 text-sm">
              You need to create a confidential account to make private payments.
            </div>
            <button
              onClick={handleCreatePayerAccount}
              disabled={creatingPayerAccount}
              className="w-full px-4 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-700 disabled:cursor-not-allowed rounded-lg transition-colors font-medium"
            >
              {creatingPayerAccount ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Creating Confidential Account...
                </span>
              ) : (
                'Create Confidential Account'
              )}
            </button>
          </div>
        ) : (
          <button
            onClick={handlePay}
            disabled={paying || !!recipientMissingConfAccount}
            className="w-full px-4 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-700 disabled:cursor-not-allowed rounded-lg transition-colors font-medium"
          >
            {paying ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {payStep || 'Processing...'}
              </span>
            ) : (
              `Pay ${requestInfo?.amountDisplay}`
            )}
          </button>
        )}

        <p className="text-xs text-zinc-500 text-center mt-4">
          Payment will be sent via encrypted confidential transfer
        </p>
      </div>
    </div>
  );
}
