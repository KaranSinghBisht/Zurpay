'use client';

import { SolanaProviders } from '../../components/SolanaProviders';
import '../globals.css';

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <SolanaProviders>{children}</SolanaProviders>
      </body>
    </html>
  );
}
