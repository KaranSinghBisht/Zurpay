'use client';

import Link from 'next/link';

interface SmartLaunchButtonProps {
  className?: string;
  children?: React.ReactNode;
}

export function SmartLaunchButton({ className = '', children }: SmartLaunchButtonProps) {
  // Always go to dashboard - it handles wallet connection and org checking
  return (
    <Link href="/dashboard" className={className}>
      {children || 'Launch App →'}
    </Link>
  );
}
