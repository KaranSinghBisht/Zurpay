import { Router } from 'express';
import { getClaimPackageByToken, getTokenStatus, markTokenUsed } from '../payrun-builder';
import { verifyClaimTransaction } from '../claim-verifier';
import { prisma } from '../db';
import { hashToken, decryptSecret } from '../crypto';
import { getProver } from '../prover';
import { createHash } from 'crypto';
import { PublicKey } from '@solana/web3.js';

const router = Router();

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

router.post('/:token/generate-proof', async (req, res) => {
  try {
    const { token } = req.params;
    const { walletAddress, employeeConfAccountAddress } = req.body;

    if (!walletAddress || !employeeConfAccountAddress) {
      return res.status(400).json({
        error: 'walletAddress and employeeConfAccountAddress are required',
      });
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
      return res.status(404).json({ error: 'Claim not found' });
    }

    if (claimToken.usedAt) {
      return res.status(410).json({ error: 'Claim already used' });
    }

    if (claimToken.expiresAt < new Date()) {
      return res.status(410).json({ error: 'Claim expired' });
    }

    if (
      !claimToken.employeeSecretEnc ||
      !claimToken.merklePathJson ||
      !claimToken.pathIndicesJson
    ) {
      return res.status(500).json({ error: 'Missing proof generation data' });
    }

    const employeeSecret = decryptSecret(claimToken.employeeSecretEnc);
    const merklePath: string[] = JSON.parse(claimToken.merklePathJson);
    const pathIndices: boolean[] = JSON.parse(claimToken.pathIndicesJson);

    const payrun = claimToken.payslip?.payrun;
    const org = payrun?.org;

    if (!payrun || !org) {
      return res.status(404).json({ error: 'Payrun or org not found' });
    }

    let employeeConfAccount: PublicKey;
    try {
      employeeConfAccount = new PublicKey(employeeConfAccountAddress);
    } catch {
      return res.status(400).json({ error: 'Invalid employeeConfAccountAddress' });
    }

    const payoutPubkeyHash = sha256(employeeConfAccount.toBytes());

    if (!payrun.merkleRootHex) {
      return res.status(500).json({ error: 'Payrun merkleRootHex is missing' });
    }
    if (!claimToken.salaryCommitmentHex) {
      return res.status(500).json({ error: 'ClaimToken salaryCommitmentHex is missing' });
    }
    if (!claimToken.ciphertextHashHex) {
      return res.status(500).json({ error: 'ClaimToken ciphertextHashHex is missing' });
    }
    if (!claimToken.encryptedAmountB64) {
      return res.status(500).json({ error: 'ClaimToken encryptedAmountB64 is missing' });
    }

    const orgId = hexToBytes(org.orgIdHex);
    const payrunId = hexToBytes(payrun.payrunIdHex);
    const merkleRoot = hexToBytes(payrun.merkleRootHex);
    const salaryCommitment = hexToBytes(claimToken.salaryCommitmentHex);
    const ciphertextHash = hexToBytes(claimToken.ciphertextHashHex);

    // Compute nullifier: sha256(sha256(orgId || payrunId) || employeeSecret)
    const domainSepInput = new Uint8Array(64);
    domainSepInput.set(orgId, 0);
    domainSepInput.set(payrunId, 32);
    const domainSep = sha256(domainSepInput);

    const nullifierInput = new Uint8Array(64);
    nullifierInput.set(domainSep, 0);
    nullifierInput.set(employeeSecret, 32);
    const nullifier = sha256(nullifierInput);

    const prover = getProver();

    const witnessInputs = {
      merkle_root: Array.from(merkleRoot),
      nullifier: Array.from(nullifier),
      payout_pubkey_hash: Array.from(payoutPubkeyHash),
      org_id: Array.from(orgId),
      salary_commitment: Array.from(salaryCommitment),
      ciphertext_hash: Array.from(ciphertextHash),
      employee_secret: Array.from(employeeSecret),
      payrun_id: Array.from(payrunId),
      merkle_path: merklePath.map((p) => Array.from(hexToBytes(p))),
      path_indices: pathIndices,
      payout_pubkey: Array.from(employeeConfAccount.toBytes()),
    };

    const { proofBytes, publicInputsBytes } = await prover.proveClaimV2(witnessInputs);

    // Format public inputs with header for on-chain verifier
    // Header: 3 x u32 LE (num_inputs=1, reserved=0, field_size=1)
    const header = Buffer.alloc(12);
    header.writeUInt32LE(1, 0);
    header.writeUInt32LE(0, 4);
    header.writeUInt32LE(1, 8);

    const publicInputsWithHeader = Buffer.concat([header, Buffer.from(publicInputsBytes)]);

    const claimPackage = {
      orgIdHex: org.orgIdHex,
      payrunIdHex: payrun.payrunIdHex,
      merkleRootHex: payrun.merkleRootHex,
      nullifierHex: bytesToHex(nullifier),
      payoutPubkeyHashHex: bytesToHex(payoutPubkeyHash),
      salaryCommitmentHex: claimToken.salaryCommitmentHex,
      ciphertextHashHex: claimToken.ciphertextHashHex,
      proofB64: Buffer.from(proofBytes).toString('base64'),
      publicInputsB64: publicInputsWithHeader.toString('base64'),
      encryptedAmountB64: claimToken.encryptedAmountB64,
      claimerConfAccount: employeeConfAccountAddress,
      zkVerifierProgramId: org.zkVerifierProgramId,
      incoProgramId: org.incoProgramId,
      schemaVersion: 5,
    };

    return res.json(claimPackage);
  } catch (error) {
    console.error('Generate proof error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: `Failed to generate proof: ${message}` });
  }
});

router.get('/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const claimPackage = await getClaimPackageByToken(token);

    if (claimPackage) {
      return res.json(claimPackage);
    }

    const status = await getTokenStatus(token);

    if (!status.exists) {
      return res.status(404).json({ error: 'Claim not found' });
    }

    if (status.used) {
      return res.status(410).json({ error: 'Claim already used' });
    }

    if (status.expired) {
      return res.status(410).json({ error: 'Claim expired' });
    }

    return res.status(404).json({ error: 'Claim not found' });
  } catch (error) {
    console.error('Get claim package error:', error);
    return res.status(500).json({ error: 'Failed to get claim package' });
  }
});

router.post('/:token/mark-used', async (req, res) => {
  try {
    const { token } = req.params;
    const { txSignature } = req.body;

    if (!txSignature) {
      return res.status(400).json({ error: 'Missing txSignature' });
    }

    const claimPackage = await getClaimPackageByToken(token);
    if (!claimPackage) {
      const status = await getTokenStatus(token);
      if (!status.exists) {
        return res.status(404).json({ error: 'Claim not found' });
      }
      if (status.used) {
        return res.status(410).json({ error: 'Claim already used' });
      }
      if (status.expired) {
        return res.status(410).json({ error: 'Claim expired' });
      }
      return res.status(404).json({ error: 'Claim not found' });
    }

    const isValid = await verifyClaimTransaction(txSignature, claimPackage);
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid claim transaction' });
    }

    const success = await markTokenUsed(token);
    if (success) {
      return res.json({ success: true });
    }

    return res.status(404).json({ error: 'Token not found' });
  } catch (error) {
    console.error('Mark claim used error:', error);
    return res.status(500).json({ error: 'Failed to mark token used' });
  }
});

export default router;
