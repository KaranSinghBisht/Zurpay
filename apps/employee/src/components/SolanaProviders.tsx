'use client';

import { useMemo, ReactNode, useEffect, useState } from 'react';
import { ConnectionProvider, WalletProvider, useConnection } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { clusterApiUrl } from '@solana/web3.js';

import '@solana/wallet-adapter-react-ui/styles.css';

interface SolanaProvidersProps {
  children: ReactNode;
}

function NetworkWarning() {
  const { connection } = useConnection();
  const [isDevnet, setIsDevnet] = useState<boolean | null>(null);

  useEffect(() => {
    async function checkNetwork() {
      try {
        const genesisHash = await connection.getGenesisHash();
        const devnetGenesisHash = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
        setIsDevnet(genesisHash === devnetGenesisHash);
      } catch {
        setIsDevnet(null);
      }
    }
    checkNetwork();
  }, [connection]);

  if (isDevnet === false) {
    return (
      <div className="fixed top-16 left-0 right-0 z-50 bg-amber-600 text-black px-4 py-2 text-center text-sm font-medium">
        Warning: Your wallet appears to be connected to Mainnet. Please switch to Devnet in your
        wallet settings.
      </div>
    );
  }

  return null;
}

export function SolanaProviders({ children }: SolanaProvidersProps) {
  const endpoint = useMemo(() => {
    return process.env.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl('devnet');
  }, []);

  const wallets = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <NetworkWarning />
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
