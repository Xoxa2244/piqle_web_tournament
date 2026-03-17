'use client';

export function LogoIcon({ size = 36, className = "" }: { size?: number; className?: string }) {
  const id = `iq-logo-${size}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7C3AED" />
          <stop offset="50%" stopColor="#8B5CF6" />
          <stop offset="100%" stopColor="#06B6D4" />
        </linearGradient>
        <linearGradient id={`${id}-arc`} x1="24" y1="12" x2="52" y2="52" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#C4B5FD" />
          <stop offset="100%" stopColor="#22D3EE" />
        </linearGradient>
        <filter id={`${id}-glow`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect x="0" y="0" width="64" height="64" rx="16" fill={`url(#${id}-bg)`} />
      <rect x="0" y="0" width="64" height="64" rx="16" fill="white" fillOpacity="0.06" />

      <rect x="16" y="16" width="7" height="32" rx="3.5" fill="white" fillOpacity="0.95" />
      <circle cx="19.5" cy="14" r="2" fill="white" fillOpacity="0.5" />

      <circle cx="39" cy="30" r="13" stroke="white" strokeWidth="5.5" strokeOpacity="0.95" fill="none" />
      <line x1="46" y1="38" x2="54" y2="50" stroke={`url(#${id}-arc)`} strokeWidth="5" strokeLinecap="round" />

      <circle cx="54" cy="50" r="3.5" fill="#22D3EE" filter={`url(#${id}-glow)`} />
      <circle cx="39" cy="17" r="2.5" fill="white" fillOpacity="0.7" filter={`url(#${id}-glow)`} />

      <line x1="21.5" y1="14" x2="36.5" y2="17" stroke="white" strokeWidth="1" strokeOpacity="0.25" strokeDasharray="2 2" />
      <circle cx="28" cy="30" r="1.5" fill="white" fillOpacity="0.3" />
    </svg>
  );
}
