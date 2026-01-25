'use client';

import { useEffect, useState } from 'react';

interface ConfettiPiece {
  id: number;
  x: number;
  y: number;
  rotation: number;
  color: string;
  scale: number;
  delay: number;
}

const COLORS = [
  '#10b981', // emerald
  '#34d399', // emerald light
  '#6ee7b7', // emerald lighter
  '#fbbf24', // amber
  '#60a5fa', // blue
  '#a78bfa', // purple
  '#f472b6', // pink
];

export function ConfettiCelebration({
  isActive,
  duration = 3000,
}: {
  isActive: boolean;
  duration?: number;
}) {
  const [pieces, setPieces] = useState<ConfettiPiece[]>([]);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isActive) {
      // Generate confetti pieces
      const newPieces: ConfettiPiece[] = [];
      for (let i = 0; i < 100; i++) {
        newPieces.push({
          id: i,
          x: Math.random() * 100, // percentage across screen
          y: -10 - Math.random() * 20, // start above screen
          rotation: Math.random() * 360,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          scale: 0.5 + Math.random() * 0.5,
          delay: Math.random() * 0.5,
        });
      }
      setPieces(newPieces);
      setVisible(true);

      // Hide after duration
      const timer = setTimeout(() => {
        setVisible(false);
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [isActive, duration]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-50">
      {pieces.map((piece) => (
        <div
          key={piece.id}
          className="absolute animate-confetti-fall"
          style={{
            left: `${piece.x}%`,
            top: `${piece.y}%`,
            transform: `rotate(${piece.rotation}deg) scale(${piece.scale})`,
            animationDelay: `${piece.delay}s`,
          }}
        >
          <div
            className="w-3 h-3"
            style={{
              backgroundColor: piece.color,
              clipPath:
                Math.random() > 0.5
                  ? 'polygon(50% 0%, 0% 100%, 100% 100%)' // triangle
                  : 'none', // rectangle
              borderRadius: Math.random() > 0.5 ? '50%' : '2px',
            }}
          />
        </div>
      ))}

      {/* Celebration text */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center animate-bounce-in">
          <div className="w-16 h-16 mx-auto mb-2 rounded-full bg-emerald-500/20 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-emerald-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div className="text-2xl font-bold text-white drop-shadow-lg">Congratulations!</div>
        </div>
      </div>

      <style jsx>{`
        @keyframes confetti-fall {
          0% {
            transform: translateY(0) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) rotate(720deg);
            opacity: 0;
          }
        }

        @keyframes bounce-in {
          0% {
            transform: scale(0);
            opacity: 0;
          }
          50% {
            transform: scale(1.2);
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }

        .animate-confetti-fall {
          animation: confetti-fall 3s ease-in-out forwards;
        }

        .animate-bounce-in {
          animation: bounce-in 0.5s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
