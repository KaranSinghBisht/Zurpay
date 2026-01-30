import { Connection, PublicKey } from '@solana/web3.js';

const ZURPAY_PROGRAM_ID = new PublicKey('Cf9tReQuvS6cb4awYPCVozQnCWYdqia62yRShJs2URy9');
const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

function deriveOrgPda(orgId: Uint8Array): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('org'), Buffer.from(orgId)],
    ZURPAY_PROGRAM_ID
  );
  return pda;
}

function deriveTreasuryPda(orgId: Uint8Array): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('treasury'), Buffer.from(orgId)],
    ZURPAY_PROGRAM_ID
  );
  return pda;
}

async function checkState(orgIdHex: string) {
  const orgId = Buffer.from(orgIdHex, 'hex');
  const orgPda = deriveOrgPda(orgId);
  const treasuryPda = deriveTreasuryPda(orgId);

  console.log('Org PDA:', orgPda.toBase58());
  console.log('Treasury PDA:', treasuryPda.toBase58());

  const [orgInfo, treasuryInfo] = await Promise.all([
    connection.getAccountInfo(orgPda),
    connection.getAccountInfo(treasuryPda),
  ]);

  console.log('Org exists on-chain:', !!orgInfo);
  console.log('Treasury exists on-chain:', !!treasuryInfo);
}

// Get orgIdHex from command line or use a test one
const orgIdHex = process.argv[2];
if (!orgIdHex) {
  console.log('Usage: npx tsx scripts/check-state.ts <orgIdHex>');
  console.log('Get orgIdHex from browser console or DB');
  process.exit(1);
}

checkState(orgIdHex).catch(console.error);
