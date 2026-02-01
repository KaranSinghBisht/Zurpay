import { PublicKey } from '@solana/web3.js';

function getEnvOrDefault(envKey: string, defaultValue: string): string {
  if (typeof process !== 'undefined' && process.env) {
    const direct = process.env[envKey];
    if (direct) {
      return direct;
    }
    const nextPublic = process.env[`NEXT_PUBLIC_${envKey}`];
    if (nextPublic) {
      return nextPublic;
    }
    const vitePublic = process.env[`VITE_${envKey}`];
    if (vitePublic) {
      return vitePublic;
    }
  }
  return defaultValue;
}

export const ZURPAY_PROGRAM_ID_DEVNET = new PublicKey(
  getEnvOrDefault('ZURPAY_PROGRAM_ID_DEVNET', 'Cf9tReQuvS6cb4awYPCVozQnCWYdqia62yRShJs2URy9')
);
export const ZURPAY_PROGRAM_ID_MAINNET = new PublicKey(
  getEnvOrDefault('ZURPAY_PROGRAM_ID_MAINNET', '11111111111111111111111111111111')
);

export const ZURPAY_PROGRAM_ID = new PublicKey(
  getEnvOrDefault('ZURPAY_PROGRAM_ID', ZURPAY_PROGRAM_ID_DEVNET.toBase58())
);

export const DEFAULT_INCO_PROGRAM_ID = new PublicKey(
  getEnvOrDefault('INCO_PROGRAM_ID', '5sjEbPiqgZrYwR31ahR6Uk9wf5awoX61YGg7jExQSwaj')
);

export const DEFAULT_ZK_VERIFIER_PROGRAM_ID = new PublicKey(
  getEnvOrDefault('ZK_VERIFIER_PROGRAM_ID', 'DgwK4ZudX5Nf48Fqw72j1J7wijojhxomPJe5gtMgkKAT')
);

export const MERKLE_TREE_DEPTH = 20;

export const MAX_EMPLOYEES_PER_PAYRUN = 2 ** MERKLE_TREE_DEPTH;

export const PUBLIC_INPUTS_SCHEMA_VERSION = 5;
export const PUBLIC_INPUTS_LEN_V5 = 44;
export const PUBLIC_INPUTS_LEN_V4 = 44;
export const PUBLIC_INPUTS_LEN_V3 = 1036;
export const PUBLIC_INPUTS_LEN_V2 = 192;

export const PDA_SEEDS = {
  ORG: Buffer.from('org'),
  PAYRUN: Buffer.from('payrun'),
  NULLIFIER: Buffer.from('null'),
  TREASURY: Buffer.from('treasury'),
  EMPLOYEE_CONF: Buffer.from('employee_conf'),
  SCHEDULE: Buffer.from('schedule'),
} as const;

export const DOMAIN_SEPARATOR = Buffer.from('zurpay-v1');
