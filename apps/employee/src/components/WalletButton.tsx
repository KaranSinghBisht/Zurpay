'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

export function WalletButton() {
    const { connected, publicKey } = useWallet();

    return (
        <div className="wallet-button-wrapper">
            <WalletMultiButton />
            {connected && publicKey && (
                <span className="ml-2 text-xs text-zinc-500 hidden md:inline">
                    {publicKey.toBase58().slice(0, 4)}...{publicKey.toBase58().slice(-4)}
                </span>
            )}
            <style jsx>{`
        .wallet-button-wrapper :global(.wallet-adapter-button) {
          background-color: rgb(16, 185, 129) !important;
          height: 36px !important;
          font-size: 14px !important;
          border-radius: 8px !important;
        }
        .wallet-button-wrapper :global(.wallet-adapter-button:hover) {
          background-color: rgb(5, 150, 105) !important;
        }
        .wallet-button-wrapper :global(.wallet-adapter-button:not([disabled]):hover) {
          background-color: rgb(5, 150, 105) !important;
        }
      `}</style>
        </div>
    );
}
