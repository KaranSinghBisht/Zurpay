'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import Link from 'next/link';
import { api, Org, Payrun } from '../../../../lib/api';

function formatAmount(amount: string): string {
  const num = BigInt(amount);
  const usd = Number(num) / 1_000_000;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(usd);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    DRAFT: 'bg-zinc-700 text-zinc-300',
    READY: 'bg-blue-900/50 text-blue-300',
    FUNDING_REQUIRED: 'bg-orange-900/50 text-orange-300',
    EXECUTING: 'bg-yellow-900/50 text-yellow-300',
    ACTIVE_CLAIMS: 'bg-emerald-900/50 text-emerald-300',
    COMPLETED: 'bg-emerald-900/50 text-emerald-300',
    FAILED: 'bg-red-900/50 text-red-300',
    CLOSED: 'bg-zinc-700 text-zinc-400',
  };
  return colors[status] || 'bg-zinc-700 text-zinc-300';
}

function getStatusLabel(status: string): string {
  return status.replace(/_/g, ' ');
}

export default function PayrunsPage() {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58();

  const [org, setOrg] = useState<Org | null>(null);
  const [payruns, setPayruns] = useState<Payrun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');

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
      setError(null);

      const orgs = await api.orgs.list(wallet);

      if (orgs.length === 0) {
        setOrg(null);
        setPayruns([]);
        setLoading(false);
        return;
      }

      const selectedOrg = orgs[0];
      setOrg(selectedOrg);

      const params: { status?: string } = {};
      if (statusFilter) params.status = statusFilter;

      const payrunList = await api.payruns.list(selectedOrg.id, wallet, params);
      setPayruns(payrunList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load payruns');
    } finally {
      setLoading(false);
    }
  };

  if (!wallet) {
    return (
      <div className="text-center py-16">
        <p className="text-zinc-400">Please connect your wallet to view payruns.</p>
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

  if (error) {
    return (
      <div className="text-center py-16">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
          <svg
            className="w-8 h-8 text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </div>
        <h3 className="text-xl font-semibold mb-2">Error Loading Payruns</h3>
        <p className="text-zinc-400 mb-4">{error}</p>
        <button onClick={loadData} className="btn-primary">
          Retry
        </button>
      </div>
    );
  }

  if (!org) {
    return (
      <div className="text-center py-16">
        <p className="text-zinc-400 mb-4">No organization found.</p>
        <Link href="/dashboard/settings" className="btn-primary">
          Initialize Organization
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold">Payruns</h2>
          <p className="text-zinc-400 text-sm">{org.name}</p>
        </div>
        <Link href="/dashboard/payruns/new" className="btn-primary">
          Create Payrun
        </Link>
      </div>

      <div className="flex gap-4 mb-6">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-emerald-500"
        >
          <option value="">All Status</option>
          <option value="DRAFT">Draft</option>
          <option value="READY">Ready</option>
          <option value="EXECUTING">Executing</option>
          <option value="ACTIVE_CLAIMS">Active Claims</option>
          <option value="COMPLETED">Completed</option>
          <option value="FAILED">Failed</option>
          <option value="CLOSED">Closed</option>
        </select>
        <button
          onClick={loadData}
          className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg transition-colors"
        >
          Refresh
        </button>
      </div>

      {payruns.length === 0 ? (
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
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <h3 className="text-xl font-semibold mb-2">No payruns found</h3>
          <p className="text-zinc-400 mb-6">
            {statusFilter
              ? `No payruns with status "${getStatusLabel(statusFilter)}"`
              : 'Create your first payrun to get started'}
          </p>
          <Link href="/dashboard/payruns/new" className="btn-primary">
            Create Payrun
          </Link>
        </div>
      ) : (
        <div className="glass-card rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-zinc-800/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
                  Payrun
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
                  Mode
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
                  Payslips
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-zinc-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {payruns.map((payrun) => (
                <tr key={payrun.id} className="hover:bg-zinc-800/30">
                  <td className="px-6 py-4">
                    <div>
                      <div className="font-mono text-sm">{payrun.payrunIdHex.slice(0, 12)}...</div>
                      {payrun.periodStart && payrun.periodEnd && (
                        <div className="text-xs text-zinc-500">
                          {new Date(payrun.periodStart).toLocaleDateString()} -{' '}
                          {new Date(payrun.periodEnd).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${getStatusColor(payrun.status)}`}
                    >
                      {getStatusLabel(payrun.status)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${
                        payrun.mode === 'BATCH'
                          ? 'bg-blue-900/50 text-blue-300'
                          : 'bg-purple-900/50 text-purple-300'
                      }`}
                    >
                      {payrun.mode}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm">
                      <span className="text-emerald-400">
                        {payrun.paidCount + payrun.claimedCount}
                      </span>
                      <span className="text-zinc-500"> / {payrun.totalPayslips}</span>
                    </div>
                    {payrun.failedCount > 0 && (
                      <div className="text-xs text-red-400">{payrun.failedCount} failed</div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium">
                      {payrun.totalAmount ? formatAmount(payrun.totalAmount) : '-'}
                    </div>
                    {payrun.paidAmount && payrun.paidAmount !== '0' && (
                      <div className="text-xs text-zinc-500">
                        {formatAmount(payrun.paidAmount)} paid
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-zinc-400">
                    {formatDate(payrun.createdAt)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex gap-2 justify-end">
                      <Link
                        href={`/dashboard/payruns/${payrun.id}`}
                        className="px-3 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-sm transition-colors"
                      >
                        View
                      </Link>
                      {payrun.onChainTxSig && (
                        <a
                          href={`https://explorer.solana.com/tx/${payrun.onChainTxSig}?cluster=devnet`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-sm transition-colors"
                        >
                          TX
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
