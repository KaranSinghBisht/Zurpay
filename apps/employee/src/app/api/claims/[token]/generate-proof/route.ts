import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { createHash, createDecipheriv } from 'crypto';
import { PublicKey } from '@solana/web3.js';
import { execSync } from 'child_process';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

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

    if (!payrun.merkleRootHex) {
      return NextResponse.json({ error: 'Payrun merkleRootHex is missing' }, { status: 500 });
    }
    if (!claimToken.salaryCommitmentHex) {
      return NextResponse.json(
        { error: 'ClaimToken salaryCommitmentHex is missing' },
        { status: 500 }
      );
    }
    if (!claimToken.ciphertextHashHex) {
      return NextResponse.json(
        { error: 'ClaimToken ciphertextHashHex is missing' },
        { status: 500 }
      );
    }
    if (!claimToken.encryptedAmountB64) {
      return NextResponse.json(
        { error: 'ClaimToken encryptedAmountB64 is missing' },
        { status: 500 }
      );
    }

    const orgId = hexToBytes(org.orgIdHex);
    const payrunId = hexToBytes(payrun.payrunIdHex);
    const merkleRoot = hexToBytes(payrun.merkleRootHex);
    const salaryCommitment = hexToBytes(claimToken.salaryCommitmentHex);
    const ciphertextHash = hexToBytes(claimToken.ciphertextHashHex);

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

      const publicInputsPreimage = new Uint8Array(160);
      publicInputsPreimage.set(merkleRoot, 0);
      publicInputsPreimage.set(nullifier, 32);
      publicInputsPreimage.set(payoutPubkeyHash, 64);
      publicInputsPreimage.set(orgId, 96);
      publicInputsPreimage.set(salaryCommitment, 128);
      const publicInputsHashBytes = sha256(publicInputsPreimage);

      let publicInputsHashField = BigInt(0);
      for (let i = 1; i < 32; i++) {
        publicInputsHashField =
          publicInputsHashField * BigInt(256) + BigInt(publicInputsHashBytes[i]);
      }
      const publicInputsHashHex = '0x' + publicInputsHashField.toString(16);

      const proverToml = `
public_inputs_hash = "${publicInputsHashHex}"
merkle_root = [${Array.from(merkleRoot).join(', ')}]
nullifier = [${Array.from(nullifier).join(', ')}]
payout_pubkey_hash = [${Array.from(payoutPubkeyHash).join(', ')}]
org_id = [${Array.from(orgId).join(', ')}]
salary_commitment = [${Array.from(salaryCommitment).join(', ')}]
ciphertext_hash = [${Array.from(ciphertextHash).join(', ')}]
employee_secret = [${Array.from(employeeSecret).join(', ')}]
payrun_id = [${Array.from(payrunId).join(', ')}]
payout_pubkey = [${Array.from(employeeConfAccount.toBytes()).join(', ')}]
merkle_path = [${merklePath.map((p) => `[${Array.from(hexToBytes(p)).join(', ')}]`).join(', ')}]
path_indices = [${pathIndices.map((i) => (i ? 'true' : 'false')).join(', ')}]
`;

      const proverTomlPath = join(circuitDir, 'Prover.toml');
      writeFileSync(proverTomlPath, proverToml);

      try {
        const sunspotBin = process.env.SUNSPOT_BIN || 'sunspot';
        const witnessName = `witness_${Date.now()}`;
        const witnessPath = join(circuitDir, 'target', `${witnessName}.gz`);

        execSync(`cd ${circuitDir} && nargo execute --prover-name Prover ${witnessName}`, {
          timeout: 120000,
          stdio: 'pipe',
        });

        // sunspot prove outputs to {ccs_basename}.proof and {ccs_basename}.pw
        const targetDir = join(circuitDir, 'target');
        const proofOutputPath = join(targetDir, 'claim_eligibility.proof');
        const publicOutputPath = join(targetDir, 'claim_eligibility.pw');

        execSync(
          `${sunspotBin} prove ${targetDir}/claim_eligibility.json ${witnessPath} ${targetDir}/claim_eligibility.ccs ${targetDir}/claim_eligibility.pk`,
          { timeout: 300000, stdio: 'pipe' }
        );

        const proofBytes = readFileSync(proofOutputPath);
        const publicInputsBytes = readFileSync(publicOutputPath);

        // Sunspot outputs Big Endian headers, but the on-chain verifier expects Little Endian
        // Convert the 12-byte header from BE to LE (3 x 4-byte u32 values)
        const fixedPublicInputs = Buffer.from(publicInputsBytes);
        for (let i = 0; i < 12; i += 4) {
          // Swap bytes: [0,1,2,3] -> [3,2,1,0]
          const b0 = fixedPublicInputs[i];
          const b1 = fixedPublicInputs[i + 1];
          const b2 = fixedPublicInputs[i + 2];
          const b3 = fixedPublicInputs[i + 3];
          fixedPublicInputs[i] = b3;
          fixedPublicInputs[i + 1] = b2;
          fixedPublicInputs[i + 2] = b1;
          fixedPublicInputs[i + 3] = b0;
        }

        proofB64 = proofBytes.toString('base64');
        publicInputsB64 = fixedPublicInputs.toString('base64');
      } catch (proverError) {
        console.error('Prover error:', proverError);
        return NextResponse.json(
          {
            error: 'Proof generation failed.',
            details: proverError instanceof Error ? proverError.message : 'Unknown error',
          },
          { status: 500 }
        );
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
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: `Failed to generate proof: ${message}` }, { status: 500 });
  }
}
