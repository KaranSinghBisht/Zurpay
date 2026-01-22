import { Connection, PublicKey, Transaction, TransactionInstruction, Keypair, sendAndConfirmTransaction, ComputeBudgetProgram } from '@solana/web3.js';
import * as fs from 'fs';

const VERIFIER_PROGRAM_ID = new PublicKey('8yseT439EGMSg2JnceSHo4AdxVoG8i7KdYovDRDeN5Gj');

async function main() {
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    
    const keypairData = JSON.parse(fs.readFileSync('/Users/kryptos/.config/solana/id.json', 'utf-8'));
    const payer = Keypair.fromSecretKey(Uint8Array.from(keypairData));
    
    const proofBytes = fs.readFileSync('/Users/kryptos/Desktop/Projects/solana-privacy-hack/Zurpay/circuits/claim_eligibility/target/claim_eligibility.proof');
    const publicWitness = fs.readFileSync('/Users/kryptos/Desktop/Projects/solana-privacy-hack/Zurpay/circuits/claim_eligibility/target/claim_eligibility.pw');
    
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
