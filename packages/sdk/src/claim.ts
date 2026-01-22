import { Connection, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import { ClaimPackageV2, ClaimAccounts } from './types';
import { hexToBytes, b64ToBytes, deriveNullifierPda } from './utils';
import { sha256 } from './merkle';
import { ZURPAY_PROGRAM_ID, PDA_SEEDS } from './constants';

/**
 * Build a claim instruction from a ClaimPackageV2.
 */
export function buildClaimInstruction(
    claimPackage: ClaimPackageV2,
    accounts: ClaimAccounts,
    claimer: PublicKey,
    programId: PublicKey = ZURPAY_PROGRAM_ID
): TransactionInstruction {
    const orgId = hexToBytes(claimPackage.orgIdHex);
    const payrunId = hexToBytes(claimPackage.payrunIdHex);
    const nullifierHash = hexToBytes(claimPackage.nullifierHex);
    const payoutPubkeyHash = hexToBytes(claimPackage.payoutPubkeyHashHex);
    const salaryCommitment = hexToBytes(claimPackage.salaryCommitmentHex);
    const ciphertextHash = hexToBytes(claimPackage.ciphertextHashHex);
    const proofBytes = b64ToBytes(claimPackage.proofB64);
    const publicInputsBytes = b64ToBytes(claimPackage.publicInputsB64);
    const encryptedAmount = b64ToBytes(claimPackage.encryptedAmountB64);

    // Derive nullifier PDA
    const nullifierPda = deriveNullifierPda(orgId, payrunId, nullifierHash, programId);

    // Anchor instruction discriminator for "claim"
    // This is the first 8 bytes of sha256("global:claim")
    const discriminator = Buffer.from([62, 198, 214, 193, 213, 159, 108, 210]);

    // Encode instruction data
    const data = Buffer.concat([
        discriminator,
        Buffer.from(nullifierHash),
        Buffer.from(payoutPubkeyHash),
        Buffer.from(salaryCommitment),
        Buffer.from(ciphertextHash),
        // proof_bytes as Vec<u8>: 4 bytes length + data
        Buffer.from(new Uint32Array([proofBytes.length]).buffer),
        Buffer.from(proofBytes),
        // public_inputs as Vec<u8>: 4 bytes length + data
        Buffer.from(new Uint32Array([publicInputsBytes.length]).buffer),
        Buffer.from(publicInputsBytes),
        // encrypted_amount as Vec<u8>: 4 bytes length + data
        Buffer.from(new Uint32Array([encryptedAmount.length]).buffer),
        Buffer.from(encryptedAmount),
    ]);

    return new TransactionInstruction({
        programId,
        keys: [
            { pubkey: claimer, isSigner: true, isWritable: true },
            { pubkey: accounts.org, isSigner: false, isWritable: false },
            { pubkey: accounts.payrun, isSigner: false, isWritable: true },
            { pubkey: nullifierPda, isSigner: false, isWritable: true },
            { pubkey: accounts.zkVerifierProgram, isSigner: false, isWritable: false },
            { pubkey: accounts.incoProgram, isSigner: false, isWritable: false },
            { pubkey: accounts.treasuryConfAccount, isSigner: false, isWritable: true },
            { pubkey: accounts.claimerConfAccount, isSigner: false, isWritable: true },
            { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false }, // System program
        ],
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
    programId: PublicKey = ZURPAY_PROGRAM_ID
): Promise<string> {
    // Verify claimer matches the payout pubkey hash
    if (!verifyClaimerMatch(accounts.claimerConfAccount, claimPackage)) {
        throw new Error(
            'Claimer confidential account does not match payout_pubkey_hash. This claim is not for your account.'
        );
    }

    // Build instruction
    const instruction = buildClaimInstruction(
        claimPackage,
        accounts,
        wallet.publicKey,
        programId
    );

    // Create transaction
    const transaction = new Transaction().add(instruction);
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = wallet.publicKey;

    // Sign transaction
    const signedTx = await wallet.signTransaction(transaction);

    // Submit transaction
    const signature = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
    });

    // Wait for confirmation
    await connection.confirmTransaction(
        {
            signature,
            blockhash,
            lastValidBlockHeight,
        },
        'confirmed'
    );

    return signature;
}

/**
 * Derive PDA addresses for a claim from org and payrun IDs.
 */
export function deriveClaimPdas(
    orgIdHex: string,
    payrunIdHex: string,
    programId: PublicKey = ZURPAY_PROGRAM_ID
): {
    org: PublicKey;
    payrun: PublicKey;
} {
    const orgId = hexToBytes(orgIdHex);
    const payrunId = hexToBytes(payrunIdHex);

    const [orgPda] = PublicKey.findProgramAddressSync(
        [PDA_SEEDS.ORG, orgId],
        programId
    );

    const [payrunPda] = PublicKey.findProgramAddressSync(
        [PDA_SEEDS.PAYRUN, orgId, payrunId],
        programId
    );

    return {
        org: orgPda,
        payrun: payrunPda,
    };
}
