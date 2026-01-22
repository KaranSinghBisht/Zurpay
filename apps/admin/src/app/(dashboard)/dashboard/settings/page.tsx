'use client';

import { useState, useEffect } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction, TransactionInstruction, SystemProgram } from '@solana/web3.js';
import {
  generateOrgId,
  bytesToHex,
  hexToBytes,
  deriveOrgPda,
  ZURPAY_PROGRAM_ID,
  DEFAULT_INCO_PROGRAM_ID,
  DEFAULT_ZK_VERIFIER_PROGRAM_ID,
} from '@zurpay/sdk';
import { api, Org } from '../../../../lib/api';

export default function SettingsPage() {
  const { connection } = useConnection();
  const { publicKey, signTransaction, connected } = useWallet();
  const wallet = publicKey?.toBase58();

  const [existingOrg, setExistingOrg] = useState<Org | null>(null);
  const [loading, setLoading] = useState(true);

  const [orgName, setOrgName] = useState<string>('');
  const [orgIdHex, setOrgIdHex] = useState<string>('');
  const [treasuryConfAccount, setTreasuryConfAccount] = useState<string>('');
  const [zkVerifierProgramId, setZkVerifierProgramId] = useState<string>(
    DEFAULT_ZK_VERIFIER_PROGRAM_ID.toBase58()
  );
  const [incoProgramId, setIncoProgramId] = useState<string>(
    DEFAULT_INCO_PROGRAM_ID.toBase58()
  );

  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [txSignature, setTxSignature] = useState<string>('');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    loadExistingOrg();
  }, [wallet]);

  const loadExistingOrg = async () => {
    if (!wallet) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const orgs = await api.orgs.list(wallet);
      if (orgs.length > 0) {
        setExistingOrg(orgs[0]);
      }
    } catch (err) {
      console.error('Failed to load org:', err);
    } finally {
      setLoading(false);
    }
  };

  const generateNewOrgId = () => {
    const newOrgId = generateOrgId();
    setOrgIdHex(bytesToHex(newOrgId));
  };

  const handleInitOrg = async () => {
    if (!publicKey || !signTransaction || !connected || !wallet) {
      setError('Please connect your wallet first');
      return;
    }

    if (!orgName || !orgIdHex || !treasuryConfAccount || !zkVerifierProgramId || !incoProgramId) {
      setError('Please fill in all required fields');
      return;
    }

    try {
      setStatus('submitting');
      setError('');

      const orgId = hexToBytes(orgIdHex);
      const treasuryPubkey = new PublicKey(treasuryConfAccount);
      const zkVerifierPubkey = new PublicKey(zkVerifierProgramId);
      const incoPubkey = new PublicKey(incoProgramId);

      const orgPda = deriveOrgPda(orgId);

      const discriminator = Buffer.from([168, 49, 22, 248, 228, 56, 111, 24]);

      const data = Buffer.concat([
        discriminator,
        Buffer.from(orgId),
        treasuryPubkey.toBuffer(),
        zkVerifierPubkey.toBuffer(),
        incoPubkey.toBuffer(),
      ]);

      const instruction = new TransactionInstruction({
        programId: ZURPAY_PROGRAM_ID,
        keys: [
          { pubkey: publicKey, isSigner: true, isWritable: true },
          { pubkey: orgPda, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data,
      });

      const transaction = new Transaction().add(instruction);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      const signedTx = await signTransaction(transaction);
      const signature = await connection.sendRawTransaction(signedTx.serialize());

      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        'confirmed'
      );

      setTxSignature(signature);

      await api.orgs.create(
        {
          orgIdHex,
          name: orgName,
          treasuryConfAccount,
          zkVerifierProgramId,
          incoProgramId,
        },
        wallet
      );

      setStatus('success');
      await loadExistingOrg();
    } catch (err) {
      console.error('Init org error:', err);
      setError(err instanceof Error ? err.message : 'Failed to initialize organization');
      setStatus('error');
    }
  };

  if (!wallet) {
    return (
      <div className="text-center py-16">
        <p className="text-zinc-400">Please connect your wallet to view settings.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (existingOrg) {
    return (
      <div>
        <h2 className="text-2xl font-bold mb-6">Settings</h2>

        <div className="glass-card rounded-xl p-6 max-w-2xl mb-6">
          <h3 className="text-lg font-semibold mb-4">Organization</h3>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-zinc-400">Name</div>
                <div className="font-medium">{existingOrg.name}</div>
              </div>
              <div>
                <div className="text-sm text-zinc-400">Role</div>
                <div className="font-medium">{existingOrg.role || 'OWNER'}</div>
              </div>
            </div>

            <div>
              <div className="text-sm text-zinc-400">Organization ID</div>
              <div className="font-mono text-sm break-all">{existingOrg.orgIdHex}</div>
            </div>

            <div>
              <div className="text-sm text-zinc-400">Treasury Account</div>
              <div className="font-mono text-sm break-all">{existingOrg.treasuryConfAccount}</div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-zinc-400">Workers</div>
                <div className="font-medium">{existingOrg._count?.workers || 0}</div>
              </div>
              <div>
                <div className="text-sm text-zinc-400">Payruns</div>
                <div className="font-medium">{existingOrg._count?.payruns || 0}</div>
              </div>
            </div>

            <div>
              <div className="text-sm text-zinc-400">Created</div>
              <div className="font-medium">{new Date(existingOrg.createdAt).toLocaleString()}</div>
            </div>
          </div>
        </div>

        <div className="glass-card rounded-xl p-6 max-w-2xl">
          <h3 className="text-lg font-semibold mb-4">Program Configuration</h3>
          <div className="space-y-4">
            <div>
              <div className="text-sm text-zinc-400">ZK Verifier Program</div>
              <div className="font-mono text-sm break-all">{existingOrg.zkVerifierProgramId}</div>
            </div>
            <div>
              <div className="text-sm text-zinc-400">Inco Program</div>
              <div className="font-mono text-sm break-all">{existingOrg.incoProgramId}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Settings</h2>
      <div className="glass-card rounded-xl p-6 max-w-2xl">
        <h3 className="text-lg font-semibold mb-4">Initialize Organization</h3>
        <p className="text-sm text-zinc-500 mb-6">
          Set up your organization on-chain. This creates the org PDA and configures the treasury,
          ZK verifier, and Inco program addresses.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">
              Organization Name *
            </label>
            <input
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="My Company"
              className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">Organization ID</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={orgIdHex}
                onChange={(e) => setOrgIdHex(e.target.value)}
                placeholder="64 hex characters"
                className="flex-1 px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-emerald-500 font-mono text-sm"
              />
              <button
                onClick={generateNewOrgId}
                className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg transition-colors text-sm"
              >
                Generate
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">
              Treasury Confidential Account *
            </label>
            <input
              type="text"
              value={treasuryConfAccount}
              onChange={(e) => setTreasuryConfAccount(e.target.value)}
              placeholder="Base58 public key"
              className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-emerald-500 font-mono text-sm"
            />
            <p className="mt-1 text-xs text-zinc-500">
              The confidential account that holds the funding for claims
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">
              ZK Verifier Program ID
            </label>
            <input
              type="text"
              value={zkVerifierProgramId}
              onChange={(e) => setZkVerifierProgramId(e.target.value)}
              placeholder="Base58 program ID"
              className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-emerald-500 font-mono text-sm"
            />
            <p className="mt-1 text-xs text-zinc-500">
              Sunspot Groth16 verifier program for ZK proofs
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">Inco Program ID</label>
            <input
              type="text"
              value={incoProgramId}
              onChange={(e) => setIncoProgramId(e.target.value)}
              placeholder="Base58 program ID"
              className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-emerald-500 font-mono text-sm"
            />
            <p className="mt-1 text-xs text-zinc-500">
              Inco Lightning program for confidential transfers
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm">
              {error}
            </div>
          )}

          {status === 'success' && txSignature && (
            <div className="p-3 bg-emerald-900/50 border border-emerald-700 rounded-lg">
              <p className="text-emerald-300 text-sm font-medium">
                Organization initialized successfully!
              </p>
              <a
                href={`https://explorer.solana.com/tx/${txSignature}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-400 text-xs hover:underline font-mono break-all"
              >
                {txSignature}
              </a>
            </div>
          )}

          <button
            onClick={handleInitOrg}
            disabled={!connected || status === 'submitting'}
            className="w-full px-4 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-700 disabled:cursor-not-allowed rounded-lg transition-colors font-medium"
          >
            {!connected && 'Connect Wallet First'}
            {connected && status === 'idle' && 'Initialize Organization'}
            {connected && status === 'submitting' && 'Submitting...'}
            {connected && status === 'success' && 'Organization Initialized'}
            {connected && status === 'error' && 'Try Again'}
          </button>
        </div>
      </div>
    </div>
  );
}
