import { spawn, execSync } from 'child_process';
import { writeFileSync, mkdirSync, existsSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { randomBytes, createHash } from 'crypto';

export interface WitnessInputs {
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

export interface ProofResult {
  proofBytes: Uint8Array;
  publicInputsBytes: Uint8Array;
}

export interface Prover {
  proveClaimV2(inputs: WitnessInputs): Promise<ProofResult>;
}

export class SunspotCliProver implements Prover {
  private sunspotBin: string;
  private nargoBin: string;
  private circuitDir: string;
  private cacheDir: string;

  constructor(circuitDir?: string) {
    this.sunspotBin = process.env.SUNSPOT_BIN || '/Users/kryptos/sunspot/go/sunspot';
    this.nargoBin = process.env.NARGO_BIN || 'nargo';
    this.circuitDir = circuitDir || join(process.cwd(), '../../circuits/claim_eligibility');
    this.cacheDir = join(process.cwd(), '.cache/sunspot');

    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  async proveClaimV2(inputs: WitnessInputs): Promise<ProofResult> {
    const sessionId = randomBytes(8).toString('hex');
    const proverTomlPath = join(this.circuitDir, 'Prover.toml');
    const witnessPath = join(this.circuitDir, 'target', `claim_eligibility_${sessionId}.gz`);
    const proofPath = join(this.cacheDir, `proof_${sessionId}.proof`);
    const pwPath = join(this.cacheDir, `proof_${sessionId}.pw`);

    const acirPath = join(this.circuitDir, 'target', 'claim_eligibility.json');
    const ccsPath = join(this.circuitDir, 'target', 'claim_eligibility.ccs');
    const pkPath = join(this.circuitDir, 'target', 'claim_eligibility.pk');

    if (!existsSync(pkPath)) {
      throw new Error(`Proving key not found at ${pkPath}. Run 'sunspot setup' first.`);
    }

    const proverTomlBackup = existsSync(proverTomlPath)
      ? readFileSync(proverTomlPath, 'utf-8')
      : null;

    try {
      const proverToml = this.formatProverToml(inputs);
      writeFileSync(proverTomlPath, proverToml);

      await this.runCommand(
        this.nargoBin,
        ['execute', '--package', 'claim_eligibility', `claim_eligibility_${sessionId}`],
        this.circuitDir
      );

      await this.runCommand(
        this.sunspotBin,
        ['prove', acirPath, witnessPath, ccsPath, pkPath],
        this.circuitDir
      );

      const defaultProofPath = join(this.circuitDir, 'target', 'claim_eligibility.proof');
      const defaultPwPath = join(this.circuitDir, 'target', 'claim_eligibility.pw');

      const proofBytes = new Uint8Array(readFileSync(defaultProofPath));
      const publicWitnessBytes = new Uint8Array(readFileSync(defaultPwPath));

      const publicInputsBytes = this.extractPublicInputs(publicWitnessBytes, inputs);

      return { proofBytes, publicInputsBytes };
    } finally {
      if (proverTomlBackup !== null) {
        writeFileSync(proverTomlPath, proverTomlBackup);
      }
      this.cleanup(witnessPath, proofPath, pwPath);
    }
  }

  private computePublicInputsHash(inputs: WitnessInputs): number[] {
    // Compute sha256(merkle_root || nullifier || payout_pubkey_hash || org_id || salary_commitment || ciphertext_hash)
    const combined = Buffer.concat([
      Buffer.from(inputs.merkle_root),
      Buffer.from(inputs.nullifier),
      Buffer.from(inputs.payout_pubkey_hash),
      Buffer.from(inputs.org_id),
      Buffer.from(inputs.salary_commitment),
      Buffer.from(inputs.ciphertext_hash),
    ]);
    const hash = createHash('sha256').update(combined).digest();
    return Array.from(hash);
  }

  private formatProverToml(inputs: WitnessInputs): string {
    const lines: string[] = [];

    // Compute and add public_inputs_hash (the only public input in v3)
    const publicInputsHash = this.computePublicInputsHash(inputs);
    lines.push(`public_inputs_hash = ${this.formatByteArray(publicInputsHash)}`);

    // All former public inputs are now private
    lines.push(`merkle_root = ${this.formatByteArray(inputs.merkle_root)}`);
    lines.push(`nullifier = ${this.formatByteArray(inputs.nullifier)}`);
    lines.push(`payout_pubkey_hash = ${this.formatByteArray(inputs.payout_pubkey_hash)}`);
    lines.push(`org_id = ${this.formatByteArray(inputs.org_id)}`);
    lines.push(`salary_commitment = ${this.formatByteArray(inputs.salary_commitment)}`);
    lines.push(`ciphertext_hash = ${this.formatByteArray(inputs.ciphertext_hash)}`);
    lines.push(`employee_secret = ${this.formatByteArray(inputs.employee_secret)}`);
    lines.push(`payrun_id = ${this.formatByteArray(inputs.payrun_id)}`);
    lines.push(`payout_pubkey = ${this.formatByteArray(inputs.payout_pubkey)}`);
    lines.push(`merkle_path = ${this.format2DByteArray(inputs.merkle_path)}`);
    lines.push(`path_indices = ${this.formatBoolArray(inputs.path_indices)}`);

    return lines.join('\n');
  }

  private formatByteArray(arr: number[]): string {
    return '[' + arr.map((b) => `"${b}"`).join(', ') + ']';
  }

  private format2DByteArray(arr: number[][]): string {
    return '[' + arr.map((row) => this.formatByteArray(row)).join(', ') + ']';
  }

  private formatBoolArray(arr: boolean[]): string {
    return '[' + arr.map((b) => `"${b}"`).join(', ') + ']';
  }

  private extractPublicInputs(publicWitness: Uint8Array, inputs: WitnessInputs): Uint8Array {
    const publicInputsHash = this.computePublicInputsHash(inputs);
    return new Uint8Array(publicInputsHash);
  }

  private runCommand(bin: string, args: string[], cwd: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn(bin, args, {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

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
          resolve();
        } else {
          reject(new Error(`${bin} exited with code ${code}: ${stderr || stdout}`));
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`Failed to run ${bin}: ${err.message}`));
      });
    });
  }

  private cleanup(...paths: string[]): void {
    for (const p of paths) {
      try {
        if (existsSync(p)) {
          unlinkSync(p);
        }
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

export class MockProver implements Prover {
  async proveClaimV2(inputs: WitnessInputs): Promise<ProofResult> {
    await new Promise((r) => setTimeout(r, 100));

    const proofBytes = new Uint8Array(256);
    for (let i = 0; i < proofBytes.length; i++) {
      proofBytes[i] = (i * 7 + 13) % 256;
    }

    const publicInputsHash = this.computePublicInputsHash(inputs);
    const publicInputsBytes = new Uint8Array(publicInputsHash);

    return { proofBytes, publicInputsBytes };
  }

  private computePublicInputsHash(inputs: WitnessInputs): number[] {
    const combined = Buffer.concat([
      Buffer.from(inputs.merkle_root),
      Buffer.from(inputs.nullifier),
      Buffer.from(inputs.payout_pubkey_hash),
      Buffer.from(inputs.org_id),
      Buffer.from(inputs.salary_commitment),
      Buffer.from(inputs.ciphertext_hash),
    ]);
    const hash = createHash('sha256').update(combined).digest();
    return Array.from(hash);
  }
}

export function getProver(): Prover {
  const useMock = process.env.USE_MOCK_PROVER === 'true';
  const sunspotBin = process.env.SUNSPOT_BIN || '/Users/kryptos/sunspot/go/sunspot';
  const pkPath = join(
    process.cwd(),
    '../../circuits/claim_eligibility/target/claim_eligibility.pk'
  );

  if (useMock || !existsSync(sunspotBin) || !existsSync(pkPath)) {
    console.log('[Prover] Using MockProver');
    return new MockProver();
  }

  console.log('[Prover] Using SunspotCliProver');
  return new SunspotCliProver();
}
