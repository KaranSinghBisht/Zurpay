import { NextRequest, NextResponse } from 'next/server';
import { createHash, randomBytes } from 'crypto';
import { spawn } from 'child_process';
import { writeFileSync, readFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import bs58 from 'bs58';
import { prisma, MemberRole } from '@/lib/db';
import { requireAuth, requireOrgAccess } from '@/lib/auth';
import { encryptAmountForInco, hashToken } from '@/lib/crypto';
import type { ClaimPackageV2 } from '@zurpay/sdk';

const MERKLE_DEPTH = 20;
const SUNSPOT_BIN = process.env.SUNSPOT_BIN || '/Users/kryptos/sunspot/go/sunspot';
const CIRCUIT_DIR =
  process.env.CIRCUIT_DIR || join(process.cwd(), '../../circuits/claim_eligibility');

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

interface WitnessInputs {
  merkle_root: number[];
  nullifier: number[];
  payout_pubkey_hash: number[];
  org_id: number[];
  salary_commitment: number[];
  ciphertext_hash: number[];
  employee_secret: number[];
  payrun_id: number[];
  merkle_path: number[][];
  path_indices: boolean[];
  payout_pubkey: number[];
}

function computePublicInputsHash(inputs: WitnessInputs): Uint8Array {
  const combined = Buffer.concat([
    Buffer.from(inputs.merkle_root),
    Buffer.from(inputs.nullifier),
    Buffer.from(inputs.payout_pubkey_hash),
    Buffer.from(inputs.org_id),
    Buffer.from(inputs.salary_commitment),
    Buffer.from(inputs.ciphertext_hash),
  ]);
  return sha256(combined);
}

function formatByteArray(arr: number[]): string {
  return '[' + arr.map((b) => `"${b}"`).join(', ') + ']';
}

function format2DByteArray(arr: number[][]): string {
  return '[' + arr.map((row) => formatByteArray(row)).join(', ') + ']';
}

function formatBoolArray(arr: boolean[]): string {
  return '[' + arr.map((b) => `"${b ? 1 : 0}"`).join(', ') + ']';
}

function formatProverToml(inputs: WitnessInputs): string {
  const publicInputsHash = Array.from(computePublicInputsHash(inputs));
  const lines: string[] = [];

  lines.push(`public_inputs_hash = ${formatByteArray(publicInputsHash)}`);
  lines.push(`merkle_root = ${formatByteArray(inputs.merkle_root)}`);
  lines.push(`nullifier = ${formatByteArray(inputs.nullifier)}`);
  lines.push(`payout_pubkey_hash = ${formatByteArray(inputs.payout_pubkey_hash)}`);
  lines.push(`org_id = ${formatByteArray(inputs.org_id)}`);
  lines.push(`salary_commitment = ${formatByteArray(inputs.salary_commitment)}`);
  lines.push(`ciphertext_hash = ${formatByteArray(inputs.ciphertext_hash)}`);
  lines.push(`employee_secret = ${formatByteArray(inputs.employee_secret)}`);
  lines.push(`payrun_id = ${formatByteArray(inputs.payrun_id)}`);
  lines.push(`payout_pubkey = ${formatByteArray(inputs.payout_pubkey)}`);
  lines.push(`merkle_path = ${format2DByteArray(inputs.merkle_path)}`);
  lines.push(`path_indices = ${formatBoolArray(inputs.path_indices)}`);

  return lines.join('\n');
}

function runCommand(
  bin: string,
  args: string[],
  cwd: string
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`${bin} exited with code ${code}: ${stderr || stdout}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to run ${bin}: ${err.message}`));
    });
  });
}

async function generateRealProof(
  inputs: WitnessInputs,
  sessionId: string
): Promise<{ proofB64: string; publicInputsB64: string }> {
  const proverTomlPath = join(CIRCUIT_DIR, 'Prover.toml');
  const acirPath = join(CIRCUIT_DIR, 'target', 'claim_eligibility.json');
  const ccsPath = join(CIRCUIT_DIR, 'target', 'claim_eligibility.ccs');
  const pkPath = join(CIRCUIT_DIR, 'target', 'claim_eligibility.pk');
  const witnessPath = join(CIRCUIT_DIR, 'target', `claim_eligibility_${sessionId}.gz`);
  const publicWitnessPath = join(CIRCUIT_DIR, 'target', 'claim_eligibility.pw');

  if (!existsSync(pkPath)) {
    throw new Error(`Proving key not found at ${pkPath}. Run 'sunspot setup' first.`);
  }

  const proverTomlBackup = existsSync(proverTomlPath)
    ? readFileSync(proverTomlPath, 'utf-8')
    : null;

  try {
    const proverToml = formatProverToml(inputs);
    writeFileSync(proverTomlPath, proverToml);

    console.log(`[Prover] Generating witness for session ${sessionId}...`);
    await runCommand(
      'nargo',
      ['execute', '--package', 'claim_eligibility', `claim_eligibility_${sessionId}`],
      CIRCUIT_DIR
    );

    console.log(`[Prover] Generating proof for session ${sessionId}...`);
    await runCommand(SUNSPOT_BIN, ['prove', acirPath, witnessPath, ccsPath, pkPath], CIRCUIT_DIR);

    const proofPath = join(CIRCUIT_DIR, 'target', 'claim_eligibility.proof');
    const proofBytes = readFileSync(proofPath);

    // Read the .pw (public witness) file that Sunspot generates
    // This contains the correctly formatted public inputs for the verifier:
    // - 12-byte header (nr_public, nr_private, vec_len)
    // - 32 field elements × 32 bytes each = 1024 bytes
    // Total: 1036 bytes
    const publicWitnessBytes = readFileSync(publicWitnessPath);
    console.log(`[Prover] Public witness size: ${publicWitnessBytes.length} bytes`);

    return {
      proofB64: proofBytes.toString('base64'),
      publicInputsB64: publicWitnessBytes.toString('base64'),
    };
  } finally {
    if (proverTomlBackup !== null) {
      writeFileSync(proverTomlPath, proverTomlBackup);
    }
    try {
      if (existsSync(witnessPath)) unlinkSync(witnessPath);
    } catch {}
  }
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
      employeeSecret: Uint8Array;
      nullifier: Uint8Array;
      salaryCommitment: Uint8Array;
      ciphertextHash: Uint8Array;
      payoutPubkeyHash: Uint8Array;
      payoutPubkey: string;
      encryptedAmount: Uint8Array;
      employeeCommitment: Uint8Array;
    }> = [];

    for (const payslip of payrun.payslips) {
      const employeeSecret = randomBytes(32);
      const employeeCommitment = sha256(employeeSecret);

      const amount = BigInt(payslip.amount);
      const encryptedAmount = encryptAmountForInco(amount);
      const ciphertextHash = sha256(encryptedAmount);

      const amountBytes = new Uint8Array(32);
      let val = amount;
      for (let i = 31; i >= 0; i--) {
        amountBytes[i] = Number(val & 0xffn);
        val >>= 8n;
      }
      const salaryCommitment = sha256(amountBytes);

      const payoutPubkey = payslip.worker.claimerConfAccount || payslip.worker.wallet;
      const payoutPubkeyBytes = bs58.decode(payoutPubkey);
      const payoutPubkeyHash = sha256(payoutPubkeyBytes);

      const domainSep = sha256(new Uint8Array([...orgIdBytes, ...payrunIdBytes]));
      const nullifier = sha256(new Uint8Array([...domainSep, ...employeeSecret]));

      const leafPreimage = new Uint8Array(160);
      leafPreimage.set(payrunIdBytes, 0);
      leafPreimage.set(employeeCommitment, 32);
      leafPreimage.set(salaryCommitment, 64);
      leafPreimage.set(ciphertextHash, 96);
      leafPreimage.set(payoutPubkeyHash, 128);
      const leaf = sha256(leafPreimage);

      leaves.push(leaf);
      payslipData.push({
        payslipId: payslip.id,
        employeeSecret,
        nullifier,
        salaryCommitment,
        ciphertextHash,
        payoutPubkeyHash,
        payoutPubkey,
        encryptedAmount,
        employeeCommitment,
      });
    }

    const { root, paths, indices } = buildMerkleTree(leaves);
    const merkleRootHex = bytesToHex(root);

    const claimLinks: { token: string; urlPath: string; claimerConfAccount: string }[] = [];

    for (let i = 0; i < payslipData.length; i++) {
      const data = payslipData[i];
      const merklePath = paths[i];
      const pathIndices = indices[i];

      const sessionId = randomBytes(8).toString('hex');
      const witnessInputs: WitnessInputs = {
        merkle_root: Array.from(root),
        nullifier: Array.from(data.nullifier),
        payout_pubkey_hash: Array.from(data.payoutPubkeyHash),
        org_id: Array.from(orgIdBytes),
        salary_commitment: Array.from(data.salaryCommitment),
        ciphertext_hash: Array.from(data.ciphertextHash),
        employee_secret: Array.from(data.employeeSecret),
        payrun_id: Array.from(payrunIdBytes),
        merkle_path: merklePath.map((p) => Array.from(p)),
        path_indices: pathIndices,
        payout_pubkey: Array.from(bs58.decode(data.payoutPubkey)),
      };

      console.log(
        `[Validate] Generating real ZK proof for payslip ${i + 1}/${payslipData.length}...`
      );
      const { proofB64, publicInputsB64 } = await generateRealProof(witnessInputs, sessionId);
      console.log(`[Validate] Proof generated for payslip ${i + 1}/${payslipData.length}`);

      const claimPackage: ClaimPackageV2 = {
        version: 'v3',
        orgIdHex: payrun.org.orgIdHex,
        payrunIdHex: payrun.payrunIdHex,
        claimerConfAccount: data.payoutPubkey,
        treasuryConfAccount: payrun.org.treasuryConfAccount,
        zkVerifierProgramId: payrun.org.zkVerifierProgramId,
        incoProgramId: payrun.org.incoProgramId,
        proofB64,
        publicInputsB64,
        encryptedAmountB64: Buffer.from(data.encryptedAmount).toString('base64'),
        payoutPubkeyHashHex: bytesToHex(data.payoutPubkeyHash),
        ciphertextHashHex: bytesToHex(data.ciphertextHash),
        nullifierHex: bytesToHex(data.nullifier),
        salaryCommitmentHex: bytesToHex(data.salaryCommitment),
        merkleRootHex,
      };

      const token = randomBytes(32).toString('hex');
      const tokenHashHex = hashToken(token);

      claimLinks.push({
        token,
        urlPath: `/paylinks/${data.payslipId}?token=${token}`,
        claimerConfAccount: data.payoutPubkey,
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

      await prisma.claimToken.create({
        data: {
          tokenHash: tokenHashHex,
          payrunId: payrun.id,
          payslipId: data.payslipId,
          expiresAt: payrun.claimDeadline || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          claimPackageJson: JSON.stringify(claimPackage),
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

    return NextResponse.json({
      merkleRootHex,
      claimLinks,
    });
  } catch (error) {
    console.error('Validate payrun error:', error);
    return NextResponse.json({ error: 'Failed to validate payrun' }, { status: 500 });
  }
}
