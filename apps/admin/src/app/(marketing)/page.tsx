'use client';

import { LaptopMockup } from '../../components/LaptopMockup';
import { FeaturesGrid } from '../../components/FeaturesGrid';
import { HowItWorks } from '../../components/HowItWorks';
import { SmartLaunchButton } from '../../components/SmartLaunchButton';

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass-card border-b border-zinc-800/50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center font-bold text-black">
              Z
            </div>
            <span className="text-xl font-bold">Zurpay</span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-zinc-400 hover:text-white transition-colors">
              Features
            </a>
            <a href="#how-it-works" className="text-zinc-400 hover:text-white transition-colors">
              How it Works
            </a>
            <a
              href="https://github.com"
              className="text-zinc-400 hover:text-white transition-colors"
            >
              GitHub
            </a>
          </div>
          <SmartLaunchButton className="btn-primary">
            Launch App →
          </SmartLaunchButton>
        </div>
      </nav>

      {/* Hero Section - Center Aligned */}
      <section className="pt-32 pb-12 px-6 text-center gradient-hero">
        <div className="max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-900/80 border border-zinc-800 text-sm text-zinc-400 mb-8 animate-fade-in-up">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Built for the Solana Privacy Hackathon 2026
          </div>

          <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold leading-tight mb-6 animate-fade-in-up delay-100">
            <span className="text-gradient">Confidential</span>
            <br />
            <span className="text-gradient-accent">Payroll</span>
            <span className="text-white"> on Solana</span>
          </h1>

          <p className="text-xl text-zinc-400 max-w-2xl mx-auto mb-10 animate-fade-in-up delay-200">
            Private payroll and contractor payouts. Amounts encrypted by default, claims gated by
            zero-knowledge proofs. Your employees deserve privacy.
          </p>

          <div className="flex flex-wrap justify-center gap-4 mb-16 animate-fade-in-up delay-300">
            <SmartLaunchButton className="btn-primary text-lg px-8 py-4">
              Launch App →
            </SmartLaunchButton>
            <a href="#how-it-works" className="btn-secondary text-lg px-8 py-4">
              Learn More
            </a>
          </div>

          {/* Trust badges */}
          <div className="flex items-center justify-center gap-8 animate-fade-in-up delay-400">
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <span className="text-emerald-500">✓</span> Inco Lightning
            </div>
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <span className="text-emerald-500">✓</span> Noir ZK Proofs
            </div>
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <span className="text-emerald-500">✓</span> Solana
            </div>
          </div>
        </div>
      </section>

      {/* Dashboard Preview in Laptop */}
      <section className="py-16 px-6 animate-fade-in-up delay-500">
        <LaptopMockup>
          {/* Dashboard mockup content */}
          <div className="w-full h-full bg-zinc-950 p-4 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded bg-emerald-500 flex items-center justify-center text-[8px] font-bold text-black">
                  Z
                </div>
                <span className="text-xs font-medium text-zinc-300">Zurpay</span>
              </div>
              <div className="flex gap-2">
                <div className="w-16 h-4 bg-zinc-800 rounded text-[6px] text-zinc-500 flex items-center justify-center">
                  Dashboard
                </div>
                <div className="w-16 h-4 bg-emerald-600 rounded text-[6px] text-white flex items-center justify-center">
                  Connect
                </div>
              </div>
            </div>

            {/* Sidebar + Content */}
            <div className="flex gap-3 h-[calc(100%-2rem)]">
              {/* Sidebar */}
              <div className="w-20 bg-zinc-900/50 rounded-lg p-2">
                <div className="space-y-1">
                  <div className="h-5 bg-zinc-800 rounded text-[6px] text-zinc-400 flex items-center px-1">
                    📊 Dashboard
                  </div>
                  <div className="h-5 bg-zinc-800/50 rounded text-[6px] text-zinc-500 flex items-center px-1">
                    📋 Payruns
                  </div>
                  <div className="h-5 bg-zinc-800/50 rounded text-[6px] text-zinc-500 flex items-center px-1">
                    ➕ Create
                  </div>
                  <div className="h-5 bg-zinc-800/50 rounded text-[6px] text-zinc-500 flex items-center px-1">
                    ⚙️ Settings
                  </div>
                </div>
              </div>

              {/* Main content */}
              <div className="flex-1">
                {/* Stats */}
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="bg-zinc-900/80 rounded-lg p-2">
                    <div className="text-[6px] text-zinc-500">Total Payruns</div>
                    <div className="text-sm font-bold text-emerald-400">12</div>
                  </div>
                  <div className="bg-zinc-900/80 rounded-lg p-2">
                    <div className="text-[6px] text-zinc-500">Pending Claims</div>
                    <div className="text-sm font-bold text-emerald-400">47</div>
                  </div>
                  <div className="bg-zinc-900/80 rounded-lg p-2">
                    <div className="text-[6px] text-zinc-500">Total Claimed</div>
                    <div className="text-sm font-bold text-emerald-400">$284k</div>
                  </div>
                </div>

                {/* Table preview */}
                <div className="bg-zinc-900/50 rounded-lg p-2">
                  <div className="text-[7px] font-medium mb-2 text-zinc-300">Recent Payruns</div>
                  <div className="space-y-1">
                    {[1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between bg-zinc-800/50 rounded px-2 py-1"
                      >
                        <div className="text-[6px] text-zinc-400">Payrun #{i}</div>
                        <div className="flex items-center gap-2">
                          <div className="text-[6px] text-zinc-500">32 employees</div>
                          <div className="w-10 h-3 bg-emerald-500/20 text-emerald-400 rounded text-[5px] flex items-center justify-center">
                            Active
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </LaptopMockup>
      </section>

      {/* Features Grid */}
      <FeaturesGrid />

      {/* How It Works - Scroll Synced */}
      <HowItWorks />

      {/* CTA Section */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="animated-border rounded-2xl p-12 text-center relative overflow-hidden">
            <div className="absolute inset-0 gradient-glow opacity-20" />
            <div className="relative">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Ready to make payroll private?
              </h2>
              <p className="text-zinc-400 text-lg mb-8 max-w-xl mx-auto">
                Join the future of confidential compensation. Your employees deserve privacy.
              </p>
              <SmartLaunchButton className="btn-primary text-lg px-8 py-4">
                Launch App →
              </SmartLaunchButton>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-zinc-900">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-emerald-500 flex items-center justify-center font-bold text-black text-sm">
              Z
            </div>
            <span className="font-semibold">Zurpay</span>
          </div>
          <p className="text-zinc-500 text-sm">Built for Solana Privacy Hackathon 2026</p>
          <div className="flex items-center gap-6 text-zinc-500 text-sm">
            <a href="#" className="hover:text-white transition-colors">
              GitHub
            </a>
            <a href="#" className="hover:text-white transition-colors">
              Docs
            </a>
            <a href="#" className="hover:text-white transition-colors">
              Twitter
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
