'use client';

import { useWallet } from '@solana/wallet-adapter-react';

export default function Home() {
  const { connected } = useWallet();

  return (
    <div className="py-12">
      <h1 className="text-3xl font-bold mb-4">Welcome to Zurpay</h1>
      <p className="text-zinc-400 mb-8">
        Connect your wallet to view and claim your confidential salary.
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
                <div className="font-medium">Receive Claim Link</div>
                <div className="text-sm text-zinc-400">
                  Your employer sends you a unique claim link via email or message
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-600/20 text-emerald-400 flex items-center justify-center text-sm font-bold shrink-0">
                2
              </div>
              <div>
                <div className="font-medium">Connect Wallet</div>
                <div className="text-sm text-zinc-400">
                  Connect your Solana wallet to receive the payment
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-600/20 text-emerald-400 flex items-center justify-center text-sm font-bold shrink-0">
                3
              </div>
              <div>
                <div className="font-medium">Claim Salary</div>
                <div className="text-sm text-zinc-400">
                  Submit the claim transaction to receive your confidential payment
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-600/20 text-emerald-400 flex items-center justify-center text-sm font-bold shrink-0">
                4
              </div>
              <div>
                <div className="font-medium">View Balance</div>
                <div className="text-sm text-zinc-400">
                  Decrypt and view your confidential balance using your wallet signature
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h2 className="text-lg font-medium mb-4">Pending Claims</h2>
          {connected ? (
            <p className="text-zinc-500">
              No pending claims. Check your email for claim links from your employer.
            </p>
          ) : (
            <p className="text-zinc-500">Connect wallet to see your pending claims.</p>
          )}
        </div>

        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
          <h3 className="text-sm font-medium text-zinc-400 mb-2">Privacy Guarantee</h3>
          <p className="text-sm text-zinc-500">
            Your salary amount is encrypted using Inco FHE. Only you can decrypt and view your
            balance by signing a message with your wallet. No one else - not even Zurpay - can see
            how much you earn.
          </p>
        </div>
      </div>
    </div>
  );
}
