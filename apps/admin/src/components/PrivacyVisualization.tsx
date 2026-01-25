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
    icon: 'money',
  },
  {
    id: 'identity',
    label: 'Employee Identity',
    description: 'Your wallet address and name',
    status: 'hidden',
    icon: 'user',
  },
  {
    id: 'eligibility',
    label: 'Claim Eligibility',
    description: 'Proof you are in the payrun',
    status: 'zk',
    icon: 'check',
  },
  {
    id: 'nullifier',
    label: 'Double-Claim Prevention',
    description: 'Unique claim identifier',
    status: 'public',
    icon: 'lock',
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
              className={`px-2 py-1 text-xs rounded-full border flex items-center gap-1 ${config.color}`}
            >
              {key === 'encrypted' && (
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18 8h-1V6c0-2.76-2.24-5-5-5s-5 2.24-5 5v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6zm9 14H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z" />
                </svg>
              )}
              {key === 'zk' && (
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z" />
                </svg>
              )}
              {key === 'hidden' && (
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
                </svg>
              )}
              {key === 'public' && (
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                </svg>
              )}
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
              <div className="w-8 h-8 mb-2 flex items-center justify-center">
                {step.icon === 'money' && (
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z" />
                  </svg>
                )}
                {step.icon === 'user' && (
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                  </svg>
                )}
                {step.icon === 'check' && (
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                  </svg>
                )}
                {step.icon === 'lock' && (
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18 8h-1V6c0-2.76-2.24-5-5-5s-5 2.24-5 5v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6zm9 14H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z" />
                  </svg>
                )}
              </div>
              <div className="font-medium text-sm">{step.label}</div>
              <div className="text-xs opacity-75 mt-1">{config.badge}</div>
            </button>
          );
        })}
      </div>

      {selectedStep && (
        <div className="mt-6 p-4 bg-zinc-800/50 rounded-lg">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 flex items-center justify-center">
              {selectedStep.icon === 'money' && (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z" />
                </svg>
              )}
              {selectedStep.icon === 'user' && (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                </svg>
              )}
              {selectedStep.icon === 'check' && (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                </svg>
              )}
              {selectedStep.icon === 'lock' && (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18 8h-1V6c0-2.76-2.24-5-5-5s-5 2.24-5 5v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6zm9 14H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z" />
                </svg>
              )}
            </div>
            <div>
              <h4 className="font-semibold">{selectedStep.label}</h4>
              <p className="text-sm text-zinc-400">{selectedStep.description}</p>
            </div>
          </div>
          <div
            className={`inline-block px-3 py-1 rounded-full text-sm ${statusConfig[selectedStep.status].color}`}
          >
            {statusConfig[selectedStep.status].badge}
          </div>
          <p className="text-sm text-zinc-400 mt-2">
            {statusConfig[selectedStep.status].description}
          </p>
        </div>
      )}

      <div className="mt-6 p-4 bg-gradient-to-r from-emerald-900/20 to-blue-900/20 rounded-lg border border-emerald-700/30">
        <h4 className="font-medium text-emerald-300 mb-2 flex items-center gap-2">
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M18 8h-1V6c0-2.76-2.24-5-5-5s-5 2.24-5 5v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6zm9 14H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z" />
          </svg>
          Privacy Summary
        </h4>
        <ul className="text-sm text-zinc-300 space-y-1">
          <li className="flex items-center gap-2">
            <svg className="w-4 h-4 text-emerald-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
            </svg>{' '}
            <strong>Salary amounts</strong> are encrypted on-chain using Inco Lightning
          </li>
          <li className="flex items-center gap-2">
            <svg className="w-4 h-4 text-emerald-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
            </svg>{' '}
            <strong>Employee identities</strong> are never revealed (only commitments stored)
          </li>
          <li className="flex items-center gap-2">
            <svg className="w-4 h-4 text-emerald-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
            </svg>{' '}
            <strong>Claim eligibility</strong> is proven via ZK without revealing data
          </li>
          <li className="flex items-center gap-2">
            <svg className="w-4 h-4 text-emerald-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
            </svg>{' '}
            <strong>Claim links</strong> use unguessable tokens, not wallet addresses
          </li>
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
            <h3 className="font-semibold text-emerald-400 mb-2 flex items-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18 8h-1V6c0-2.76-2.24-5-5-5s-5 2.24-5 5v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6zm9 14H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z" />
              </svg>
              Encrypted Amounts (Inco Lightning)
            </h3>
            <p className="text-sm text-zinc-300">
              All salary amounts are encrypted using Inco Lightning before being stored on-chain.
              Only the recipient can decrypt their actual payment amount. Observers see only
              encrypted ciphertext.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-blue-400 mb-2 flex items-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
              </svg>
              Zero-Knowledge Proofs (Noir + Sunspot)
            </h3>
            <p className="text-sm text-zinc-300">
              When claiming salary, employees prove they are eligible without revealing their
              identity or amount. The ZK proof is verified on-chain using the Sunspot Groth16
              verifier.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-amber-400 mb-2 flex items-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z" />
              </svg>
              Merkle Tree Commitments
            </h3>
            <p className="text-sm text-zinc-300">
              The payrun stores only a single 32-byte Merkle root on-chain. Individual employee data
              remains off-chain, with only cryptographic commitments included in the tree.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-red-400 mb-2 flex items-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
              </svg>
              Nullifiers (Double-Claim Prevention)
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
