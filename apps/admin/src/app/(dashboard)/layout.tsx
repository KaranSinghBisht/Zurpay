'use client';

import React, { useState, useRef, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Send,
  Settings,
  Users,
  Bell,
  Menu,
  X,
  Search,
  ShieldCheck,
  Link as LinkIcon,
  CheckCircle,
  Calendar,
  FileText,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SolanaProviders } from '../../components/SolanaProviders';
import { WalletButton } from '../../components/WalletButton';
import { SidebarOrgSection } from '../../components/SidebarOrgSection';
import '../globals.css';

const SidebarItem = memo(function SidebarItem({
  icon: Icon,
  label,
  path,
  active,
}: {
  icon: React.ElementType;
  label: string;
  path: string;
  active: boolean;
}) {
  return (
    <Link href={path} prefetch={true}>
      <div
        className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all hover:translate-x-1 ${
          active
            ? 'bg-primary/20 text-accent border border-primary/30'
            : 'text-gray-400 hover:text-white hover:bg-white/5'
        }`}
      >
        <Icon size={20} />
        <span className="font-medium">{label}</span>
        {active && (
          <div className="ml-auto w-1.5 h-1.5 rounded-full bg-accent shadow-[0_0_10px_#06B6D4]" />
        )}
      </div>
    </Link>
  );
});

const menuItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
  { icon: Users, label: 'Workers', path: '/dashboard/workers' },
  { icon: Send, label: 'Payruns', path: '/dashboard/payruns' },
  { icon: CheckCircle, label: 'Approvals', path: '/dashboard/approvals' },
  { icon: Calendar, label: 'Schedules', path: '/dashboard/schedules' },
  { icon: LinkIcon, label: 'Paylinks', path: '/dashboard/paylinks' },
  { icon: FileText, label: 'Requests', path: '/dashboard/requests' },
  { icon: ShieldCheck, label: 'Treasury', path: '/dashboard/treasury' },
  { icon: Settings, label: 'Settings', path: '/dashboard/settings' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const hasAnimated = useRef(false);
  const pathname = usePathname();

  const shouldAnimate = !hasAnimated.current;
  if (isSidebarOpen) {
    hasAnimated.current = true;
  }

  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-dark text-white font-sans">
        <SolanaProviders>
          <div className="flex h-screen overflow-hidden">
            <AnimatePresence initial={false}>
              {isSidebarOpen && (
                <motion.aside
                  initial={shouldAnimate ? { x: -300 } : false}
                  animate={{ x: 0 }}
                  exit={{ x: -300 }}
                  transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                  className="w-64 glass border-r border-white/5 p-6 flex flex-col gap-8 z-50 lg:relative fixed h-full"
                >
                  <Link href="/" className="flex items-center gap-2 mb-2 group" prefetch={true}>
                    <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20 group-hover:scale-105 transition-transform">
                      <ShieldCheck className="text-white" size={24} />
                    </div>
                    <h1 className="text-2xl font-display font-bold text-white">Zurpay</h1>
                  </Link>

                  <nav className="flex flex-col gap-2 flex-grow">
                    {menuItems.map((item) => (
                      <SidebarItem
                        key={item.path}
                        {...item}
                        active={
                          pathname === item.path || (pathname?.startsWith(item.path + '/') ?? false)
                        }
                      />
                    ))}
                  </nav>

                  <SidebarOrgSection />
                </motion.aside>
              )}
            </AnimatePresence>

            {/* Main Content */}
            <main
              className={`flex-grow flex flex-col overflow-hidden relative ${isSidebarOpen ? 'lg:ml-0' : ''}`}
            >
              {/* Header */}
              <header className="h-20 border-b border-white/5 px-8 flex items-center justify-between glass z-40 shrink-0">
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setSidebarOpen(!isSidebarOpen)}
                    className="p-2 hover:bg-white/5 rounded-lg transition-colors"
                  >
                    {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
                  </button>
                  <div className="hidden md:flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-2 rounded-xl w-64">
                    <Search size={16} className="text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search payruns..."
                      className="bg-transparent border-none outline-none text-sm w-full"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <button className="relative p-2 hover:bg-white/5 rounded-lg transition-colors">
                    <Bell size={20} className="text-gray-400" />
                    <span className="absolute top-2 right-2 w-2 h-2 bg-accent rounded-full border-2 border-dark" />
                  </button>
                  <div className="h-8 w-px bg-white/10" />
                  <WalletButton />
                </div>
              </header>

              {/* Page Area */}
              <div className="flex-grow overflow-y-auto p-8 relative grid-pattern">{children}</div>
            </main>
          </div>
        </SolanaProviders>
      </body>
    </html>
  );
}
