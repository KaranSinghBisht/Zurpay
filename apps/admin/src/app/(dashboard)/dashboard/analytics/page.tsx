'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { api, Org, OrgAnalytics } from '../../../../lib/api';

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

function StatCard({
  label,
  value,
  subtext,
  accent = false,
}: {
  label: string;
  value: string | number;
  subtext?: string;
  accent?: boolean;
}) {
  return (
    <div className="glass-card rounded-xl p-6 hover:bg-zinc-900/50 transition-all">
      <div className="text-zinc-400 text-sm">{label}</div>
      <div className={`text-3xl font-bold mt-2 ${accent ? 'text-emerald-400' : ''}`}>{value}</div>
      {subtext && <div className="text-xs text-zinc-500 mt-1">{subtext}</div>}
    </div>
  );
}

function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const percentage = max > 0 ? (value / max) * 100 : 0;
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-zinc-400">{label}</span>
        <span className="text-zinc-300">{percentage.toFixed(1)}%</span>
      </div>
      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-emerald-500 rounded-full transition-all duration-500"
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58();

  const [org, setOrg] = useState<Org | null>(null);
  const [analytics, setAnalytics] = useState<OrgAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [wallet]);

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
        setAnalytics(null);
        setLoading(false);
        return;
      }

      const selectedOrg = orgs[0];
      setOrg(selectedOrg);

      const analyticsData = await api.orgs.getAnalytics(selectedOrg.id, wallet);
      setAnalytics(analyticsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  if (!wallet) {
    return (
      <div className="text-center py-16">
        <div className="text-5xl mb-4">📊</div>
        <h3 className="text-xl font-semibold mb-2">Connect Your Wallet</h3>
        <p className="text-zinc-400">Connect your wallet to view analytics</p>
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
        <div className="text-5xl mb-4">Error</div>
        <h3 className="text-xl font-semibold mb-2">Failed to Load Analytics</h3>
        <p className="text-zinc-400 mb-4">{error}</p>
        <button onClick={loadData} className="btn-primary">
          Retry
        </button>
      </div>
    );
  }

  if (!org || !analytics) {
    return (
      <div>
        <h2 className="text-2xl font-bold mb-6">Analytics</h2>
        <div className="text-center py-16 glass-card rounded-xl">
          <div className="text-5xl mb-4">📊</div>
          <h3 className="text-xl font-semibold mb-2">No Data Yet</h3>
          <p className="text-zinc-400">Create payruns to see analytics</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold">Analytics</h2>
          <p className="text-zinc-400 text-sm">{org.name} - Privacy-Preserving Metrics</p>
        </div>
      </div>

      <div className="glass-card rounded-xl p-6 mb-8 border border-emerald-900/50 bg-emerald-950/20">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-lg bg-emerald-900/50 flex items-center justify-center text-emerald-400">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-emerald-300 mb-2">Privacy-First Analytics</h3>
            <p className="text-sm text-zinc-400 mb-4">
              All metrics shown are aggregates. Individual salary amounts remain encrypted with Inco
              FHE and never leave your employees&apos; wallets.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-emerald-400">
                  {analytics.privacy.encryptedTransfers}
                </div>
                <div className="text-xs text-zinc-500">Encrypted Transfers</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-emerald-400">
                  {analytics.privacy.zkProofsVerified}
                </div>
                <div className="text-xs text-zinc-500">ZK Proofs Verified</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-emerald-400">100%</div>
                <div className="text-xs text-zinc-500">Amounts Hidden</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-emerald-400">0</div>
                <div className="text-xs text-zinc-500">PII On-Chain</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <StatCard
          label="Total Distributed"
          value={formatAmount(analytics.summary.totalDistributed)}
          subtext="via confidential transfers"
          accent
        />
        <StatCard
          label="Total Payruns"
          value={analytics.summary.totalPayruns}
          subtext={`${analytics.summary.completedPayruns} completed`}
        />
        <StatCard
          label="Active Workers"
          value={analytics.summary.activeWorkers}
          subtext={`of ${analytics.summary.totalWorkers} total`}
        />
        <StatCard
          label="Payrun Success Rate"
          value={`${analytics.performance.payrunSuccessRate}%`}
          subtext="completed successfully"
          accent
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="glass-card rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4">Claim Performance</h3>
          <div className="space-y-4">
            <ProgressBar
              value={analytics.claims.claimedPayslips}
              max={analytics.claims.totalPayslips}
              label="Payslip Claim Rate"
            />
            <ProgressBar
              value={analytics.paylinks.claimed}
              max={analytics.paylinks.total}
              label="Paylink Claim Rate"
            />
          </div>
          <div className="mt-6 pt-4 border-t border-zinc-800">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-xl font-bold">{analytics.claims.claimedPayslips}</div>
                <div className="text-xs text-zinc-500">Payslips Claimed</div>
              </div>
              <div>
                <div className="text-xl font-bold">{analytics.claims.pendingPayslips}</div>
                <div className="text-xs text-zinc-500">Pending</div>
              </div>
              <div>
                <div className="text-xl font-bold">{analytics.paylinks.expired}</div>
                <div className="text-xs text-zinc-500">Paylinks Expired</div>
              </div>
            </div>
          </div>
        </div>

        <div className="glass-card rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4">Timing Metrics</h3>
          <div className="grid grid-cols-2 gap-6">
            <div className="text-center p-4 bg-zinc-800/50 rounded-lg">
              <div className="text-3xl font-bold text-emerald-400">
                {analytics.performance.avgClaimTimeHours !== null
                  ? `${analytics.performance.avgClaimTimeHours}h`
                  : 'N/A'}
              </div>
              <div className="text-sm text-zinc-400 mt-1">Avg. Time to Claim</div>
            </div>
            <div className="text-center p-4 bg-zinc-800/50 rounded-lg">
              <div className="text-3xl font-bold text-emerald-400">{analytics.paylinks.active}</div>
              <div className="text-sm text-zinc-400 mt-1">Active Paylinks</div>
            </div>
          </div>
          <div className="mt-4 p-3 bg-zinc-900/50 rounded-lg">
            <div className="text-xs text-zinc-500">
              Faster claim times indicate healthy employee engagement. All claim transactions are
              verified on-chain with ZK proofs.
            </div>
          </div>
        </div>
      </div>

      <div className="glass-card rounded-xl p-6">
        <h3 className="text-lg font-semibold mb-4">Monthly Activity</h3>
        {analytics.trends.payrunsByMonth.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {analytics.trends.payrunsByMonth.slice(0, 6).map((item) => (
              <div key={item.month} className="text-center p-3 bg-zinc-800/50 rounded-lg">
                <div className="text-lg font-bold">{item.count}</div>
                <div className="text-xs text-zinc-500">{item.month}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-zinc-500">
            No monthly data yet. Create more payruns to see trends.
          </div>
        )}
      </div>
    </div>
  );
}
