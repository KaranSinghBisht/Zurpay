'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';

// Glass morphism card with hover effects
export const GlassCard: React.FC<{
    children: React.ReactNode;
    className?: string;
    hover?: boolean;
}> = ({ children, className = '', hover = true }) => (
    <motion.div
        whileHover={hover ? { y: -5, boxShadow: '0 20px 40px rgba(0,0,0,0.3)' } : {}}
        className={`glass rounded-2xl p-6 border border-white/10 transition-shadow ${className}`}
    >
        {children}
    </motion.div>
);

// Animated stat card with counter
export const StatCard: React.FC<{
    label: string;
    value: number;
    prefix?: string;
    suffix?: string;
    trend?: number;
    icon: LucideIcon;
}> = ({ label, value, prefix = '', suffix = '', trend, icon: Icon }) => {
    const [displayValue, setDisplayValue] = useState(0);

    useEffect(() => {
        let start = 0;
        const end = value;
        if (start === end) return;

        const timer = setInterval(() => {
            start += Math.ceil(end / 100);
            if (start >= end) {
                setDisplayValue(end);
                clearInterval(timer);
            } else {
                setDisplayValue(start);
            }
        }, 20);

        return () => clearInterval(timer);
    }, [value]);

    return (
        <GlassCard className="flex flex-col gap-4">
            <div className="flex justify-between items-start">
                <div className="p-3 bg-white/5 rounded-xl text-accent">
                    <Icon size={24} />
                </div>
                {trend !== undefined && (
                    <div className={`flex items-center gap-1 text-sm font-medium ${trend >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {trend >= 0 ? '+' : ''}{trend}%
                    </div>
                )}
            </div>
            <div>
                <p className="text-gray-400 text-sm mb-1">{label}</p>
                <h3 className="text-3xl font-display font-bold">
                    {prefix}{displayValue.toLocaleString()}{suffix}
                </h3>
            </div>
        </GlassCard>
    );
};

// Status badge component
export const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
    const styles: Record<string, string> = {
        'Completed': 'bg-green-400/10 text-green-400 border-green-400/20',
        'Claimed': 'bg-green-400/10 text-green-400 border-green-400/20',
        'Processing': 'bg-accent/10 text-accent border-accent/20',
        'Pending': 'bg-yellow-400/10 text-yellow-400 border-yellow-400/20',
        'Draft': 'bg-gray-400/10 text-gray-400 border-gray-400/20',
        'Failed': 'bg-red-400/10 text-red-400 border-red-400/20',
    };

    return (
        <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${styles[status] || styles['Draft']}`}>
            {status}
        </span>
    );
};

// Animated background with gradient blobs
export const AnimatedBackground: React.FC = () => (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/20 blur-[120px] rounded-full animate-pulse-slow" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-accent/10 blur-[120px] rounded-full animate-pulse-slow" style={{ animationDelay: '2s' }} />
        <div className="absolute top-[20%] right-[10%] w-[30%] h-[30%] bg-purple-900/10 blur-[100px] rounded-full animate-pulse-slow" style={{ animationDelay: '4s' }} />
    </div>
);

// Loading skeleton
export const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
    <div className={`animate-pulse bg-white/5 rounded-lg ${className}`} />
);

// Feature card for landing page
export const FeatureCard: React.FC<{
    icon: LucideIcon;
    title: string;
    description: string;
    delay?: number;
}> = ({ icon: Icon, title, description, delay = 0 }) => (
    <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ delay }}
        viewport={{ once: true }}
    >
        <GlassCard className="h-full group">
            <div className="w-12 h-12 bg-primary/20 rounded-2xl flex items-center justify-center mb-6 text-accent group-hover:scale-110 transition-transform">
                <Icon size={24} />
            </div>
            <h3 className="text-xl font-bold mb-3 font-display">{title}</h3>
            <p className="text-gray-400 leading-relaxed">{description}</p>
        </GlassCard>
    </motion.div>
);
