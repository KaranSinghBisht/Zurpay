import { createHash, randomBytes } from 'crypto';
import { MERKLE_TREE_DEPTH } from './constants';

export function sha256(data: Uint8Array): Uint8Array {
  return new Uint8Array(createHash('sha256').update(data).digest());
}

export function concat(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

/**
 * Compute leaf v2: sha256(payrun_id || employee_commitment || salary_commitment || ciphertext_hash || payout_pubkey_hash)
 */
export function computeLeafV2(
  payrunId: Uint8Array,
  employeeCommitment: Uint8Array,
  salaryCommitment: Uint8Array,
  ciphertextHash: Uint8Array,
  payoutPubkeyHash: Uint8Array
): Uint8Array {
  return sha256(
    concat(payrunId, employeeCommitment, salaryCommitment, ciphertextHash, payoutPubkeyHash)
  );
}

export function computeEmployeeCommitment(employeeSecret: Uint8Array): Uint8Array {
  return sha256(employeeSecret);
}

/**
 * Compute a blinded salary commitment to prevent brute-force recovery.
 *
 * SECURITY: Blinding is MANDATORY. Without blinding, salary amounts (typically 0-1M range)
 * can be trivially brute-forced from the commitment hash.
 *
 * @param amount - The salary amount as a bigint
 * @param blinding - 32-byte random blinding factor (REQUIRED)
 * @returns SHA256(blinding || amount) as 32 bytes
 * @throws Error if blinding is missing or invalid
 */
export function computeSalaryCommitment(amount: bigint, blinding: Uint8Array): Uint8Array {
  if (!blinding || blinding.length < 16) {
    throw new Error(
      'SECURITY: Blinding factor is required for salary commitments. ' +
        'Without blinding, salary amounts can be brute-forced from the commitment. ' +
        'Provide at least 16 bytes of random data (32 bytes recommended).'
    );
  }

  const amountBytes = new Uint8Array(32);
  let val = amount;
  for (let i = 31; i >= 0; i--) {
    amountBytes[i] = Number(val & 0xffn);
    val >>= 8n;
  }

  return sha256(concat(blinding, amountBytes));
}

/**
 * Generate a cryptographically secure random blinding factor.
 * Use this to generate blinding for computeSalaryCommitment().
 *
 * @returns 32 bytes of random data
 */
export function generateBlindingFactor(): Uint8Array {
  return new Uint8Array(randomBytes(32));
}

export function computeNullifier(
  orgId: Uint8Array,
  payrunId: Uint8Array,
  employeeSecret: Uint8Array
): Uint8Array {
  const domainSep = sha256(concat(orgId, payrunId));
  return sha256(concat(domainSep, employeeSecret));
}

export function hashNodes(left: Uint8Array, right: Uint8Array): Uint8Array {
  return sha256(concat(left, right));
}

export function computeCiphertextHash(encryptedAmount: Uint8Array): Uint8Array {
  return sha256(encryptedAmount);
}

export const EMPTY_LEAF = sha256(new Uint8Array(32));

export class MerkleTree {
  private leaves: Uint8Array[];
  private layers: Uint8Array[][];
  public readonly depth: number;

  constructor(leaves: Uint8Array[], depth: number = MERKLE_TREE_DEPTH) {
    this.depth = depth;
    const maxLeaves = 2 ** depth;

    if (leaves.length > maxLeaves) {
      throw new Error(`Too many leaves: ${leaves.length} > ${maxLeaves}`);
    }

    this.leaves = [...leaves];
    while (this.leaves.length < maxLeaves) {
      this.leaves.push(EMPTY_LEAF);
    }

    this.layers = this.buildTree();
  }

  private buildTree(): Uint8Array[][] {
    const layers: Uint8Array[][] = [this.leaves];

    let currentLayer = this.leaves;
    while (currentLayer.length > 1) {
      const nextLayer: Uint8Array[] = [];
      for (let i = 0; i < currentLayer.length; i += 2) {
        nextLayer.push(hashNodes(currentLayer[i], currentLayer[i + 1]));
      }
      layers.push(nextLayer);
      currentLayer = nextLayer;
    }

    return layers;
  }

  get root(): Uint8Array {
    return this.layers[this.layers.length - 1][0];
  }

  getProof(leafIndex: number): { path: Uint8Array[]; indices: boolean[] } {
    if (leafIndex < 0 || leafIndex >= this.leaves.length) {
      throw new Error(`Invalid leaf index: ${leafIndex}`);
    }

    const path: Uint8Array[] = [];
    const indices: boolean[] = [];

    let currentIndex = leafIndex;
    for (let i = 0; i < this.depth; i++) {
      const isRight = currentIndex % 2 === 1;
      const siblingIndex = isRight ? currentIndex - 1 : currentIndex + 1;

      path.push(this.layers[i][siblingIndex]);
      indices.push(isRight);

      currentIndex = Math.floor(currentIndex / 2);
    }

    return { path, indices };
  }

  static verify(
    root: Uint8Array,
    leaf: Uint8Array,
    path: Uint8Array[],
    indices: boolean[]
  ): boolean {
    let current = leaf;

    for (let i = 0; i < path.length; i++) {
      current = indices[i] ? hashNodes(path[i], current) : hashNodes(current, path[i]);
    }

    return Buffer.from(current).equals(Buffer.from(root));
  }
}
