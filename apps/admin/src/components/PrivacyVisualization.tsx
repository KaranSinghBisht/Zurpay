'use client';

import { useState } from 'react';

interface PrivacyStep {
    id: string;
    label: string;
    description: string;
    status: 'public' | 'encrypted' | 'zk' | 'hidden';
    icon: string;
}

const privacySteps: PrivacyStep[] = [
    {
        id: 'salary',
        label: 'Salary Amount',
        description: 'Your exact salary in USDC',
        status: 'encrypted',
        icon: '💰',
    },
    {
        id: 'identity',
        label: 'Employee Identity',
        description: 'Your wallet address and name',
        status: 'hidden',
        icon: '👤',
    },
    {
        id: 'eligibility',
        label: 'Claim Eligibility',
        description: 'Proof you are in the payrun',
        status: 'zk',
        icon: '✅',
    },
    {
        id: 'nullifier',
        label: 'Double-Claim Prevention',
        description: 'Unique claim identifier',
        status: 'public',
        icon: '🔒',
    },
];

const statusConfig = {
    public: {
        color: 'bg-red-500/20 border-red-500 text-red-300',
        badge: 'On-Chain (Public)',
        description: 'Visible to anyone on Solana',
    },
    encrypted: {
        color: 'bg-amber-500/20 border-amber-500 text-amber-300',
        badge: 'Encrypted (Inco)',
        description: 'Encrypted via Inco Lightning',
    },
    zk: {
        color: 'bg-blue-500/20 border-blue-500 text-blue-300',
        badge: 'ZK Proof Only',
        description: 'Verified without revealing data',
    },
    hidden: {
        color: 'bg-emerald-500/20 border-emerald-500 text-emerald-300',
        badge: 'Never Exposed',
        description: 'Never leaves your device',
    },
};

export function PrivacyVisualization() {
    const [selectedStep, setSelectedStep] = useState<PrivacyStep | null>(null);

    return (
        <div className="glass-card rounded-xl p-6">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h3 className="text-lg font-semibold">Privacy Guarantees</h3>
                    <p className="text-sm text-zinc-400">What stays private in Zurpay</p>
                </div>
                <div className="flex gap-2">
                    {Object.entries(statusConfig).map(([key, config]) => (
                        <div
                            key={key}
                            className={`px-2 py-1 text-xs rounded-full border ${config.color}`}
                        >
                            {key === 'encrypted' && '🔐'}
                            {key === 'zk' && '🎭'}
                            {key === 'hidden' && '🛡️'}
                            {key === 'public' && '📢'}
                        </div>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {privacySteps.map((step) => {
                    const config = statusConfig[step.status];
                    return (
                        <button
                            key={step.id}
                            onClick={() => setSelectedStep(step)}
                            className={`p-4 rounded-lg border-2 transition-all hover:scale-105 ${config.color}`}
                        >
                            <div className="text-3xl mb-2">{step.icon}</div>
                            <div className="font-medium text-sm">{step.label}</div>
                            <div className="text-xs opacity-75 mt-1">{config.badge}</div>
                        </button>
                    );
                })}
            </div>

            {selectedStep && (
                <div className="mt-6 p-4 bg-zinc-800/50 rounded-lg">
                    <div className="flex items-center gap-3 mb-2">
                        <span className="text-2xl">{selectedStep.icon}</span>
                        <div>
                            <h4 className="font-semibold">{selectedStep.label}</h4>
                            <p className="text-sm text-zinc-400">{selectedStep.description}</p>
                        </div>
                    </div>
                    <div className={`inline-block px-3 py-1 rounded-full text-sm ${statusConfig[selectedStep.status].color}`}>
                        {statusConfig[selectedStep.status].badge}
                    </div>
                    <p className="text-sm text-zinc-400 mt-2">
                        {statusConfig[selectedStep.status].description}
                    </p>
                </div>
            )}

            <div className="mt-6 p-4 bg-gradient-to-r from-emerald-900/20 to-blue-900/20 rounded-lg border border-emerald-700/30">
                <h4 className="font-medium text-emerald-300 mb-2">🔒 Privacy Summary</h4>
                <ul className="text-sm text-zinc-300 space-y-1">
                    <li>✓ <strong>Salary amounts</strong> are encrypted on-chain using Inco Lightning</li>
                    <li>✓ <strong>Employee identities</strong> are never revealed (only commitments stored)</li>
                    <li>✓ <strong>Claim eligibility</strong> is proven via ZK without revealing data</li>
                    <li>✓ <strong>Claim links</strong> use unguessable tokens, not wallet addresses</li>
                </ul>
            </div>
        </div>
    );
}

export function PrivacyExplainerModal({
    isOpen,
    onClose,
}: {
    isOpen: boolean;
    onClose: () => void;
}) {
    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={onClose}
        >
            <div
                className="bg-zinc-900 rounded-xl p-6 w-full max-w-2xl border border-zinc-800 max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold">How Zurpay Protects Privacy</h2>
                    <button onClick={onClose} className="text-zinc-400 hover:text-white">
                        ✕
                    </button>
                </div>

                <div className="space-y-6">
                    <section>
                        <h3 className="font-semibold text-emerald-400 mb-2">
                            🔐 Encrypted Amounts (Inco Lightning)
                        </h3>
                        <p className="text-sm text-zinc-300">
                            All salary amounts are encrypted using Inco Lightning before being stored on-chain.
                            Only the recipient can decrypt their actual payment amount. Observers see only
                            encrypted ciphertext.
                        </p>
                    </section>

                    <section>
                        <h3 className="font-semibold text-blue-400 mb-2">
                            🎭 Zero-Knowledge Proofs (Noir + Sunspot)
                        </h3>
                        <p className="text-sm text-zinc-300">
                            When claiming salary, employees prove they are eligible without revealing their
                            identity or amount. The ZK proof is verified on-chain using the Sunspot Groth16
                            verifier.
                        </p>
                    </section>

                    <section>
                        <h3 className="font-semibold text-amber-400 mb-2">
                            🌳 Merkle Tree Commitments
                        </h3>
                        <p className="text-sm text-zinc-300">
                            The payrun stores only a single 32-byte Merkle root on-chain. Individual employee
                            data remains off-chain, with only cryptographic commitments included in the tree.
                        </p>
                    </section>

                    <section>
                        <h3 className="font-semibold text-red-400 mb-2">
                            🛡️ Nullifiers (Double-Claim Prevention)
                        </h3>
                        <p className="text-sm text-zinc-300">
                            Each claim generates a unique nullifier hash stored on-chain. This prevents
                            double-claiming without revealing who claimed or how much.
                        </p>
                    </section>
                </div>

                <button
                    onClick={onClose}
                    className="mt-6 w-full px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
                >
                    Got it!
                </button>
            </div>
        </div>
    );
}
