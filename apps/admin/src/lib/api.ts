import { getAuthToken } from '../contexts/AuthContext';

// Use relative paths for API calls - works on Vercel
const API_BASE = '';

export interface ApiOptions {
  wallet?: string;
}

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isServerError(): boolean {
    return this.status >= 500;
  }
}

const ERROR_MESSAGES: Record<number, string> = {
  400: 'Invalid request. Please check your input.',
  401: 'Please sign in to continue.',
  403: 'You do not have permission to perform this action.',
  404: 'The requested resource was not found.',
  409: 'This resource already exists.',
  429: 'Too many requests. Please try again later.',
  500: 'Server error. Please try again later.',
  502: 'Service temporarily unavailable.',
  503: 'Service temporarily unavailable.',
};

function getUserFriendlyMessage(status: number, serverMessage?: string): string {
  if (serverMessage && serverMessage !== 'Request failed') {
    return serverMessage;
  }
  return ERROR_MESSAGES[status] || `Request failed (${status})`;
}

async function fetchApi<T>(path: string, options: RequestInit & ApiOptions = {}): Promise<T> {
  const { wallet, ...fetchOptions } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(fetchOptions.headers as Record<string, string>),
  };

  const token = getAuthToken();
  console.log('[fetchApi] Token retrieved:', token ? `${token.slice(0, 20)}...` : 'null');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...fetchOptions,
      headers,
    });
  } catch (err) {
    throw new ApiError(
      'Unable to connect to server. Please check your internet connection.',
      0,
      'NETWORK_ERROR'
    );
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = getUserFriendlyMessage(response.status, errorData.error);
    throw new ApiError(message, response.status, errorData.code);
  }

  return response.json();
}

export interface Org {
  id: string;
  orgIdHex: string;
  name: string;
  ownerWallet: string;
  treasuryConfAccount: string;
  zkVerifierProgramId: string;
  incoProgramId: string;
  settings: string | null;
  createdAt: string;
  role?: string;
  _count?: {
    workers: number;
    payruns: number;
  };
}

export interface OrgMember {
  id: string;
  wallet: string;
  role: 'OWNER' | 'ADMIN' | 'VIEWER' | 'AUDITOR';
  createdAt: string;
}

export interface Worker {
  id: string;
  orgId: string;
  wallet: string;
  claimerConfAccount: string | null;
  type: 'EMPLOYEE' | 'CONTRACTOR';
  status: 'ACTIVE' | 'INACTIVE';
  displayName: string | null;
  email: string | null;
  externalId: string | null;
  startDate: string | null;
  endDate: string | null;
  metadata: string | null;
  createdAt: string;
  compPlans?: CompPlan[];
  _count?: {
    payslips: number;
  };
}

export interface CompPlan {
  id: string;
  workerId: string;
  currency: string;
  schedule: 'MONTHLY' | 'BIWEEKLY' | 'WEEKLY' | 'AD_HOC';
  rateAmount: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  notes: string | null;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  orgId: string;
  actorWallet: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: string | null;
  createdAt: string;
}

export interface PayrunClaimInfo {
  payslipId: string;
  claimerConfAccount: string;
  hasActiveToken: boolean;
  expiresAt?: string;
}

export interface Payrun {
  id: string;
  orgId: string;
  payrunIdHex: string;
  periodStart: string | null;
  periodEnd: string | null;
  status:
    | 'DRAFT'
    | 'PENDING_APPROVAL'
    | 'READY'
    | 'FUNDING_REQUIRED'
    | 'EXECUTING'
    | 'ACTIVE_CLAIMS'
    | 'COMPLETED'
    | 'FAILED'
    | 'CLOSED';
  mode: 'BATCH' | 'CLAIMS';
  merkleRootHex: string | null;
  totalPayslips: number;
  paidCount: number;
  claimedCount: number;
  failedCount: number;
  totalAmount: string | null;
  paidAmount: string | null;
  claimDeadline: string | null;
  createdBy: string;
  executedBy: string | null;
  executedAt: string | null;
  closedAt: string | null;
  onChainTxSig: string | null;
  notes: string | null;
  createdAt: string;
  requiresApproval?: boolean;
  approvedBy?: string | null;
  approvedAt?: string | null;
  rejectedBy?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
  claimLinks?: PayrunClaimInfo[];
  _count?: {
    payslips: number;
  };
}

export interface Payslip {
  id: string;
  payrunId: string;
  workerId: string;
  amount: string;
  currency: string;
  status: 'PENDING' | 'PROCESSING' | 'PAID' | 'CLAIMED' | 'FAILED' | 'CANCELLED';
  payoutTxSig: string | null;
  paidAt: string | null;
  worker?: {
    id: string;
    wallet: string;
    displayName: string | null;
    type: string;
  };
}

export interface Paylink {
  id: string;
  orgId: string;
  amount: string;
  currency: string;
  recipientWallet: string | null;
  status: 'ACTIVE' | 'CLAIMED' | 'EXPIRED' | 'CANCELLED';
  expiresAt: string;
  claimedBy: string | null;
  claimedAt: string | null;
  payoutTxSig: string | null;
  memo: string | null;
  createdBy: string;
  createdAt: string;
  claimUrl?: string;
}

export interface OrgStats {
  payruns: {
    total: number;
    active: number;
    completed: number;
  };
  workers: {
    total: number;
    active: number;
  };
  claims: {
    pending: number;
    claimed: number;
    paid: number;
  };
  paylinks: {
    active: number;
    claimed: number;
    expired: number;
  };
  financials: {
    totalPaidAmount: string;
  };
  recentPayruns: Array<{
    id: string;
    payrunIdHex: string;
    status: string;
    totalPayslips: number;
    paidCount: number;
    claimedCount: number;
    totalAmount: string | null;
    createdAt: string;
  }>;
}

export interface MultisigProposal {
  id: string;
  orgId: string;
  transactionIndex: string;
  type: 'PAYRUN_EXECUTE' | 'TREASURY_TRANSFER' | 'CONFIG_CHANGE';
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXECUTED' | 'CANCELLED';
  payrunId: string | null;
  title: string;
  description: string | null;
  approvals: string[];
  rejections: string[];
  proposedBy: string;
  proposedAt: string;
  executedBy: string | null;
  executedAt: string | null;
  txSignature: string | null;
  createdAt: string;
}

export interface ApprovalRequest {
  id: string;
  payrunId: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedBy: string;
  requestedAt: string;
  respondedBy: string | null;
  respondedAt: string | null;
  comments: string | null;
  createdAt: string;
}

export interface ApprovalRequestWithPayrun extends ApprovalRequest {
  payrun: {
    id: string;
    payrunIdHex: string;
    periodStart: string | null;
    periodEnd: string | null;
    totalPayslips: number;
    totalAmount: string | null;
    status: string;
    createdBy: string;
  };
}

export interface RecurringSchedule {
  id: string;
  orgId: string;
  name: string;
  frequency: 'WEEKLY' | 'BIWEEKLY' | 'SEMIMONTHLY' | 'MONTHLY';
  status: 'ACTIVE' | 'PAUSED' | 'CANCELLED';
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  secondDayOfMonth: number | null;
  workerIds: string[];
  autoApprove: boolean;
  requiresApproval: boolean;
  claimDeadlineDays: number;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastPayrunId: string | null;
  createdBy: string;
  createdAt: string;
}

export const api = {
  orgs: {
    list: (wallet: string) => fetchApi<Org[]>('/api/v1/orgs', { wallet }),

    get: (orgId: string, wallet: string) =>
      fetchApi<Org & { members: OrgMember[] }>(`/api/v1/orgs/${orgId}`, { wallet }),

    create: (
      data: {
        orgIdHex: string;
        name: string;
        treasuryConfAccount: string;
        zkVerifierProgramId: string;
        incoProgramId: string;
      },
      wallet: string
    ) =>
      fetchApi<Org>('/api/v1/orgs', {
        method: 'POST',
        body: JSON.stringify(data),
        wallet,
      }),

    update: (orgId: string, data: { name?: string }, wallet: string) =>
      fetchApi<Org>(`/api/v1/orgs/${orgId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
        wallet,
      }),

    addMember: (orgId: string, data: { wallet: string; role: string }, wallet: string) =>
      fetchApi<OrgMember>(`/api/v1/orgs/${orgId}/members`, {
        method: 'POST',
        body: JSON.stringify(data),
        wallet,
      }),

    removeMember: (orgId: string, memberId: string, wallet: string) =>
      fetchApi<void>(`/api/v1/orgs/${orgId}/members/${memberId}`, {
        method: 'DELETE',
        wallet,
      }),

    getStats: (orgId: string, wallet: string) =>
      fetchApi<OrgStats>(`/api/v1/orgs/${orgId}/stats`, { wallet }),
  },

  workers: {
    list: (orgId: string, wallet: string, params?: { status?: string; type?: string }) => {
      const query = new URLSearchParams(params as Record<string, string>).toString();
      return fetchApi<Worker[]>(`/api/v1/orgs/${orgId}/workers${query ? `?${query}` : ''}`, {
        wallet,
      });
    },

    get: (orgId: string, workerId: string, wallet: string) =>
      fetchApi<Worker>(`/api/v1/orgs/${orgId}/workers/${workerId}`, { wallet }),

    create: (
      orgId: string,
      data: {
        wallet: string;
        claimerConfAccount?: string;
        type?: 'EMPLOYEE' | 'CONTRACTOR';
        displayName?: string;
        email?: string;
        externalId?: string;
        startDate?: string;
      },
      wallet: string
    ) =>
      fetchApi<Worker>(`/api/v1/orgs/${orgId}/workers`, {
        method: 'POST',
        body: JSON.stringify(data),
        wallet,
      }),

    update: (orgId: string, workerId: string, data: Partial<Worker>, wallet: string) =>
      fetchApi<Worker>(`/api/v1/orgs/${orgId}/workers/${workerId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
        wallet,
      }),

    createCompPlan: (
      orgId: string,
      workerId: string,
      data: {
        currency?: string;
        schedule?: string;
        rateAmount: string;
        effectiveFrom?: string;
        notes?: string;
      },
      wallet: string
    ) =>
      fetchApi<CompPlan>(`/api/v1/orgs/${orgId}/workers/${workerId}/comp-plans`, {
        method: 'POST',
        body: JSON.stringify(data),
        wallet,
      }),
  },

  auditLogs: {
    list: (
      orgId: string,
      wallet: string,
      params?: { limit?: number; offset?: number; action?: string }
    ) => {
      const query = new URLSearchParams(params as Record<string, string>).toString();
      return fetchApi<AuditLog[]>(`/api/v1/orgs/${orgId}/audit-logs${query ? `?${query}` : ''}`, {
        wallet,
      });
    },
  },

  payruns: {
    list: (
      orgId: string,
      wallet: string,
      params?: { status?: string; limit?: number; offset?: number }
    ) => {
      const query = new URLSearchParams(params as Record<string, string>).toString();
      return fetchApi<Payrun[]>(`/api/v1/orgs/${orgId}/payruns${query ? `?${query}` : ''}`, {
        wallet,
      });
    },

    get: (orgId: string, payrunId: string, wallet: string) =>
      fetchApi<Payrun & { payslips: Payslip[] }>(`/api/v1/orgs/${orgId}/payruns/${payrunId}`, {
        wallet,
      }),

    create: (
      orgId: string,
      data: {
        periodStart?: string;
        periodEnd?: string;
        mode?: 'BATCH' | 'CLAIMS';
        claimDeadline?: string;
        workerIds?: string[];
        notes?: string;
      },
      wallet: string
    ) =>
      fetchApi<{
        payrunId: string;
        payrunIdHex: string;
        totalPayslips: number;
        totalAmount: string;
      }>(`/api/v1/orgs/${orgId}/payruns`, {
        method: 'POST',
        body: JSON.stringify(data),
        wallet,
      }),

    validate: (orgId: string, payrunId: string, wallet: string) =>
      fetchApi<{
        merkleRootHex: string;
        claimLinks?: { token: string; urlPath: string; claimerConfAccount: string }[];
      }>(`/api/v1/orgs/${orgId}/payruns/${payrunId}/validate`, {
        method: 'POST',
        wallet,
      }),

    execute: (orgId: string, payrunId: string, idempotencyKey: string, wallet: string) =>
      fetchApi<{ status: string; paidCount: number; failedCount: number }>(
        `/api/v1/orgs/${orgId}/payruns/${payrunId}/execute`,
        {
          method: 'POST',
          body: JSON.stringify({ idempotencyKey }),
          wallet,
        }
      ),

    openClaims: (orgId: string, payrunId: string, wallet: string) =>
      fetchApi<{ success: boolean }>(`/api/v1/orgs/${orgId}/payruns/${payrunId}/open-claims`, {
        method: 'POST',
        wallet,
      }),

    setOnChain: (orgId: string, payrunId: string, txSignature: string, wallet: string) =>
      fetchApi<{ success: boolean }>(`/api/v1/orgs/${orgId}/payruns/${payrunId}/set-onchain`, {
        method: 'POST',
        body: JSON.stringify({ txSignature }),
        wallet,
      }),

    close: (orgId: string, payrunId: string, wallet: string) =>
      fetchApi<{ success: boolean }>(`/api/v1/orgs/${orgId}/payruns/${payrunId}/close`, {
        method: 'POST',
        wallet,
      }),

    cancel: (orgId: string, payrunId: string, wallet: string) =>
      fetchApi<{ success: boolean }>(`/api/v1/orgs/${orgId}/payruns/${payrunId}/cancel`, {
        method: 'POST',
        wallet,
      }),
  },

  paylinks: {
    list: (
      orgId: string,
      wallet: string,
      params?: { status?: string; limit?: number; offset?: number }
    ) => {
      const query = new URLSearchParams(params as Record<string, string>).toString();
      return fetchApi<Paylink[]>(`/api/v1/orgs/${orgId}/paylinks${query ? `?${query}` : ''}`, {
        wallet,
      });
    },

    get: (orgId: string, paylinkId: string, wallet: string) =>
      fetchApi<Paylink>(`/api/v1/orgs/${orgId}/paylinks/${paylinkId}`, { wallet }),

    create: (
      orgId: string,
      data: {
        amount: string;
        currency?: string;
        recipientWallet?: string;
        recipientEmail?: string;
        recipientName?: string;
        expiresAt: string;
        memo?: string;
        sendEmail?: boolean;
      },
      wallet: string
    ) =>
      fetchApi<Paylink & { emailSent?: boolean }>(`/api/v1/orgs/${orgId}/paylinks`, {
        method: 'POST',
        body: JSON.stringify(data),
        wallet,
      }),

    cancel: (orgId: string, paylinkId: string, wallet: string) =>
      fetchApi<{ success: boolean }>(`/api/v1/orgs/${orgId}/paylinks/${paylinkId}/cancel`, {
        method: 'POST',
        wallet,
      }),

    sendEmail: (
      orgId: string,
      paylinkId: string,
      data: { email: string; recipientName?: string },
      wallet: string
    ) =>
      fetchApi<{ success: boolean; message: string }>(
        `/api/v1/orgs/${orgId}/paylinks/${paylinkId}/send-email`,
        {
          method: 'POST',
          body: JSON.stringify(data),
          wallet,
        }
      ),
  },

  exports: {
    downloadCsv: (orgId: string, payrunId: string, wallet: string) =>
      `${API_BASE}/api/v1/orgs/${orgId}/payruns/${payrunId}/export.csv?wallet=${wallet}`,

    downloadAuditPack: (orgId: string, payrunId: string, wallet: string) =>
      `${API_BASE}/api/v1/orgs/${orgId}/payruns/${payrunId}/audit-pack.json?wallet=${wallet}`,
  },

  multisig: {
    get: (orgId: string, wallet: string) =>
      fetchApi<{
        enabled: boolean;
        configured: boolean;
        multisigPda?: string;
        vaultPda?: string;
        threshold?: number;
        onChainState?: {
          threshold: number;
          transactionIndex: string;
          members: Array<{ key: string; permissions: number }>;
        };
      }>(`/api/v1/orgs/${orgId}/multisig`, { wallet }),

    prepare: (
      orgId: string,
      data: {
        members: Array<{ wallet: string; permissions: 'all' | 'vote' | 'initiate' | 'execute' }>;
        threshold: number;
      },
      wallet: string
    ) =>
      fetchApi<{
        createKey: string;
        multisigPda: string;
        vaultPda: string;
        threshold: number;
        members: Array<{ wallet: string; permissions: string }>;
        instruction: {
          programId: string;
          keys: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>;
          data: string;
        };
      }>(`/api/v1/orgs/${orgId}/multisig/prepare`, {
        method: 'POST',
        body: JSON.stringify(data),
        wallet,
      }),

    confirm: (
      orgId: string,
      data: {
        multisigPda: string;
        vaultPda: string;
        createKey: string;
        threshold: number;
      },
      wallet: string
    ) =>
      fetchApi<{
        success: boolean;
        multisigPda: string;
        vaultPda: string;
        threshold: number;
      }>(`/api/v1/orgs/${orgId}/multisig/confirm`, {
        method: 'POST',
        body: JSON.stringify(data),
        wallet,
      }),

    disable: (orgId: string, wallet: string) =>
      fetchApi<{ success: boolean }>(`/api/v1/orgs/${orgId}/multisig/disable`, {
        method: 'POST',
        wallet,
      }),

    listProposals: (orgId: string, wallet: string, status?: string) => {
      const query = status ? `?status=${status}` : '';
      return fetchApi<MultisigProposal[]>(`/api/v1/orgs/${orgId}/multisig/proposals${query}`, {
        wallet,
      });
    },

    getProposal: (orgId: string, proposalId: string, wallet: string) =>
      fetchApi<MultisigProposal & { onChainStatus?: unknown }>(
        `/api/v1/orgs/${orgId}/multisig/proposals/${proposalId}`,
        { wallet }
      ),

    syncProposal: (orgId: string, proposalId: string, wallet: string) =>
      fetchApi<MultisigProposal>(`/api/v1/orgs/${orgId}/multisig/proposals/${proposalId}/sync`, {
        method: 'POST',
        wallet,
      }),
  },

  payrunMultisig: {
    proposeToMultisig: (orgId: string, payrunId: string, wallet: string) =>
      fetchApi<{
        proposalId: string;
        transactionIndex: string;
        vaultTransactionIx: {
          programId: string;
          keys: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>;
          data: string;
        };
        proposalCreateIx: {
          programId: string;
          keys: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>;
          data: string;
        };
      }>(`/api/v1/orgs/${orgId}/payruns/${payrunId}/propose-multisig`, {
        method: 'POST',
        wallet,
      }),

    getProposals: (orgId: string, payrunId: string, wallet: string) =>
      fetchApi<MultisigProposal[]>(`/api/v1/orgs/${orgId}/payruns/${payrunId}/multisig-proposals`, {
        wallet,
      }),

    approve: (orgId: string, proposalId: string, wallet: string) =>
      fetchApi<{
        instruction: {
          programId: string;
          keys: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>;
          data: string;
        };
      }>(`/api/v1/orgs/${orgId}/multisig-proposals/${proposalId}/approve`, {
        method: 'POST',
        wallet,
      }),

    reject: (orgId: string, proposalId: string, wallet: string) =>
      fetchApi<{
        instruction: {
          programId: string;
          keys: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>;
          data: string;
        };
      }>(`/api/v1/orgs/${orgId}/multisig-proposals/${proposalId}/reject`, {
        method: 'POST',
        wallet,
      }),

    execute: (orgId: string, proposalId: string, wallet: string) =>
      fetchApi<{
        instruction: {
          programId: string;
          keys: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>;
          data: string;
        };
      }>(`/api/v1/orgs/${orgId}/multisig-proposals/${proposalId}/execute`, {
        method: 'POST',
        wallet,
      }),

    syncProposal: (orgId: string, proposalId: string, wallet: string) =>
      fetchApi<{ proposal: MultisigProposal; payrunUpdated: boolean }>(
        `/api/v1/orgs/${orgId}/multisig-proposals/${proposalId}/sync`,
        {
          method: 'POST',
          wallet,
        }
      ),

    confirmExecution: (orgId: string, proposalId: string, txSignature: string, wallet: string) =>
      fetchApi<{ success: boolean; proposal: MultisigProposal }>(
        `/api/v1/orgs/${orgId}/multisig-proposals/${proposalId}/confirm-execution`,
        {
          method: 'POST',
          body: JSON.stringify({ txSignature }),
          wallet,
        }
      ),

    getMultisigInfo: (orgId: string, wallet: string) =>
      fetchApi<{
        enabled: boolean;
        multisigPda?: string;
        vaultPda?: string;
        threshold?: number;
        state?: {
          threshold: number;
          transactionIndex: string;
          members: Array<{ key: string; permissions: number }>;
        };
      }>(`/api/v1/orgs/${orgId}/multisig-info`, { wallet }),
  },

  approvals: {
    submitForApproval: (
      orgId: string,
      payrunId: string,
      data: { comments?: string },
      wallet: string
    ) =>
      fetchApi<{ payrun: Payrun; approvalRequest: ApprovalRequest }>(
        `/api/v1/orgs/${orgId}/payruns/${payrunId}/submit-for-approval`,
        {
          method: 'POST',
          body: JSON.stringify(data),
          wallet,
        }
      ),

    list: (orgId: string, wallet: string, status?: string) => {
      const query = status ? `?status=${status}` : '';
      return fetchApi<ApprovalRequestWithPayrun[]>(
        `/api/v1/orgs/${orgId}/approval-requests${query}`,
        {
          wallet,
        }
      );
    },

    respond: (
      orgId: string,
      requestId: string,
      data: { approved: boolean; comments?: string },
      wallet: string
    ) =>
      fetchApi<{ approvalRequest: ApprovalRequest; payrun: Payrun }>(
        `/api/v1/orgs/${orgId}/approval-requests/${requestId}/respond`,
        {
          method: 'POST',
          body: JSON.stringify(data),
          wallet,
        }
      ),

    getHistory: (orgId: string, payrunId: string, wallet: string) =>
      fetchApi<ApprovalRequest[]>(`/api/v1/orgs/${orgId}/payruns/${payrunId}/approval-history`, {
        wallet,
      }),
  },

  schedules: {
    list: (orgId: string, wallet: string, status?: string) => {
      const query = status ? `?status=${status}` : '';
      return fetchApi<RecurringSchedule[]>(`/api/v1/orgs/${orgId}/schedules${query}`, { wallet });
    },

    get: (orgId: string, scheduleId: string, wallet: string) =>
      fetchApi<RecurringSchedule>(`/api/v1/orgs/${orgId}/schedules/${scheduleId}`, { wallet }),

    create: (
      orgId: string,
      data: {
        name: string;
        frequency: 'WEEKLY' | 'BIWEEKLY' | 'SEMIMONTHLY' | 'MONTHLY';
        dayOfWeek?: number;
        dayOfMonth?: number;
        secondDayOfMonth?: number;
        workerIds?: string[];
        autoApprove?: boolean;
        requiresApproval?: boolean;
        claimDeadlineDays?: number;
      },
      wallet: string
    ) =>
      fetchApi<RecurringSchedule>(`/api/v1/orgs/${orgId}/schedules`, {
        method: 'POST',
        body: JSON.stringify(data),
        wallet,
      }),

    update: (
      orgId: string,
      scheduleId: string,
      data: Partial<{
        name: string;
        frequency: 'WEEKLY' | 'BIWEEKLY' | 'SEMIMONTHLY' | 'MONTHLY';
        dayOfWeek: number;
        dayOfMonth: number;
        secondDayOfMonth: number;
        workerIds: string[];
        autoApprove: boolean;
        requiresApproval: boolean;
        claimDeadlineDays: number;
        status: 'ACTIVE' | 'PAUSED';
      }>,
      wallet: string
    ) =>
      fetchApi<RecurringSchedule>(`/api/v1/orgs/${orgId}/schedules/${scheduleId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
        wallet,
      }),

    delete: (orgId: string, scheduleId: string, wallet: string) =>
      fetchApi<void>(`/api/v1/orgs/${orgId}/schedules/${scheduleId}`, {
        method: 'DELETE',
        wallet,
      }),

    runNow: (orgId: string, scheduleId: string, wallet: string) =>
      fetchApi<{ schedule: RecurringSchedule; payrun: Payrun }>(
        `/api/v1/orgs/${orgId}/schedules/${scheduleId}/run-now`,
        {
          method: 'POST',
          wallet,
        }
      ),
  },
};
