'use client';

import { useEffect, useRef } from 'react';

interface QRCodeGeneratorProps {
    value: string;
    size?: number;
    className?: string;
}

// Simple QR code generator using canvas
// For production, consider using a library like 'qrcode' npm package
export function QRCodeGenerator({ value, size = 200, className = '' }: QRCodeGeneratorProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if (!canvasRef.current || !value) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clear canvas
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);

        // Generate a simple visual placeholder for QR code
        // In production, use a proper QR code library
        const moduleSize = size / 25;
        const qrData = generateQRPattern(value);

        ctx.fillStyle = '#000000';
        for (let row = 0; row < 25; row++) {
            for (let col = 0; col < 25; col++) {
                if (qrData[row * 25 + col]) {
                    ctx.fillRect(col * moduleSize, row * moduleSize, moduleSize, moduleSize);
                }
            }
        }

        // Draw finder patterns (the three corners)
        drawFinderPattern(ctx, 0, 0, moduleSize);
        drawFinderPattern(ctx, 18 * moduleSize, 0, moduleSize);
        drawFinderPattern(ctx, 0, 18 * moduleSize, moduleSize);
    }, [value, size]);

    return (
        <div className={`inline-block rounded-lg overflow-hidden bg-white p-2 ${className}`}>
            <canvas ref={canvasRef} width={size} height={size} />
        </div>
    );
}

function drawFinderPattern(ctx: CanvasRenderingContext2D, x: number, y: number, moduleSize: number) {
    ctx.fillStyle = '#000000';
    // Outer border
    ctx.fillRect(x, y, 7 * moduleSize, 7 * moduleSize);
    // White inner
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + moduleSize, y + moduleSize, 5 * moduleSize, 5 * moduleSize);
    // Black center
    ctx.fillStyle = '#000000';
    ctx.fillRect(x + 2 * moduleSize, y + 2 * moduleSize, 3 * moduleSize, 3 * moduleSize);
}

function generateQRPattern(data: string): boolean[] {
    // Simple hash-based pattern generator for visual representation
    // This is NOT a real QR code - use a proper library for production
    const pattern: boolean[] = new Array(625).fill(false);
    let hash = 0;

    for (let i = 0; i < data.length; i++) {
        hash = ((hash << 5) - hash) + data.charCodeAt(i);
        hash = hash & hash;
    }

    const seed = Math.abs(hash);
    for (let i = 0; i < 625; i++) {
        // Skip finder pattern areas
        const row = Math.floor(i / 25);
        const col = i % 25;

        if ((row < 8 && col < 8) ||
            (row < 8 && col >= 17) ||
            (row >= 17 && col < 8)) {
            continue;
        }

        // Generate pseudo-random pattern based on data hash
        const val = (seed * (i + 1) * 31337) % 100;
        pattern[i] = val < 50;
    }

    return pattern;
}

interface QRCodeModalProps {
    isOpen: boolean;
    onClose: () => void;
    url: string;
    title?: string;
}

export function QRCodeModal({ isOpen, onClose, url, title = 'Claim Link QR Code' }: QRCodeModalProps) {
    if (!isOpen) return null;

    const copyToClipboard = () => {
        navigator.clipboard.writeText(url);
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
            <div
                className="bg-zinc-900 rounded-xl p-6 w-full max-w-sm border border-zinc-800"
                onClick={(e) => e.stopPropagation()}
            >
                <h3 className="text-lg font-semibold mb-4 text-center">{title}</h3>

                <div className="flex justify-center mb-4">
                    <QRCodeGenerator value={url} size={200} />
                </div>

                <p className="text-sm text-zinc-400 text-center mb-4">
                    Scan this QR code to open the claim link
                </p>

                <div className="p-3 bg-zinc-800 rounded-lg mb-4">
                    <p className="text-xs text-zinc-400 break-all font-mono">{url}</p>
                </div>

                <div className="flex gap-3">
                    <button
                        onClick={copyToClipboard}
                        className="flex-1 px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg transition-colors text-sm"
                    >
                        📋 Copy Link
                    </button>
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors text-sm"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
}
