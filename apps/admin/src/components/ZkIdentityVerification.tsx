'use client';

import { useState } from 'react';

type VerificationStatus = 'none' | 'pending' | 'verified' | 'failed';

interface IdentityProof {
    nullifier: string;
    commitment: string;
    proofData: string;
    verificationType: 'zkpassport' | 'semaphore' | 'worldid';
    verifiedAt: Date;
}

interface ZkIdentityVerificationProps {
    onVerified?: (proof: IdentityProof) => void;
    optional?: boolean;
    className?: string;
}

// Mock Semaphore group ID - in production this would be configured
const ZURPAY_SEMAPHORE_GROUP_ID = 'zurpay-verified-users-v1';

export function ZkIdentityVerification({
    onVerified,
    optional = true,
    className = '',
}: ZkIdentityVerificationProps) {
    const [status, setStatus] = useState<VerificationStatus>('none');
    const [error, setError] = useState<string | null>(null);
    const [selectedMethod, setSelectedMethod] = useState<'zkpassport' | 'semaphore' | null>(null);

    // Simulated zkPassport verification flow
    const handleZkPassportVerify = async () => {
        try {
            setStatus('pending');
            setError(null);

            // In production, this would:
            // 1. Generate a challenge
            // 2. User scans QR with zkPassport app
            // 3. zkPassport generates proof of identity without revealing data
            // 4. Backend verifies the proof

            // Simulate verification delay
            await new Promise((resolve) => setTimeout(resolve, 2000));

            // Generate mock proof
            const mockProof: IdentityProof = {
                nullifier: `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`,
                commitment: `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`,
                proofData: btoa(JSON.stringify({
                    protocol: 'groth16',
                    curve: 'bn254',
                    verified: true,
                    timestamp: Date.now(),
                })),
                verificationType: 'zkpassport',
                verifiedAt: new Date(),
            };

            setStatus('verified');
            onVerified?.(mockProof);
        } catch (err) {
            setStatus('failed');
            setError(err instanceof Error ? err.message : 'Verification failed');
        }
    };

    // Simulated Semaphore verification flow
    const handleSemaphoreVerify = async () => {
        try {
            setStatus('pending');
            setError(null);

            // In production, this would:
            // 1. User generates identity commitment using Semaphore SDK
            // 2. User is added to Zurpay's Semaphore group
            // 3. User generates proof of membership for future claims

            await new Promise((resolve) => setTimeout(resolve, 2000));

            const mockProof: IdentityProof = {
                nullifier: `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`,
                commitment: `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`,
                proofData: btoa(JSON.stringify({
                    protocol: 'semaphore',
                    groupId: ZURPAY_SEMAPHORE_GROUP_ID,
                    verified: true,
                    timestamp: Date.now(),
                })),
                verificationType: 'semaphore',
                verifiedAt: new Date(),
            };

            setStatus('verified');
            onVerified?.(mockProof);
        } catch (err) {
            setStatus('failed');
            setError(err instanceof Error ? err.message : 'Verification failed');
        }
    };

    if (status === 'verified') {
        return (
            <div className={`bg-emerald-900/20 border border-emerald-500/30 rounded-2xl p-6 ${className}`}>
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center">
                        <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <div>
                        <div className="font-semibold text-emerald-400">Identity Verified</div>
                        <div className="text-sm text-slate-400">
                            Your identity has been cryptographically verified without revealing personal data
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={`bg-slate-800/50 border border-slate-700 rounded-2xl p-6 ${className}`}>
            <div className="flex items-start justify-between mb-4">
                <div>
                    <h3 className="font-semibold text-white flex items-center gap-2">
                        🛡️ Privacy-Preserving Identity Verification
                        {optional && (
                            <span className="text-xs bg-slate-700 text-slate-400 px-2 py-0.5 rounded">Optional</span>
                        )}
                    </h3>
                    <p className="text-sm text-slate-400 mt-1">
                        Prove your identity without revealing personal information using zero-knowledge proofs
                    </p>
                </div>
            </div>

            {error && (
                <div className="mb-4 p-3 bg-red-900/30 border border-red-500/50 rounded-xl text-red-300 text-sm">
                    {error}
                </div>
            )}

            {!selectedMethod ? (
                <div className="grid grid-cols-2 gap-4">
                    <button
                        onClick={() => setSelectedMethod('zkpassport')}
                        className="p-4 bg-slate-900/50 hover:bg-slate-900 border border-slate-600 hover:border-violet-500/50 rounded-xl transition-all text-left group"
                    >
                        <div className="text-2xl mb-2">🛂</div>
                        <div className="font-medium text-white group-hover:text-violet-400 transition-colors">
                            zkPassport
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                            Prove nationality or age without revealing passport data
                        </div>
                    </button>

                    <button
                        onClick={() => setSelectedMethod('semaphore')}
                        className="p-4 bg-slate-900/50 hover:bg-slate-900 border border-slate-600 hover:border-cyan-500/50 rounded-xl transition-all text-left group"
                    >
                        <div className="text-2xl mb-2">👁️</div>
                        <div className="font-medium text-white group-hover:text-cyan-400 transition-colors">
                            Semaphore
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                            Anonymous group membership proof
                        </div>
                    </button>
                </div>
            ) : (
                <div>
                    <button
                        onClick={() => setSelectedMethod(null)}
                        className="text-slate-400 hover:text-white mb-4 text-sm flex items-center gap-1"
                    >
                        ← Choose different method
                    </button>

                    {selectedMethod === 'zkpassport' && (
                        <div className="text-center py-6">
                            <div className="text-5xl mb-4">🛂</div>
                            <h4 className="text-lg font-semibold text-white mb-2">zkPassport Verification</h4>
                            <p className="text-sm text-slate-400 mb-6 max-w-sm mx-auto">
                                Generate a zero-knowledge proof that you hold a valid passport without revealing any
                                personal details.
                            </p>

                            {status === 'pending' ? (
                                <div className="flex flex-col items-center gap-4">
                                    <div className="w-20 h-20 border-4 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
                                    <div className="text-slate-400">Generating proof...</div>
                                </div>
                            ) : (
                                <button
                                    onClick={handleZkPassportVerify}
                                    className="bg-gradient-to-r from-violet-500 to-purple-500 text-white font-semibold px-6 py-3 rounded-xl hover:opacity-90 transition-opacity"
                                >
                                    Start Verification
                                </button>
                            )}
                        </div>
                    )}

                    {selectedMethod === 'semaphore' && (
                        <div className="text-center py-6">
                            <div className="text-5xl mb-4">👁️</div>
                            <h4 className="text-lg font-semibold text-white mb-2">Semaphore Identity</h4>
                            <p className="text-sm text-slate-400 mb-6 max-w-sm mx-auto">
                                Join the Zurpay verified users group and prove membership anonymously when claiming
                                payments.
                            </p>

                            {status === 'pending' ? (
                                <div className="flex flex-col items-center gap-4">
                                    <div className="w-20 h-20 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
                                    <div className="text-slate-400">Generating identity...</div>
                                </div>
                            ) : (
                                <button
                                    onClick={handleSemaphoreVerify}
                                    className="bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold px-6 py-3 rounded-xl hover:opacity-90 transition-opacity"
                                >
                                    Generate Identity
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}

            <div className="mt-6 pt-4 border-t border-slate-700">
                <div className="text-xs text-slate-500 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                    </svg>
                    Powered by Noir ZK circuits. Your data never leaves your device.
                </div>
            </div>
        </div>
    );
}

export default ZkIdentityVerification;
