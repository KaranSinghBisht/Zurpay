'use client';

import { useEffect, useState } from 'react';

export function FlowAnimation() {
  const [activeStep, setActiveStep] = useState(0);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % 5);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const steps = [
    { id: 0, label: 'CSV Upload', icon: '📄', x: 60, y: 40 },
    { id: 1, label: 'Merkle Tree', icon: '🌳', x: 200, y: 100 },
    { id: 2, label: 'ZK Proofs', icon: '🔐', x: 340, y: 40 },
    { id: 3, label: 'Encrypted\nPayouts', icon: '💎', x: 200, y: 200 },
    { id: 4, label: 'Private\nClaims', icon: '✓', x: 340, y: 200 },
  ];

  const connections = [
    { from: 0, to: 1 },
    { from: 1, to: 2 },
    { from: 1, to: 3 },
    { from: 2, to: 4 },
    { from: 3, to: 4 },
  ];

  return (
    <div className="relative w-full h-[400px] animate-slide-in-right delay-300">
      {/* Glow background */}
      <div className="absolute inset-0 gradient-glow opacity-30" />
      
      <svg viewBox="0 0 400 280" className="w-full h-full">
        <defs>
          <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.2" />
            <stop offset="50%" stopColor="#10b981" stopOpacity="1" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.2" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        {/* Connection lines */}
        {connections.map((conn, i) => {
          const from = steps[conn.from];
          const to = steps[conn.to];
          const isActive = activeStep === conn.from || activeStep === conn.to;
          
          return (
            <line
              key={i}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={isActive ? '#10b981' : '#27272a'}
              strokeWidth={isActive ? 2 : 1}
              strokeDasharray={isActive ? '0' : '4'}
              className="transition-all duration-500"
              filter={isActive ? 'url(#glow)' : ''}
            />
          );
        })}

        {/* Animated data particles */}
        {connections.map((conn, i) => {
          const from = steps[conn.from];
          const to = steps[conn.to];
          if (activeStep !== conn.from) return null;
          
          return (
            <circle key={`particle-${i}`} r="4" fill="#10b981" filter="url(#glow)">
              <animateMotion
                dur="1s"
                repeatCount="1"
                path={`M${from.x},${from.y} L${to.x},${to.y}`}
              />
            </circle>
          );
        })}

        {/* Step nodes */}
        {steps.map((step) => {
          const isActive = activeStep === step.id;
          
          return (
            <g key={step.id} className="cursor-pointer">
              {/* Node background */}
              <rect
                x={step.x - 35}
                y={step.y - 25}
                width="70"
                height="50"
                rx="12"
                fill={isActive ? '#1a2e1a' : '#12121a'}
                stroke={isActive ? '#10b981' : '#27272a'}
                strokeWidth={isActive ? 2 : 1}
                className="transition-all duration-300"
                filter={isActive ? 'url(#glow)' : ''}
              />
              
              {/* Icon */}
              <text
                x={step.x}
                y={step.y - 5}
                textAnchor="middle"
                fontSize="18"
                className="select-none"
              >
                {step.icon}
              </text>
              
              {/* Label */}
              <text
                x={step.x}
                y={step.y + 35}
                textAnchor="middle"
                fill={isActive ? '#10b981' : '#9ca3af'}
                fontSize="10"
                fontWeight={isActive ? '600' : '400'}
                className="transition-all duration-300"
              >
                {step.label.split('\n').map((line, i) => (
                  <tspan key={i} x={step.x} dy={i === 0 ? 0 : 12}>
                    {line}
                  </tspan>
                ))}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Step indicator */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 flex gap-2">
        {steps.map((step) => (
          <div
            key={step.id}
            className={`w-2 h-2 rounded-full transition-all duration-300 ${
              activeStep === step.id ? 'bg-emerald-500 w-6' : 'bg-zinc-700'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
