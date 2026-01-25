'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { api, Org, RecurringSchedule, Worker } from '../../../../lib/api';

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const frequencyLabels: Record<string, string> = {
  WEEKLY: 'Weekly',
  BIWEEKLY: 'Bi-weekly',
  SEMIMONTHLY: 'Semi-monthly',
  MONTHLY: 'Monthly',
};

const dayOfWeekLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function SchedulesPage() {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58();

  const [org, setOrg] = useState<Org | null>(null);
  const [schedules, setSchedules] = useState<RecurringSchedule[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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
        setSchedules([]);
        return;
      }

      const selectedOrg = orgs[0];
      setOrg(selectedOrg);

      const [scheduleList, workerList] = await Promise.all([
        api.schedules.list(selectedOrg.id, wallet),
        api.workers.list(selectedOrg.id, wallet),
      ]);
      setSchedules(scheduleList);
      setWorkers(workerList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load schedules');
    } finally {
      setLoading(false);
    }
  };

  const handleRunNow = async (scheduleId: string) => {
    if (!org || !wallet) return;
    if (!confirm('This will create a new payrun based on this schedule. Continue?')) return;

    setActionLoading(scheduleId);
    setError(null);

    try {
      const result = await api.schedules.runNow(org.id, scheduleId, wallet);
      setSuccessMessage(`Payrun created! ID: ${result.payrun.payrunIdHex.slice(0, 12)}...`);
      setTimeout(() => setSuccessMessage(null), 5000);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run schedule');
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleStatus = async (schedule: RecurringSchedule) => {
    if (!org || !wallet) return;

    const newStatus = schedule.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    setActionLoading(schedule.id);

    try {
      await api.schedules.update(org.id, schedule.id, { status: newStatus }, wallet);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update schedule');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (scheduleId: string) => {
    if (!org || !wallet) return;
    if (!confirm('Are you sure you want to delete this schedule?')) return;

    setActionLoading(scheduleId);

    try {
      await api.schedules.delete(org.id, scheduleId, wallet);
      setSuccessMessage('Schedule deleted');
      setTimeout(() => setSuccessMessage(null), 5000);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete schedule');
    } finally {
      setActionLoading(null);
    }
  };

  const getScheduleDescription = (schedule: RecurringSchedule): string => {
    const freq = frequencyLabels[schedule.frequency] || schedule.frequency;
    if (schedule.frequency === 'WEEKLY' || schedule.frequency === 'BIWEEKLY') {
      const day = schedule.dayOfWeek !== null ? dayOfWeekLabels[schedule.dayOfWeek] : '';
      return `${freq} on ${day}`;
    }
    if (schedule.frequency === 'SEMIMONTHLY') {
      return `${freq} on days ${schedule.dayOfMonth} & ${schedule.secondDayOfMonth}`;
    }
    return `${freq} on day ${schedule.dayOfMonth}`;
  };

  if (!wallet) {
    return (
      <div className="text-center py-16">
        <p className="text-zinc-400">Please connect your wallet to view schedules.</p>
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
          <h2 className="text-2xl font-bold">Recurring Schedules</h2>
          <p className="text-zinc-400 text-sm">Automate payroll with recurring payment schedules</p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="btn-primary">
          Create Schedule
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-300 mb-6">
          {error}
        </div>
      )}

      {schedules.length === 0 ? (
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
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
          <h3 className="text-xl font-semibold mb-2">No schedules yet</h3>
          <p className="text-zinc-400 mb-6">Create recurring schedules to automate your payroll</p>
          <button onClick={() => setShowCreateModal(true)} className="btn-primary">
            Create Schedule
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {schedules.map((schedule) => (
            <div key={schedule.id} className="glass-card rounded-xl p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-semibold">{schedule.name}</span>
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${
                        schedule.status === 'ACTIVE'
                          ? 'bg-emerald-900/50 text-emerald-300'
                          : schedule.status === 'PAUSED'
                            ? 'bg-amber-900/50 text-amber-300'
                            : 'bg-zinc-700 text-zinc-400'
                      }`}
                    >
                      {schedule.status}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-400 mt-1">{getScheduleDescription(schedule)}</p>
                  <p className="text-sm text-zinc-500">
                    {schedule.workerIds.length} workers • Claim deadline:{' '}
                    {schedule.claimDeadlineDays} days
                  </p>
                </div>
                <div className="text-right text-sm text-zinc-500">
                  <p>
                    Next run:{' '}
                    {schedule.nextRunAt ? formatDate(schedule.nextRunAt) : 'Not scheduled'}
                  </p>
                  <p>Last run: {schedule.lastRunAt ? formatDate(schedule.lastRunAt) : 'Never'}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-zinc-800">
                {schedule.requiresApproval && (
                  <span className="inline-flex items-center gap-1 text-xs text-amber-400">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 9v2m0 4v2m0 4v2M6.228 6.228a9 9 0 1012.544 0M6.228 6.228L4.5 4.5m11.772 11.772l1.728 1.728"
                      />
                    </svg>
                    Requires Approval
                  </span>
                )}
                {schedule.autoApprove && (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    Auto-Approve
                  </span>
                )}
              </div>

              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => handleRunNow(schedule.id)}
                  disabled={actionLoading !== null}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-700 rounded text-sm transition-colors"
                >
                  {actionLoading === schedule.id ? '...' : 'Run Now'}
                </button>
                <button
                  onClick={() => handleToggleStatus(schedule)}
                  disabled={actionLoading !== null}
                  className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 rounded text-sm transition-colors"
                >
                  {schedule.status === 'ACTIVE' ? 'Pause' : 'Resume'}
                </button>
                <button
                  onClick={() => handleDelete(schedule.id)}
                  disabled={actionLoading !== null}
                  className="px-3 py-1.5 text-red-400 hover:text-red-300 disabled:opacity-50 text-sm transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreateModal && (
        <CreateScheduleModal
          orgId={org.id}
          wallet={wallet}
          workers={workers}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            setSuccessMessage('Schedule created!');
            setTimeout(() => setSuccessMessage(null), 5000);
            loadData();
          }}
        />
      )}

      {successMessage && (
        <div className="fixed bottom-6 right-6 px-6 py-3 bg-emerald-600 text-white rounded-lg shadow-lg z-50">
          ✓ {successMessage}
        </div>
      )}
    </div>
  );
}

function CreateScheduleModal({
  orgId,
  wallet,
  workers,
  onClose,
  onSuccess,
}: {
  orgId: string;
  wallet: string;
  workers: Worker[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [formData, setFormData] = useState({
    name: '',
    frequency: 'MONTHLY' as 'WEEKLY' | 'BIWEEKLY' | 'SEMIMONTHLY' | 'MONTHLY',
    dayOfWeek: 1,
    dayOfMonth: 1,
    secondDayOfMonth: 15,
    workerIds: [] as string[],
    requiresApproval: true,
    autoApprove: false,
    claimDeadlineDays: 30,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const data: Parameters<typeof api.schedules.create>[1] = {
        name: formData.name,
        frequency: formData.frequency,
        workerIds: formData.workerIds.length > 0 ? formData.workerIds : undefined,
        requiresApproval: formData.requiresApproval,
        autoApprove: formData.autoApprove,
        claimDeadlineDays: formData.claimDeadlineDays,
      };

      if (formData.frequency === 'WEEKLY' || formData.frequency === 'BIWEEKLY') {
        data.dayOfWeek = formData.dayOfWeek;
      } else if (formData.frequency === 'SEMIMONTHLY') {
        data.dayOfMonth = formData.dayOfMonth;
        data.secondDayOfMonth = formData.secondDayOfMonth;
      } else {
        data.dayOfMonth = formData.dayOfMonth;
      }

      await api.schedules.create(orgId, data, wallet);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create schedule');
    } finally {
      setLoading(false);
    }
  };

  const toggleWorker = (workerId: string) => {
    setFormData((prev) => ({
      ...prev,
      workerIds: prev.workerIds.includes(workerId)
        ? prev.workerIds.filter((id) => id !== workerId)
        : [...prev.workerIds, workerId],
    }));
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-zinc-900 rounded-xl p-6 w-full max-w-lg border border-zinc-800 max-h-[90vh] overflow-y-auto">
        <h3 className="text-xl font-semibold mb-4">Create Recurring Schedule</h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Schedule Name *</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-emerald-500"
              placeholder="Monthly Payroll"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Frequency *</label>
            <select
              value={formData.frequency}
              onChange={(e) =>
                setFormData({ ...formData, frequency: e.target.value as typeof formData.frequency })
              }
              className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-emerald-500"
            >
              <option value="WEEKLY">Weekly</option>
              <option value="BIWEEKLY">Bi-weekly</option>
              <option value="SEMIMONTHLY">Semi-monthly (1st & 15th)</option>
              <option value="MONTHLY">Monthly</option>
            </select>
          </div>

          {(formData.frequency === 'WEEKLY' || formData.frequency === 'BIWEEKLY') && (
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Day of Week</label>
              <select
                value={formData.dayOfWeek}
                onChange={(e) => setFormData({ ...formData, dayOfWeek: parseInt(e.target.value) })}
                className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-emerald-500"
              >
                {dayOfWeekLabels.map((day, i) => (
                  <option key={i} value={i}>
                    {day}
                  </option>
                ))}
              </select>
            </div>
          )}

          {formData.frequency === 'MONTHLY' && (
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Day of Month</label>
              <input
                type="number"
                min="1"
                max="28"
                value={formData.dayOfMonth}
                onChange={(e) => setFormData({ ...formData, dayOfMonth: parseInt(e.target.value) })}
                className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-emerald-500"
              />
            </div>
          )}

          {formData.frequency === 'SEMIMONTHLY' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">First Day</label>
                <input
                  type="number"
                  min="1"
                  max="28"
                  value={formData.dayOfMonth}
                  onChange={(e) =>
                    setFormData({ ...formData, dayOfMonth: parseInt(e.target.value) })
                  }
                  className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Second Day</label>
                <input
                  type="number"
                  min="1"
                  max="28"
                  value={formData.secondDayOfMonth}
                  onChange={(e) =>
                    setFormData({ ...formData, secondDayOfMonth: parseInt(e.target.value) })
                  }
                  className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">
              Claim Deadline (days)
            </label>
            <input
              type="number"
              min="1"
              max="90"
              value={formData.claimDeadlineDays}
              onChange={(e) =>
                setFormData({ ...formData, claimDeadlineDays: parseInt(e.target.value) })
              }
              className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.requiresApproval}
                onChange={(e) => setFormData({ ...formData, requiresApproval: e.target.checked })}
                className="w-4 h-4 rounded text-emerald-500"
              />
              <span className="text-sm">Requires Approval</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.autoApprove}
                onChange={(e) => setFormData({ ...formData, autoApprove: e.target.checked })}
                className="w-4 h-4 rounded text-emerald-500"
              />
              <span className="text-sm">Auto-Approve (skip approval step)</span>
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">
              Included Workers (
              {formData.workerIds.length === 0 ? 'All' : formData.workerIds.length})
            </label>
            <div className="max-h-40 overflow-y-auto border border-zinc-700 rounded-lg p-2 space-y-1">
              {workers.length === 0 ? (
                <p className="text-sm text-zinc-500 p-2">No workers found</p>
              ) : (
                workers.map((worker) => (
                  <label
                    key={worker.id}
                    className="flex items-center gap-2 p-2 hover:bg-zinc-800 rounded cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={formData.workerIds.includes(worker.id)}
                      onChange={() => toggleWorker(worker.id)}
                      className="w-4 h-4 rounded text-emerald-500"
                    />
                    <span className="text-sm">
                      {worker.displayName || worker.wallet.slice(0, 8) + '...'}
                    </span>
                    <span className="text-xs text-zinc-500">{worker.type}</span>
                  </label>
                ))
              )}
            </div>
            <p className="text-xs text-zinc-500 mt-1">Leave empty to include all active workers</p>
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
              {loading ? 'Creating...' : 'Create Schedule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
