'use client';

import { useEffect, useRef, useState } from 'react';

interface Step {
    id: number;
    title: string;
    description: string;
    nodes: number[]; // Which architecture nodes to highlight
}

const steps: Step[] = [
    {
        id: 0,
        title: 'Upload Payroll CSV',
        description: 'Import employee wallets and salary amounts. All data stays on your machine - nothing leaves until you say so.',
        nodes: [0],
    },
    {
        id: 1,
        title: 'Generate Merkle Tree',
        description: 'Cryptographic commitments are created for each employee. The tree ensures data integrity while keeping individual entries private.',
        nodes: [0, 1],
    },
    {
        id: 2,
        title: 'Post Root On-chain',
        description: 'Only the Merkle root is stored on Solana. No employee data, no amounts - just a single hash proving the payrun exists.',
        nodes: [1, 2],
    },
    {
        id: 3,
        title: 'Distribute Claim Packages',
        description: 'Employees receive encrypted proof packages through your preferred channel. Each package contains their Merkle proof and encrypted amount.',
        nodes: [1, 3],
    },
    {
        id: 4,
        title: 'ZK Proof Generation',
        description: 'Employees generate zero-knowledge proofs in their browser using Noir. The proof shows eligibility without revealing any details.',
        nodes: [3, 4],
    },
    {
        id: 5,
        title: 'Confidential Claims',
        description: 'Funds transfer privately via Inco Lightning. Only the recipient knows the amount. Double-spending is prevented by on-chain nullifiers.',
        nodes: [4, 5],
    },
];

const architectureNodes = [
    { id: 0, label: 'CSV Upload', icon: '📄', x: 80, y: 50 },
    { id: 1, label: 'Merkle Tree', icon: '🌳', x: 200, y: 120 },
    { id: 2, label: 'On-chain Root', icon: '⛓️', x: 320, y: 50 },
    { id: 3, label: 'Claim Package', icon: '📦', x: 200, y: 200 },
    { id: 4, label: 'ZK Proof', icon: '🔐', x: 320, y: 200 },
    { id: 5, label: 'Private Payout', icon: '💎', x: 320, y: 280 },
];

const connections = [
    { from: 0, to: 1 },
    { from: 1, to: 2 },
    { from: 1, to: 3 },
    { from: 3, to: 4 },
    { from: 4, to: 5 },
];

export function HowItWorks() {
    const [activeStep, setActiveStep] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const stepRefs = useRef<(HTMLDivElement | null)[]>([]);

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        const index = stepRefs.current.indexOf(entry.target as HTMLDivElement);
                        if (index !== -1) {
                            setActiveStep(index);
                        }
                    }
                });
            },
            {
                root: null,
                rootMargin: '-40% 0px -40% 0px',
                threshold: 0.5,
            }
        );

        stepRefs.current.forEach((ref) => {
            if (ref) observer.observe(ref);
        });

        return () => observer.disconnect();
    }, []);

    const activeNodes = steps[activeStep]?.nodes || [];

    return (
        <section id="how-it-works" className="py-20 px-6">
            <div className="max-w-7xl mx-auto">
                <div className="text-center mb-16">
                    <h2 className="text-3xl md:text-5xl font-bold mb-4">
                        How it works
                    </h2>
                    <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
                        Six steps to fully confidential payroll on Solana
                    </p>
                </div>

                <div className="grid lg:grid-cols-2 gap-12 items-start">
                    {/* Left: Scrollable steps */}
                    <div ref={containerRef} className="space-y-8">
                        {steps.map((step, i) => (
                            <div
                                key={step.id}
                                ref={(el) => { stepRefs.current[i] = el; }}
                                className={`p-6 rounded-xl transition-all duration-500 ${activeStep === i
                                        ? 'bg-zinc-900/80 border border-emerald-500/50 shadow-lg shadow-emerald-500/10'
                                        : 'bg-zinc-900/30 border border-zinc-800'
                                    }`}
                            >
                                <div className="flex items-start gap-4">
                                    <div
                                        className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-500 ${activeStep === i
                                                ? 'bg-emerald-500 text-black'
                                                : 'bg-zinc-800 text-zinc-500'
                                            }`}
                                    >
                                        {i + 1}
                                    </div>
                                    <div className="flex-1">
                                        <h3
                                            className={`text-xl font-semibold mb-2 transition-colors duration-500 ${activeStep === i ? 'text-white' : 'text-zinc-400'
                                                }`}
                                        >
                                            {step.title}
                                        </h3>
                                        <p
                                            className={`transition-colors duration-500 ${activeStep === i ? 'text-zinc-300' : 'text-zinc-500'
                                                }`}
                                        >
                                            {step.description}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Right: Sticky architecture diagram */}
                    <div className="lg:sticky lg:top-32">
                        <div className="glass-card rounded-2xl p-6">
                            <svg viewBox="0 0 400 350" className="w-full">
                                <defs>
                                    <filter id="glow-strong">
                                        <feGaussianBlur stdDeviation="4" result="coloredBlur" />
                                        <feMerge>
                                            <feMergeNode in="coloredBlur" />
                                            <feMergeNode in="SourceGraphic" />
                                        </feMerge>
                                    </filter>
                                    <linearGradient id="activeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                        <stop offset="0%" stopColor="#10b981" />
                                        <stop offset="100%" stopColor="#34d399" />
                                    </linearGradient>
                                </defs>

                                {/* Connections */}
                                {connections.map((conn, i) => {
                                    const from = architectureNodes[conn.from];
                                    const to = architectureNodes[conn.to];
                                    const isActive =
                                        activeNodes.includes(conn.from) && activeNodes.includes(conn.to);

                                    return (
                                        <g key={i}>
                                            <line
                                                x1={from.x}
                                                y1={from.y}
                                                x2={to.x}
                                                y2={to.y}
                                                stroke={isActive ? '#10b981' : '#27272a'}
                                                strokeWidth={isActive ? 3 : 1}
                                                className="transition-all duration-500"
                                                filter={isActive ? 'url(#glow-strong)' : ''}
                                            />
                                            {isActive && (
                                                <circle r="5" fill="#10b981" filter="url(#glow-strong)">
                                                    <animateMotion
                                                        dur="1.5s"
                                                        repeatCount="indefinite"
                                                        path={`M${from.x},${from.y} L${to.x},${to.y}`}
                                                    />
                                                </circle>
                                            )}
                                        </g>
                                    );
                                })}

                                {/* Nodes */}
                                {architectureNodes.map((node) => {
                                    const isActive = activeNodes.includes(node.id);

                                    return (
                                        <g key={node.id}>
                                            {/* Node background */}
                                            <rect
                                                x={node.x - 45}
                                                y={node.y - 25}
                                                width="90"
                                                height="50"
                                                rx="12"
                                                fill={isActive ? '#064e3b' : '#18181b'}
                                                stroke={isActive ? '#10b981' : '#27272a'}
                                                strokeWidth={isActive ? 2 : 1}
                                                className="transition-all duration-500"
                                                filter={isActive ? 'url(#glow-strong)' : ''}
                                            />

                                            {/* Icon */}
                                            <text
                                                x={node.x}
                                                y={node.y - 2}
                                                textAnchor="middle"
                                                fontSize="20"
                                                className="select-none"
                                            >
                                                {node.icon}
                                            </text>

                                            {/* Label */}
                                            <text
                                                x={node.x}
                                                y={node.y + 40}
                                                textAnchor="middle"
                                                fill={isActive ? '#10b981' : '#71717a'}
                                                fontSize="11"
                                                fontWeight={isActive ? '600' : '400'}
                                                className="transition-all duration-500"
                                            >
                                                {node.label}
                                            </text>
                                        </g>
                                    );
                                })}
                            </svg>

                            {/* Progress indicator */}
                            <div className="flex justify-center gap-2 mt-4">
                                {steps.map((_, i) => (
                                    <button
                                        key={i}
                                        onClick={() => {
                                            stepRefs.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                        }}
                                        className={`w-2 h-2 rounded-full transition-all duration-300 ${activeStep === i ? 'bg-emerald-500 w-6' : 'bg-zinc-700 hover:bg-zinc-600'
                                            }`}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
