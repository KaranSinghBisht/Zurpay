import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import { ClaimPackageV2, ClaimAccounts } from './types';
import { hexToBytes, deriveNullifierPda } from './utils';
import { sha256 } from './merkle';
import {
  ZURPAY_PROGRAM_ID,
  PDA_SEEDS,
  PUBLIC_INPUTS_LEN_V3,
  PUBLIC_INPUTS_LEN_V4,
  PUBLIC_INPUTS_LEN_V5,
  PUBLIC_INPUTS_LEN_V2,
  DEFAULT_INCO_PROGRAM_ID,
} from './constants';

function validateHexField(
  value: string | undefined,
  fieldName: string,
  expectedLength: number
): void {
  if (!value) {
    throw new Error(`ClaimPackage validation failed: ${fieldName} is missing`);
  }
  const cleanHex = value.startsWith('0x') ? value.slice(2) : value;
  if (cleanHex.length !== expectedLength * 2) {
    throw new Error(
      `ClaimPackage validation failed: ${fieldName} has invalid length (expected ${expectedLength * 2} hex chars, got ${cleanHex.length})`
    );
  }
  if (!/^[0-9a-fA-F]*$/.test(cleanHex)) {
    throw new Error(`ClaimPackage validation failed: ${fieldName} contains non-hex characters`);
  }
}

function validateBase64Field(
  value: string | undefined,
  fieldName: string,
  minLength?: number
): Uint8Array {
  if (!value) {
    throw new Error(`ClaimPackage validation failed: ${fieldName} is missing`);
  }
  try {
    const bytes = Buffer.from(value, 'base64');
    if (minLength !== undefined && bytes.length < minLength) {
      throw new Error(
        `ClaimPackage validation failed: ${fieldName} decoded to ${bytes.length} bytes (expected at least ${minLength})`
      );
    }
    return new Uint8Array(bytes);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('ClaimPackage')) throw e;
    throw new Error(`ClaimPackage validation failed: ${fieldName} is not valid base64`);
  }
}

export function validateClaimPackage(claimPackage: ClaimPackageV2): {
  orgId: Uint8Array;
  payrunId: Uint8Array;
  nullifierHash: Uint8Array;
  payoutPubkeyHash: Uint8Array;
  salaryCommitment: Uint8Array;
  ciphertextHash: Uint8Array;
  proofBytes: Uint8Array;
  publicInputsBytes: Uint8Array;
  encryptedAmount: Uint8Array;
} {
  validateHexField(claimPackage.orgIdHex, 'orgIdHex', 32);
  validateHexField(claimPackage.payrunIdHex, 'payrunIdHex', 32);
  validateHexField(claimPackage.nullifierHex, 'nullifierHex', 32);
  validateHexField(claimPackage.salaryCommitmentHex, 'salaryCommitmentHex', 32);
  validateHexField(claimPackage.ciphertextHashHex, 'ciphertextHashHex', 32);
  validateHexField(claimPackage.merkleRootHex, 'merkleRootHex', 32);

  if (claimPackage.payoutPubkeyHashHex) {
    validateHexField(claimPackage.payoutPubkeyHashHex, 'payoutPubkeyHashHex', 32);
  }

  const proofBytes = validateBase64Field(claimPackage.proofB64, 'proofB64', 100);
  const publicInputsBytes = validateBase64Field(
    claimPackage.publicInputsB64,
    'publicInputsB64',
    PUBLIC_INPUTS_LEN_V4
  );
  const encryptedAmount = validateBase64Field(
    claimPackage.encryptedAmountB64,
    'encryptedAmountB64',
    1
  );

  const validLengths = [
    PUBLIC_INPUTS_LEN_V5,
    PUBLIC_INPUTS_LEN_V4,
    PUBLIC_INPUTS_LEN_V2,
    PUBLIC_INPUTS_LEN_V3,
  ];
  if (!validLengths.includes(publicInputsBytes.length)) {
    throw new Error(
      `ClaimPackage validation failed: publicInputsB64 decoded to ${publicInputsBytes.length} bytes (expected ${PUBLIC_INPUTS_LEN_V5} for V5, ${PUBLIC_INPUTS_LEN_V2} for V2, or ${PUBLIC_INPUTS_LEN_V3} for V3)`
    );
  }

  return {
    orgId: hexToBytes(claimPackage.orgIdHex),
    payrunId: hexToBytes(claimPackage.payrunIdHex),
    nullifierHash: hexToBytes(claimPackage.nullifierHex),
    payoutPubkeyHash: claimPackage.payoutPubkeyHashHex
      ? hexToBytes(claimPackage.payoutPubkeyHashHex)
      : new Uint8Array(32),
    salaryCommitment: hexToBytes(claimPackage.salaryCommitmentHex),
    ciphertextHash: hexToBytes(claimPackage.ciphertextHashHex),
    proofBytes,
    publicInputsBytes,
    encryptedAmount,
  };
}

/**
 * Optional Inco allowance accounts for confidential transfers.
 * These are needed to allow the claimer to decrypt their new balance.
 */
export interface IncoAllowanceAccounts {
  treasuryAllowancePda: PublicKey;
  treasuryOwnerAddress: PublicKey;
  claimerAllowancePda: PublicKey;
  claimerOwnerAddress: PublicKey;
}

export function buildClaimInstruction(
  claimPackage: ClaimPackageV2,
  accounts: ClaimAccounts,
  claimer: PublicKey,
  programId: PublicKey = ZURPAY_PROGRAM_ID,
  incoAllowanceAccounts?: IncoAllowanceAccounts,
  schemaVersion: number = 5
): TransactionInstruction {
  const validated = validateClaimPackage(claimPackage);
  const {
    orgId,
    payrunId,
    nullifierHash,
    payoutPubkeyHash,
    salaryCommitment,
    ciphertextHash,
    proofBytes,
    publicInputsBytes,
    encryptedAmount,
  } = validated;

  const nullifierPda = deriveNullifierPda(orgId, payrunId, nullifierHash, programId);

  const discriminator = Buffer.from([62, 198, 214, 193, 213, 159, 108, 210]);

  const encodeU32LE = (value: number): Buffer => {
    const buf = Buffer.alloc(4);
    buf.writeUInt32LE(value, 0);
    return buf;
  };

  console.log('=== SDK BUILD CLAIM INSTRUCTION ===');
  console.log('nullifierHash:', Buffer.from(nullifierHash).toString('hex'));
  console.log('payoutPubkeyHash:', Buffer.from(payoutPubkeyHash).toString('hex'));
  console.log('salaryCommitment:', Buffer.from(salaryCommitment).toString('hex'));
  console.log('ciphertextHash:', Buffer.from(ciphertextHash).toString('hex'));
  console.log('proofBytes.length:', proofBytes.length);
  console.log('publicInputsBytes.length:', publicInputsBytes.length);
  console.log('publicInputsBytes (hex):', Buffer.from(publicInputsBytes).toString('hex'));
  console.log('encryptedAmount.length:', encryptedAmount.length);
  console.log('schemaVersion:', schemaVersion);

  const data = Buffer.concat([
    discriminator,
    Buffer.from(nullifierHash),
    Buffer.from(payoutPubkeyHash),
    Buffer.from(salaryCommitment),
    Buffer.from(ciphertextHash),
    encodeU32LE(proofBytes.length),
    Buffer.from(proofBytes),
    encodeU32LE(publicInputsBytes.length),
    Buffer.from(publicInputsBytes),
    encodeU32LE(encryptedAmount.length),
    Buffer.from(encryptedAmount),
    Buffer.from([schemaVersion]),
  ]);

  const keys = [
    { pubkey: claimer, isSigner: true, isWritable: true },
    { pubkey: accounts.org, isSigner: false, isWritable: false },
    { pubkey: accounts.payrun, isSigner: false, isWritable: true },
    { pubkey: nullifierPda, isSigner: false, isWritable: true },
    { pubkey: accounts.zkVerifierProgram, isSigner: false, isWritable: false },
    { pubkey: accounts.incoProgram, isSigner: false, isWritable: false },
    { pubkey: accounts.treasury, isSigner: false, isWritable: true },
    { pubkey: accounts.claimerConfAccount, isSigner: false, isWritable: true },
    {
      pubkey: new PublicKey('11111111111111111111111111111111'),
      isSigner: false,
      isWritable: false,
    },
  ];

  if (incoAllowanceAccounts) {
    keys.push(
      { pubkey: incoAllowanceAccounts.treasuryAllowancePda, isSigner: false, isWritable: true },
      { pubkey: incoAllowanceAccounts.treasuryOwnerAddress, isSigner: false, isWritable: false },
      { pubkey: incoAllowanceAccounts.claimerAllowancePda, isSigner: false, isWritable: true },
      { pubkey: incoAllowanceAccounts.claimerOwnerAddress, isSigner: false, isWritable: false }
    );
  }

  return new TransactionInstruction({
    programId,
    keys,
    data,
  });
}

/**
 * Verify that the connected wallet matches the payout pubkey hash in the claim package.
 * Returns true if the wallet can claim this package.
 */
export function verifyClaimerMatch(
  claimerConfAccountPubkey: PublicKey,
  claimPackage: ClaimPackageV2
): boolean {
  const computedHash = sha256(claimerConfAccountPubkey.toBytes());
  const expectedHash = hexToBytes(claimPackage.payoutPubkeyHashHex);

  // Compare arrays
  if (computedHash.length !== expectedHash.length) {
    return false;
  }
  for (let i = 0; i < computedHash.length; i++) {
    if (computedHash[i] !== expectedHash[i]) {
      return false;
    }
  }
  return true;
}

/**
 * High-level function to submit a claim from a ClaimPackageV2.
 *
 * @param connection - Solana connection
 * @param wallet - Connected wallet adapter (must have signTransaction)
 * @param claimPackage - The claim package from payroll-builder
 * @param accounts - Account addresses needed for the claim
 * @param programId - Optional program ID override
 * @returns Transaction signature
 */
export async function submitClaimFromPackage(
  connection: Connection,
  wallet: {
    publicKey: PublicKey;
    signTransaction: (tx: Transaction) => Promise<Transaction>;
  },
  claimPackage: ClaimPackageV2,
  accounts: ClaimAccounts,
  programId: PublicKey = ZURPAY_PROGRAM_ID,
  incoAllowanceAccounts?: IncoAllowanceAccounts,
  schemaVersion: number = 5
): Promise<string> {
  if (claimPackage.payoutPubkeyHashHex) {
    if (!verifyClaimerMatch(accounts.claimerConfAccount, claimPackage)) {
      throw new Error(
        'Claimer confidential account does not match payout_pubkey_hash. This claim is not for your account.'
      );
    }
  }

  const instruction = buildClaimInstruction(
    claimPackage,
    accounts,
    wallet.publicKey,
    programId,
    incoAllowanceAccounts,
    schemaVersion
  );

  const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
    units: 600_000,
  });

  const transaction = new Transaction().add(computeBudgetIx).add(instruction);

  const sendWithRetry = async (maxRetries = 3): Promise<string> => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = wallet.publicKey;

      try {
        transaction.compileMessage();
      } catch (compileError) {
        console.error('Transaction compile error:', compileError);
        console.error(
          'Instruction keys:',
          instruction.keys.map((k, i) => ({
            index: i,
            pubkey: k.pubkey.toBase58(),
            isSigner: k.isSigner,
            isWritable: k.isWritable,
          }))
        );
        console.error('Instruction data length:', instruction.data.length);
        throw new Error(
          `Transaction compilation failed: ${compileError instanceof Error ? compileError.message : String(compileError)}`
        );
      }

      const signedTx = await wallet.signTransaction(transaction);

      try {
        const signature = await connection.sendRawTransaction(signedTx.serialize(), {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        });

        await connection.confirmTransaction(
          {
            signature,
            blockhash,
            lastValidBlockHeight,
          },
          'confirmed'
        );

        return signature;
      } catch (sendError) {
        const errorMsg = sendError instanceof Error ? sendError.message : String(sendError);
        const isBlockhashError =
          errorMsg.includes('Blockhash not found') || errorMsg.includes('block height exceeded');

        if (isBlockhashError && attempt < maxRetries) {
          console.warn(`Blockhash expired, retrying (attempt ${attempt + 1}/${maxRetries})...`);
          continue;
        }
        throw sendError;
      }
    }
    throw new Error('Max retries exceeded');
  };

  return sendWithRetry();
}

export function deriveClaimPdas(
  orgIdHex: string,
  payrunIdHex: string,
  claimerWallet: PublicKey,
  programId: PublicKey = ZURPAY_PROGRAM_ID
): {
  org: PublicKey;
  payrun: PublicKey;
  treasury: PublicKey;
  employeeConf: PublicKey;
} {
  const orgId = hexToBytes(orgIdHex);
  const payrunId = hexToBytes(payrunIdHex);

  const [orgPda] = PublicKey.findProgramAddressSync([PDA_SEEDS.ORG, orgId], programId);

  const [payrunPda] = PublicKey.findProgramAddressSync(
    [PDA_SEEDS.PAYRUN, orgId, payrunId],
    programId
  );

  const [treasury] = PublicKey.findProgramAddressSync([PDA_SEEDS.TREASURY, orgId], programId);

  const [employeeConf] = PublicKey.findProgramAddressSync(
    [PDA_SEEDS.EMPLOYEE_CONF, orgId, claimerWallet.toBuffer()],
    programId
  );

  return {
    org: orgPda,
    payrun: payrunPda,
    treasury,
    employeeConf,
  };
}

export function deriveIncoAllowancePda(
  handle: bigint,
  allowedAddress: PublicKey,
  incoProgramId: PublicKey = DEFAULT_INCO_PROGRAM_ID
): PublicKey {
  const handleBuffer = Buffer.alloc(16);
  let h = handle;
  for (let i = 0; i < 16; i++) {
    handleBuffer[i] = Number(h & BigInt(0xff));
    h = h >> BigInt(8);
  }
  const [pda] = PublicKey.findProgramAddressSync(
    [handleBuffer, allowedAddress.toBuffer()],
    incoProgramId
  );
  return pda;
}
