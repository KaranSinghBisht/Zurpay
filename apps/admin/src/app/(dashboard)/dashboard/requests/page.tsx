'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { api, PaymentRequest, PaymentRequestStats, Org } from '../../../../lib/api';

export default function PaymentRequestsPage() {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58();

  const [org, setOrg] = useState<Org | null>(null);
  const [requests, setRequests] = useState<PaymentRequest[]>([]);
  const [stats, setStats] = useState<PaymentRequestStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('PENDING');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadData();
  }, [wallet, statusFilter]);

  const loadData = async () => {
    if (!wallet) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const orgs = await api.orgs.list(wallet);

      if (orgs.length === 0) {
        setOrg(null);
        setRequests([]);
        return;
      }

      const selectedOrg = orgs[0];
      setOrg(selectedOrg);

      const params: { status?: string } = {};
      if (statusFilter) params.status = statusFilter;

      const [requestList, statsData] = await Promise.all([
        api.paymentRequests.list(selectedOrg.id, wallet, params),
        api.paymentRequests.getStats(selectedOrg.id, wallet),
      ]);

      setRequests(requestList);
      setStats(statsData);
      setSelectedIds(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load payment requests');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (requestId: string) => {
    if (!org || !wallet) return;
    if (!confirm('Approve this payment request? This will mark it as paid.')) return;

    try {
      setActionLoading(requestId);
      await api.paymentRequests.approve(org.id, requestId, {}, wallet);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve request');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (requestId: string) => {
    if (!org || !wallet) return;
    const reason = prompt('Reason for rejection (optional):');
    if (reason === null) return;

    try {
      setActionLoading(requestId);
      await api.paymentRequests.reject(org.id, requestId, { reason: reason || undefined }, wallet);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject request');
    } finally {
      setActionLoading(null);
    }
  };

  const handleBatchApprove = async () => {
    if (!org || !wallet || selectedIds.size === 0) return;
    if (!confirm(`Approve ${selectedIds.size} payment request(s)?`)) return;

    try {
      setActionLoading('batch');
      const result = await api.paymentRequests.batchApprove(
        org.id,
        { requestIds: Array.from(selectedIds) },
        wallet
      );
      setSuccessMessage(
        `Approved ${result.approved} request(s)${result.expired > 0 ? `, ${result.expired} expired` : ''}`
      );
      setTimeout(() => setSuccessMessage(null), 5000);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to batch approve requests');
    } finally {
      setActionLoading(null);
    }
  };

  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const toggleSelectAll = () => {
    const pendingRequests = requests.filter((r) => r.status === 'PENDING');
    if (selectedIds.size === pendingRequests.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingRequests.map((r) => r.id)));
    }
  };

  const formatAmount = (amount: string) => {
    const num = BigInt(amount);
    const usd = Number(num) / 1_000_000;
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(usd);
  };

  const formatWallet = (walletAddr: string) =>
    `${walletAddr.slice(0, 6)}...${walletAddr.slice(-4)}`;

  const pendingRequests = requests.filter((r) => r.status === 'PENDING');

  if (!wallet) {
    return (
      <div className="text-center py-16">
        <p className="text-zinc-400">Please connect your wallet to view payment requests.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!org) {
    return (
      <div className="text-center py-16">
        <p className="text-zinc-400 mb-4">No organization found.</p>
        <a href="/dashboard/settings" className="btn-primary">
          Initialize Organization
        </a>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold">Payment Requests</h2>
          <p className="text-zinc-400 text-sm">Manage incoming payment requests from contractors</p>
        </div>
        {selectedIds.size > 0 && (
          <button
            onClick={handleBatchApprove}
            disabled={actionLoading === 'batch'}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-700 rounded-lg transition-colors"
          >
            {actionLoading === 'batch' ? 'Processing...' : `Approve ${selectedIds.size} Selected`}
          </button>
        )}
      </div>

      {error && (
        <div className="p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-300 mb-6">
          {error}
          <button onClick={() => setError(null)} className="ml-4 text-red-400 hover:text-red-300">
            ✕
          </button>
        </div>
      )}

      {successMessage && (
        <div className="fixed bottom-6 right-6 px-6 py-3 bg-emerald-600 text-white rounded-lg shadow-lg z-50">
          {successMessage}
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div className="glass-card rounded-xl p-4">
            <p className="text-sm text-zinc-400">Pending</p>
            <p className="text-2xl font-bold text-yellow-400">{stats.pending}</p>
          </div>
          <div className="glass-card rounded-xl p-4">
            <p className="text-sm text-zinc-400">Paid</p>
            <p className="text-2xl font-bold text-emerald-400">{stats.paid}</p>
          </div>
          <div className="glass-card rounded-xl p-4">
            <p className="text-sm text-zinc-400">Rejected</p>
            <p className="text-2xl font-bold text-red-400">{stats.cancelled}</p>
          </div>
          <div className="glass-card rounded-xl p-4">
            <p className="text-sm text-zinc-400">Expired</p>
            <p className="text-2xl font-bold text-zinc-500">{stats.expired}</p>
          </div>
          <div className="glass-card rounded-xl p-4">
            <p className="text-sm text-zinc-400">Pending Amount</p>
            <p className="text-2xl font-bold text-yellow-400">
              {formatAmount(stats.pendingAmount)}
            </p>
          </div>
        </div>
      )}

      <div className="flex gap-4 mb-6">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-emerald-500"
        >
          <option value="">All Status</option>
          <option value="PENDING">Pending</option>
          <option value="PAID">Paid</option>
          <option value="CANCELLED">Rejected</option>
          <option value="EXPIRED">Expired</option>
        </select>

        {statusFilter === 'PENDING' && pendingRequests.length > 0 && (
          <button
            onClick={toggleSelectAll}
            className="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg hover:border-zinc-600 transition-colors"
          >
            {selectedIds.size === pendingRequests.length ? 'Deselect All' : 'Select All'}
          </button>
        )}
      </div>

      {requests.length === 0 ? (
        <div className="glass-card rounded-xl p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-lg bg-zinc-800 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-zinc-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
          </div>
          <h3 className="text-xl font-semibold mb-2">No payment requests</h3>
          <p className="text-zinc-400">
            {statusFilter === 'PENDING'
              ? 'No pending payment requests from contractors'
              : 'No payment requests found with the selected filter'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map((request) => (
            <div key={request.id} className="glass-card rounded-xl p-6">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-start gap-4">
                  {request.status === 'PENDING' && (
                    <label className="flex items-center cursor-pointer mt-1">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(request.id)}
                        onChange={() => toggleSelection(request.id)}
                        className="w-5 h-5 rounded text-emerald-500 bg-zinc-800 border-zinc-600"
                      />
                    </label>
                  )}
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="text-2xl font-bold">{formatAmount(request.amount)}</span>
                      <span
                        className={`px-2 py-1 text-xs rounded-full ${
                          request.status === 'PENDING'
                            ? 'bg-yellow-900/50 text-yellow-300'
                            : request.status === 'PAID'
                              ? 'bg-emerald-900/50 text-emerald-300'
                              : request.status === 'EXPIRED'
                                ? 'bg-zinc-700 text-zinc-400'
                                : 'bg-red-900/50 text-red-300'
                        }`}
                      >
                        {request.status === 'CANCELLED' ? 'REJECTED' : request.status}
                      </span>
                    </div>
                    {request.memo && <p className="text-sm text-zinc-400 mt-1">{request.memo}</p>}
                  </div>
                </div>
                <div className="text-right text-sm text-zinc-500">
                  <p>Requested {new Date(request.createdAt).toLocaleDateString()}</p>
                  {request.expiresAt && (
                    <p>Expires {new Date(request.expiresAt).toLocaleDateString()}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-4 p-3 bg-zinc-800 rounded-lg mb-4">
                <div>
                  <p className="text-xs text-zinc-500">Requester Wallet</p>
                  <p className="font-mono text-sm">{formatWallet(request.recipientWallet)}</p>
                </div>
                {request.recipientEmail && (
                  <div>
                    <p className="text-xs text-zinc-500">Email</p>
                    <p className="text-sm">{request.recipientEmail}</p>
                  </div>
                )}
              </div>

              {request.status === 'PAID' && request.paidBy && (
                <div className="p-3 bg-emerald-900/20 rounded-lg mb-4">
                  <p className="text-sm text-emerald-300">
                    Paid by <span className="font-mono">{formatWallet(request.paidBy)}</span>
                    {request.paidAt && ` on ${new Date(request.paidAt).toLocaleDateString()}`}
                  </p>
                  {request.payoutTxSig && (
                    <a
                      href={`https://explorer.solana.com/tx/${request.payoutTxSig}?cluster=devnet`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-emerald-400 hover:underline"
                    >
                      View Transaction
                    </a>
                  )}
                </div>
              )}

              {request.status === 'PENDING' && (
                <div className="flex gap-4">
                  <button
                    onClick={() => handleApprove(request.id)}
                    disabled={actionLoading === request.id}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-700 rounded-lg transition-colors"
                  >
                    {actionLoading === request.id ? 'Processing...' : 'Approve & Pay'}
                  </button>
                  <button
                    onClick={() => handleReject(request.id)}
                    disabled={actionLoading === request.id}
                    className="px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg transition-colors"
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
