import type { Metadata } from 'next';
import { ClientLayout } from '../components/ClientLayout';
import './globals.css';

export const metadata: Metadata = {
  title: 'Zurpay',
  description: 'Claim your confidential salary',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
