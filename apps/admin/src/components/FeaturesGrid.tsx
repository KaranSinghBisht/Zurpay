const features = [
  {
    icon: 'lock',
    title: 'Encrypted Amounts',
    description:
      'Salary data encrypted using Inco Lightning confidential handles. No one sees what you pay - not even blockchain explorers.',
  },
  {
    icon: 'tree',
    title: 'Merkle-based Privacy',
    description:
      'Only the Merkle root is stored on-chain. Your entire employee list stays completely hidden and off-chain.',
  },
  {
    icon: 'zap',
    title: 'ZK Claim Proofs',
    description:
      'Employees prove eligibility with Noir zero-knowledge proofs generated in-browser. No trusted third party required.',
  },
  {
    icon: 'shield',
    title: 'Double-spend Protection',
    description:
      'On-chain nullifiers prevent duplicate claims. Each employee can only claim once per payrun - cryptographically guaranteed.',
  },
  {
    icon: 'banknotes',
    title: 'Sub-cent Transactions',
    description:
      'Solana speed with minimal gas costs. Process thousands of payroll claims without breaking the bank.',
  },
  {
    icon: 'refresh',
    title: 'Self-custodial',
    description:
      'Employees claim directly to their own wallets. No custodial risk, no intermediaries, pure peer-to-peer.',
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
            Stop leaking salary data. Zurpay keeps your compensation confidential while maintaining
            full on-chain verifiability.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, i) => (
            <div
              key={feature.title}
              className="group glass-card rounded-xl p-6 hover:bg-zinc-800/50 hover:border-emerald-500/30 transition-all duration-300 hover:-translate-y-1"
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <div className="w-12 h-12 mb-4 rounded-lg bg-emerald-500/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                {feature.icon === 'lock' && (
                  <svg
                    className="w-6 h-6 text-emerald-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                )}
                {feature.icon === 'tree' && (
                  <svg
                    className="w-6 h-6 text-emerald-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
                    />
                  </svg>
                )}
                {feature.icon === 'zap' && (
                  <svg
                    className="w-6 h-6 text-emerald-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                )}
                {feature.icon === 'shield' && (
                  <svg
                    className="w-6 h-6 text-emerald-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                )}
                {feature.icon === 'banknotes' && (
                  <svg
                    className="w-6 h-6 text-emerald-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                )}
                {feature.icon === 'refresh' && (
                  <svg
                    className="w-6 h-6 text-emerald-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                )}
              </div>
              <h3 className="text-lg font-semibold mb-2 group-hover:text-emerald-400 transition-colors">
                {feature.title}
              </h3>
              <p className="text-zinc-400 text-sm leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
