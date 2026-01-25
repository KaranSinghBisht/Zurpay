import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import pinoHttp from 'pino-http';
import {
  buildPayrunFromCsv,
  buildPayrunV2,
  getClaimPackageByToken,
  markTokenUsed,
  getTokenStatus,
} from './payrun-builder';
import { CreatePayrunRequestSchema, CreatePayrunRequestV2Schema } from './types';
import { prisma } from './db';
import logger from './logger';
import {
  saveLegacyPayrun,
  saveLegacyPayrunWithPackages,
  getLegacyPayrun,
  getLegacyPayrunsByOrg,
  getLegacyClaimPackage,
  getLegacyClaimPackagesForWallet,
} from './legacy-storage';

import orgsRouter from './routes/orgs';
import workersRouter from './routes/workers';
import payrunsRouter from './routes/payruns';
import exportsRouter from './routes/exports';
import paylinksRouter from './routes/paylinks';
import claimsRouter from './routes/claims';
import authRouter from './routes/auth';
import multisigRouter from './routes/multisig';
import approvalsRouter from './routes/approvals';
import schedulesRouter from './routes/schedules';
import payrunMultisigRouter from './routes/payrun-multisig';
import analyticsRouter from './routes/analytics';
import paymentRequestsRouter from './routes/payment-requests';
import { apiRateLimit, strictRateLimit } from './middleware/rateLimit';
import { startCleanupScheduler, stopCleanupScheduler } from './services/cleanup';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { verifyClaimTransaction } from './claim-verifier';

// =============================================================================
// SECURITY: Environment variable validation
// =============================================================================

const ENABLE_LEGACY_ENDPOINTS = process.env.ENABLE_LEGACY_ENDPOINTS === 'true';

if (ENABLE_LEGACY_ENDPOINTS) {
  const internalSecret = process.env.PAYROLL_BUILDER_INTERNAL_SECRET;
  if (!internalSecret) {
    console.error(
      'FATAL: PAYROLL_BUILDER_INTERNAL_SECRET is required when legacy endpoints are enabled'
    );
    process.exit(1);
  }
  if (internalSecret === 'demo-secret-change-me') {
    console.error('FATAL: PAYROLL_BUILDER_INTERNAL_SECRET cannot be the default insecure value');
    console.error('Please set a secure random value in your environment');
    process.exit(1);
  }
}

// Validate JWT secret
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is required for authentication');
  process.exit(1);
}

if (JWT_SECRET.length < 32) {
  console.error('FATAL: JWT_SECRET must be at least 32 characters long');
  process.exit(1);
}

if (!process.env.PAYROLL_ENCRYPTION_KEY) {
  console.error('FATAL: PAYROLL_ENCRYPTION_KEY environment variable is required');
  console.error('Generate a secure key with: openssl rand -hex 32');
  process.exit(1);
}

if (process.env.PAYROLL_ENCRYPTION_KEY === process.env.JWT_SECRET) {
  console.error('FATAL: PAYROLL_ENCRYPTION_KEY must be different from JWT_SECRET');
  console.error('Using the same key for signing and encryption is a security anti-pattern');
  process.exit(1);
}

if (process.env.PAYROLL_ENCRYPTION_KEY.length < 32) {
  console.error(
    'FATAL: PAYROLL_ENCRYPTION_KEY must be at least 32 characters (64 hex chars recommended)'
  );
  process.exit(1);
}

// =============================================================================
// SECURITY: CORS configuration
// =============================================================================

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : ['http://localhost:3000', 'http://localhost:3002']; // Default: local dev only

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, curl, etc.)
    if (!origin) {
      callback(null, true);
      return;
    }

    if (ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: Origin ${origin} not allowed`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-idempotency-key'],
  maxAge: 86400, // 24 hours - browsers cache preflight
};

const app = express();

app.set('trust proxy', process.env.TRUST_PROXY === 'true');
app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/health' } }));
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.text({ type: 'text/csv' }));

// Auth endpoints (no authentication required, but rate limited)
app.use('/api/auth', strictRateLimit, authRouter);

// Apply rate limiting to all API v1 endpoints
app.use('/api/v1', apiRateLimit);

// API v1 endpoints (require authentication)
app.use('/api/v1/orgs', orgsRouter);
app.use('/api/v1/orgs', workersRouter);
app.use('/api/v1/orgs', payrunsRouter);
app.use('/api/v1/orgs', exportsRouter);
app.use('/api/v1/orgs', paylinksRouter);
app.use('/api/v1/orgs', multisigRouter);
app.use('/api/v1/orgs', approvalsRouter);
app.use('/api/v1/orgs', schedulesRouter);
app.use('/api/v1/orgs', payrunMultisigRouter);
app.use('/api/v1/orgs', analyticsRouter);
app.use('/api/v1/orgs', paymentRequestsRouter);
app.use('/api/v1', paylinksRouter);
app.use('/api/v1/claims', claimsRouter);

if (ENABLE_LEGACY_ENDPOINTS) {
  console.warn('WARNING: Legacy endpoints are enabled. These are deprecated and insecure.');
  console.warn('Set ENABLE_LEGACY_ENDPOINTS=false in production.');

  app.post('/api/payruns/create', async (req, res) => {
    try {
      const request = CreatePayrunRequestV2Schema.parse(req.body);

      const result = await buildPayrunV2(request);

      await saveLegacyPayrun({
        id: request.payrunIdHex,
        orgId: request.orgIdHex,
        merkleRoot: result.merkleRootHex,
        totalEmployees: result.totalEmployees,
        claimDeadline: request.claimDeadlineUnix,
        createdAt: Date.now(),
      });

      return res.json({
        merkleRootHex: result.merkleRootHex,
        totalEmployees: result.totalEmployees,
        claimLinks: result.claimLinks,
      });
    } catch (error) {
      console.error('Error creating payrun:', error);
      if (error instanceof Error) {
        return res.status(400).json({ error: error.message });
      }
      return res.status(500).json({ error: 'Failed to create payrun' });
    }
  });

  app.get('/api/claim/:token', async (req, res) => {
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
  });

  app.post('/api/claim/:token/mark-used', async (req, res) => {
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
  });

  app.post('/api/payruns', async (req, res) => {
    try {
      const params = CreatePayrunRequestSchema.parse(req.query);
      const csvData = req.body as string;

      if (!csvData || typeof csvData !== 'string') {
        return res.status(400).json({ error: 'CSV data required in request body' });
      }

      const { payrunRecord, claimPackages } = await buildPayrunFromCsv({
        orgId: params.orgId,
        payrunId: params.payrunId,
        csvData,
        claimDeadline: params.claimDeadline,
      });

      await saveLegacyPayrunWithPackages(payrunRecord, claimPackages);

      return res.json({
        payrunId: payrunRecord.id,
        merkleRoot: payrunRecord.merkleRoot,
        totalEmployees: payrunRecord.totalEmployees,
      });
    } catch (error) {
      console.error('Error creating payrun:', error);
      return res.status(500).json({ error: 'Failed to create payrun' });
    }
  });

  app.get('/api/payruns/:payrunId', async (req, res) => {
    const payrun = await getLegacyPayrun(req.params.payrunId);
    if (!payrun) {
      return res.status(404).json({ error: 'Payrun not found' });
    }
    return res.json(payrun);
  });

  app.get('/api/orgs/:orgId/payruns', async (req, res) => {
    try {
      const payruns = await getLegacyPayrunsByOrg(req.params.orgId);
      return res.json(payruns);
    } catch (error) {
      console.error('Error listing legacy payruns:', error);
      return res.status(500).json({ error: 'Failed to list payruns' });
    }
  });

  app.get('/api/claim-package', async (req, res) => {
    const { payrunId, wallet } = req.query;

    if (!payrunId || !wallet) {
      return res.status(400).json({ error: 'payrunId and wallet required' });
    }

    const pkg = await getLegacyClaimPackage(payrunId as string, wallet as string);
    if (!pkg) {
      return res.status(404).json({ error: 'Claim package not found' });
    }

    return res.json(pkg);
  });

  app.get('/api/wallets/:wallet/claims', async (req, res) => {
    const packages = await getLegacyClaimPackagesForWallet(req.params.wallet);
    return res.json(packages);
  });
}

app.get('/health', async (_, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', database: 'connected' });
  } catch {
    res.status(500).json({ status: 'error', database: 'disconnected' });
  }
});

app.use(notFoundHandler);
app.use(errorHandler);

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  logger.info(
    { port: PORT, legacyEndpoints: ENABLE_LEGACY_ENDPOINTS },
    'Payroll builder service started'
  );

  const CLEANUP_INTERVAL = parseInt(process.env.CLEANUP_INTERVAL_MS || '3600000', 10);
  startCleanupScheduler(CLEANUP_INTERVAL);
});

process.on('SIGTERM', async () => {
  stopCleanupScheduler();
  await prisma.$disconnect();
  process.exit(0);
});
