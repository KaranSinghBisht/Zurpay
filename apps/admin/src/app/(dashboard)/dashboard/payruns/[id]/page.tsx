'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';
import { deriveOrgPda, derivePayrunPda, hexToBytes, ZURPAY_PROGRAM_ID } from '@zurpay/sdk';
import {
  api,
  Org,
  Payrun,
  Payslip,
  ApprovalRequest,
  MultisigProposal,
} from '../../../../../lib/api';
import { env } from '../../../../../lib/env';

function formatAmount(amount: string): string {
  const num = BigInt(amount);
  const usd = Number(num) / 1_000_000;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(usd);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    DRAFT: 'bg-zinc-700 text-zinc-300',
    PENDING_APPROVAL: 'bg-amber-900/50 text-amber-300',
    READY: 'bg-blue-900/50 text-blue-300',
    FUNDING_REQUIRED: 'bg-orange-900/50 text-orange-300',
    EXECUTING: 'bg-yellow-900/50 text-yellow-300',
    ACTIVE_CLAIMS: 'bg-emerald-900/50 text-emerald-300',
    COMPLETED: 'bg-emerald-900/50 text-emerald-300',
    FAILED: 'bg-red-900/50 text-red-300',
    CLOSED: 'bg-zinc-700 text-zinc-400',
    PENDING: 'bg-zinc-700 text-zinc-300',
    PROCESSING: 'bg-yellow-900/50 text-yellow-300',
    PAID: 'bg-emerald-900/50 text-emerald-300',
    CLAIMED: 'bg-emerald-900/50 text-emerald-300',
    CANCELLED: 'bg-zinc-700 text-zinc-400',
  };
  return colors[status] || 'bg-zinc-700 text-zinc-300';
}

function getStatusLabel(status: string): string {
  return status.replace(/_/g, ' ');
}

type ClaimLink = {
  token: string;
  urlPath: string;
  claimerConfAccount: string;
};

const CLAIM_LINKS_STORAGE_KEY = 'zurpay_claim_links_';

export default function PayrunDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const wallet = publicKey?.toBase58();

  const payrunId = params.id as string;

  const [org, setOrg] = useState<Org | null>(null);
  const [payrun, setPayrun] = useState<(Payrun & { payslips: Payslip[] }) | null>(null);
  const [approvalHistory, setApprovalHistory] = useState<ApprovalRequest[]>([]);
  const [multisigProposals, setMultisigProposals] = useState<MultisigProposal[]>([]);
  const [multisigInfo, setMultisigInfo] = useState<{ enabled: boolean; threshold?: number } | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSubmitApprovalModal, setShowSubmitApprovalModal] = useState(false);
  const [claimLinks, setClaimLinks] = useState<ClaimLink[]>([]);
  const [claimLinksNotice, setClaimLinksNotice] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [wallet, payrunId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem(`${CLAIM_LINKS_STORAGE_KEY}${payrunId}`);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as ClaimLink[];
      if (Array.isArray(parsed)) {
        setClaimLinks(parsed);
      }
    } catch {
      // Ignore malformed storage entries.
    }
  }, [payrunId]);

  const loadData = async () => {
    if (!wallet) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const orgs = await api.orgs.list(wallet);
      if (orgs.length === 0) {
        setError('No organization found');
        return;
      }

      const selectedOrg = orgs[0];
      setOrg(selectedOrg);

      const payrunData = await api.payruns.get(selectedOrg.id, payrunId, wallet);
      setPayrun(payrunData);

      // Load approval history
      try {
        const history = await api.approvals.getHistory(selectedOrg.id, payrunId, wallet);
        setApprovalHistory(history);
      } catch {
        // Approval history may not exist for all payruns
        setApprovalHistory([]);
      }

      // Load multisig info and proposals
      try {
        const info = await api.payrunMultisig.getMultisigInfo(selectedOrg.id, wallet);
        setMultisigInfo(info);

        if (info.enabled) {
          const proposals = await api.payrunMultisig.getProposals(selectedOrg.id, payrunId, wallet);
          setMultisigProposals(proposals);
        }
      } catch (err) {
        console.error('Failed to load multisig info:', err);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load payrun');
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (
    action: 'validate' | 'execute' | 'openClaims' | 'close' | 'cancel'
  ) => {
    if (!org || !payrun || !wallet) return;

    setActionLoading(action);
    setError(null);

    try {
      switch (action) {
        case 'validate': {
          const result = await api.payruns.validate(org.id, payrun.id, wallet);
          if (result.claimLinks && result.claimLinks.length > 0) {
            setClaimLinks(result.claimLinks);
            if (typeof window !== 'undefined') {
              localStorage.setItem(
                `${CLAIM_LINKS_STORAGE_KEY}${payrunId}`,
                JSON.stringify(result.claimLinks)
              );
            }
            setClaimLinksNotice(
              'Claim links are generated once. They are stored in this browser so you can copy them for the demo.'
            );
          }
          break;
        }
        case 'execute':
          await api.payruns.execute(org.id, payrun.id, `exec_${Date.now()}`, wallet);
          break;
        case 'openClaims':
          await api.payruns.openClaims(org.id, payrun.id, wallet);
          break;
        case 'close':
          await api.payruns.close(org.id, payrun.id, wallet);
          break;
        case 'cancel':
          await api.payruns.cancel(org.id, payrun.id, wallet);
          break;
      }
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} payrun`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleProposeToMultisig = async () => {
    if (!org || !payrun || !wallet || !signTransaction || !publicKey) return;

    setActionLoading('proposeMultisig');
    setError(null);

    try {
      const result = await api.payrunMultisig.proposeToMultisig(org.id, payrun.id, wallet);

      const transaction = new Transaction();
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      transaction.add(
        new TransactionInstruction({
          programId: new PublicKey(result.vaultTransactionIx.programId),
          keys: result.vaultTransactionIx.keys.map((k) => ({
            pubkey: new PublicKey(k.pubkey),
            isSigner: k.isSigner,
            isWritable: k.isWritable,
          })),
          data: Buffer.from(result.vaultTransactionIx.data, 'base64'),
        })
      );

      transaction.add(
        new TransactionInstruction({
          programId: new PublicKey(result.proposalCreateIx.programId),
          keys: result.proposalCreateIx.keys.map((k) => ({
            pubkey: new PublicKey(k.pubkey),
            isSigner: k.isSigner,
            isWritable: k.isWritable,
          })),
          data: Buffer.from(result.proposalCreateIx.data, 'base64'),
        })
      );

      const signedTx = await signTransaction(transaction);
      const signature = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });

      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        'confirmed'
      );

      await loadData();
    } catch (err) {
      console.error('Propose error:', err);
      setError(err instanceof Error ? err.message : 'Failed to create proposal');
    } finally {
      setActionLoading(null);
    }
  };

  const handleVote = async (proposalId: string, approve: boolean) => {
    if (!org || !wallet || !signTransaction || !publicKey) return;

    setActionLoading(approve ? `approve_${proposalId}` : `reject_${proposalId}`);
    setError(null);

    try {
      const result = approve
        ? await api.payrunMultisig.approve(org.id, proposalId, wallet)
        : await api.payrunMultisig.reject(org.id, proposalId, wallet);

      const transaction = new Transaction();
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      transaction.add(
        new TransactionInstruction({
          programId: new PublicKey(result.instruction.programId),
          keys: result.instruction.keys.map((k) => ({
            pubkey: new PublicKey(k.pubkey),
            isSigner: k.isSigner,
            isWritable: k.isWritable,
          })),
          data: Buffer.from(result.instruction.data, 'base64'),
        })
      );

      const signedTx = await signTransaction(transaction);
      const signature = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });

      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        'confirmed'
      );

      await api.payrunMultisig.syncProposal(org.id, proposalId, wallet);
      await loadData();
    } catch (err) {
      console.error('Vote error:', err);
      setError(err instanceof Error ? err.message : 'Failed to submit vote');
    } finally {
      setActionLoading(null);
    }
  };

  const handleExecuteMultisig = async (proposalId: string) => {
    if (!org || !wallet || !signTransaction || !publicKey) return;

    setActionLoading(`execute_${proposalId}`);
    setError(null);

    try {
      const result = await api.payrunMultisig.execute(org.id, proposalId, wallet);

      const transaction = new Transaction();
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      transaction.add(
        new TransactionInstruction({
          programId: new PublicKey(result.instruction.programId),
          keys: result.instruction.keys.map((k) => ({
            pubkey: new PublicKey(k.pubkey),
            isSigner: k.isSigner,
            isWritable: k.isWritable,
          })),
          data: Buffer.from(result.instruction.data, 'base64'),
        })
      );

      const signedTx = await signTransaction(transaction);
      const signature = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });

      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        'confirmed'
      );

      await api.payrunMultisig.confirmExecution(org.id, proposalId, signature, wallet);
      await loadData();
    } catch (err) {
      console.error('Execute error:', err);
      setError(err instanceof Error ? err.message : 'Failed to execute proposal');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSubmitForApproval = async (comments: string) => {
    if (!org || !payrun || !wallet) return;

    setActionLoading('submitForApproval');
    setError(null);

    try {
      await api.approvals.submitForApproval(org.id, payrun.id, { comments }, wallet);
      setShowSubmitApprovalModal(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit for approval');
    } finally {
      setActionLoading(null);
    }
  };

  const buildClaimUrl = (urlPath: string) => {
    const base = env.EMPLOYEE_APP_URL.replace(/\/$/, '');
    return `${base}${urlPath}`;
  };

  const copyToClipboard = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setClaimLinksNotice('Claim link copied to clipboard.');
    } catch {
      setClaimLinksNotice('Failed to copy claim link. Please copy manually.');
    }
  };

  const handleLaunchPayrun = async () => {
    if (!org || !payrun || !wallet || !publicKey || !signTransaction) return;

    setActionLoading('launch');
    setError(null);

    try {
      setActionLoading('launch-validate');
      await api.payruns.validate(org.id, payrun.id, wallet);

      const updatedPayrun = await api.payruns.get(org.id, payrun.id, wallet);
      setPayrun(updatedPayrun);

      setActionLoading('launch-chain');
      await postPayrunToChain(updatedPayrun);

      setActionLoading('launch-claims');
      await api.payruns.openClaims(org.id, payrun.id, wallet);

      await loadData();
    } catch (err) {
      console.error('Launch payrun error:', err);
      setError(err instanceof Error ? err.message : 'Failed to launch payrun');
    } finally {
      setActionLoading(null);
    }
  };

  const postPayrunToChain = async (payrunData: Payrun & { payslips: Payslip[] }) => {
    if (!org || !wallet || !publicKey || !signTransaction) return;

    // Check if already posted (DB state)
    if (payrunData.onChainTxSig) {
      console.log('Payrun already posted on-chain, skipping...');
      return;
    }

    if (!payrunData.merkleRootHex) {
      throw new Error('Merkle root not generated');
    }

    const validatePublicKey = (value: string, fieldName: string): PublicKey => {
      try {
        return new PublicKey(value);
      } catch {
        throw new Error(`Invalid ${fieldName}: "${value}"`);
      }
    };

    const treasuryPubkey = validatePublicKey(org.treasuryConfAccount, 'treasury account');
    const zkVerifierPubkey = validatePublicKey(org.zkVerifierProgramId, 'ZK verifier program ID');
    const incoPubkey = validatePublicKey(org.incoProgramId, 'Inco program ID');

    const orgIdBytes = hexToBytes(org.orgIdHex);
    const payrunIdBytes = hexToBytes(payrunData.payrunIdHex);
    const merkleRootBytes = hexToBytes(payrunData.merkleRootHex);

    const orgPda = deriveOrgPda(orgIdBytes, ZURPAY_PROGRAM_ID);
    const payrunPda = derivePayrunPda(orgIdBytes, payrunIdBytes, ZURPAY_PROGRAM_ID);

    const [orgAccountInfo, payrunAccountInfo] = await Promise.all([
      connection.getAccountInfo(orgPda),
      connection.getAccountInfo(payrunPda),
    ]);

    if (payrunAccountInfo) {
      throw new Error('Payrun already posted on-chain');
    }

    const transaction = new Transaction();

    if (!orgAccountInfo) {
      const initOrgDiscriminator = Buffer.from([159, 225, 34, 170, 187, 34, 218, 4]);
      const initOrgData = Buffer.concat([
        initOrgDiscriminator,
        Buffer.from(orgIdBytes),
        Buffer.from(treasuryPubkey.toBytes()),
        Buffer.from(zkVerifierPubkey.toBytes()),
        Buffer.from(incoPubkey.toBytes()),
      ]);

      transaction.add(
        new TransactionInstruction({
          programId: ZURPAY_PROGRAM_ID,
          keys: [
            { pubkey: publicKey, isSigner: true, isWritable: true },
            { pubkey: orgPda, isSigner: false, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          ],
          data: initOrgData,
        })
      );
    }

    const setPayrunDiscriminator = Buffer.from([106, 77, 86, 198, 171, 28, 92, 59]);
    const totalEmployeesBuf = Buffer.alloc(4);
    totalEmployeesBuf.writeUInt32LE(payrunData.totalPayslips, 0);

    const deadlineUnix = payrunData.claimDeadline
      ? Math.floor(new Date(payrunData.claimDeadline).getTime() / 1000)
      : Math.floor(Date.now() / 1000 + 30 * 24 * 60 * 60);
    const deadlineBuf = Buffer.alloc(8);
    deadlineBuf.writeBigInt64LE(BigInt(deadlineUnix), 0);

    const setPayrunData = Buffer.concat([
      setPayrunDiscriminator,
      Buffer.from(payrunIdBytes),
      Buffer.from(merkleRootBytes),
      totalEmployeesBuf,
      deadlineBuf,
    ]);

    transaction.add(
      new TransactionInstruction({
        programId: ZURPAY_PROGRAM_ID,
        keys: [
          { pubkey: publicKey, isSigner: true, isWritable: true },
          { pubkey: orgPda, isSigner: false, isWritable: true },
          { pubkey: payrunPda, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: setPayrunData,
      })
    );

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

    await api.payruns.setOnChain(org.id, payrunData.id, signature, wallet);
  };

  const handleSetOnChain = async () => {
    if (!org || !payrun || !wallet || !publicKey || !signTransaction) return;

    if (!payrun.merkleRootHex) {
      setError('Validate the payrun to generate a merkle root before posting on-chain.');
      return;
    }

    const validatePublicKey = (value: string, fieldName: string): PublicKey | null => {
      try {
        return new PublicKey(value);
      } catch {
        setError(`Invalid ${fieldName}: "${value}". Please update your organization settings.`);
        return null;
      }
    };

    const treasuryPubkey = validatePublicKey(org.treasuryConfAccount, 'treasury account');
    const zkVerifierPubkey = validatePublicKey(org.zkVerifierProgramId, 'ZK verifier program ID');
    const incoPubkey = validatePublicKey(org.incoProgramId, 'Inco program ID');

    if (!treasuryPubkey || !zkVerifierPubkey || !incoPubkey) {
      return;
    }

    try {
      setActionLoading('setOnChain');
      setError(null);

      const orgIdBytes = hexToBytes(org.orgIdHex);
      const payrunIdBytes = hexToBytes(payrun.payrunIdHex);
      const merkleRootBytes = hexToBytes(payrun.merkleRootHex);

      const orgPda = deriveOrgPda(orgIdBytes, ZURPAY_PROGRAM_ID);
      const payrunPda = derivePayrunPda(orgIdBytes, payrunIdBytes, ZURPAY_PROGRAM_ID);

      const [orgAccountInfo, payrunAccountInfo] = await Promise.all([
        connection.getAccountInfo(orgPda),
        connection.getAccountInfo(payrunPda),
      ]);

      if (payrunAccountInfo) {
        throw new Error(
          'This payrun has already been posted on-chain. The payrun PDA already exists.'
        );
      }

      const transaction = new Transaction();

      if (!orgAccountInfo) {
        console.log('Org not initialized on-chain, initializing first...');

        const initOrgDiscriminator = Buffer.from([159, 225, 34, 170, 187, 34, 218, 4]);

        const treasuryConfAccountBytes = treasuryPubkey.toBytes();
        const zkVerifierProgramIdBytes = zkVerifierPubkey.toBytes();
        const incoProgramIdBytes = incoPubkey.toBytes();

        const initOrgData = Buffer.concat([
          initOrgDiscriminator,
          Buffer.from(orgIdBytes),
          Buffer.from(treasuryConfAccountBytes),
          Buffer.from(zkVerifierProgramIdBytes),
          Buffer.from(incoProgramIdBytes),
        ]);

        const initOrgInstruction = new TransactionInstruction({
          programId: ZURPAY_PROGRAM_ID,
          keys: [
            { pubkey: publicKey, isSigner: true, isWritable: true },
            { pubkey: orgPda, isSigner: false, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          ],
          data: initOrgData,
        });

        transaction.add(initOrgInstruction);
      }

      // Now add the setPayrun instruction
      const setPayrunDiscriminator = Buffer.from([106, 77, 86, 198, 171, 28, 92, 59]); // set_payrun
      const totalEmployeesBuf = Buffer.alloc(4);
      totalEmployeesBuf.writeUInt32LE(payrun.totalPayslips, 0);

      const deadlineUnix = payrun.claimDeadline
        ? Math.floor(new Date(payrun.claimDeadline).getTime() / 1000)
        : Math.floor(Date.now() / 1000 + 30 * 24 * 60 * 60);
      const deadlineBuf = Buffer.alloc(8);
      deadlineBuf.writeBigInt64LE(BigInt(deadlineUnix), 0);

      const setPayrunData = Buffer.concat([
        setPayrunDiscriminator,
        Buffer.from(payrunIdBytes),
        Buffer.from(merkleRootBytes),
        totalEmployeesBuf,
        deadlineBuf,
      ]);

      const setPayrunInstruction = new TransactionInstruction({
        programId: ZURPAY_PROGRAM_ID,
        keys: [
          { pubkey: publicKey, isSigner: true, isWritable: true },
          { pubkey: orgPda, isSigner: false, isWritable: true },
          { pubkey: payrunPda, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: setPayrunData,
      });

      transaction.add(setPayrunInstruction);

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      const simulateResult = await connection.simulateTransaction(transaction);
      if (simulateResult.value.err) {
        console.error('Simulation failed:', simulateResult.value.err);
        console.error('Logs:', simulateResult.value.logs);
        const logs = simulateResult.value.logs?.join('\n') || 'No logs';
        throw new Error(
          `Transaction simulation failed: ${JSON.stringify(simulateResult.value.err)}\n\nLogs:\n${logs}`
        );
      }

      console.log('Simulation passed, requesting wallet signature...');
      console.log('Transaction instructions:', transaction.instructions.length);
      console.log('Fee payer:', transaction.feePayer?.toBase58());

      let signedTx;
      try {
        signedTx = await signTransaction(transaction);
      } catch (signErr) {
        console.error('Wallet sign error details:', signErr);
        throw signErr;
      }
      const signature = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });

      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        'confirmed'
      );

      await api.payruns.setOnChain(org.id, payrun.id, signature, wallet);
      await loadData();
    } catch (err) {
      console.error('Set on-chain error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to post payrun on-chain';
      setError(errorMessage);
    } finally {
      setActionLoading(null);
    }
  };

  if (!wallet) {
    return (
      <div className="text-center py-16">
        <p className="text-zinc-400">Please connect your wallet to view this payrun.</p>
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

  if (error && !payrun) {
    return (
      <div className="text-center py-16">
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
        <h3 className="text-xl font-semibold mb-2">Error Loading Payrun</h3>
        <p className="text-zinc-400 mb-4">{error}</p>
        <button onClick={() => router.push('/dashboard/payruns')} className="btn-primary">
          Back to Payruns
        </button>
      </div>
    );
  }

  if (!payrun) return null;

  const canValidate = payrun.status === 'DRAFT';
  const canSubmitForApproval = payrun.status === 'DRAFT';
  const canExecute = payrun.status === 'READY' && payrun.mode === 'BATCH';
  const canOpenClaims =
    payrun.status === 'READY' && payrun.mode === 'CLAIMS' && !!payrun.onChainTxSig;
  const canSetOnChain =
    payrun.status === 'READY' &&
    payrun.mode === 'CLAIMS' &&
    !!payrun.merkleRootHex &&
    !payrun.onChainTxSig;
  const canClose = ['COMPLETED', 'FAILED', 'ACTIVE_CLAIMS'].includes(payrun.status);
  const canCancel = ['DRAFT', 'READY'].includes(payrun.status);

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => router.push('/dashboard/payruns')}
          className="text-zinc-400 hover:text-white"
        >
          ← Back
        </button>
        <div className="flex-1">
          <h2 className="text-2xl font-bold">Payrun Details</h2>
          <p className="text-zinc-400 text-sm font-mono">{payrun.payrunIdHex}</p>
        </div>
        <span className={`px-3 py-1 rounded-full ${getStatusColor(payrun.status)}`}>
          {getStatusLabel(payrun.status)}
        </span>
      </div>

      {error && (
        <div className="p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-300 mb-6">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="glass-card rounded-xl p-6">
          <h3 className="text-sm text-zinc-400 mb-1">Total Amount</h3>
          <div className="text-2xl font-bold">
            {payrun.totalAmount ? formatAmount(payrun.totalAmount) : '-'}
          </div>
        </div>
        <div className="glass-card rounded-xl p-6">
          <h3 className="text-sm text-zinc-400 mb-1">Payslips</h3>
          <div className="text-2xl font-bold">
            <span className="text-emerald-400">{payrun.paidCount + payrun.claimedCount}</span>
            <span className="text-zinc-500"> / {payrun.totalPayslips}</span>
          </div>
          {payrun.failedCount > 0 && (
            <div className="text-sm text-red-400">{payrun.failedCount} failed</div>
          )}
        </div>
        <div className="glass-card rounded-xl p-6">
          <h3 className="text-sm text-zinc-400 mb-1">Mode</h3>
          <div className="text-2xl font-bold">{payrun.mode}</div>
        </div>
      </div>

      <div className="glass-card rounded-xl p-6 mb-8">
        <h3 className="text-lg font-semibold mb-4">Details</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-sm text-zinc-400">Created</div>
            <div className="font-medium">{formatDate(payrun.createdAt)}</div>
          </div>
          <div>
            <div className="text-sm text-zinc-400">Created By</div>
            <div className="font-mono text-sm truncate">{payrun.createdBy.slice(0, 12)}...</div>
          </div>
          {payrun.periodStart && (
            <div>
              <div className="text-sm text-zinc-400">Period Start</div>
              <div className="font-medium">{formatDate(payrun.periodStart)}</div>
            </div>
          )}
          {payrun.periodEnd && (
            <div>
              <div className="text-sm text-zinc-400">Period End</div>
              <div className="font-medium">{formatDate(payrun.periodEnd)}</div>
            </div>
          )}
          {payrun.claimDeadline && (
            <div>
              <div className="text-sm text-zinc-400">Claim Deadline</div>
              <div className="font-medium">{formatDate(payrun.claimDeadline)}</div>
            </div>
          )}
          {payrun.executedAt && (
            <div>
              <div className="text-sm text-zinc-400">Executed At</div>
              <div className="font-medium">{formatDate(payrun.executedAt)}</div>
            </div>
          )}
          {payrun.merkleRootHex && (
            <div className="col-span-2">
              <div className="text-sm text-zinc-400">Merkle Root</div>
              <div className="font-mono text-xs break-all">{payrun.merkleRootHex}</div>
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-3 mb-8">
        {canValidate && (
          <button
            onClick={handleLaunchPayrun}
            disabled={actionLoading !== null}
            className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-700 rounded-lg transition-colors font-medium text-lg"
          >
            {actionLoading?.startsWith('launch') ? (
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {actionLoading === 'launch-validate' && 'Generating proofs...'}
                {actionLoading === 'launch-chain' && 'Posting to chain...'}
                {actionLoading === 'launch-claims' && 'Opening claims...'}
              </span>
            ) : (
              'Launch Payrun'
            )}
          </button>
        )}
        {canSetOnChain && (
          <button
            onClick={handleSetOnChain}
            disabled={actionLoading !== null}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-zinc-700 rounded-lg transition-colors"
          >
            {actionLoading === 'setOnChain' ? 'Posting...' : 'Post Payrun On-Chain'}
          </button>
        )}
        {canSubmitForApproval && (
          <button
            onClick={() => setShowSubmitApprovalModal(true)}
            disabled={actionLoading !== null}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-zinc-700 rounded-lg transition-colors"
          >
            {actionLoading === 'submitForApproval' ? 'Submitting...' : 'Submit for Approval'}
          </button>
        )}
        {canExecute && (
          <button
            onClick={() => handleAction('execute')}
            disabled={actionLoading !== null}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-700 rounded-lg transition-colors"
          >
            {actionLoading === 'execute' ? 'Executing...' : 'Execute Payouts'}
          </button>
        )}
        {canOpenClaims && (
          <button
            onClick={() => handleAction('openClaims')}
            disabled={actionLoading !== null}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-700 rounded-lg transition-colors"
          >
            {actionLoading === 'openClaims' ? 'Opening...' : 'Open for Claims'}
          </button>
        )}
        {canClose && (
          <button
            onClick={() => handleAction('close')}
            disabled={actionLoading !== null}
            className="px-4 py-2 bg-zinc-600 hover:bg-zinc-700 disabled:bg-zinc-700 rounded-lg transition-colors"
          >
            {actionLoading === 'close' ? 'Closing...' : 'Close Payrun'}
          </button>
        )}
        {canCancel && (
          <button
            onClick={() => handleAction('cancel')}
            disabled={actionLoading !== null}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-zinc-700 rounded-lg transition-colors"
          >
            {actionLoading === 'cancel' ? 'Cancelling...' : 'Cancel Payrun'}
          </button>
        )}
        {payrun.onChainTxSig && (
          <a
            href={`https://explorer.solana.com/tx/${payrun.onChainTxSig}?cluster=devnet`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg transition-colors"
          >
            View Transaction
          </a>
        )}
      </div>

      {payrun.status === 'READY' && payrun.mode === 'CLAIMS' && !payrun.onChainTxSig && (
        <div className="mb-6 rounded-lg border border-yellow-700/60 bg-yellow-900/30 px-4 py-3 text-sm text-yellow-200">
          Post the payrun on-chain before opening claims. Employees will not be able to claim until
          the on-chain payrun exists.
        </div>
      )}

      {/* Multisig Section */}
      {multisigInfo?.enabled && (
        <div className="glass-card rounded-xl p-6 mb-8">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-semibold">Multisig Approval</h3>
            {payrun.status === 'READY' && multisigProposals.length === 0 && (
              <button
                onClick={handleProposeToMultisig}
                disabled={actionLoading !== null}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-zinc-700 rounded-lg transition-colors text-sm"
              >
                {actionLoading === 'proposeMultisig' ? 'Proposing...' : 'Propose to Multisig'}
              </button>
            )}
          </div>

          {multisigProposals.length === 0 ? (
            <p className="text-zinc-400 text-sm">No active multisig proposals for this payrun.</p>
          ) : (
            <div className="space-y-4">
              {multisigProposals.map((proposal) => {
                const isApproved = proposal.status === 'APPROVED';
                const isExecuted = proposal.status === 'EXECUTED';
                const isRejected = proposal.status === 'REJECTED';
                const hasVoted =
                  proposal.approvals.includes(wallet!) || proposal.rejections.includes(wallet!);
                const canVote = !hasVoted && proposal.status === 'PENDING';
                const canExecute =
                  proposal.status === 'APPROVED' &&
                  multisigInfo.threshold !== undefined &&
                  proposal.approvals.length >= multisigInfo.threshold;

                return (
                  <div
                    key={proposal.id}
                    className="bg-zinc-900/50 rounded-lg p-4 border border-zinc-800"
                  >
                    <div className="flex flex-col md:flex-row justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <span
                            className={`px-2 py-0.5 text-xs rounded-full ${
                              isExecuted
                                ? 'bg-emerald-900/50 text-emerald-300'
                                : isApproved
                                  ? 'bg-blue-900/50 text-blue-300'
                                  : isRejected
                                    ? 'bg-red-900/50 text-red-300'
                                    : 'bg-amber-900/50 text-amber-300'
                            }`}
                          >
                            {proposal.status}
                          </span>
                          <h4 className="font-medium">{proposal.title}</h4>
                        </div>
                        <p className="text-sm text-zinc-400 mb-3">
                          {proposal.description || 'No description'}
                        </p>

                        <div className="flex gap-4 text-sm">
                          <div className="text-emerald-400">
                            ✓ {proposal.approvals.length} Approved
                          </div>
                          <div className="text-red-400">
                            ✗ {proposal.rejections.length} Rejected
                          </div>
                          <div className="text-zinc-500">
                            Threshold: {multisigInfo.threshold || '?'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {canVote && (
                          <>
                            <button
                              onClick={() => handleVote(proposal.id, true)}
                              disabled={actionLoading !== null}
                              className="px-3 py-1.5 bg-emerald-900/30 hover:bg-emerald-900/50 text-emerald-300 border border-emerald-900/50 rounded-lg transition-colors text-sm"
                            >
                              {actionLoading === `approve_${proposal.id}` ? '...' : 'Approve'}
                            </button>
                            <button
                              onClick={() => handleVote(proposal.id, false)}
                              disabled={actionLoading !== null}
                              className="px-3 py-1.5 bg-red-900/30 hover:bg-red-900/50 text-red-300 border border-red-900/50 rounded-lg transition-colors text-sm"
                            >
                              {actionLoading === `reject_${proposal.id}` ? '...' : 'Reject'}
                            </button>
                          </>
                        )}

                        {canExecute && (
                          <button
                            onClick={() => handleExecuteMultisig(proposal.id)}
                            disabled={actionLoading !== null}
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-700 rounded-lg transition-colors text-sm font-medium"
                          >
                            {actionLoading === `execute_${proposal.id}`
                              ? 'Executing...'
                              : 'Execute'}
                          </button>
                        )}

                        {!canVote && !canExecute && !isExecuted && (
                          <span className="text-sm text-zinc-500 italic">
                            {hasVoted ? 'You have voted' : 'Waiting for votes'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {(claimLinks.length > 0 || claimLinksNotice) && (
        <div className="glass-card rounded-xl p-6 mb-8">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold">Claim Links</h3>
              <p className="text-xs text-zinc-400">
                Share these with employees. Links are generated once during validation.
              </p>
            </div>
            {claimLinks.length > 0 && (
              <button
                onClick={() =>
                  copyToClipboard(claimLinks.map((link) => buildClaimUrl(link.urlPath)).join('\n'))
                }
                className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-sm transition-colors"
              >
                Copy All
              </button>
            )}
          </div>

          {claimLinksNotice && (
            <div className="text-xs text-emerald-400 mb-4">{claimLinksNotice}</div>
          )}

          {claimLinks.length === 0 ? (
            <div className="text-sm text-zinc-400">No claim links available yet.</div>
          ) : (
            <div className="space-y-4">
              {claimLinks.map((link) => {
                const fullUrl = buildClaimUrl(link.urlPath);
                return (
                  <div
                    key={link.token}
                    className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-4"
                  >
                    <div className="text-xs text-zinc-400 mb-2">Payout Account</div>
                    <div className="font-mono text-xs break-all mb-3">
                      {link.claimerConfAccount}
                    </div>
                    <div className="flex flex-col gap-2 md:flex-row md:items-center">
                      <code className="flex-1 font-mono text-xs break-all bg-zinc-800/60 px-3 py-2 rounded-lg">
                        {fullUrl}
                      </code>
                      <button
                        onClick={() => copyToClipboard(fullUrl)}
                        className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-sm transition-colors"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="glass-card rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-800">
          <h3 className="text-lg font-semibold">Payslips ({payrun.payslips.length})</h3>
        </div>
        {payrun.payslips.length === 0 ? (
          <div className="p-6 text-center text-zinc-400">No payslips in this payrun</div>
        ) : (
          <table className="w-full">
            <thead className="bg-zinc-800/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
                  Worker
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
                  Paid At
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {payrun.payslips.map((payslip) => (
                <tr key={payslip.id} className="hover:bg-zinc-800/30">
                  <td className="px-6 py-4">
                    <div>
                      <div className="font-medium">
                        {payslip.worker?.displayName || payslip.worker?.email || 'Unknown'}
                      </div>
                      <div className="text-xs text-zinc-500">
                        {payslip.worker?.email ||
                          (payslip.worker?.wallet
                            ? `${payslip.worker.wallet.slice(0, 12)}...`
                            : 'No wallet')}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${
                        payslip.worker?.type === 'EMPLOYEE'
                          ? 'bg-blue-900/50 text-blue-300'
                          : 'bg-purple-900/50 text-purple-300'
                      }`}
                    >
                      {payslip.worker?.type || 'UNKNOWN'}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-medium">{formatAmount(payslip.amount)}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${getStatusColor(payslip.status)}`}
                    >
                      {payslip.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-zinc-400">{formatDate(payslip.paidAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Approval History Section */}
      {approvalHistory.length > 0 && (
        <div className="glass-card rounded-xl overflow-hidden mt-8">
          <div className="px-6 py-4 border-b border-zinc-800">
            <h3 className="text-lg font-semibold">Approval History</h3>
          </div>
          <div className="divide-y divide-zinc-800">
            {approvalHistory.map((request) => (
              <div key={request.id} className="px-6 py-4">
                <div className="flex justify-between items-start">
                  <div>
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${
                        request.status === 'APPROVED'
                          ? 'bg-emerald-900/50 text-emerald-300'
                          : request.status === 'REJECTED'
                            ? 'bg-red-900/50 text-red-300'
                            : 'bg-amber-900/50 text-amber-300'
                      }`}
                    >
                      {request.status}
                    </span>
                    <p className="text-sm text-zinc-400 mt-2">
                      Requested by{' '}
                      <span className="font-mono">{request.requestedBy.slice(0, 8)}...</span>
                    </p>
                    {request.respondedBy && (
                      <p className="text-sm text-zinc-400">
                        Responded by{' '}
                        <span className="font-mono">{request.respondedBy.slice(0, 8)}...</span>
                      </p>
                    )}
                    {request.comments && (
                      <p className="text-sm text-zinc-300 mt-2 italic">"{request.comments}"</p>
                    )}
                  </div>
                  <div className="text-right text-sm text-zinc-500">
                    <p>{formatDate(request.requestedAt)}</p>
                    {request.respondedAt && <p>Responded: {formatDate(request.respondedAt)}</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Submit for Approval Modal */}
      {showSubmitApprovalModal && (
        <SubmitApprovalModal
          loading={actionLoading === 'submitForApproval'}
          onSubmit={handleSubmitForApproval}
          onClose={() => setShowSubmitApprovalModal(false)}
        />
      )}
    </div>
  );
}

function SubmitApprovalModal({
  loading,
  onSubmit,
  onClose,
}: {
  loading: boolean;
  onSubmit: (comments: string) => void;
  onClose: () => void;
}) {
  const [comments, setComments] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(comments);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-zinc-900 rounded-xl p-6 w-full max-w-md border border-zinc-800">
        <h3 className="text-xl font-semibold mb-4">Submit for Approval</h3>
        <p className="text-zinc-400 text-sm mb-4">
          This payrun will be sent to approvers for review. Once approved, it can be executed or
          opened for claims.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">
              Comments (Optional)
            </label>
            <textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-emerald-500 min-h-[100px]"
              placeholder="Add any notes for the approvers..."
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-zinc-700 rounded-lg transition-colors"
            >
              {loading ? 'Submitting...' : 'Submit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
