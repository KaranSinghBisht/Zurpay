'use client';

import { useSession } from 'next-auth/react';

export default function Home() {
  const { data: session } = useSession();

  return (
    <div className="py-12">
      <h1 className="text-3xl font-bold mb-4">Welcome to Zurpay</h1>
      <p className="text-zinc-400 mb-8">
        Private payroll on Solana. Receive payments without revealing your wallet to your employer.
      </p>

      <div className="grid gap-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h2 className="text-lg font-medium mb-4">How It Works</h2>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-600/20 text-emerald-400 flex items-center justify-center text-sm font-bold shrink-0">
                1
              </div>
              <div>
                <div className="font-medium">Receive Invite</div>
                <div className="text-sm text-zinc-400">
                  Your employer invites you by email to join their organization
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-600/20 text-emerald-400 flex items-center justify-center text-sm font-bold shrink-0">
                2
              </div>
              <div>
                <div className="font-medium">Sign In with Google</div>
                <div className="text-sm text-zinc-400">
                  Accept the invite by verifying your email with Google
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-600/20 text-emerald-400 flex items-center justify-center text-sm font-bold shrink-0">
                3
              </div>
              <div>
                <div className="font-medium">Get Payment Link</div>
                <div className="text-sm text-zinc-400">
                  When payday comes, you receive an email with your claim link
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-600/20 text-emerald-400 flex items-center justify-center text-sm font-bold shrink-0">
                4
              </div>
              <div>
                <div className="font-medium">Claim to Any Wallet</div>
                <div className="text-sm text-zinc-400">
                  Connect any Solana wallet to receive payment - your employer never sees which one
                </div>
              </div>
            </div>
          </div>
        </div>

        {session ? (
          <div className="bg-emerald-900/20 border border-emerald-800 rounded-xl p-6">
            <h2 className="text-lg font-medium mb-2 text-emerald-400">Signed In</h2>
            <p className="text-zinc-400 text-sm mb-4">
              You&apos;re signed in as <span className="text-white">{session.user?.email}</span>
            </p>
            <p className="text-zinc-500 text-sm">
              Check your email for invite or claim links from your employer.
            </p>
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <h2 className="text-lg font-medium mb-2">Getting Started</h2>
            <p className="text-zinc-500 text-sm">
              If you received an invite or claim link from your employer, click it to get started.
              You&apos;ll sign in with Google to verify your identity.
            </p>
          </div>
        )}

        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
          <h3 className="text-sm font-medium text-zinc-400 mb-2">Privacy Guarantee</h3>
          <p className="text-sm text-zinc-500">
            Your wallet address is never shared with your employer. ZK proofs verify your
            eligibility without revealing your identity. Salary amounts are encrypted - only you can
            see them.
          </p>
        </div>
      </div>
    </div>
  );
}
