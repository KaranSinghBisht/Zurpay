'use client';

import { useState, useEffect } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { useRouter } from 'next/navigation';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { api, Org, OrgStats } from '../../../lib/api';

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
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    DRAFT: 'bg-zinc-700 text-zinc-300',
    READY: 'bg-blue-900/50 text-blue-300',
    EXECUTING: 'bg-yellow-900/50 text-yellow-300',
    ACTIVE_CLAIMS: 'bg-emerald-900/50 text-emerald-300',
    COMPLETED: 'bg-emerald-900/50 text-emerald-300',
    FAILED: 'bg-red-900/50 text-red-300',
    CLOSED: 'bg-zinc-700 text-zinc-400',
  };
  return colors[status] || 'bg-zinc-700 text-zinc-300';
}

function TreasuryCard({ treasuryAccount }: { treasuryAccount: string }) {
  const { connection } = useConnection();
  const [accountExists, setAccountExists] = useState<boolean | null>(null);
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkTreasuryAccount();
  }, [treasuryAccount]);

  const checkTreasuryAccount = async () => {
    try {
      setLoading(true);
      const pubkey = new PublicKey(treasuryAccount);
      const accountInfo = await connection.getAccountInfo(pubkey);
      setAccountExists(accountInfo !== null);

      const balance = await connection.getBalance(pubkey);
      setSolBalance(balance / LAMPORTS_PER_SOL);
    } catch (err) {
      console.error('Error checking treasury:', err);
      setAccountExists(false);
    } finally {
      setLoading(false);
    }
  };

  const copyAddress = () => {
    navigator.clipboard.writeText(treasuryAccount);
  };

  return (
    <div className="glass-card rounded-xl p-6 mb-8">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <span>Treasury</span>
          {loading ? (
            <span className="w-2 h-2 bg-zinc-500 rounded-full animate-pulse" />
          ) : accountExists ? (
            <span className="w-2 h-2 bg-emerald-500 rounded-full" title="Account active" />
          ) : (
            <span className="w-2 h-2 bg-red-500 rounded-full" title="Account not found" />
          )}
        </h3>
        <span className="text-xs text-zinc-500">Inco Confidential Account</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="col-span-2">
          <div className="text-xs text-zinc-400 mb-1">Account Address</div>
          <div className="flex items-center gap-2">
            <code className="text-sm font-mono bg-zinc-800 px-3 py-2 rounded-lg flex-1 truncate">
              {treasuryAccount}
            </code>
            <button
              onClick={copyAddress}
              className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-sm transition-colors"
            >
              Copy
            </button>
          </div>
        </div>

        <div>
          <div className="text-xs text-zinc-400 mb-1">SOL Balance</div>
          <div className="text-2xl font-bold">
            {loading ? (
              <span className="text-zinc-500">...</span>
            ) : solBalance !== null ? (
              `${solBalance.toFixed(4)} SOL`
            ) : (
              <span className="text-zinc-500">-</span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="text-xs text-zinc-500">
          {accountExists === false && (
            <span className="text-yellow-400">
              Treasury account not initialized. Fund it to enable claims.
            </span>
          )}
          {accountExists === true && (
            <span className="text-emerald-400">
              Confidential balance is encrypted and only visible to account owner.
            </span>
          )}
        </div>
        <a
          href={`https://explorer.solana.com/address/${treasuryAccount}?cluster=devnet`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-emerald-400 hover:text-emerald-300 text-sm"
        >
          View on Explorer →
        </a>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { publicKey } = useWallet();
  const router = useRouter();
  const wallet = publicKey?.toBase58();

  const [org, setOrg] = useState<Org | null>(null);
  const [stats, setStats] = useState<OrgStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noOrg, setNoOrg] = useState(false);

  useEffect(() => {
    loadData();
  }, [wallet]);

  // Redirect to onboarding if wallet connected but no org
  useEffect(() => {
    if (noOrg && wallet) {
      router.push('/onboarding');
    }
  }, [noOrg, wallet, router]);

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
        setNoOrg(true);
        setOrg(null);
        setStats(null);
        setLoading(false);
        return;
      }

      setNoOrg(false);
      const selectedOrg = orgs[0];
      setOrg(selectedOrg);

      const orgStats = await api.orgs.getStats(selectedOrg.id, wallet);
      setStats(orgStats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  if (!wallet) {
    return (
      <div className="text-center py-16">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-500/20 flex items-center justify-center">
          <svg
            className="w-8 h-8 text-emerald-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
        </div>
        <h3 className="text-xl font-semibold mb-2">Connect Your Wallet</h3>
        <p className="text-zinc-400">Connect your wallet to view your organization dashboard</p>
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
        <h3 className="text-xl font-semibold mb-2">Error Loading Dashboard</h3>
        <p className="text-zinc-400 mb-4">{error}</p>
        <button onClick={loadData} className="btn-primary">
          Retry
        </button>
      </div>
    );
  }

  if (!org) {
    // Will auto-redirect to onboarding via useEffect
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-zinc-400">Redirecting to setup...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold">Dashboard</h2>
          <p className="text-zinc-400 text-sm">{org.name}</p>
        </div>
        <a href="/dashboard/payruns/new" className="btn-primary">
          New Payrun
        </a>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="glass-card rounded-xl p-6 hover:bg-zinc-900/50 transition-all">
          <div className="text-zinc-400 text-sm">Total Payruns</div>
          <div className="text-3xl font-bold mt-2 text-gradient-accent">
            {stats?.payruns.total || 0}
          </div>
          <div className="text-xs text-zinc-500 mt-1">{stats?.payruns.active || 0} active</div>
        </div>

        <div className="glass-card rounded-xl p-6 hover:bg-zinc-900/50 transition-all">
          <div className="text-zinc-400 text-sm">Pending Claims</div>
          <div className="text-3xl font-bold mt-2 text-gradient-accent">
            {stats?.claims.pending || 0}
          </div>
          <div className="text-xs text-zinc-500 mt-1">awaiting employees</div>
        </div>

        <div className="glass-card rounded-xl p-6 hover:bg-zinc-900/50 transition-all">
          <div className="text-zinc-400 text-sm">Total Claimed</div>
          <div className="text-3xl font-bold mt-2 text-gradient-accent">
            {(stats?.claims.claimed || 0) + (stats?.claims.paid || 0)}
          </div>
          <div className="text-xs text-zinc-500 mt-1">payslips processed</div>
        </div>

        <div className="glass-card rounded-xl p-6 hover:bg-zinc-900/50 transition-all">
          <div className="text-zinc-400 text-sm">Total Paid</div>
          <div className="text-3xl font-bold mt-2 text-gradient-accent">
            {formatAmount(stats?.financials.totalPaidAmount || '0')}
          </div>
          <div className="text-xs text-zinc-500 mt-1">USDC distributed</div>
        </div>
      </div>

      {org?.treasuryConfAccount && <TreasuryCard treasuryAccount={org.treasuryConfAccount} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="glass-card rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4">Workers</h3>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-3xl font-bold">{stats?.workers.active || 0}</div>
              <div className="text-sm text-zinc-400">active workers</div>
            </div>
            <a
              href="/dashboard/workers"
              className="text-emerald-400 hover:text-emerald-300 text-sm"
            >
              Manage →
            </a>
          </div>
        </div>

        <div className="glass-card rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4">Paylinks</h3>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-3xl font-bold">{stats?.paylinks.active || 0}</div>
              <div className="text-sm text-zinc-400">active paylinks</div>
            </div>
            <a
              href="/dashboard/paylinks"
              className="text-emerald-400 hover:text-emerald-300 text-sm"
            >
              View All →
            </a>
          </div>
        </div>

        <div className="glass-card rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4">Paylinks Claimed</h3>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-3xl font-bold">{stats?.paylinks.claimed || 0}</div>
              <div className="text-sm text-zinc-400">links redeemed</div>
            </div>
            <a
              href="/dashboard/paylinks"
              className="text-emerald-400 hover:text-emerald-300 text-sm"
            >
              View All →
            </a>
          </div>
        </div>
      </div>

      {stats?.recentPayruns && stats.recentPayruns.length > 0 ? (
        <div className="glass-card rounded-xl p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Recent Payruns</h3>
            <a
              href="/dashboard/payruns"
              className="text-emerald-400 hover:text-emerald-300 text-sm"
            >
              View All →
            </a>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-zinc-500 uppercase">
                  <th className="pb-3 font-medium">Payrun</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Payslips</th>
                  <th className="pb-3 font-medium">Amount</th>
                  <th className="pb-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {stats.recentPayruns.map((payrun) => (
                  <tr key={payrun.id} className="hover:bg-zinc-800/30">
                    <td className="py-3">
                      <a
                        href={`/dashboard/payruns/${payrun.id}`}
                        className="font-mono text-sm hover:text-emerald-400"
                      >
                        {payrun.payrunIdHex.slice(0, 12)}...
                      </a>
                    </td>
                    <td className="py-3">
                      <span
                        className={`px-2 py-1 text-xs rounded-full ${getStatusColor(payrun.status)}`}
                      >
                        {payrun.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3 text-sm">
                      {payrun.paidCount + payrun.claimedCount} / {payrun.totalPayslips}
                    </td>
                    <td className="py-3 text-sm">
                      {payrun.totalAmount ? formatAmount(payrun.totalAmount) : '-'}
                    </td>
                    <td className="py-3 text-sm text-zinc-400">{formatDate(payrun.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="mt-4 text-center py-16 glass-card rounded-xl">
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
          <h3 className="text-xl font-semibold mb-2">No payruns yet</h3>
          <p className="text-zinc-400 mb-6">Create your first confidential payrun to get started</p>
          <a href="/dashboard/payruns/new" className="btn-primary">
            Create Payrun →
          </a>
        </div>
      )}
    </div>
  );
}
