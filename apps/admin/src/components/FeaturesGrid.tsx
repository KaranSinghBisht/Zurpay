const features = [
    {
        icon: '🔐',
        title: 'Encrypted Amounts',
        description: 'Salary data encrypted using Inco Lightning confidential handles. No one sees what you pay - not even blockchain explorers.',
    },
    {
        icon: '🌳',
        title: 'Merkle-based Privacy',
        description: 'Only the Merkle root is stored on-chain. Your entire employee list stays completely hidden and off-chain.',
    },
    {
        icon: '⚡',
        title: 'ZK Claim Proofs',
        description: 'Employees prove eligibility with Noir zero-knowledge proofs generated in-browser. No trusted third party required.',
    },
    {
        icon: '🛡️',
        title: 'Double-spend Protection',
        description: 'On-chain nullifiers prevent duplicate claims. Each employee can only claim once per payrun - cryptographically guaranteed.',
    },
    {
        icon: '💸',
        title: 'Sub-cent Transactions',
        description: 'Solana speed with minimal gas costs. Process thousands of payroll claims without breaking the bank.',
    },
    {
        icon: '🔄',
        title: 'Self-custodial',
        description: 'Employees claim directly to their own wallets. No custodial risk, no intermediaries, pure peer-to-peer.',
    },
];

export function FeaturesGrid() {
    return (
        <section id="features" className="py-20 px-6">
            <div className="max-w-7xl mx-auto">
                <div className="text-center mb-16">
                    <h2 className="text-3xl md:text-5xl font-bold mb-4">
                        Privacy-first payroll infrastructure
                    </h2>
                    <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
                        Stop leaking salary data. Zurpay keeps your compensation confidential
                        while maintaining full on-chain verifiability.
                    </p>
                </div>

                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {features.map((feature, i) => (
                        <div
                            key={feature.title}
                            className="group glass-card rounded-xl p-6 hover:bg-zinc-800/50 hover:border-emerald-500/30 transition-all duration-300 hover:-translate-y-1"
                            style={{ animationDelay: `${i * 100}ms` }}
                        >
                            <div className="text-4xl mb-4 group-hover:scale-110 transition-transform duration-300">
                                {feature.icon}
                            </div>
                            <h3 className="text-lg font-semibold mb-2 group-hover:text-emerald-400 transition-colors">
                                {feature.title}
                            </h3>
                            <p className="text-zinc-400 text-sm leading-relaxed">
                                {feature.description}
                            </p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
