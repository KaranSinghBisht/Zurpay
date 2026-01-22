import * as multisig from '@sqds/multisig';
import {
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  TransactionInstruction,
} from '@solana/web3.js';

const { Permission, Permissions } = multisig.types;

export const SQUADS_PROGRAM_ID = new PublicKey('SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf');

export interface MultisigMember {
  wallet: string;
  permissions: 'all' | 'vote' | 'initiate' | 'execute';
}

export interface MultisigConfig {
  multisigPda: string;
  vaultPda: string;
  createKey: string;
  threshold: number;
  members: MultisigMember[];
}

export interface ProposalInfo {
  transactionIndex: bigint;
  status: 'active' | 'approved' | 'rejected' | 'executed' | 'cancelled';
  approvals: string[];
  rejections: string[];
}

function getConnection(): Connection {
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  return new Connection(rpcUrl, 'confirmed');
}

function getPermissions(perm: MultisigMember['permissions']): multisig.types.Permissions {
  switch (perm) {
    case 'all':
      return Permissions.all();
    case 'vote':
      return Permissions.fromPermissions([Permission.Vote]);
    case 'initiate':
      return Permissions.fromPermissions([Permission.Initiate]);
    case 'execute':
      return Permissions.fromPermissions([Permission.Execute]);
    default:
      return Permissions.fromPermissions([Permission.Vote]);
  }
}

export function deriveMultisigPda(createKey: PublicKey): PublicKey {
  const [multisigPda] = multisig.getMultisigPda({ createKey });
  return multisigPda;
}

export function deriveVaultPda(multisigPda: PublicKey, index: number = 0): PublicKey {
  const [vaultPda] = multisig.getVaultPda({ multisigPda, index });
  return vaultPda;
}

export async function getCreateMultisigInstruction(params: {
  createKey: Keypair;
  creator: PublicKey;
  members: MultisigMember[];
  threshold: number;
  timeLock?: number;
}): Promise<{
  multisigPda: PublicKey;
  vaultPda: PublicKey;
  instruction: TransactionInstruction;
}> {
  const connection = getConnection();
  const { createKey, creator, members, threshold, timeLock = 0 } = params;

  const [multisigPda] = multisig.getMultisigPda({ createKey: createKey.publicKey });
  const [vaultPda] = multisig.getVaultPda({ multisigPda, index: 0 });

  const [programConfigPda] = multisig.getProgramConfigPda({});

  let treasury: PublicKey;
  try {
    const programConfig = await multisig.accounts.ProgramConfig.fromAccountAddress(
      connection,
      programConfigPda
    );
    treasury = programConfig.treasury;
  } catch {
    treasury = creator;
  }

  const membersWithPermissions = members.map((m) => ({
    key: new PublicKey(m.wallet),
    permissions: getPermissions(m.permissions),
  }));

  const ix = multisig.instructions.multisigCreateV2({
    createKey: createKey.publicKey,
    creator,
    multisigPda,
    configAuthority: null,
    timeLock,
    members: membersWithPermissions,
    threshold,
    rentCollector: null,
    treasury,
  });

  return {
    multisigPda,
    vaultPda,
    instruction: ix,
  };
}

export async function getMultisigState(multisigPda: PublicKey): Promise<{
  threshold: number;
  transactionIndex: bigint;
  members: Array<{ key: string; permissions: number }>;
} | null> {
  const connection = getConnection();

  try {
    const account = await multisig.accounts.Multisig.fromAccountAddress(connection, multisigPda);

    return {
      threshold: account.threshold,
      transactionIndex: BigInt(account.transactionIndex.toString()),
      members: account.members.map((m) => ({
        key: m.key.toBase58(),
        permissions: m.permissions.mask,
      })),
    };
  } catch {
    return null;
  }
}

export async function getProposalInstructions(params: {
  multisigPda: PublicKey;
  creator: PublicKey;
  vaultIndex?: number;
  instructions: TransactionInstruction[];
}): Promise<{
  transactionIndex: bigint;
  vaultTransactionIx: TransactionInstruction;
  proposalCreateIx: TransactionInstruction;
}> {
  const connection = getConnection();
  const { multisigPda, creator, vaultIndex = 0, instructions } = params;

  const [vaultPda] = multisig.getVaultPda({ multisigPda, index: vaultIndex });

  const multisigAccount = await multisig.accounts.Multisig.fromAccountAddress(
    connection,
    multisigPda
  );
  const transactionIndex = BigInt(Number(multisigAccount.transactionIndex) + 1);

  const { blockhash } = await connection.getLatestBlockhash();
  const transactionMessage = new TransactionMessage({
    payerKey: vaultPda,
    recentBlockhash: blockhash,
    instructions,
  });

  const vaultTransactionIx = multisig.instructions.vaultTransactionCreate({
    multisigPda,
    transactionIndex,
    creator,
    vaultIndex,
    ephemeralSigners: 0,
    transactionMessage,
    memo: undefined,
  });

  const proposalCreateIx = multisig.instructions.proposalCreate({
    multisigPda,
    transactionIndex,
    creator,
  });

  return {
    transactionIndex,
    vaultTransactionIx,
    proposalCreateIx,
  };
}

export function getApprovalInstruction(params: {
  multisigPda: PublicKey;
  transactionIndex: bigint;
  member: PublicKey;
}): TransactionInstruction {
  const { multisigPda, transactionIndex, member } = params;

  return multisig.instructions.proposalApprove({
    multisigPda,
    transactionIndex,
    member,
    memo: undefined,
  });
}

export function getRejectionInstruction(params: {
  multisigPda: PublicKey;
  transactionIndex: bigint;
  member: PublicKey;
}): TransactionInstruction {
  const { multisigPda, transactionIndex, member } = params;

  return multisig.instructions.proposalReject({
    multisigPda,
    transactionIndex,
    member,
    memo: undefined,
  });
}

export async function getExecuteInstruction(params: {
  multisigPda: PublicKey;
  transactionIndex: bigint;
  member: PublicKey;
}): Promise<TransactionInstruction> {
  const connection = getConnection();
  const { multisigPda, transactionIndex, member } = params;

  const result = await multisig.instructions.vaultTransactionExecute({
    connection,
    multisigPda,
    transactionIndex,
    member,
  });

  return result.instruction;
}

export async function getProposalStatus(
  multisigPda: PublicKey,
  transactionIndex: bigint
): Promise<ProposalInfo | null> {
  const connection = getConnection();

  try {
    const [proposalPda] = multisig.getProposalPda({
      multisigPda,
      transactionIndex,
    });

    const proposal = await multisig.accounts.Proposal.fromAccountAddress(connection, proposalPda);

    let status: ProposalInfo['status'] = 'active';
    if ('approved' in proposal.status) {
      status = 'approved';
    } else if ('rejected' in proposal.status) {
      status = 'rejected';
    } else if ('executed' in proposal.status) {
      status = 'executed';
    } else if ('cancelled' in proposal.status) {
      status = 'cancelled';
    }

    return {
      transactionIndex,
      status,
      approvals: proposal.approved.map((k) => k.toBase58()),
      rejections: proposal.rejected.map((k) => k.toBase58()),
    };
  } catch {
    return null;
  }
}

export async function canExecuteProposal(
  multisigPda: PublicKey,
  transactionIndex: bigint
): Promise<boolean> {
  try {
    const multisigState = await getMultisigState(multisigPda);
    if (!multisigState) return false;

    const proposalStatus = await getProposalStatus(multisigPda, transactionIndex);
    if (!proposalStatus) return false;

    return (
      proposalStatus.status === 'approved' ||
      proposalStatus.approvals.length >= multisigState.threshold
    );
  } catch {
    return false;
  }
}

export function buildPayrunFundingInstruction(params: {
  vaultPda: PublicKey;
  destinationConfAccount: PublicKey;
  amount: bigint;
  incoProgramId: PublicKey;
}): TransactionInstruction {
  const { vaultPda, destinationConfAccount, amount, incoProgramId } = params;

  // Inco transfer instruction placeholder - depends on Inco Lightning's instruction format
  const data = Buffer.alloc(8);
  data.writeBigUInt64LE(amount, 0);

  return new TransactionInstruction({
    programId: incoProgramId,
    keys: [
      { pubkey: vaultPda, isSigner: true, isWritable: true },
      { pubkey: destinationConfAccount, isSigner: false, isWritable: true },
    ],
    data,
  });
}
