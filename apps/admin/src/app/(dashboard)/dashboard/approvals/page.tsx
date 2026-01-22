'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { api, Org, ApprovalRequestWithPayrun } from '../../../../lib/api';

function formatAmount(amount: string | null): string {
    if (!amount) return '-';
    const num = BigInt(amount);
    const usd = Number(num) / 1_000_000;
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
    }).format(usd);
}

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

export default function ApprovalsPage() {
    const { publicKey } = useWallet();
    const wallet = publicKey?.toBase58();

    const [org, setOrg] = useState<Org | null>(null);
    const [requests, setRequests] = useState<ApprovalRequestWithPayrun[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<string>('PENDING');
    const [selectedRequest, setSelectedRequest] = useState<ApprovalRequestWithPayrun | null>(null);
    const [actionLoading, setActionLoading] = useState(false);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

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
                setRequests([]);
                return;
            }

            const selectedOrg = orgs[0];
            setOrg(selectedOrg);

            const requestList = await api.approvals.list(
                selectedOrg.id,
                wallet,
                statusFilter || undefined
            );
            setRequests(requestList);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load approval requests');
        } finally {
            setLoading(false);
        }
    };

    const handleRespond = async (approved: boolean, comments: string) => {
        if (!org || !wallet || !selectedRequest) return;

        setActionLoading(true);
        setError(null);

        try {
            await api.approvals.respond(
                org.id,
                selectedRequest.id,
                { approved, comments },
                wallet
            );
            setSelectedRequest(null);
            setSuccessMessage(approved ? 'Payrun approved!' : 'Payrun rejected');
            setTimeout(() => setSuccessMessage(null), 5000);
            await loadData();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to respond to approval request');
        } finally {
            setActionLoading(false);
        }
    };

    if (!wallet) {
        return (
            <div className="text-center py-16">
                <p className="text-zinc-400">Please connect your wallet to view approval requests.</p>
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
                    <h2 className="text-2xl font-bold">Approval Requests</h2>
                    <p className="text-zinc-400 text-sm">
                        Review and approve pending payrun requests
                    </p>
                </div>
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
                    <option value="PENDING">Pending</option>
                    <option value="APPROVED">Approved</option>
                    <option value="REJECTED">Rejected</option>
                </select>
            </div>

            {requests.length === 0 ? (
                <div className="glass-card rounded-xl p-8 text-center">
                    <div className="text-5xl mb-4">✅</div>
                    <h3 className="text-xl font-semibold mb-2">No approval requests</h3>
                    <p className="text-zinc-400">
                        {statusFilter === 'PENDING'
                            ? 'All caught up! No pending approvals.'
                            : 'No requests match the selected filter.'}
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {requests.map((request) => (
                        <div key={request.id} className="glass-card rounded-xl p-6">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-lg font-semibold">
                                            Payrun: {request.payrun.payrunIdHex.slice(0, 12)}...
                                        </span>
                                        <span
                                            className={`px-2 py-1 text-xs rounded-full ${request.status === 'PENDING'
                                                    ? 'bg-amber-900/50 text-amber-300'
                                                    : request.status === 'APPROVED'
                                                        ? 'bg-emerald-900/50 text-emerald-300'
                                                        : 'bg-red-900/50 text-red-300'
                                                }`}
                                        >
                                            {request.status}
                                        </span>
                                    </div>
                                    <p className="text-sm text-zinc-400 mt-1">
                                        {request.payrun.totalPayslips} payslips • {formatAmount(request.payrun.totalAmount)}
                                    </p>
                                    {request.payrun.periodStart && request.payrun.periodEnd && (
                                        <p className="text-sm text-zinc-500">
                                            Period: {formatDate(request.payrun.periodStart)} - {formatDate(request.payrun.periodEnd)}
                                        </p>
                                    )}
                                </div>
                                <div className="text-right text-sm text-zinc-500">
                                    <p>Requested: {formatDate(request.requestedAt)}</p>
                                    <p className="font-mono text-xs">
                                        By: {request.requestedBy.slice(0, 8)}...
                                    </p>
                                </div>
                            </div>

                            {request.comments && (
                                <div className="p-3 bg-zinc-800 rounded-lg mb-4 text-sm text-zinc-300 italic">
                                    "{request.comments}"
                                </div>
                            )}

                            {request.status === 'PENDING' && (
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setSelectedRequest(request)}
                                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors text-sm"
                                    >
                                        Review & Respond
                                    </button>
                                    <a
                                        href={`/dashboard/payruns/${request.payrunId}`}
                                        className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg transition-colors text-sm"
                                    >
                                        View Payrun Details
                                    </a>
                                </div>
                            )}

                            {request.status !== 'PENDING' && request.respondedBy && (
                                <div className="text-sm text-zinc-400">
                                    Responded by <span className="font-mono">{request.respondedBy.slice(0, 8)}...</span>
                                    {request.respondedAt && ` on ${formatDate(request.respondedAt)}`}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {selectedRequest && (
                <ApprovalResponseModal
                    request={selectedRequest}
                    loading={actionLoading}
                    onRespond={handleRespond}
                    onClose={() => setSelectedRequest(null)}
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

function ApprovalResponseModal({
    request,
    loading,
    onRespond,
    onClose,
}: {
    request: ApprovalRequestWithPayrun;
    loading: boolean;
    onRespond: (approved: boolean, comments: string) => void;
    onClose: () => void;
}) {
    const [comments, setComments] = useState('');

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-zinc-900 rounded-xl p-6 w-full max-w-lg border border-zinc-800">
                <h3 className="text-xl font-semibold mb-4">Review Approval Request</h3>

                <div className="p-4 bg-zinc-800 rounded-lg mb-4">
                    <p className="text-sm text-zinc-400 mb-2">Payrun Details</p>
                    <p className="font-mono text-sm">{request.payrun.payrunIdHex}</p>
                    <div className="grid grid-cols-2 gap-4 mt-2 text-sm">
                        <div>
                            <span className="text-zinc-400">Payslips:</span> {request.payrun.totalPayslips}
                        </div>
                        <div>
                            <span className="text-zinc-400">Total:</span> {formatAmount(request.payrun.totalAmount)}
                        </div>
                    </div>
                </div>

                {request.comments && (
                    <div className="p-3 bg-zinc-800/50 rounded-lg mb-4">
                        <p className="text-sm text-zinc-400 mb-1">Requester's Notes:</p>
                        <p className="text-sm italic">"{request.comments}"</p>
                    </div>
                )}

                <div className="mb-4">
                    <label className="block text-sm font-medium text-zinc-400 mb-1">
                        Your Comments (Optional)
                    </label>
                    <textarea
                        value={comments}
                        onChange={(e) => setComments(e.target.value)}
                        className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-emerald-500 min-h-[80px]"
                        placeholder="Add any notes about your decision..."
                    />
                </div>

                <div className="flex gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => onRespond(false, comments)}
                        disabled={loading}
                        className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-zinc-700 rounded-lg transition-colors"
                    >
                        {loading ? 'Processing...' : 'Reject'}
                    </button>
                    <button
                        onClick={() => onRespond(true, comments)}
                        disabled={loading}
                        className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-700 rounded-lg transition-colors"
                    >
                        {loading ? 'Processing...' : 'Approve'}
                    </button>
                </div>
            </div>
        </div>
    );
}
