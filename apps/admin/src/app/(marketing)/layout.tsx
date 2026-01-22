import type { Metadata } from 'next';
import '../globals.css';

export const metadata: Metadata = {
    title: 'Zurpay - Confidential Payroll on Solana',
    description: 'Private payroll and contractor payouts. Amounts encrypted by default, claims gated by ZK proofs.',
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body className="min-h-screen">
                {children}
            </body>
        </html>
    );
}
