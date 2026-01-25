'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction, TransactionInstruction, SystemProgram } from '@solana/web3.js';
import { api, Org, MultisigProposal } from '../../../../lib/api';
import { encryptAmountForInco } from '../../../../lib/crypto';

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

interface MultisigMemberInput {
  wallet: string;
  permissions: 'all' | 'vote' | 'initiate' | 'execute';
}

interface MultisigConfig {
  enabled: boolean;
  configured: boolean;
  multisigPda?: string;
  vaultPda?: string;
  threshold?: number;
  onChainState?: {
    threshold: number;
    transactionIndex: string;
    members: Array<{ key: string; permissions: number }>;
  };
}

interface PreparedMultisig {
  createKey: string;
  multisigPda: string;
  vaultPda: string;
  threshold: number;
  instruction: {
    programId: string;
    keys: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>;
    data: string;
  };
}

export default function TreasuryPage() {
  const { connection } = useConnection();
  const { publicKey, signTransaction, connected } = useWallet();
  const wallet = publicKey?.toBase58();

  const [org, setOrg] = useState<Org | null>(null);
  const [config, setConfig] = useState<MultisigConfig | null>(null);
  const [proposals, setProposals] = useState<MultisigProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showConfigModal, setShowConfigModal] = useState(false);
  const [members, setMembers] = useState<MultisigMemberInput[]>([
    { wallet: '', permissions: 'all' },
  ]);
  const [threshold, setThreshold] = useState(1);
  const [preparedTx, setPreparedTx] = useState<PreparedMultisig | null>(null);
  const [configuring, setConfiguring] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [depositAmount, setDepositAmount] = useState('');
  const [depositing, setDepositing] = useState(false);
  const [treasuryInitialized, setTreasuryInitialized] = useState<boolean | null>(null);
  const [initializingTreasury, setInitializingTreasury] = useState(false);
  const [treasuryPda, setTreasuryPda] = useState<string | null>(null);
  const [orgPda, setOrgPda] = useState<string | null>(null);
  const [orgInitialized, setOrgInitialized] = useState<boolean | null>(null);
  const [checkingTreasury, setCheckingTreasury] = useState(false);

  const checkTreasuryStatus = useCallback(
    async (orgIdHex: string) => {
      try {
        setCheckingTreasury(true);
        const orgId = hexToBytes(orgIdHex);
        const orgAccount = deriveOrgPda(orgId);
        const treasury = deriveTreasuryPda(orgId);
        setOrgPda(orgAccount.toBase58());
        setTreasuryPda(treasury.toBase58());

        const [orgInfo, treasuryInfo] = await Promise.all([
          connection.getAccountInfo(orgAccount),
          connection.getAccountInfo(treasury),
        ]);

        setOrgInitialized(orgInfo !== null);
        setTreasuryInitialized(treasuryInfo !== null);
      } catch (err) {
        console.error('Failed to check treasury status:', err);
        setOrgInitialized(false);
        setTreasuryInitialized(false);
      } finally {
        setCheckingTreasury(false);
      }
    },
    [connection]
  );

  useEffect(() => {
    loadData();
  }, [wallet]);

  const loadData = async () => {
    if (!wallet) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const orgs = await api.orgs.list(wallet);

      if (orgs.length === 0) {
        setOrg(null);
        return;
      }

      const selectedOrg = orgs[0];
      setOrg(selectedOrg);

      const [multisigConfig, proposalList] = await Promise.all([
        api.multisig.get(selectedOrg.id, wallet),
        api.multisig.listProposals(selectedOrg.id, wallet).catch(() => []),
      ]);

      setConfig(multisigConfig);
      setProposals(proposalList);

      if (selectedOrg.orgIdHex) {
        await checkTreasuryStatus(selectedOrg.orgIdHex);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load treasury data');
    } finally {
      setLoading(false);
    }
  };

  const addMember = () => {
    setMembers([...members, { wallet: '', permissions: 'vote' }]);
  };

  const removeMember = (index: number) => {
    if (members.length > 1) {
      setMembers(members.filter((_, i) => i !== index));
    }
  };

  const updateMember = (index: number, field: 'wallet' | 'permissions', value: string) => {
    const updated = [...members];
    if (field === 'permissions') {
      updated[index].permissions = value as MultisigMemberInput['permissions'];
    } else {
      updated[index].wallet = value;
    }
    setMembers(updated);
  };

  const handlePrepare = async () => {
    if (!org || !wallet) return;

    const validMembers = members.filter((m) => m.wallet.trim());
    if (validMembers.length === 0) {
      setError('At least one member is required');
      return;
    }

    if (threshold > validMembers.length) {
      setError('Threshold cannot exceed number of members');
      return;
    }

    try {
      setConfiguring(true);
      setError(null);

      const result = await api.multisig.prepare(
        org.id,
        { members: validMembers, threshold },
        wallet
      );

      setPreparedTx(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to prepare transaction');
    } finally {
      setConfiguring(false);
    }
  };

  const handleSubmit = async () => {
    if (!org || !wallet || !publicKey || !signTransaction || !preparedTx) return;

    try {
      setSubmitting(true);
      setError(null);

      const ix = new TransactionInstruction({
        programId: new PublicKey(preparedTx.instruction.programId),
        keys: preparedTx.instruction.keys.map((k) => ({
          pubkey: new PublicKey(k.pubkey),
          isSigner: k.isSigner,
          isWritable: k.isWritable,
        })),
        data: Buffer.from(preparedTx.instruction.data, 'base64'),
      });

      const transaction = new Transaction().add(ix);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      const signedTx = await signTransaction(transaction);
      const signature = await connection.sendRawTransaction(signedTx.serialize());

      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        'confirmed'
      );

      await api.multisig.confirm(
        org.id,
        {
          multisigPda: preparedTx.multisigPda,
          vaultPda: preparedTx.vaultPda,
          createKey: preparedTx.createKey,
          threshold: preparedTx.threshold,
        },
        wallet
      );

      setShowConfigModal(false);
      setPreparedTx(null);
      setMembers([{ wallet: '', permissions: 'all' }]);
      setThreshold(1);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create multisig');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDisable = async () => {
    if (!org || !wallet) return;
    if (
      !confirm(
        'Are you sure you want to disable multi-sig? This will not delete the on-chain multisig.'
      )
    )
      return;

    try {
      await api.multisig.disable(org.id, wallet);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disable multisig');
    }
  };

  const handleInitOrg = async () => {
    if (!org || !wallet || !publicKey || !signTransaction || !org.orgIdHex) return;

    try {
      setInitializingTreasury(true);
      setError(null);

      const orgId = hexToBytes(org.orgIdHex);
      const orgAccount = deriveOrgPda(orgId);
      const treasury = deriveTreasuryPda(orgId);

      const zkVerifierProgramId = new PublicKey('DgwK4ZudX5Nf48Fqw72j1J7wijojhxomPJe5gtMgkKAT');

      const discriminator = Buffer.from([0x9f, 0xe1, 0x22, 0xaa, 0xbb, 0x22, 0xda, 0x04]);

      const data = Buffer.concat([
        discriminator,
        Buffer.from(orgId),
        treasury.toBuffer(),
        zkVerifierProgramId.toBuffer(),
        INCO_PROGRAM_ID.toBuffer(),
      ]);

      const initOrgIx = new TransactionInstruction({
        programId: ZURPAY_PROGRAM_ID,
        keys: [
          { pubkey: publicKey, isSigner: true, isWritable: true },
          { pubkey: orgAccount, isSigner: false, isWritable: true },
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

      setOrgInitialized(true);
    } catch (err) {
      console.error('Org init error:', err);
      setError(err instanceof Error ? err.message : 'Failed to initialize organization on-chain');
    } finally {
      setInitializingTreasury(false);
    }
  };

  const handleInitTreasury = async () => {
    if (!org || !wallet || !publicKey || !signTransaction || !org.orgIdHex) return;

    try {
      setInitializingTreasury(true);
      setError(null);

      const orgId = hexToBytes(org.orgIdHex);
      const orgPda = deriveOrgPda(orgId);
      const treasury = deriveTreasuryPda(orgId);

      const discriminator = Buffer.from([0x69, 0x98, 0xad, 0x33, 0x9e, 0x97, 0x31, 0x0e]);

      const initTreasuryIx = new TransactionInstruction({
        programId: ZURPAY_PROGRAM_ID,
        keys: [
          { pubkey: publicKey, isSigner: true, isWritable: true },
          { pubkey: orgPda, isSigner: false, isWritable: false },
          { pubkey: treasury, isSigner: false, isWritable: true },
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

      setTreasuryInitialized(true);
    } catch (err) {
      console.error('Treasury init error:', err);
      setError(err instanceof Error ? err.message : 'Failed to initialize treasury');
    } finally {
      setInitializingTreasury(false);
    }
  };

  const handleDeposit = async () => {
    if (!org || !wallet || !publicKey || !signTransaction || !org.orgIdHex || !depositAmount)
      return;

    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    try {
      setDepositing(true);
      setError(null);

      const amountLamports = BigInt(Math.floor(amount * 1e9));
      const encryptedAmount = await encryptAmountForInco(amountLamports);

      const orgId = hexToBytes(org.orgIdHex);
      const orgPda = deriveOrgPda(orgId);
      const treasury = deriveTreasuryPda(orgId);

      const discriminator = Buffer.from([0x02, 0x81, 0x48, 0xd6, 0x32, 0x5e, 0x97, 0xe6]);

      const encodeU32LE = (value: number): Buffer => {
        const buf = Buffer.alloc(4);
        buf.writeUInt32LE(value, 0);
        return buf;
      };

      const data = Buffer.concat([
        discriminator,
        encodeU32LE(encryptedAmount.length),
        Buffer.from(encryptedAmount),
      ]);

      const depositIx = new TransactionInstruction({
        programId: ZURPAY_PROGRAM_ID,
        keys: [
          { pubkey: publicKey, isSigner: true, isWritable: true },
          { pubkey: orgPda, isSigner: false, isWritable: false },
          { pubkey: treasury, isSigner: false, isWritable: true },
          { pubkey: INCO_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data,
      });

      const transaction = new Transaction().add(depositIx);
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

      setDepositAmount('');
      alert(`Deposit successful! TX: ${signature}`);
    } catch (err) {
      console.error('Deposit error:', err);
      setError(err instanceof Error ? err.message : 'Failed to deposit to treasury');
    } finally {
      setDepositing(false);
    }
  };

  const formatPermissions = (mask: number): string => {
    const perms: string[] = [];
    if (mask & 1) perms.push('Initiate');
    if (mask & 2) perms.push('Vote');
    if (mask & 4) perms.push('Execute');
    return perms.length > 0 ? perms.join(', ') : 'None';
  };

  if (!wallet) {
    return (
      <div className="text-center py-16">
        <p className="text-zinc-400">Please connect your wallet to view treasury settings.</p>
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

  if (!org) {
    return (
      <div className="text-center py-16">
        <p className="text-zinc-400 mb-4">No organization found.</p>
        <a href="/dashboard/settings" className="btn-primary">
          Initialize Organization
        </a>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Treasury</h2>
        <p className="text-zinc-400 text-sm">
          Configure multi-signature treasury for secure fund management
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-300 mb-6">
          {error}
        </div>
      )}

      <div className="grid gap-6">
        {/* Inco Treasury Section */}
        <div className="glass-card rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4">Confidential Treasury (Inco FHE)</h3>

          {checkingTreasury ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <span className="ml-3 text-zinc-400">Checking on-chain status...</span>
            </div>
          ) : orgInitialized === null ? (
            <div className="text-center py-8">
              <p className="text-zinc-400">Unable to check on-chain status</p>
            </div>
          ) : !orgInitialized ? (
            <div className="text-center py-8">
              <div className="text-5xl mb-4">🔗</div>
              <h4 className="text-lg font-medium mb-2">Organization Not On-Chain</h4>
              <p className="text-zinc-400 text-sm mb-4">
                Initialize your organization on Solana before setting up the treasury
              </p>
              {orgPda && (
                <div className="p-3 bg-zinc-800 rounded-lg mb-4 text-left">
                  <div className="text-xs text-zinc-500 mb-1">Organization PDA</div>
                  <div className="font-mono text-xs text-zinc-300 break-all">{orgPda}</div>
                </div>
              )}
              <button
                onClick={handleInitOrg}
                disabled={initializingTreasury || !connected}
                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-700 rounded-lg transition-colors"
              >
                {initializingTreasury ? 'Initializing...' : 'Initialize Organization On-Chain'}
              </button>
            </div>
          ) : !treasuryInitialized ? (
            <div className="text-center py-8">
              <div className="text-5xl mb-4">🔒</div>
              <h4 className="text-lg font-medium mb-2">Treasury Not Initialized</h4>
              <p className="text-zinc-400 text-sm mb-4">
                Initialize your encrypted treasury to enable confidential payments
              </p>
              {treasuryPda && (
                <div className="p-3 bg-zinc-800 rounded-lg mb-4 text-left">
                  <div className="text-xs text-zinc-500 mb-1">Treasury PDA</div>
                  <div className="font-mono text-xs text-zinc-300 break-all">{treasuryPda}</div>
                </div>
              )}
              <button
                onClick={handleInitTreasury}
                disabled={initializingTreasury || !connected}
                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-700 rounded-lg transition-colors"
              >
                {initializingTreasury ? 'Initializing...' : 'Initialize Treasury'}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                <span className="text-emerald-400 font-medium">Initialized</span>
              </div>

              <div className="p-3 bg-zinc-800 rounded-lg">
                <div className="text-xs text-zinc-500 mb-1">Treasury PDA</div>
                <div className="font-mono text-xs text-zinc-300 break-all">{treasuryPda}</div>
              </div>

              <div className="border-t border-zinc-700 pt-4 mt-4">
                <h4 className="text-sm font-medium text-zinc-300 mb-3">Deposit Funds</h4>
                <p className="text-xs text-zinc-500 mb-3">
                  Deposit funds to your encrypted treasury. Amounts are encrypted using Inco FHE.
                </p>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <div className="relative">
                      <input
                        type="number"
                        value={depositAmount}
                        onChange={(e) => setDepositAmount(e.target.value)}
                        placeholder="0.00"
                        min="0"
                        step="0.01"
                        className="w-full px-4 py-2 pr-16 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-emerald-500 text-white"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">
                        SOL
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={handleDeposit}
                    disabled={depositing || !depositAmount || !connected}
                    className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-700 rounded-lg transition-colors whitespace-nowrap"
                  >
                    {depositing ? 'Depositing...' : 'Deposit'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Multi-Sig Section */}
        <div className="glass-card rounded-xl p-6">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-lg font-semibold">Multi-Sig Configuration</h3>
            {config?.enabled ? (
              <button onClick={handleDisable} className="text-sm text-red-400 hover:text-red-300">
                Disable Multi-Sig
              </button>
            ) : (
              <button
                onClick={() => setShowConfigModal(true)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-sm transition-colors"
              >
                Enable Multi-Sig
              </button>
            )}
          </div>

          {config?.enabled && config.configured ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-zinc-400">Status</div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                    <span className="font-medium text-emerald-400">Enabled</span>
                  </div>
                </div>
                <div>
                  <div className="text-sm text-zinc-400">Threshold</div>
                  <div className="font-medium">
                    {config.onChainState?.threshold || config.threshold} of{' '}
                    {config.onChainState?.members.length || 0} signers
                  </div>
                </div>
              </div>

              <div>
                <div className="text-sm text-zinc-400 mb-1">Multisig PDA</div>
                <div className="font-mono text-sm break-all text-zinc-300">
                  {config.multisigPda}
                </div>
              </div>

              <div>
                <div className="text-sm text-zinc-400 mb-1">Vault PDA (Treasury)</div>
                <div className="font-mono text-sm break-all text-zinc-300">{config.vaultPda}</div>
              </div>

              {config.onChainState?.members && (
                <div>
                  <div className="text-sm text-zinc-400 mb-2">Members</div>
                  <div className="space-y-2">
                    {config.onChainState.members.map((member, i) => (
                      <div
                        key={i}
                        className="flex justify-between items-center p-3 bg-zinc-800 rounded-lg"
                      >
                        <span className="font-mono text-sm">
                          {member.key.slice(0, 8)}...{member.key.slice(-8)}
                        </span>
                        <span className="text-xs text-zinc-400">
                          {formatPermissions(member.permissions)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="text-5xl mb-4">🔐</div>
              <h4 className="text-lg font-medium mb-2">Multi-Sig Not Configured</h4>
              <p className="text-zinc-400 text-sm mb-4">
                Secure your treasury with multi-signature approval using Squads Protocol
              </p>
              <button
                onClick={() => setShowConfigModal(true)}
                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
              >
                Configure Multi-Sig
              </button>
            </div>
          )}
        </div>

        {config?.enabled && proposals.length > 0 && (
          <div className="glass-card rounded-xl p-6">
            <h3 className="text-lg font-semibold mb-4">Pending Proposals</h3>
            <div className="space-y-3">
              {proposals.map((proposal) => (
                <div
                  key={proposal.id}
                  className="flex justify-between items-center p-4 bg-zinc-800 rounded-lg"
                >
                  <div>
                    <div className="font-medium">{proposal.title}</div>
                    <div className="text-sm text-zinc-400">
                      {proposal.approvals.length} approvals
                    </div>
                  </div>
                  <span
                    className={`px-2 py-1 text-xs rounded-full ${
                      proposal.status === 'PENDING'
                        ? 'bg-yellow-900/50 text-yellow-300'
                        : proposal.status === 'APPROVED'
                          ? 'bg-emerald-900/50 text-emerald-300'
                          : proposal.status === 'EXECUTED'
                            ? 'bg-blue-900/50 text-blue-300'
                            : 'bg-zinc-700 text-zinc-400'
                    }`}
                  >
                    {proposal.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showConfigModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-zinc-900 rounded-xl p-6 w-full max-w-lg border border-zinc-800 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-semibold mb-4">Configure Multi-Sig Treasury</h3>

            {!preparedTx ? (
              <>
                <div className="space-y-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-2">Signers</label>
                    {members.map((member, index) => (
                      <div key={index} className="flex gap-2 mb-2">
                        <input
                          type="text"
                          value={member.wallet}
                          onChange={(e) => updateMember(index, 'wallet', e.target.value)}
                          placeholder="Wallet address"
                          className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-emerald-500 font-mono text-sm"
                        />
                        <select
                          value={member.permissions}
                          onChange={(e) => updateMember(index, 'permissions', e.target.value)}
                          className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-emerald-500 text-sm"
                        >
                          <option value="all">All</option>
                          <option value="vote">Vote</option>
                          <option value="initiate">Initiate</option>
                          <option value="execute">Execute</option>
                        </select>
                        {members.length > 1 && (
                          <button
                            onClick={() => removeMember(index)}
                            className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-sm"
                          >
                            X
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      onClick={addMember}
                      className="text-sm text-emerald-400 hover:text-emerald-300"
                    >
                      + Add Signer
                    </button>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-2">
                      Approval Threshold
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={members.length}
                      value={threshold}
                      onChange={(e) => setThreshold(parseInt(e.target.value) || 1)}
                      className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-emerald-500"
                    />
                    <p className="text-xs text-zinc-500 mt-1">
                      Number of approvals required to execute transactions
                    </p>
                  </div>
                </div>

                {error && (
                  <div className="p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm mb-4">
                    {error}
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowConfigModal(false);
                      setError(null);
                    }}
                    className="flex-1 px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handlePrepare}
                    disabled={configuring || !connected}
                    className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-700 rounded-lg transition-colors"
                  >
                    {configuring ? 'Preparing...' : 'Prepare Transaction'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-4 mb-6">
                  <div className="p-4 bg-zinc-800 rounded-lg">
                    <div className="text-sm text-zinc-400 mb-1">Multisig PDA</div>
                    <div className="font-mono text-xs break-all">{preparedTx.multisigPda}</div>
                  </div>

                  <div className="p-4 bg-zinc-800 rounded-lg">
                    <div className="text-sm text-zinc-400 mb-1">Vault PDA</div>
                    <div className="font-mono text-xs break-all">{preparedTx.vaultPda}</div>
                  </div>

                  <div className="p-4 bg-emerald-900/30 border border-emerald-700 rounded-lg">
                    <div className="text-sm text-emerald-300">
                      Ready to create {preparedTx.threshold}-of-
                      {members.filter((m) => m.wallet).length} multisig
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm mb-4">
                    {error}
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setPreparedTx(null);
                      setError(null);
                    }}
                    className="flex-1 px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={submitting || !connected}
                    className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-700 rounded-lg transition-colors"
                  >
                    {submitting ? 'Creating...' : 'Sign & Create Multisig'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
