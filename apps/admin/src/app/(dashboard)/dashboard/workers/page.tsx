'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import Link from 'next/link';
import { api, Worker, Org } from '../../../../lib/api';
import { getAuthToken } from '../../../../contexts/AuthContext';
import { Check, Copy } from 'lucide-react';

export default function WorkersPage() {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58();

  const [org, setOrg] = useState<Org | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');

  useEffect(() => {
    loadData();
  }, [wallet, statusFilter, typeFilter]);

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
        setWorkers([]);
        return;
      }

      const selectedOrg = orgs[0];
      setOrg(selectedOrg);

      const params: { status?: string; type?: string } = {};
      if (statusFilter) params.status = statusFilter;
      if (typeFilter) params.type = typeFilter;

      const workerList = await api.workers.list(selectedOrg.id, wallet, params);
      setWorkers(workerList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workers');
    } finally {
      setLoading(false);
    }
  };

  const formatAmount = (amount: string) => {
    const num = BigInt(amount);
    const usd = Number(num) / 1_000_000;
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(usd);
  };

  if (!wallet) {
    return (
      <div className="text-center py-16">
        <p className="text-zinc-400">Please connect your wallet to view workers.</p>
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
          <h2 className="text-2xl font-bold">Workers</h2>
          <p className="text-zinc-400 text-sm">{org.name}</p>
        </div>
        <button onClick={() => setShowAddModal(true)} className="btn-primary">
          Invite Employee
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-300 mb-6">
          {error}
        </div>
      )}

      <div className="flex gap-4 mb-6">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-emerald-500"
        >
          <option value="">All Status</option>
          <option value="ACTIVE">Active</option>
          <option value="INVITED">Invited</option>
          <option value="INACTIVE">Inactive</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-emerald-500"
        >
          <option value="">All Types</option>
          <option value="EMPLOYEE">Employee</option>
          <option value="CONTRACTOR">Contractor</option>
        </select>
      </div>

      {workers.length === 0 ? (
        <div className="glass-card rounded-xl p-8 text-center">
          <div className="text-5xl mb-4">👥</div>
          <h3 className="text-xl font-semibold mb-2">No workers yet</h3>
          <p className="text-zinc-400 mb-6">Invite your first worker to get started with payroll</p>
          <button onClick={() => setShowAddModal(true)} className="btn-primary">
            Invite Employee
          </button>
        </div>
      ) : (
        <div className="glass-card rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-zinc-800/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
                  Worker
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
                  Compensation
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
                  Payslips
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-zinc-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {workers.map((worker) => (
                <tr key={worker.id} className="hover:bg-zinc-800/30">
                  <td className="px-6 py-4">
                    <div>
                      <div className="font-medium text-white">
                        {worker.email || worker.displayName || '(No email)'}
                      </div>
                      <div className="text-xs text-zinc-500 mt-0.5">
                        {worker.wallet ? (
                          <span className="font-mono">
                            {worker.wallet.slice(0, 6)}...{worker.wallet.slice(-4)}
                          </span>
                        ) : (
                          <span className="text-zinc-600 italic">Wallet hidden for privacy</span>
                        )}
                      </div>
                      {worker.displayName && worker.displayName !== worker.email && (
                        <div className="text-xs text-zinc-500">{worker.displayName}</div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${
                        worker.type === 'EMPLOYEE'
                          ? 'bg-blue-900/50 text-blue-300'
                          : 'bg-purple-900/50 text-purple-300'
                      }`}
                    >
                      {worker.type}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${
                        worker.status === 'ACTIVE'
                          ? 'bg-emerald-900/50 text-emerald-300'
                          : (worker.status as string) === 'INVITED'
                            ? 'bg-amber-900/50 text-amber-300'
                            : 'bg-zinc-700 text-zinc-400'
                      }`}
                    >
                      {worker.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {worker.compPlans && worker.compPlans.length > 0 ? (
                      <div>
                        <div className="font-medium">
                          {formatAmount(worker.compPlans[0].rateAmount)}
                        </div>
                        <div className="text-xs text-zinc-500">
                          {worker.compPlans[0].schedule.toLowerCase()} /{' '}
                          {worker.compPlans[0].currency}
                        </div>
                      </div>
                    ) : (
                      <span className="text-zinc-500 text-sm">Not set</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-zinc-400">{worker._count?.payslips || 0}</span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/dashboard/workers/${worker.id}`}
                      className="text-emerald-400 hover:text-emerald-300 text-sm"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAddModal && (
        <AddWorkerModal
          orgId={org.id}
          wallet={wallet}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            loadData();
          }}
        />
      )}
    </div>
  );
}

function AddWorkerModal({
  orgId,
  wallet,
  onClose,
  onSuccess,
}: {
  orgId: string;
  wallet: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [formData, setFormData] = useState({
    type: 'EMPLOYEE' as 'EMPLOYEE' | 'CONTRACTOR',
    displayName: '',
    email: '',
    rateAmount: '',
    schedule: 'MONTHLY' as 'MONTHLY' | 'BIWEEKLY' | 'WEEKLY' | 'AD_HOC',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteResult, setInviteResult] = useState<{ inviteUrl: string; expiresAt: string } | null>(
    null
  );
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const payload: any = {
        email: formData.email,
        type: formData.type,
      };

      if (formData.displayName) payload.displayName = formData.displayName;

      if (formData.rateAmount) {
        payload.rateAmount = (parseFloat(formData.rateAmount) * 1_000_000).toString();
        payload.schedule = formData.schedule;
        payload.currency = 'USDC';
      }

      const token = getAuthToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`/api/v1/orgs/${orgId}/workers/invite`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to invite worker');
      }

      const data = await response.json();
      setInviteResult({
        inviteUrl: data.inviteUrl,
        expiresAt: data.expiresAt,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to invite worker');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (inviteResult?.inviteUrl) {
      navigator.clipboard.writeText(inviteResult.inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (inviteResult) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-zinc-900 rounded-xl p-6 w-full max-w-md border border-zinc-800">
          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-12 h-12 bg-emerald-900/30 rounded-full flex items-center justify-center mb-4">
              <Check className="w-6 h-6 text-emerald-500" />
            </div>
            <h3 className="text-xl font-semibold text-white">Invite Sent!</h3>
            <p className="text-zinc-400 text-sm mt-2">
              Share this link with {formData.displayName || formData.email} to let them claim their
              account.
            </p>
          </div>

          <div className="bg-zinc-950 rounded-lg border border-zinc-800 p-3 mb-6">
            <div className="flex items-center justify-between gap-3">
              <code className="text-xs text-zinc-300 font-mono truncate flex-1">
                {inviteResult.inviteUrl}
              </code>
              <button
                onClick={copyToClipboard}
                className="p-2 hover:bg-zinc-800 rounded-md transition-colors text-zinc-400 hover:text-white"
                title="Copy link"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            onClick={onSuccess}
            className="w-full px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors font-medium"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-zinc-900 rounded-xl p-6 w-full max-w-md border border-zinc-800">
        <h3 className="text-xl font-semibold mb-4">Invite Employee</h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Email Address *</label>
            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-emerald-500"
              placeholder="employee@company.com"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Type</label>
              <select
                value={formData.type}
                onChange={(e) =>
                  setFormData({ ...formData, type: e.target.value as 'EMPLOYEE' | 'CONTRACTOR' })
                }
                className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-emerald-500"
              >
                <option value="EMPLOYEE">Employee</option>
                <option value="CONTRACTOR">Contractor</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">
                Display Name (Optional)
              </label>
              <input
                type="text"
                value={formData.displayName}
                onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-emerald-500"
                placeholder="John Doe"
              />
            </div>
          </div>

          <div className="border-t border-zinc-800 pt-4">
            <h4 className="text-sm font-medium text-zinc-400 mb-3">Compensation (Optional)</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">
                  Amount (USDC)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.rateAmount}
                  onChange={(e) => setFormData({ ...formData, rateAmount: e.target.value })}
                  className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-emerald-500"
                  placeholder="5000.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Schedule</label>
                <select
                  value={formData.schedule}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      schedule: e.target.value as 'MONTHLY' | 'BIWEEKLY' | 'WEEKLY' | 'AD_HOC',
                    })
                  }
                  className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-emerald-500"
                >
                  <option value="MONTHLY">Monthly</option>
                  <option value="BIWEEKLY">Biweekly</option>
                  <option value="WEEKLY">Weekly</option>
                  <option value="AD_HOC">Ad-hoc</option>
                </select>
              </div>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-700 rounded-lg transition-colors"
            >
              {loading ? 'Sending Invite...' : 'Send Invite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
