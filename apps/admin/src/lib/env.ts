const requiredEnvVars = {
  NEXT_PUBLIC_PAYROLL_BUILDER_URL: process.env.NEXT_PUBLIC_PAYROLL_BUILDER_URL,
  NEXT_PUBLIC_SOLANA_RPC_URL: process.env.NEXT_PUBLIC_SOLANA_RPC_URL,
} as const;

type EnvKey = keyof typeof requiredEnvVars;

function validateEnv(): void {
  const missing: EnvKey[] = [];

  for (const [key, value] of Object.entries(requiredEnvVars)) {
    if (!value) {
      missing.push(key as EnvKey);
    }
  }

  if (missing.length > 0 && process.env.NODE_ENV === 'production') {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. ` +
        'Please check your .env.local file.'
    );
  }
}

validateEnv();

function getSolanaRpcUrl(): string {
  const heliusApiKey = process.env.NEXT_PUBLIC_HELIUS_API_KEY;
  if (heliusApiKey) {
    return `https://devnet.helius-rpc.com/?api-key=${heliusApiKey}`;
  }
  return process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
}

export const env = {
  PAYROLL_BUILDER_URL: process.env.NEXT_PUBLIC_PAYROLL_BUILDER_URL || 'http://localhost:3001',
  SOLANA_RPC_URL: getSolanaRpcUrl(),
  EMPLOYEE_APP_URL: process.env.NEXT_PUBLIC_EMPLOYEE_APP_URL || 'http://localhost:3002',
  HELIUS_API_KEY: process.env.NEXT_PUBLIC_HELIUS_API_KEY || '',
} as const;
