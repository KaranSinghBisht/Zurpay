'use client';

import { useState, useEffect } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';
import { deriveOrgPda, derivePayrunPda, hexToBytes, ZURPAY_PROGRAM_ID } from '@zurpay/sdk';
import { api, Paylink, Org } from '../../../../lib/api';
import { QRCodeModal } from '../../../../components/QRCodeGenerator';

export default function PaylinksPage() {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const wallet = publicKey?.toBase58();

  const [org, setOrg] = useState<Org | null>(null);
  const [paylinks, setPaylinks] = useState<Paylink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [resendModalPaylink, setResendModalPaylink] = useState<Paylink | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [qrModalPaylink, setQrModalPaylink] = useState<Paylink | null>(null);
  const [postingOnChain, setPostingOnChain] = useState<string | null>(null);

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
        setPaylinks([]);
        return;
      }

      const selectedOrg = orgs[0];
      setOrg(selectedOrg);

      const params: { status?: string } = {};
      if (statusFilter) params.status = statusFilter;

      const paylinkList = await api.paylinks.list(selectedOrg.id, wallet, params);
      setPaylinks(paylinkList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load paylinks');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (paylinkId: string) => {
    if (!org || !wallet) return;
    if (!confirm('Are you sure you want to cancel this paylink?')) return;

    try {
      await api.paylinks.cancel(org.id, paylinkId, wallet);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel paylink');
    }
  };

  const handlePostOnChain = async (paylink: Paylink) => {
    if (!org || !wallet || !publicKey || !signTransaction) return;
    if (!paylink.paylinkIdHex || !paylink.merkleRootHex) {
      setError('Paylink is missing required cryptographic data');
      return;
    }

    setPostingOnChain(paylink.id);
    setError(null);

    try {
      const orgIdBytes = hexToBytes(org.orgIdHex);
      const paylinkIdBytes = hexToBytes(paylink.paylinkIdHex);
      const merkleRootBytes = hexToBytes(paylink.merkleRootHex);

      const orgPda = deriveOrgPda(orgIdBytes, ZURPAY_PROGRAM_ID);
      const payrunPda = derivePayrunPda(orgIdBytes, paylinkIdBytes, ZURPAY_PROGRAM_ID);

      const [orgAccountInfo, payrunAccountInfo] = await Promise.all([
        connection.getAccountInfo(orgPda),
        connection.getAccountInfo(payrunPda),
      ]);

      if (payrunAccountInfo) {
        setError('This paylink has already been posted on-chain');
        return;
      }

      const transaction = new Transaction();

      if (!orgAccountInfo) {
        const treasuryPubkey = new PublicKey(org.treasuryConfAccount);
        const zkVerifierPubkey = new PublicKey(org.zkVerifierProgramId);
        const incoPubkey = new PublicKey(org.incoProgramId);

        const initOrgDiscriminator = Buffer.from([159, 225, 34, 170, 187, 34, 218, 4]);
        const initOrgData = Buffer.concat([
          initOrgDiscriminator,
          Buffer.from(orgIdBytes),
          Buffer.from(treasuryPubkey.toBytes()),
          Buffer.from(zkVerifierPubkey.toBytes()),
          Buffer.from(incoPubkey.toBytes()),
        ]);

        transaction.add(
          new TransactionInstruction({
            programId: ZURPAY_PROGRAM_ID,
            keys: [
              { pubkey: publicKey, isSigner: true, isWritable: true },
              { pubkey: orgPda, isSigner: false, isWritable: true },
              { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            ],
            data: initOrgData,
          })
        );
      }

      const setPayrunDiscriminator = Buffer.from([106, 77, 86, 198, 171, 28, 92, 59]);
      const totalEmployeesBuf = Buffer.alloc(4);
      totalEmployeesBuf.writeUInt32LE(1, 0);

      const deadlineUnix = Math.floor(new Date(paylink.expiresAt).getTime() / 1000);
      const deadlineBuf = Buffer.alloc(8);
      deadlineBuf.writeBigInt64LE(BigInt(deadlineUnix), 0);

      const setPayrunData = Buffer.concat([
        setPayrunDiscriminator,
        Buffer.from(paylinkIdBytes),
        Buffer.from(merkleRootBytes),
        totalEmployeesBuf,
        deadlineBuf,
      ]);

      transaction.add(
        new TransactionInstruction({
          programId: ZURPAY_PROGRAM_ID,
          keys: [
            { pubkey: publicKey, isSigner: true, isWritable: true },
            { pubkey: orgPda, isSigner: false, isWritable: true },
            { pubkey: payrunPda, isSigner: false, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          ],
          data: setPayrunData,
        })
      );

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      const signedTx = await signTransaction(transaction);
      const signature = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });

      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        'confirmed'
      );

      await api.paylinks.setOnChain(org.id, paylink.id, signature, wallet);
      setSuccessMessage('Paylink posted on-chain successfully!');
      setTimeout(() => setSuccessMessage(null), 5000);
      loadData();
    } catch (err) {
      console.error('Post on-chain error:', err);
      setError(err instanceof Error ? err.message : 'Failed to post paylink on-chain');
    } finally {
      setPostingOnChain(null);
    }
  };

  const formatAmount = (amount: string) => {
    const num = BigInt(amount);
    const usd = Number(num) / 1_000_000;
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(usd);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  if (!wallet) {
    return (
      <div className="text-center py-16">
        <p className="text-zinc-400">Please connect your wallet to view paylinks.</p>
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
          <h2 className="text-2xl font-bold">Paylinks</h2>
          <p className="text-zinc-400 text-sm">
            One-time payment links for contractors and ad-hoc payments
          </p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="btn-primary">
          Create Paylink
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
          <option value="CLAIMED">Claimed</option>
          <option value="EXPIRED">Expired</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>

      {paylinks.length === 0 ? (
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
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>
          <h3 className="text-xl font-semibold mb-2">No paylinks yet</h3>
          <p className="text-zinc-400 mb-6">
            Create payment links for contractors or one-off payments
          </p>
          <button onClick={() => setShowCreateModal(true)} className="btn-primary">
            Create Paylink
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {paylinks.map((paylink) => {
            const claimUrl = paylink.claimUrl || '';

            return (
              <div key={paylink.id} className="glass-card rounded-xl p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="text-2xl font-bold">{formatAmount(paylink.amount)}</span>
                      <span
                        className={`px-2 py-1 text-xs rounded-full ${
                          paylink.status === 'ACTIVE'
                            ? 'bg-emerald-900/50 text-emerald-300'
                            : paylink.status === 'CLAIMED'
                              ? 'bg-blue-900/50 text-blue-300'
                              : paylink.status === 'EXPIRED'
                                ? 'bg-yellow-900/50 text-yellow-300'
                                : 'bg-zinc-700 text-zinc-400'
                        }`}
                      >
                        {paylink.status}
                      </span>
                    </div>
                    {paylink.memo && <p className="text-sm text-zinc-400 mt-1">{paylink.memo}</p>}
                  </div>
                  <div className="text-right text-sm text-zinc-500">
                    <p>Created {new Date(paylink.createdAt).toLocaleDateString()}</p>
                    <p>Expires {new Date(paylink.expiresAt).toLocaleDateString()}</p>
                  </div>
                </div>

                {paylink.status === 'ACTIVE' && !paylink.onChainTxSig && (
                  <div className="p-3 bg-orange-900/20 border border-orange-700/50 rounded-lg mb-4 flex items-center justify-between">
                    <span className="text-sm text-orange-300">
                      Not posted on-chain. Recipients cannot claim until posted.
                    </span>
                    <button
                      onClick={() => handlePostOnChain(paylink)}
                      disabled={postingOnChain !== null}
                      className="px-3 py-1 bg-orange-600 hover:bg-orange-700 disabled:bg-zinc-700 rounded text-sm transition-colors font-medium"
                    >
                      {postingOnChain === paylink.id ? 'Posting...' : 'Post On-Chain'}
                    </button>
                  </div>
                )}
                {paylink.status === 'ACTIVE' && paylink.onChainTxSig && claimUrl && (
                  <div className="flex items-center gap-2 p-3 bg-zinc-800 rounded-lg mb-4">
                    <input
                      type="text"
                      readOnly
                      value={claimUrl}
                      className="flex-1 bg-transparent text-sm font-mono text-zinc-300 outline-none"
                    />
                    <button
                      onClick={() => copyToClipboard(claimUrl)}
                      className="px-3 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-sm transition-colors"
                    >
                      Copy
                    </button>
                  </div>
                )}
                {paylink.status === 'ACTIVE' && paylink.onChainTxSig && !claimUrl && (
                  <div className="p-3 bg-yellow-900/20 rounded-lg mb-4 text-sm text-yellow-300">
                    Claim link unavailable. Regenerate to share a new link.
                  </div>
                )}

                {paylink.status === 'ACTIVE' && paylink.onChainTxSig && (
                  <div className="text-xs text-zinc-500 mb-4">
                    On-chain:{' '}
                    <a
                      href={`https://explorer.solana.com/tx/${paylink.onChainTxSig}?cluster=devnet`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-400 hover:underline"
                    >
                      View Setup Tx
                    </a>
                  </div>
                )}
                {paylink.status === 'CLAIMED' && (
                  <div className="p-3 bg-blue-900/20 rounded-lg mb-4">
                    <p className="text-sm text-blue-300">
                      Claimed by{' '}
                      <span className="font-mono">
                        {paylink.claimedBy?.slice(0, 8)}...{paylink.claimedBy?.slice(-8)}
                      </span>
                    </p>
                    {paylink.payoutTxSig && (
                      <a
                        href={`https://explorer.solana.com/tx/${paylink.payoutTxSig}?cluster=devnet`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-400 hover:underline"
                      >
                        View Claim Transaction
                      </a>
                    )}
                  </div>
                )}

                {paylink.status === 'ACTIVE' && (
                  <div className="flex gap-4">
                    <button
                      onClick={() => setQrModalPaylink(paylink)}
                      className="inline-flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 4v16m8-8H4"
                        />
                      </svg>
                      QR Code
                    </button>
                    <button
                      onClick={() => setResendModalPaylink(paylink)}
                      className="inline-flex items-center gap-1 text-sm text-emerald-400 hover:text-emerald-300"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                        />
                      </svg>
                      Resend Email
                    </button>
                    <button
                      onClick={() => handleCancel(paylink.id)}
                      className="text-sm text-red-400 hover:text-red-300"
                    >
                      Cancel Paylink
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showCreateModal && (
        <CreatePaylinkModal
          orgId={org.id}
          wallet={wallet}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            loadData();
          }}
        />
      )}

      {resendModalPaylink && (
        <ResendEmailModal
          orgId={org.id}
          paylinkId={resendModalPaylink.id}
          wallet={wallet}
          onClose={() => setResendModalPaylink(null)}
          onSuccess={(email) => {
            setResendModalPaylink(null);
            setSuccessMessage(`Email sent to ${email}`);
            setTimeout(() => setSuccessMessage(null), 5000);
          }}
        />
      )}

      {successMessage && (
        <div className="fixed bottom-6 right-6 px-6 py-3 bg-emerald-600 text-white rounded-lg shadow-lg z-50 animate-pulse">
          ✓ {successMessage}
        </div>
      )}

      {qrModalPaylink && (
        <QRCodeModal
          isOpen={true}
          onClose={() => setQrModalPaylink(null)}
          url={qrModalPaylink.claimUrl || ''}
          title={`Payment: ${qrModalPaylink.amount} ${qrModalPaylink.currency}`}
        />
      )}
    </div>
  );
}

function CreatePaylinkModal({
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
    amount: '',
    recipientWallet: '',
    recipientEmail: '',
    recipientName: '',
    expiresAt: '',
    memo: '',
    sendEmail: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdPaylink, setCreatedPaylink] = useState<(Paylink & { emailSent?: boolean }) | null>(
    null
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const amountInMicroUnits = (parseFloat(formData.amount) * 1_000_000).toString();

      const paylink = await api.paylinks.create(
        orgId,
        {
          amount: amountInMicroUnits,
          recipientWallet: formData.recipientWallet || undefined,
          recipientEmail: formData.recipientEmail || undefined,
          recipientName: formData.recipientName || undefined,
          expiresAt: new Date(formData.expiresAt).toISOString(),
          memo: formData.memo || undefined,
          sendEmail: formData.sendEmail && !!formData.recipientEmail,
        },
        wallet
      );

      setCreatedPaylink(paylink as Paylink & { emailSent?: boolean });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create paylink');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  if (createdPaylink) {
    const claimUrl = createdPaylink.claimUrl || '';

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-zinc-900 rounded-xl p-6 w-full max-w-md border border-zinc-800">
          <h3 className="text-xl font-semibold mb-4 text-emerald-400">Paylink Created!</h3>

          <div className="space-y-4">
            {createdPaylink.emailSent && (
              <div className="p-3 bg-emerald-900/30 border border-emerald-700 rounded-lg text-emerald-300 text-sm">
                Email sent to {formData.recipientEmail}
              </div>
            )}

            <div className="p-4 bg-zinc-800 rounded-lg">
              <p className="text-sm text-zinc-400 mb-2">Share this link:</p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={claimUrl}
                  className="flex-1 bg-transparent text-sm font-mono text-zinc-300 outline-none"
                />
                <button
                  onClick={() => copyToClipboard(claimUrl)}
                  className="px-3 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-sm transition-colors"
                >
                  Copy
                </button>
              </div>
            </div>

            <button
              onClick={onSuccess}
              className="w-full px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-zinc-900 rounded-xl p-6 w-full max-w-md border border-zinc-800 max-h-[90vh] overflow-y-auto">
        <h3 className="text-xl font-semibold mb-4">Create Paylink</h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Amount (USDC) *</label>
            <input
              type="number"
              required
              step="0.01"
              min="0.01"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-emerald-500"
              placeholder="100.00"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">
              Recipient Wallet (Optional)
            </label>
            <input
              type="text"
              value={formData.recipientWallet}
              onChange={(e) => setFormData({ ...formData, recipientWallet: e.target.value })}
              className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-emerald-500 font-mono text-sm"
              placeholder="Leave empty to allow anyone with the link"
            />
          </div>

          <div className="border-t border-zinc-700 pt-4">
            <label className="flex items-center gap-3 cursor-pointer mb-4">
              <input
                type="checkbox"
                checked={formData.sendEmail}
                onChange={(e) => setFormData({ ...formData, sendEmail: e.target.checked })}
                className="w-4 h-4 rounded text-emerald-500"
              />
              <span className="text-sm">Send claim link via email</span>
            </label>

            {formData.sendEmail && (
              <div className="space-y-3 pl-7">
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">
                    Recipient Email *
                  </label>
                  <input
                    type="email"
                    required={formData.sendEmail}
                    value={formData.recipientEmail}
                    onChange={(e) => setFormData({ ...formData, recipientEmail: e.target.value })}
                    className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-emerald-500"
                    placeholder="recipient@example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">
                    Recipient Name (Optional)
                  </label>
                  <input
                    type="text"
                    value={formData.recipientName}
                    onChange={(e) => setFormData({ ...formData, recipientName: e.target.value })}
                    className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-emerald-500"
                    placeholder="John Doe"
                  />
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Expires At *</label>
            <input
              type="datetime-local"
              required
              value={formData.expiresAt}
              onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
              className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Memo</label>
            <input
              type="text"
              value={formData.memo}
              onChange={(e) => setFormData({ ...formData, memo: e.target.value })}
              className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-emerald-500"
              placeholder="Payment for..."
            />
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
              {loading ? 'Creating...' : 'Create Paylink'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ResendEmailModal({
  orgId,
  paylinkId,
  wallet,
  onClose,
  onSuccess,
}: {
  orgId: string;
  paylinkId: string;
  wallet: string;
  onClose: () => void;
  onSuccess: (email: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await api.paylinks.sendEmail(
        orgId,
        paylinkId,
        { email, recipientName: recipientName || undefined },
        wallet
      );
      onSuccess(email);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send email');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-zinc-900 rounded-xl p-6 w-full max-w-md border border-zinc-800">
        <h3 className="text-xl font-semibold mb-4">Resend Claim Link Email</h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">
              Recipient Email *
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-emerald-500"
              placeholder="recipient@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">
              Recipient Name (Optional)
            </label>
            <input
              type="text"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-emerald-500"
              placeholder="John Doe"
            />
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
              {loading ? 'Sending...' : 'Send Email'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
