import React from 'react';

export function CoreDrillingIcon({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Drill bit */}
      <path
        d="M32 8L32 56"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* Spiral */}
      <path
        d="M28 16C28 16 24 20 28 24C32 28 28 32 28 32C28 32 24 36 28 40C32 44 28 48 28 48"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M36 16C36 16 40 20 36 24C32 28 36 32 36 32C36 32 40 36 36 40C32 44 36 48 36 48"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      {/* Drill head */}
      <circle cx="32" cy="10" r="6" fill="currentColor" />
      {/* Diamond tip */}
      <path
        d="M32 52L28 56L32 60L36 56L32 52Z"
        fill="currentColor"
        opacity="0.8"
      />
      {/* Concrete representation */}
      <circle cx="20" cy="32" r="2" fill="currentColor" opacity="0.3" />
      <circle cx="44" cy="28" r="2" fill="currentColor" opacity="0.3" />
      <circle cx="42" cy="40" r="2" fill="currentColor" opacity="0.3" />
    </svg>
  );
}

export function WallSawingIcon({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Saw blade */}
      <circle
        cx="32"
        cy="32"
        r="18"
        stroke="currentColor"
        strokeWidth="3"
        fill="none"
      />
      {/* Diamond segments */}
      {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => {
        const radian = (angle * Math.PI) / 180;
        const x = 32 + Math.cos(radian) * 18;
        const y = 32 + Math.sin(radian) * 18;
        return (
          <circle
            key={i}
            cx={x}
            cy={y}
            r="2"
            fill="currentColor"
          />
        );
      })}
      {/* Handle */}
      <rect x="28" y="6" width="8" height="12" rx="2" fill="currentColor" />
      {/* Guard */}
      <path
        d="M14 32C14 22 22 14 32 14L32 50C22 50 14 42 14 32Z"
        fill="currentColor"
        opacity="0.2"
      />
      {/* Cut line */}
      <line
        x1="50"
        y1="32"
        x2="60"
        y2="32"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="4 4"
      />
    </svg>
  );
}

export function HandHeldChainSawIcon({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Chain bar */}
      <rect
        x="10"
        y="28"
        width="48"
        height="8"
        rx="4"
        fill="currentColor"
        opacity="0.3"
      />
      {/* Chain */}
      <path
        d="M10 32L58 32"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* Chain teeth */}
      {[16, 24, 32, 40, 48].map((x, i) => (
        <rect
          key={i}
          x={x - 1}
          y={28}
          width="2"
          height="8"
          fill="currentColor"
        />
      ))}
      {/* Handle */}
      <rect x="12" y="14" width="16" height="8" rx="4" fill="currentColor" />
      {/* Grip */}
      <path
        d="M20 22L20 42"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
      />
      {/* Motor housing */}
      <rect x="8" y="20" width="12" height="24" rx="3" fill="currentColor" opacity="0.6" />
    </svg>
  );
}

export function HandSawIcon({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Blade */}
      <path
        d="M12 48L52 8"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
      {/* Saw teeth */}
      {[0, 0.25, 0.5, 0.75].map((t, i) => {
        const x1 = 12 + (52 - 12) * t;
        const y1 = 48 + (8 - 48) * t;
        const perpX = 3;
        const perpY = 3;
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x1 + perpX}
            y2={y1 - perpY}
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        );
      })}
      {/* Handle */}
      <rect
        x="48"
        y="4"
        width="12"
        height="16"
        rx="4"
        fill="currentColor"
      />
      {/* Grip detail */}
      <line x1="52" y1="8" x2="52" y2="16" stroke="white" strokeWidth="1" opacity="0.5" />
      <line x1="56" y1="8" x2="56" y2="16" stroke="white" strokeWidth="1" opacity="0.5" />
      {/* Guard */}
      <rect
        x="44"
        y="6"
        width="4"
        height="12"
        rx="2"
        fill="currentColor"
        opacity="0.6"
      />
    </svg>
  );
}

export function SlabSawingIcon({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Base/slab */}
      <rect
        x="8"
        y="44"
        width="48"
        height="12"
        rx="2"
        fill="currentColor"
        opacity="0.2"
      />
      {/* Saw blade */}
      <circle
        cx="32"
        cy="30"
        r="16"
        stroke="currentColor"
        strokeWidth="3"
        fill="none"
      />
      {/* Diamond segments on blade */}
      {[0, 60, 120, 180, 240, 300].map((angle, i) => {
        const radian = (angle * Math.PI) / 180;
        const x = 32 + Math.cos(radian) * 16;
        const y = 30 + Math.sin(radian) * 16;
        return (
          <rect
            key={i}
            x={x - 2}
            y={y - 1.5}
            width="4"
            height="3"
            fill="currentColor"
          />
        );
      })}
      {/* Motor/frame */}
      <rect x="26" y="6" width="12" height="10" rx="2" fill="currentColor" />
      {/* Support arms */}
      <line x1="20" y1="16" x2="20" y2="44" stroke="currentColor" strokeWidth="3" />
      <line x1="44" y1="16" x2="44" y2="44" stroke="currentColor" strokeWidth="3" />
      {/* Cut line in slab */}
      <line
        x1="20"
        y1="50"
        x2="44"
        y2="50"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray="4 2"
      />
    </svg>
  );
}

export function LaborIcon({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Hard hat */}
      <path
        d="M32 14C24 14 18 20 18 28L18 32L46 32L46 28C46 20 40 14 32 14Z"
        fill="currentColor"
      />
      {/* Hat brim */}
      <ellipse cx="32" cy="32" rx="16" ry="3" fill="currentColor" opacity="0.6" />
      {/* Hat stripe */}
      <rect x="18" y="28" width="28" height="3" fill="white" opacity="0.3" />
      {/* Person body */}
      <path
        d="M22 36L22 56L28 56L28 44L36 44L36 56L42 56L42 36"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Tool belt */}
      <line x1="20" y1="42" x2="44" y2="42" stroke="currentColor" strokeWidth="2" />
      {/* Tools on belt */}
      <rect x="24" y="42" width="3" height="6" rx="1" fill="currentColor" opacity="0.5" />
      <rect x="37" y="42" width="3" height="6" rx="1" fill="currentColor" opacity="0.5" />
    </svg>
  );
}

// Service icon wrapper with gradient background
export function ServiceIconWrapper({
  icon,
  gradient,
  className = ""
}: {
  icon: React.ReactNode;
  gradient: string;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl p-4 ${gradient} ${className}`}>
      <div className="text-white">
        {icon}
      </div>
    </div>
  );
}
