import { NextRequest, NextResponse } from 'next/server';
import { createHash, randomBytes, createCipheriv } from 'crypto';
import { prisma, MemberRole } from '@/lib/db';
import { requireAuth, requireOrgAccess } from '@/lib/auth';
import { encryptAmountForInco, hashToken } from '@/lib/crypto';
import { sendClaimEmail } from '@/lib/email';

const MERKLE_DEPTH = 20;

function sha256(data: Uint8Array): Uint8Array {
  return new Uint8Array(createHash('sha256').update(data).digest());
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function getEncryptionKey(): string {
  const key = process.env.PAYROLL_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('PAYROLL_ENCRYPTION_KEY environment variable is required');
  }
  if (key.length < 32) {
    throw new Error('PAYROLL_ENCRYPTION_KEY must be at least 32 characters');
  }
  return key;
}

function encryptSecret(secret: Uint8Array): string {
  const iv = randomBytes(16);
  const encryptionKey = getEncryptionKey();
  const key = Buffer.from(encryptionKey.slice(0, 32).padEnd(32, '0'));
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(Buffer.from(secret)), cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function buildMerkleTree(leaves: Uint8Array[]): {
  root: Uint8Array;
  paths: Uint8Array[][];
  indices: boolean[][];
} {
  if (leaves.length === 0) {
    return { root: new Uint8Array(32), paths: [], indices: [] };
  }

  const size = Math.pow(2, MERKLE_DEPTH);
  const paddedLeaves = [...leaves];
  while (paddedLeaves.length < size) {
    paddedLeaves.push(new Uint8Array(32));
  }

  let currentLevel = paddedLeaves;
  const layers: Uint8Array[][] = [currentLevel];

  while (currentLevel.length > 1) {
    const nextLevel: Uint8Array[] = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      const combined = new Uint8Array(64);
      combined.set(currentLevel[i], 0);
      combined.set(currentLevel[i + 1], 32);
      nextLevel.push(sha256(combined));
    }
    layers.push(nextLevel);
    currentLevel = nextLevel;
  }

  const root = currentLevel[0];
  const paths: Uint8Array[][] = [];
  const indices: boolean[][] = [];

  for (let leafIdx = 0; leafIdx < leaves.length; leafIdx++) {
    const path: Uint8Array[] = [];
    const indexPath: boolean[] = [];
    let idx = leafIdx;

    for (let level = 0; level < MERKLE_DEPTH; level++) {
      const isRight = idx % 2 === 1;
      const siblingIdx = isRight ? idx - 1 : idx + 1;
      path.push(layers[level][siblingIdx]);
      indexPath.push(isRight);
      idx = Math.floor(idx / 2);
    }

    paths.push(path);
    indices.push(indexPath);
  }

  return { root, paths, indices };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string; payrunId: string }> }
) {
  const { orgId, payrunId } = await params;
  const authResult = await requireAuth(request);
  if (authResult instanceof Response) return authResult;
  const { wallet } = authResult;

  const accessResult = await requireOrgAccess(wallet, orgId, [MemberRole.OWNER, MemberRole.ADMIN]);
  if (accessResult instanceof Response) return accessResult;

  try {
    const payrun = await prisma.payrun.findUnique({
      where: { id: payrunId },
      include: {
        org: true,
        payslips: {
          include: {
            worker: true,
          },
        },
      },
    });

    if (!payrun || payrun.orgId !== orgId) {
      return NextResponse.json({ error: 'Payrun not found' }, { status: 404 });
    }

    if (payrun.status !== 'DRAFT') {
      return NextResponse.json({ error: 'Payrun already validated' }, { status: 400 });
    }

    const orgIdBytes = hexToBytes(payrun.org.orgIdHex);
    const payrunIdBytes = hexToBytes(payrun.payrunIdHex);

    const leaves: Uint8Array[] = [];
    const payslipData: Array<{
      payslipId: string;
      workerEmail: string | null;
      employeeSecret: Uint8Array;
      nullifier: Uint8Array;
      salaryCommitment: Uint8Array;
      ciphertextHash: Uint8Array;
      encryptedAmount: Uint8Array;
      employeeCommitment: Uint8Array;
      leafIndex: number;
    }> = [];

    for (let i = 0; i < payrun.payslips.length; i++) {
      const payslip = payrun.payslips[i];
      const employeeSecret = randomBytes(32);
      const employeeCommitment = sha256(employeeSecret);

      const amount = BigInt(payslip.amount);
      const encryptedAmount = await encryptAmountForInco(amount);
      const ciphertextHash = sha256(encryptedAmount);

      const amountBytes = new Uint8Array(32);
      let val = amount;
      for (let j = 31; j >= 0; j--) {
        amountBytes[j] = Number(val & 0xffn);
        val >>= 8n;
      }
      const salaryCommitment = sha256(amountBytes);

      const domainSep = sha256(new Uint8Array([...orgIdBytes, ...payrunIdBytes]));
      const nullifier = sha256(new Uint8Array([...domainSep, ...employeeSecret]));

      const leafPreimage = new Uint8Array(128);
      leafPreimage.set(payrunIdBytes, 0);
      leafPreimage.set(employeeCommitment, 32);
      leafPreimage.set(salaryCommitment, 64);
      leafPreimage.set(ciphertextHash, 96);
      const leaf = sha256(leafPreimage);

      leaves.push(leaf);
      payslipData.push({
        payslipId: payslip.id,
        workerEmail: payslip.worker.email,
        employeeSecret,
        nullifier,
        salaryCommitment,
        ciphertextHash,
        encryptedAmount,
        employeeCommitment,
        leafIndex: i,
      });
    }

    const { root, paths, indices } = buildMerkleTree(leaves);
    const merkleRootHex = bytesToHex(root);

    const claimLinks: { token: string; urlPath: string; email: string | null }[] = [];

    for (let i = 0; i < payslipData.length; i++) {
      const data = payslipData[i];
      const merklePath = paths[i];
      const pathIndices = indices[i];

      const token = randomBytes(32).toString('hex');
      const tokenHashHex = hashToken(token);

      claimLinks.push({
        token,
        urlPath: `/claims/${payrun.id}?token=${token}`,
        email: data.workerEmail,
      });

      await prisma.payslip.update({
        where: { id: data.payslipId },
        data: {
          employeeCommitmentHex: bytesToHex(data.employeeCommitment),
          salaryCommitmentHex: bytesToHex(data.salaryCommitment),
          ciphertextHashHex: bytesToHex(data.ciphertextHash),
          nullifierHex: bytesToHex(data.nullifier),
          encryptedAmountB64: Buffer.from(data.encryptedAmount).toString('base64'),
        },
      });

      // Store proof generation data for claim time
      await prisma.claimToken.create({
        data: {
          tokenHash: tokenHashHex,
          payrunId: payrun.id,
          payslipId: data.payslipId,
          expiresAt: payrun.claimDeadline || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          expectedEmail: data.workerEmail,
          employeeSecretEnc: encryptSecret(data.employeeSecret),
          merklePathJson: JSON.stringify(merklePath.map((p) => bytesToHex(p))),
          pathIndicesJson: JSON.stringify(pathIndices),
          leafIndex: data.leafIndex,
          salaryCommitmentHex: bytesToHex(data.salaryCommitment),
          ciphertextHashHex: bytesToHex(data.ciphertextHash),
          employeeCommitmentHex: bytesToHex(data.employeeCommitment),
          nullifierHex: bytesToHex(data.nullifier),
          encryptedAmountB64: Buffer.from(data.encryptedAmount).toString('base64'),
        },
      });
    }

    await prisma.payrun.update({
      where: { id: payrunId },
      data: {
        status: 'READY',
        merkleRootHex,
      },
    });

    const emailResults: { email: string; success: boolean; error?: string }[] = [];
    for (const link of claimLinks) {
      if (link.email) {
        try {
          const payslipData = payrun.payslips.find((p) => p.worker.email === link.email);
          await sendClaimEmail({
            to: link.email,
            orgName: payrun.org.name,
            claimToken: link.token,
            payrunId: payrun.id,
            amount: payslipData?.amount.toString(),
            currency: 'USDC',
          });
          emailResults.push({ email: link.email, success: true });
        } catch (error) {
          console.error(`Failed to send claim email to ${link.email}:`, error);
          emailResults.push({
            email: link.email,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    }

    return NextResponse.json({
      merkleRootHex,
      claimLinks,
      emailResults,
      message: 'Payrun validated. Proofs will be generated at claim time for privacy.',
    });
  } catch (error) {
    console.error('Validate payrun error:', error);
    return NextResponse.json({ error: 'Failed to validate payrun' }, { status: 500 });
  }
}
