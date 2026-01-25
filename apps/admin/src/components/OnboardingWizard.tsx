'use client';

import { useState, useEffect } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { PublicKey, Transaction, TransactionInstruction, SystemProgram } from '@solana/web3.js';

type OnboardingStep =
  | 'welcome'
  | 'auth'
  | 'org-choice'
  | 'create-org'
  | 'init-org-onchain'
  | 'init-treasury'
  | 'add-worker'
  | 'complete';

interface OnboardingState {
  orgId: string | null;
  orgIdHex: string | null;
  orgName: string;
  treasuryAccount: string;
  workerEmail: string;
  workerName: string;
}

const ZURPAY_PROGRAM_ID = new PublicKey('Cf9tReQuvS6cb4awYPCVozQnCWYdqia62yRShJs2URy9');
const INCO_PROGRAM_ID = new PublicKey('5sjEbPiqgZrYwR31ahR6Uk9wf5awoX61YGg7jExQSwaj');

function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function deriveOrgPda(orgId: Uint8Array): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync([Buffer.from('org'), orgId], ZURPAY_PROGRAM_ID);
  return pda;
}

function deriveTreasuryPda(orgId: Uint8Array): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('treasury'), orgId],
    ZURPAY_PROGRAM_ID
  );
  return pda;
}

export function OnboardingWizard() {
  const { connection } = useConnection();
  const { publicKey, connected, signTransaction } = useWallet();
  const { isAuthenticated, signIn, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const wallet = publicKey?.toBase58();

  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [state, setState] = useState<OnboardingState>({
    orgId: null,
    orgIdHex: null,
    orgName: '',
    treasuryAccount: '',
    workerEmail: '',
    workerName: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-advance from welcome to auth when wallet connects
  useEffect(() => {
    if (connected && step === 'welcome') {
      setStep('auth');
    }
  }, [connected, step]);

  // Auto-advance from auth when authenticated
  useEffect(() => {
    if (isAuthenticated && step === 'auth') {
      setStep('org-choice');
    }
  }, [isAuthenticated, step]);

  const handleSignIn = async () => {
    try {
      setError(null);
      await signIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign in');
    }
  };

  const handleCreateOrg = async () => {
    if (!wallet || !state.orgName) return;

    // Check if still authenticated - if not, go back to auth step
    if (!isAuthenticated) {
      setError('Session expired. Please sign in again.');
      setStep('auth');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Generate random org ID hex (32 bytes = 64 hex chars)
      const orgIdHex = Array.from({ length: 64 }, () =>
        Math.floor(Math.random() * 16).toString(16)
      ).join('');

      const zkVerifierProgramId = 'DgwK4ZudX5Nf48Fqw72j1J7wijojhxomPJe5gtMgkKAT';
      const incoProgramId = '5sjEbPiqgZrYwR31ahR6Uk9wf5awoX61YGg7jExQSwaj';

      const treasuryPda = deriveTreasuryPda(hexToBytes(orgIdHex));

      const org = await api.orgs.create(
        {
          orgIdHex,
          name: state.orgName,
          treasuryConfAccount: treasuryPda.toBase58(),
          zkVerifierProgramId,
          incoProgramId,
        },
        wallet
      );

      setState((prev) => ({ ...prev, orgId: org.id, orgIdHex }));
      setStep('init-org-onchain');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create organization');
    } finally {
      setLoading(false);
    }
  };

  const handleInitOrgOnchain = async () => {
    if (!wallet || !publicKey || !signTransaction || !state.orgIdHex) return;

    try {
      setLoading(true);
      setError(null);

      const orgId = hexToBytes(state.orgIdHex);
      const orgPda = deriveOrgPda(orgId);
      const treasuryPda = deriveTreasuryPda(orgId);

      const zkVerifierProgramId = new PublicKey('DgwK4ZudX5Nf48Fqw72j1J7wijojhxomPJe5gtMgkKAT');
      const incoProgramId = INCO_PROGRAM_ID;

      const discriminator = Buffer.from([0x9f, 0xe1, 0x22, 0xaa, 0xbb, 0x22, 0xda, 0x04]);

      const data = Buffer.concat([
        discriminator,
        Buffer.from(orgId),
        treasuryPda.toBuffer(),
        zkVerifierProgramId.toBuffer(),
        incoProgramId.toBuffer(),
      ]);

      const initOrgIx = new TransactionInstruction({
        programId: ZURPAY_PROGRAM_ID,
        keys: [
          { pubkey: publicKey, isSigner: true, isWritable: true },
          { pubkey: orgPda, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data,
      });

      const transaction = new Transaction().add(initOrgIx);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      const signedTx = await signTransaction(transaction);
      const signature = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });

      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        'confirmed'
      );

      setStep('init-treasury');
    } catch (err) {
      console.error('Init org on-chain error:', err);
      setError(err instanceof Error ? err.message : 'Failed to initialize organization on-chain');
    } finally {
      setLoading(false);
    }
  };

  const handleInitTreasury = async () => {
    if (!wallet || !publicKey || !signTransaction || !state.orgIdHex) return;

    try {
      setLoading(true);
      setError(null);

      const orgId = hexToBytes(state.orgIdHex);
      const orgPda = deriveOrgPda(orgId);
      const treasuryPda = deriveTreasuryPda(orgId);

      const discriminator = Buffer.from([0x69, 0x98, 0xad, 0x33, 0x9e, 0x97, 0x31, 0x0e]);

      const initTreasuryIx = new TransactionInstruction({
        programId: ZURPAY_PROGRAM_ID,
        keys: [
          { pubkey: publicKey, isSigner: true, isWritable: true },
          { pubkey: orgPda, isSigner: false, isWritable: false },
          { pubkey: treasuryPda, isSigner: false, isWritable: true },
          { pubkey: INCO_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: discriminator,
      });

      const transaction = new Transaction().add(initTreasuryIx);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      const signedTx = await signTransaction(transaction);
      const signature = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });

      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        'confirmed'
      );

      setStep('add-worker');
    } catch (err) {
      console.error('Treasury init error:', err);
      setError(err instanceof Error ? err.message : 'Failed to initialize treasury');
    } finally {
      setLoading(false);
    }
  };

  const handleInviteWorker = async () => {
    if (!wallet || !state.orgId || !state.workerEmail) return;

    try {
      setLoading(true);
      setError(null);

      await api.workers.invite(
        state.orgId,
        {
          email: state.workerEmail,
          displayName: state.workerName || undefined,
        },
        wallet
      );

      setStep('complete');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to invite worker');
    } finally {
      setLoading(false);
    }
  };

  const handleFinish = () => {
    router.push('/dashboard');
  };

  const stepIndicators = [
    { key: 'welcome', label: 'Welcome' },
    { key: 'auth', label: 'Sign In' },
    { key: 'org-choice', label: 'Organization' },
    { key: 'create-org', label: 'Setup' },
    { key: 'init-org-onchain', label: 'On-Chain' },
    { key: 'init-treasury', label: 'Treasury' },
    { key: 'add-worker', label: 'Team' },
    { key: 'complete', label: 'Done' },
  ];

  const currentStepIndex = stepIndicators.findIndex((s) => s.key === step);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-8">
      <div className="w-full max-w-2xl">
        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex justify-between mb-2">
            {stepIndicators.map((s, i) => (
              <div
                key={s.key}
                className={`text-xs font-medium transition-colors ${
                  i <= currentStepIndex ? 'text-emerald-400' : 'text-slate-600'
                }`}
              >
                {s.label}
              </div>
            ))}
          </div>
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 transition-all duration-500"
              style={{ width: `${((currentStepIndex + 1) / stepIndicators.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Card Container */}
        <div className="bg-slate-900/50 backdrop-blur-xl rounded-3xl border border-slate-700/50 p-8 shadow-2xl">
          {/* Error Display */}
          {error && (
            <div className="mb-6 p-4 bg-red-900/30 border border-red-500/50 rounded-xl text-red-300 text-sm">
              {error}
            </div>
          )}

          {/* Step: Welcome */}
          {step === 'welcome' && (
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
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
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
              </div>
              <h1 className="text-3xl font-bold text-white mb-4">Welcome to Zurpay</h1>
              <p className="text-slate-400 mb-8 max-w-md mx-auto">
                Private payroll powered by zero-knowledge proofs. Your employees receive payments
                without revealing their salaries to anyone.
              </p>
              <div className="flex justify-center">
                <WalletMultiButton className="!bg-gradient-to-r !from-emerald-500 !to-cyan-500 !rounded-xl !px-8 !py-4 !font-semibold !text-lg hover:!opacity-90 !transition-opacity" />
              </div>
            </div>
          )}

          {/* Step: Auth */}
          {step === 'auth' && (
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
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
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
              </div>
              <h1 className="text-3xl font-bold text-white mb-4">Verify Your Wallet</h1>
              <p className="text-slate-400 mb-8">
                Sign a message to prove you own this wallet. This doesn&apos;t cost any gas.
              </p>
              <button
                onClick={handleSignIn}
                disabled={authLoading}
                className="bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-semibold px-8 py-4 rounded-xl text-lg hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-3 mx-auto"
              >
                {authLoading ? (
                  <>
                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Waiting for signature...
                  </>
                ) : (
                  <>Sign In with Wallet</>
                )}
              </button>
            </div>
          )}

          {/* Step: Org Choice */}
          {step === 'org-choice' && (
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-6 rounded-lg bg-slate-800 flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-slate-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <h1 className="text-3xl font-bold text-white mb-4">Get Started</h1>
              <p className="text-slate-400 mb-8">
                Are you creating a new organization or joining an existing one?
              </p>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setStep('create-org')}
                  className="p-6 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 hover:border-emerald-500/50 rounded-2xl transition-all group"
                >
                  <div className="w-10 h-10 mx-auto mb-3 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                    <svg
                      className="w-6 h-6 text-emerald-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <div className="font-semibold text-white group-hover:text-emerald-400 transition-colors">
                    Create Organization
                  </div>
                  <div className="text-sm text-slate-500 mt-1">Set up payroll for your team</div>
                </button>
                <button
                  onClick={() => router.push('/dashboard')}
                  className="p-6 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 hover:border-cyan-500/50 rounded-2xl transition-all group"
                >
                  <div className="text-4xl mb-3">👥</div>
                  <div className="font-semibold text-white group-hover:text-cyan-400 transition-colors">
                    Join Organization
                  </div>
                  <div className="text-sm text-slate-500 mt-1">Someone invited you</div>
                </button>
              </div>
            </div>
          )}

          {/* Step: Create Org */}
          {step === 'create-org' && (
            <div>
              <button
                onClick={() => setStep('org-choice')}
                className="text-slate-400 hover:text-white mb-4 text-sm flex items-center gap-1"
              >
                ← Back
              </button>
              <h1 className="text-3xl font-bold text-white mb-2">Create Your Organization</h1>
              <p className="text-slate-400 mb-8">Set up your company for private payroll</p>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Organization Name *
                  </label>
                  <input
                    type="text"
                    value={state.orgName}
                    onChange={(e) => setState((prev) => ({ ...prev, orgName: e.target.value }))}
                    placeholder="Acme Corp"
                    className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none transition-colors"
                  />
                </div>

                <button
                  onClick={handleCreateOrg}
                  disabled={loading || !state.orgName}
                  className="w-full bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-semibold px-8 py-4 rounded-xl text-lg hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-3"
                >
                  {loading ? (
                    <>
                      <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create Organization →'
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Step: Init Org On-Chain */}
          {step === 'init-org-onchain' && (
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-6 rounded-lg bg-slate-800 flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-slate-400"
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
              <h1 className="text-3xl font-bold text-white mb-4">Initialize On-Chain</h1>
              <p className="text-slate-400 mb-8">
                Create your organization account on Solana. This registers your org with the Zurpay
                program.
              </p>
              <div className="p-4 bg-slate-800/50 border border-slate-700 rounded-xl mb-8 text-left">
                <div className="text-sm text-slate-400 mb-1">Organization PDA</div>
                <div className="font-mono text-sm text-emerald-400 break-all">
                  {state.orgIdHex ? deriveOrgPda(hexToBytes(state.orgIdHex)).toBase58() : '...'}
                </div>
              </div>
              <button
                onClick={handleInitOrgOnchain}
                disabled={loading || !connected}
                className="bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-semibold px-8 py-4 rounded-xl text-lg hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-3 mx-auto"
              >
                {loading ? (
                  <>
                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Creating On-Chain...
                  </>
                ) : (
                  'Create Organization On-Chain'
                )}
              </button>
              <p className="text-xs text-slate-500 mt-4">
                This will require signing a transaction with your wallet
              </p>
            </div>
          )}

          {/* Step: Init Treasury */}
          {step === 'init-treasury' && (
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
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
              <h1 className="text-3xl font-bold text-white mb-4">Initialize Treasury</h1>
              <p className="text-slate-400 mb-8">
                Your organization needs a confidential treasury account on-chain. This creates an
                encrypted balance that will fund your payroll.
              </p>
              <div className="p-4 bg-slate-800/50 border border-slate-700 rounded-xl mb-8 text-left">
                <div className="text-sm text-slate-400 mb-1">Treasury Address</div>
                <div className="font-mono text-sm text-emerald-400 break-all">
                  {state.orgIdHex
                    ? deriveTreasuryPda(hexToBytes(state.orgIdHex)).toBase58()
                    : '...'}
                </div>
              </div>
              <button
                onClick={handleInitTreasury}
                disabled={loading || !connected}
                className="bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-semibold px-8 py-4 rounded-xl text-lg hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-3 mx-auto"
              >
                {loading ? (
                  <>
                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Initializing...
                  </>
                ) : (
                  'Initialize Treasury On-Chain'
                )}
              </button>
              <p className="text-xs text-slate-500 mt-4">
                This will require signing a transaction with your wallet
              </p>
            </div>
          )}

          {/* Step: Invite Worker */}
          {step === 'add-worker' && (
            <div>
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
                      d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <h1 className="text-3xl font-bold text-white mb-2">Treasury Initialized!</h1>
                <p className="text-slate-400">Invite your first team member by email</p>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Employee Email *
                  </label>
                  <input
                    type="email"
                    value={state.workerEmail}
                    onChange={(e) => setState((prev) => ({ ...prev, workerEmail: e.target.value }))}
                    placeholder="employee@company.com"
                    className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none transition-colors"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    They&apos;ll receive an invite email to join your organization
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Display Name (optional)
                  </label>
                  <input
                    type="text"
                    value={state.workerName}
                    onChange={(e) => setState((prev) => ({ ...prev, workerName: e.target.value }))}
                    placeholder="John Doe"
                    className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none transition-colors"
                  />
                </div>

                <div className="flex gap-4">
                  <button
                    onClick={handleFinish}
                    className="flex-1 px-6 py-4 border border-slate-700 text-slate-300 hover:text-white hover:border-slate-600 rounded-xl transition-colors"
                  >
                    Skip for now
                  </button>
                  <button
                    onClick={handleInviteWorker}
                    disabled={loading || !state.workerEmail}
                    className="flex-1 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-semibold px-6 py-4 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Sending Invite...
                      </>
                    ) : (
                      'Send Invite →'
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step: Complete */}
          {step === 'complete' && (
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
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
              <h1 className="text-3xl font-bold text-white mb-4">You&apos;re All Set!</h1>
              <p className="text-slate-400 mb-8">
                Your organization is ready. You can now create payrolls and send private payments to
                your team.
              </p>
              <button
                onClick={handleFinish}
                className="bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-semibold px-8 py-4 rounded-xl text-lg hover:opacity-90 transition-opacity"
              >
                Go to Dashboard →
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-slate-500 text-sm">
          Powered by Inco Confidential Computing & Noir ZK Proofs
        </div>
      </div>
    </div>
  );
}

export default OnboardingWizard;
