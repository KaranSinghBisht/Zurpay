import { ClaimPackageV2 } from '@zurpay/sdk';

export interface PaylinkInfo {
  id: string;
  orgName: string;
  amountDisplay: string;
  currency: string;
  memo: string | null;
  expiresAt: string;
  salaryCommitmentHex: string | null;
  ciphertextHashHex: string | null;
  encryptedAmountB64: string | null;
}

export interface PaymentRequestInfo {
  id: string;
  recipientWallet: string;
  amount: string;
  amountDisplay: string;
  currency: string;
  memo: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface PaymentRequestCreated {
  id: string;
  payUrl: string;
  amount: string;
  currency: string;
  memo: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface PaymentRequestListItem extends PaymentRequestCreated {
  status: string;
  paidBy: string | null;
  paidAt: string | null;
  payoutTxSig: string | null;
}

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<ApiResult<T>> {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  // Use relative paths for Vercel deployment
  const response = await fetch(path, {
    ...options,
    headers,
  });

  let data: any = null;
  const text = await response.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      data,
      error: data?.error || data?.message || response.statusText,
    };
  }

  return { ok: true, status: response.status, data };
}

export const employeeApi = {
  claims: {
    getPackage: (token: string) => request<ClaimPackageV2>(`/api/claims/${token}`),
    generateProof: (
      token: string,
      payload: { walletAddress: string; employeeConfAccountAddress: string }
    ) =>
      request<ClaimPackageV2>(`/api/claims/${token}/generate-proof`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    markUsed: (token: string, txSignature: string) =>
      request(`/api/claims/${token}/mark-used`, {
        method: 'POST',
        body: JSON.stringify({ txSignature }),
      }),
  },
  paylinks: {
    getClaimInfo: (token: string) => request<PaylinkInfo>(`/api/paylinks/${token}/claim`),
    generateProof: (
      token: string,
      payload: { walletAddress: string; employeeConfAccountAddress: string }
    ) =>
      request<ClaimPackageV2>(`/api/paylinks/${token}/generate-proof`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    claim: (
      token: string,
      payload: { claimerWallet: string; claimerConfAccount: string; txSig: string }
    ) =>
      request(`/api/paylinks/${token}/claim`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  },
  paymentRequests: {
    create: (payload: {
      recipientWallet: string;
      recipientConfAccount?: string;
      amount: string;
      currency?: string;
      memo?: string;
      expiresAt?: string;
      signature: string;
      message: string;
    }) =>
      request<PaymentRequestCreated>('/api/payment-requests', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    get: (id: string) => request<PaymentRequestInfo>(`/api/payment-requests/${id}`),
    list: (wallet: string) =>
      request<PaymentRequestListItem[]>(`/api/payment-requests?wallet=${wallet}`),
    pay: (id: string, payload: { payerWallet: string; txSig: string }) =>
      request<{ success: boolean; txSig: string }>(`/api/payment-requests/${id}/pay`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    cancel: (id: string) =>
      request<{ success: boolean }>(`/api/payment-requests/${id}`, {
        method: 'DELETE',
      }),
  },
};
