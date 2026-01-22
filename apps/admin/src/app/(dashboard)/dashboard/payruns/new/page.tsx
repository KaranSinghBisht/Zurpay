'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@solana/wallet-adapter-react';
import { api, Org, Worker } from '../../../../../lib/api';

type Step = 'config' | 'workers' | 'review' | 'creating' | 'done';

function formatAmount(amount: string): string {
  const num = BigInt(amount);
  const usd = Number(num) / 1_000_000;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(usd);
}

export default function CreatePayrunPage() {
  const router = useRouter();
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58();

  const [org, setOrg] = useState<Org | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [step, setStep] = useState<Step>('config');

  const [formData, setFormData] = useState({
    periodStart: '',
    periodEnd: '',
    mode: 'CLAIMS' as 'BATCH' | 'CLAIMS',
    claimDeadline: '',
    notes: '',
  });

  const [selectedWorkerIds, setSelectedWorkerIds] = useState<Set<string>>(new Set());

  const [createdPayrun, setCreatedPayrun] = useState<{
    payrunId: string;
    payrunIdHex: string;
    totalPayslips: number;
    totalAmount: string;
  } | null>(null);

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
        return;
      }

      const selectedOrg = orgs[0];
      setOrg(selectedOrg);

      const workerList = await api.workers.list(selectedOrg.id, wallet, { status: 'ACTIVE' });
      setWorkers(workerList);

      const eligibleWorkers = workerList.filter(
        (w) => w.compPlans && w.compPlans.length > 0
      );
      setSelectedWorkerIds(new Set(eligibleWorkers.map((w) => w.id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const eligibleWorkers = workers.filter(
    (w) => w.compPlans && w.compPlans.length > 0
  );

  const ineligibleWorkers = workers.filter(
    (w) => !w.compPlans || w.compPlans.length === 0
  );

  const selectedWorkers = eligibleWorkers.filter((w) => selectedWorkerIds.has(w.id));

  const totalAmount = selectedWorkers.reduce((sum, w) => {
    const comp = w.compPlans?.[0];
    return sum + BigInt(comp?.rateAmount || '0');
  }, BigInt(0));

  const toggleWorker = (workerId: string) => {
    const newSet = new Set(selectedWorkerIds);
    if (newSet.has(workerId)) {
      newSet.delete(workerId);
    } else {
      newSet.add(workerId);
    }
    setSelectedWorkerIds(newSet);
  };

  const toggleAll = () => {
    if (selectedWorkerIds.size === eligibleWorkers.length) {
      setSelectedWorkerIds(new Set());
    } else {
      setSelectedWorkerIds(new Set(eligibleWorkers.map((w) => w.id)));
    }
  };

  const handleCreatePayrun = async () => {
    if (!org || !wallet || selectedWorkerIds.size === 0) return;

    setStep('creating');
    setError(null);

    try {
      const result = await api.payruns.create(
        org.id,
        {
          periodStart: formData.periodStart
            ? new Date(formData.periodStart).toISOString()
            : undefined,
          periodEnd: formData.periodEnd ? new Date(formData.periodEnd).toISOString() : undefined,
          mode: formData.mode,
          claimDeadline: formData.claimDeadline
            ? new Date(formData.claimDeadline).toISOString()
            : undefined,
          workerIds: Array.from(selectedWorkerIds),
          notes: formData.notes || undefined,
        },
        wallet
      );

      setCreatedPayrun(result);
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create payrun');
      setStep('review');
    }
  };

  if (!wallet) {
    return (
      <div className="text-center py-16">
        <p className="text-zinc-400">Please connect your wallet to create a payrun.</p>
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
      <div>
        <h2 className="text-2xl font-bold mb-6">Create Payrun</h2>
        <div className="bg-yellow-900/50 border border-yellow-700 rounded-xl p-6">
          <p className="text-yellow-300">
            Please{' '}
            <a href="/dashboard/settings" className="underline">
              initialize your organization
            </a>{' '}
            first.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => router.push('/dashboard/payruns')}
          className="text-zinc-400 hover:text-white"
        >
          ← Back
        </button>
        <h2 className="text-2xl font-bold">Create Payrun</h2>
      </div>

      <div className="flex gap-2 mb-6">
        {['config', 'workers', 'review', 'creating', 'done'].map((s, i) => (
          <div
            key={s}
            className={`h-2 flex-1 rounded ${s === step
              ? 'bg-emerald-500'
              : ['config', 'workers', 'review', 'creating', 'done'].indexOf(s) <
                ['config', 'workers', 'review', 'creating', 'done'].indexOf(step)
                ? 'bg-emerald-700'
                : 'bg-zinc-700'
              }`}
          />
        ))}
      </div>

      {error && (
        <div className="p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-300 mb-6">
          {error}
        </div>
      )}

      {step === 'config' && (
        <div className="glass-card rounded-xl p-6 max-w-2xl">
          <h3 className="text-lg font-semibold mb-4">Step 1: Configure Payrun</h3>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">
                  Period Start (Optional)
                </label>
                <input
                  type="date"
                  value={formData.periodStart}
                  onChange={(e) => setFormData({ ...formData, periodStart: e.target.value })}
                  className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">
                  Period End (Optional)
                </label>
                <input
                  type="date"
                  value={formData.periodEnd}
                  onChange={(e) => setFormData({ ...formData, periodEnd: e.target.value })}
                  className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">Payrun Mode</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="mode"
                    value="CLAIMS"
                    checked={formData.mode === 'CLAIMS'}
                    onChange={() => setFormData({ ...formData, mode: 'CLAIMS' })}
                    className="w-4 h-4 text-emerald-500"
                  />
                  <span>Claims (Employees claim via link)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="mode"
                    value="BATCH"
                    checked={formData.mode === 'BATCH'}
                    onChange={() => setFormData({ ...formData, mode: 'BATCH' })}
                    className="w-4 h-4 text-emerald-500"
                  />
                  <span>Batch (Direct payout)</span>
                </label>
              </div>
            </div>

            {formData.mode === 'CLAIMS' && (
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">
                  Claim Deadline
                </label>
                <input
                  type="datetime-local"
                  value={formData.claimDeadline}
                  onChange={(e) => setFormData({ ...formData, claimDeadline: e.target.value })}
                  className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-emerald-500"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">
                Notes (Optional)
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={2}
                className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-emerald-500 resize-none"
                placeholder="e.g., January 2026 payroll"
              />
            </div>

            <button
              onClick={() => setStep('workers')}
              className="w-full px-4 py-3 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors font-medium"
            >
              Next: Select Workers
            </button>
          </div>
        </div>
      )}

      {step === 'workers' && (
        <div className="glass-card rounded-xl p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Step 2: Select Workers</h3>
            <button onClick={toggleAll} className="text-sm text-emerald-400 hover:text-emerald-300">
              {selectedWorkerIds.size === eligibleWorkers.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>

          {eligibleWorkers.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-zinc-400 mb-4">
                No eligible workers found. Workers need a compensation plan to be included in a payrun.
              </p>
              <a href="/dashboard/workers" className="btn-primary">
                Manage Workers
              </a>
            </div>
          ) : (
            <>
              <div className="space-y-2 max-h-96 overflow-y-auto mb-4">
                {eligibleWorkers.map((worker) => {
                  const comp = worker.compPlans?.[0];
                  const isSelected = selectedWorkerIds.has(worker.id);

                  return (
                    <label
                      key={worker.id}
                      className={`flex items-center gap-4 p-4 rounded-lg cursor-pointer transition-colors ${isSelected
                        ? 'bg-emerald-900/30 border border-emerald-700'
                        : 'bg-zinc-800 border border-transparent hover:bg-zinc-700'
                        }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleWorker(worker.id)}
                        className="w-5 h-5 rounded text-emerald-500"
                      />
                      <div className="flex-1">
                        <div className="font-medium">
                          {worker.displayName || worker.wallet.slice(0, 12) + '...'}
                        </div>
                        <div className="text-xs text-zinc-500">
                          {worker.type} · {comp?.schedule || 'No schedule'}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">
                          {comp ? formatAmount(comp.rateAmount) : '-'}
                        </div>
                        <div className="text-xs text-zinc-500">{comp?.currency || 'USDC'}</div>
                      </div>
                    </label>
                  );
                })}
              </div>

              {ineligibleWorkers.length > 0 && (
                <div className="mt-4 p-3 bg-yellow-900/20 border border-yellow-700/50 rounded-lg">
                  <p className="text-sm text-yellow-300">
                    {ineligibleWorkers.length} worker(s) ineligible (missing compensation plan)
                  </p>
                </div>
              )}

              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => setStep('config')}
                  className="px-4 py-3 bg-zinc-700 hover:bg-zinc-600 rounded-lg transition-colors font-medium"
                >
                  Back
                </button>
                <button
                  disabled={selectedWorkerIds.size === 0}
                  onClick={() => setStep('review')}
                  className="flex-1 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-700 disabled:cursor-not-allowed rounded-lg transition-colors font-medium"
                >
                  Next: Review ({selectedWorkerIds.size} selected)
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {step === 'review' && (
        <div className="glass-card rounded-xl p-6 max-w-2xl">
          <h3 className="text-lg font-semibold mb-4">Step 3: Review & Create</h3>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-zinc-800 rounded-lg">
                <div className="text-sm text-zinc-400">Workers</div>
                <div className="text-2xl font-bold">{selectedWorkerIds.size}</div>
              </div>
              <div className="p-4 bg-zinc-800 rounded-lg">
                <div className="text-sm text-zinc-400">Total Amount</div>
                <div className="text-2xl font-bold">{formatAmount(totalAmount.toString())}</div>
              </div>
            </div>

            <div className="p-4 bg-zinc-800 rounded-lg">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-zinc-400">Mode:</span>{' '}
                  <span className="font-medium">{formData.mode}</span>
                </div>
                {formData.periodStart && (
                  <div>
                    <span className="text-zinc-400">Period:</span>{' '}
                    <span className="font-medium">
                      {formData.periodStart} to {formData.periodEnd || 'N/A'}
                    </span>
                  </div>
                )}
                {formData.claimDeadline && (
                  <div>
                    <span className="text-zinc-400">Claim Deadline:</span>{' '}
                    <span className="font-medium">
                      {new Date(formData.claimDeadline).toLocaleString()}
                    </span>
                  </div>
                )}
                {formData.notes && (
                  <div className="col-span-2">
                    <span className="text-zinc-400">Notes:</span>{' '}
                    <span className="font-medium">{formData.notes}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setStep('workers')}
                className="px-4 py-3 bg-zinc-700 hover:bg-zinc-600 rounded-lg transition-colors font-medium"
              >
                Back
              </button>
              <button
                onClick={handleCreatePayrun}
                className="flex-1 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors font-medium"
              >
                Create Payrun
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 'creating' && (
        <div className="glass-card rounded-xl p-6 max-w-2xl">
          <h3 className="text-lg font-semibold mb-4">Creating Payrun...</h3>
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-zinc-300">Generating payslips and cryptographic commitments...</p>
          </div>
        </div>
      )}

      {step === 'done' && createdPayrun && (
        <div className="glass-card rounded-xl p-6 max-w-2xl">
          <h3 className="text-lg font-semibold mb-4 text-emerald-400">
            Payrun Created Successfully!
          </h3>

          <div className="space-y-4">
            <div className="p-4 bg-emerald-900/30 border border-emerald-700 rounded-lg">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-emerald-300">Payslips</div>
                  <div className="text-2xl font-bold">{createdPayrun.totalPayslips}</div>
                </div>
                <div>
                  <div className="text-sm text-emerald-300">Total Amount</div>
                  <div className="text-2xl font-bold">
                    {formatAmount(createdPayrun.totalAmount)}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 bg-zinc-800 rounded-lg">
              <div className="text-sm text-zinc-400 mb-1">Payrun ID</div>
              <div className="font-mono text-sm break-all">{createdPayrun.payrunIdHex}</div>
            </div>

            <div className="p-4 bg-blue-900/30 border border-blue-700 rounded-lg">
              <p className="text-sm text-blue-300">
                <strong>Next Steps:</strong> The payrun is in DRAFT status. Go to the payrun details
                to validate it (generates merkle tree & ZK proofs), then open it for claims or
                execute batch payouts.
              </p>
            </div>

            <div className="flex gap-2">
              <a
                href={`/dashboard/payruns/${createdPayrun.payrunId}`}
                className="flex-1 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors font-medium text-center"
              >
                View Payrun Details
              </a>
              <a
                href="/dashboard/payruns"
                className="px-4 py-3 bg-zinc-700 hover:bg-zinc-600 rounded-lg transition-colors font-medium"
              >
                All Payruns
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
