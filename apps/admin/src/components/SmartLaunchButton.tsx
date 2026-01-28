'use client';

import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useRouter } from 'next/navigation';
import { api } from '../lib/api';

interface SmartLaunchButtonProps {
  className?: string;
  children?: React.ReactNode;
}

export function SmartLaunchButton({ className = '', children }: SmartLaunchButtonProps) {
  const { publicKey, connected } = useWallet();
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const [hasOrg, setHasOrg] = useState<boolean | null>(null);

  useEffect(() => {
    const checkOrg = async () => {
      if (!connected || !publicKey) {
        setHasOrg(null);
        return;
      }

      try {
        const orgs = await api.orgs.list(publicKey.toBase58());
        setHasOrg(orgs.length > 0);
      } catch {
        setHasOrg(false);
      }
    };

    checkOrg();
  }, [connected, publicKey]);

  const handleClick = async () => {
    if (!connected) {
      // Not connected - go to onboarding where they can connect
      router.push('/onboarding');
      return;
    }

    setChecking(true);

    try {
      const orgs = await api.orgs.list(publicKey!.toBase58());
      if (orgs.length > 0) {
        router.push('/dashboard');
      } else {
        router.push('/onboarding');
      }
    } catch {
      router.push('/onboarding');
    } finally {
      setChecking(false);
    }
  };

  // If already checked and has org, show direct dashboard link
  if (hasOrg === true) {
    return (
      <a href="/dashboard" className={className}>
        {children || 'Go to Dashboard →'}
      </a>
    );
  }

  return (
    <button onClick={handleClick} disabled={checking} className={className}>
      {checking ? (
        <span className="flex items-center gap-2">
          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          Checking...
        </span>
      ) : (
        children || 'Launch App →'
      )}
    </button>
  );
}
