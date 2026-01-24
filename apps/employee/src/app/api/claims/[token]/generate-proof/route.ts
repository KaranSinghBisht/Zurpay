import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { createHash, createDecipheriv } from 'crypto';
import { PublicKey } from '@solana/web3.js';
import { execSync } from 'child_process';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const ENCRYPTION_KEY = process.env.PAYROLL_ENCRYPTION_KEY || 'change-me-please-use-32-chars-or';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function sha256(data: Uint8Array): Uint8Array {
  return new Uint8Array(createHash('sha256').update(data).digest());
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
  }
  return bytes;
}

function decryptSecret(encryptedData: string): Uint8Array {
  const [ivHex, encryptedHex] = encryptedData.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const key = Buffer.from(ENCRYPTION_KEY.slice(0, 32).padEnd(32, '0'));
  const decipher = createDecipheriv('aes-256-cbc', key, iv);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return new Uint8Array(decrypted);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  try {
    const body = await request.json();
    const { walletAddress, employeeConfAccountAddress } = body;

    if (!walletAddress || !employeeConfAccountAddress) {
      return NextResponse.json(
        { error: 'walletAddress and employeeConfAccountAddress are required' },
        { status: 400 }
      );
    }

    const tokenHash = hashToken(token);

    const claimToken = await prisma.claimToken.findUnique({
      where: { tokenHash },
      include: {
        payslip: {
          include: {
            payrun: {
              include: {
                org: true,
              },
            },
          },
        },
      },
    });

    if (!claimToken) {
      return NextResponse.json({ error: 'Claim not found' }, { status: 404 });
    }

    if (claimToken.usedAt) {
      return NextResponse.json({ error: 'Claim already used' }, { status: 410 });
    }

    if (claimToken.expiresAt < new Date()) {
      return NextResponse.json({ error: 'Claim expired' }, { status: 410 });
    }

    if (
      !claimToken.employeeSecretEnc ||
      !claimToken.merklePathJson ||
      !claimToken.pathIndicesJson
    ) {
      return NextResponse.json({ error: 'Missing proof generation data' }, { status: 500 });
    }

    if (claimToken.expectedEmail) {
      const session = await getServerSession(authOptions);
      if (!session?.user?.email) {
        return NextResponse.json(
          { error: 'Authentication required', requiresAuth: true },
          { status: 401 }
        );
      }
      if (session.user.email.toLowerCase() !== claimToken.expectedEmail.toLowerCase()) {
        return NextResponse.json(
          { error: 'Email mismatch. This claim is for a different email address.' },
          { status: 403 }
        );
      }
    }

    const employeeSecret = decryptSecret(claimToken.employeeSecretEnc);
    const merklePath: string[] = JSON.parse(claimToken.merklePathJson);
    const pathIndices: boolean[] = JSON.parse(claimToken.pathIndicesJson);

    const payrun = claimToken.payslip?.payrun;
    const org = payrun?.org;

    if (!payrun || !org) {
      return NextResponse.json({ error: 'Payrun or org not found' }, { status: 404 });
    }

    const employeeConfAccount = new PublicKey(employeeConfAccountAddress);
    const payoutPubkeyHash = sha256(employeeConfAccount.toBytes());

    const orgId = hexToBytes(org.orgIdHex);
    const payrunId = hexToBytes(payrun.payrunIdHex);
    const merkleRoot = hexToBytes(payrun.merkleRootHex!);
    const salaryCommitment = hexToBytes(claimToken.salaryCommitmentHex!);
    const ciphertextHash = hexToBytes(claimToken.ciphertextHashHex!);

    const domainSepInput = new Uint8Array(64);
    domainSepInput.set(orgId, 0);
    domainSepInput.set(payrunId, 32);
    const domainSep = sha256(domainSepInput);

    const nullifierInput = new Uint8Array(64);
    nullifierInput.set(domainSep, 0);
    nullifierInput.set(employeeSecret, 32);
    const nullifier = sha256(nullifierInput);

    const useMockProver = process.env.USE_MOCK_PROVER === 'true';

    let proofB64: string;
    let publicInputsB64: string;

    if (useMockProver) {
      const publicInputsPreimage = new Uint8Array(160);
      publicInputsPreimage.set(merkleRoot, 0);
      publicInputsPreimage.set(nullifier, 32);
      publicInputsPreimage.set(payoutPubkeyHash, 64);
      publicInputsPreimage.set(orgId, 96);
      publicInputsPreimage.set(salaryCommitment, 128);

      const publicInputsHash = sha256(publicInputsPreimage);
      const publicInputsField = new Uint8Array(32);
      publicInputsField[0] = 0;
      publicInputsField.set(publicInputsHash.slice(1, 32), 1);

      const header = Buffer.alloc(12);
      header.writeUInt32LE(1, 0);
      header.writeUInt32LE(0, 4);
      header.writeUInt32LE(1, 8);

      const publicInputsBytes = Buffer.concat([header, Buffer.from(publicInputsField)]);
      publicInputsB64 = publicInputsBytes.toString('base64');

      proofB64 = Buffer.alloc(192).toString('base64');
    } else {
      const circuitDir = join(process.cwd(), '..', '..', 'circuits', 'claim_eligibility');
      const tempDir = join(tmpdir(), `zurpay-proof-${Date.now()}`);

      if (!existsSync(tempDir)) {
        mkdirSync(tempDir, { recursive: true });
      }

      const proverToml = `
merkle_root = [${Array.from(merkleRoot).join(', ')}]
nullifier = [${Array.from(nullifier).join(', ')}]
payout_pubkey_hash = [${Array.from(payoutPubkeyHash).join(', ')}]
org_id = [${Array.from(orgId).join(', ')}]
salary_commitment = [${Array.from(salaryCommitment).join(', ')}]
ciphertext_hash = [${Array.from(ciphertextHash).join(', ')}]
employee_secret = [${Array.from(employeeSecret).join(', ')}]
payrun_id = [${Array.from(payrunId).join(', ')}]
merkle_path = [${merklePath.map((p) => `[${Array.from(hexToBytes(p)).join(', ')}]`).join(', ')}]
path_indices = [${pathIndices.map((i) => (i ? 'true' : 'false')).join(', ')}]

[public_inputs]
public_inputs_hash = "0x0"
`;

      const proverTomlPath = join(tempDir, 'Prover.toml');
      writeFileSync(proverTomlPath, proverToml);

      try {
        execSync(`cd ${circuitDir} && nargo prove --prover-toml ${proverTomlPath}`, {
          timeout: 120000,
        });

        const sunspotBin = process.env.SUNSPOT_BIN || 'sunspot';
        execSync(
          `${sunspotBin} prove ${circuitDir}/target/claim_eligibility.json ${proverTomlPath} ${tempDir}/proof.bin ${tempDir}/public.pw`,
          { timeout: 120000 }
        );

        const proofBytes = readFileSync(join(tempDir, 'proof.bin'));
        const publicInputsBytes = readFileSync(join(tempDir, 'public.pw'));

        proofB64 = proofBytes.toString('base64');
        publicInputsB64 = publicInputsBytes.toString('base64');
      } catch (proverError) {
        console.error('Prover error:', proverError);
        return NextResponse.json({ error: 'Proof generation failed' }, { status: 500 });
      }
    }

    const claimPackage = {
      orgIdHex: org.orgIdHex,
      payrunIdHex: payrun.payrunIdHex,
      merkleRootHex: payrun.merkleRootHex,
      nullifierHex: bytesToHex(nullifier),
      payoutPubkeyHashHex: bytesToHex(payoutPubkeyHash),
      salaryCommitmentHex: claimToken.salaryCommitmentHex,
      ciphertextHashHex: claimToken.ciphertextHashHex,
      proofB64,
      publicInputsB64,
      encryptedAmountB64: claimToken.encryptedAmountB64,
      claimerConfAccount: employeeConfAccountAddress,
      zkVerifierProgramId: org.zkVerifierProgramId,
      incoProgramId: org.incoProgramId,
      schemaVersion: 5,
    };

    return NextResponse.json(claimPackage);
  } catch (error) {
    console.error('Generate proof error:', error);
    return NextResponse.json({ error: 'Failed to generate proof' }, { status: 500 });
  }
}
