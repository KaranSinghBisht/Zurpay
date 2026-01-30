import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  Keypair,
  sendAndConfirmTransaction,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const VERIFIER_PROGRAM_ID = new PublicKey(
  process.env.VERIFIER_PROGRAM_ID || '8yseT439EGMSg2JnceSHo4AdxVoG8i7KdYovDRDeN5Gj'
);

async function main() {
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  const connection = new Connection(rpcUrl, 'confirmed');

  // Use SOLANA_KEYPAIR_PATH env var or default to ~/.config/solana/id.json
  const keypairPath =
    process.env.SOLANA_KEYPAIR_PATH || path.join(os.homedir(), '.config', 'solana', 'id.json');
  if (!fs.existsSync(keypairPath)) {
    console.error(`Keypair file not found at: ${keypairPath}`);
    console.error('Set SOLANA_KEYPAIR_PATH environment variable or ensure default keypair exists');
    process.exit(1);
  }
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
  const payer = Keypair.fromSecretKey(Uint8Array.from(keypairData));

  // Use paths relative to project root
  const circuitDir =
    process.env.CIRCUIT_DIR ||
    path.join(__dirname, '..', '..', 'circuits', 'claim_eligibility', 'target');
  const proofPath = path.join(circuitDir, 'claim_eligibility.proof');
  const witnessPath = path.join(circuitDir, 'claim_eligibility.pw');

  if (!fs.existsSync(proofPath) || !fs.existsSync(witnessPath)) {
    console.error('Proof or witness files not found. Run nargo compile and sunspot prove first.');
    console.error(`Expected: ${proofPath}`);
    console.error(`Expected: ${witnessPath}`);
    process.exit(1);
  }

  const proofBytes = fs.readFileSync(proofPath);
  const publicWitness = fs.readFileSync(witnessPath);

  console.log('Proof size:', proofBytes.length);
  console.log('Public witness size:', publicWitness.length);

  // Verifier expects: proof_bytes || public_witness_bytes (concatenated directly, no length prefixes)
  const instructionData = Buffer.concat([proofBytes, publicWitness]);
  console.log('Instruction data size:', instructionData.length);

  const verifyIx = new TransactionInstruction({
    programId: VERIFIER_PROGRAM_ID,
    keys: [],
    data: instructionData,
  });

  const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 });

  const tx = new Transaction().add(computeBudgetIx, verifyIx);

  console.log('Sending verification transaction...');

  try {
    const sig = await sendAndConfirmTransaction(connection, tx, [payer], {
      skipPreflight: false,
      commitment: 'confirmed',
    });
    console.log('✅ Verification successful!');
    console.log('Transaction:', sig);
    console.log('Explorer: https://explorer.solana.com/tx/' + sig + '?cluster=devnet');
  } catch (err: any) {
    console.error('❌ Verification failed:', err.message);
    if (err.logs) {
      console.log('Logs:', err.logs);
    }
  }
}

main().catch(console.error);
