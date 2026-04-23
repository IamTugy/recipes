import type { SVGProps } from 'react'

type MotifProps = SVGProps<SVGSVGElement>

export function SteamSwirl(props: MotifProps) {
  return (
    <svg viewBox="0 0 60 80" fill="none" {...props}>
      <path
        d="M20 72 C 10 60, 30 52, 20 40 C 10 28, 30 20, 22 8"
        stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.55"
      />
      <path
        d="M38 76 C 30 62, 50 54, 40 42 C 30 30, 48 22, 40 10"
        stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.4"
      />
    </svg>
  )
}

export function SakuraPetal(props: MotifProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M12 2 C 14 6, 18 8, 20 12 C 18 16, 14 18, 12 22 C 10 18, 6 16, 4 12 C 6 8, 10 6, 12 2 Z"
        fill="currentColor" opacity="0.85"
      />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" opacity="0.35" />
    </svg>
  )
}

export function SakuraBlossom(props: MotifProps) {
  return (
    <svg viewBox="0 0 40 40" fill="none" {...props}>
      {[0, 72, 144, 216, 288].map(a => (
        <ellipse
          key={a}
          cx="20" cy="9" rx="5" ry="8"
          fill="currentColor" opacity="0.75"
          transform={`rotate(${a} 20 20)`}
        />
      ))}
      <circle cx="20" cy="20" r="2.2" fill="currentColor" opacity="0.45" />
    </svg>
  )
}

export function Chopsticks(props: MotifProps) {
  return (
    <svg viewBox="0 0 60 60" fill="none" {...props}>
      <rect x="10" y="8" width="3" height="48" rx="1.5" fill="currentColor" opacity="0.75"
        transform="rotate(-15 11.5 32)" />
      <rect x="20" y="8" width="3" height="48" rx="1.5" fill="currentColor" opacity="0.75"
        transform="rotate(-8 21.5 32)" />
    </svg>
  )
}

export function RiceBowl(props: MotifProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" {...props}>
      <ellipse cx="32" cy="26" rx="22" ry="5" fill="currentColor" opacity="0.3" />
      <path
        d="M10 26 Q 32 58 54 26 Z"
        fill="currentColor" opacity="0.85"
      />
      <path d="M10 26 Q 32 32 54 26" stroke="currentColor" strokeWidth="1.5" opacity="0.5" fill="none" />
    </svg>
  )
}

export function Sparkle(props: MotifProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M12 2 L13.5 10.5 L22 12 L13.5 13.5 L12 22 L10.5 13.5 L2 12 L10.5 10.5 Z"
        fill="currentColor"
      />
    </svg>
  )
}

export function NoodleSwirl(props: MotifProps) {
  return (
    <svg viewBox="0 0 60 60" fill="none" {...props}>
      <path
        d="M8 48 Q 20 20, 30 30 T 52 18"
        stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" opacity="0.7"
      />
      <path
        d="M8 42 Q 22 16, 32 26 T 52 12"
        stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" opacity="0.5"
      />
      <path
        d="M8 54 Q 20 26, 30 36 T 52 24"
        stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" opacity="0.55"
      />
    </svg>
  )
}

export function LeafSprig(props: MotifProps) {
  return (
    <svg viewBox="0 0 40 60" fill="none" {...props}>
      <path d="M20 58 Q 20 30 20 6" stroke="currentColor" strokeWidth="1.6" opacity="0.65" />
      <path d="M20 44 Q 8 40 6 30" stroke="currentColor" strokeWidth="1.6" fill="none" opacity="0.7" />
      <path d="M20 34 Q 32 30 34 20" stroke="currentColor" strokeWidth="1.6" fill="none" opacity="0.7" />
      <path d="M20 24 Q 10 20 8 12" stroke="currentColor" strokeWidth="1.6" fill="none" opacity="0.7" />
      <ellipse cx="6" cy="30" rx="6" ry="2.5" fill="currentColor" opacity="0.65" transform="rotate(-30 6 30)" />
      <ellipse cx="34" cy="20" rx="6" ry="2.5" fill="currentColor" opacity="0.65" transform="rotate(30 34 20)" />
      <ellipse cx="8" cy="12" rx="6" ry="2.5" fill="currentColor" opacity="0.65" transform="rotate(-30 8 12)" />
    </svg>
  )
}

export function WaveBorder(props: MotifProps) {
  return (
    <svg viewBox="0 0 200 20" fill="none" preserveAspectRatio="none" {...props}>
      <path
        d="M0 10 Q 25 0 50 10 T 100 10 T 150 10 T 200 10"
        stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.6"
      />
    </svg>
  )
}

export function CloudPuff(props: MotifProps) {
  return (
    <svg viewBox="0 0 80 40" fill="none" {...props}>
      <path
        d="M10 30 Q 10 18 22 18 Q 24 10 34 12 Q 40 6 50 12 Q 62 10 64 22 Q 74 22 72 32 L 10 32 Z"
        fill="currentColor" opacity="0.7"
      />
    </svg>
  )
}

export function Lantern(props: MotifProps) {
  return (
    <svg viewBox="0 0 40 60" fill="none" {...props}>
      <line x1="20" y1="2" x2="20" y2="10" stroke="currentColor" strokeWidth="1" opacity="0.7" />
      <ellipse cx="20" cy="30" rx="14" ry="18" fill="currentColor" opacity="0.85" />
      <line x1="6" y1="30" x2="34" y2="30" stroke="rgb(0 0 0 / 0.25)" strokeWidth="1" />
      <rect x="14" y="48" width="12" height="4" fill="currentColor" opacity="0.9" />
      <line x1="20" y1="52" x2="20" y2="58" stroke="currentColor" strokeWidth="1" opacity="0.6" />
    </svg>
  )
}

export function Mountain(props: MotifProps) {
  return (
    <svg viewBox="0 0 120 60" fill="none" {...props}>
      <path d="M0 60 L 30 20 L 50 38 L 80 8 L 120 60 Z" fill="currentColor" opacity="0.65" />
      <path d="M22 28 L 30 20 L 38 28 L 34 30 L 30 25 L 26 30 Z" fill="rgb(255 255 255 / 0.4)" />
      <path d="M72 16 L 80 8 L 88 16 L 84 18 L 80 13 L 76 18 Z" fill="rgb(255 255 255 / 0.4)" />
    </svg>
  )
}

export function ThemeIcon({ theme, ...props }: MotifProps & { theme: 'matcha' | 'ramen' | 'sakura' }) {
  if (theme === 'matcha') return <LeafSprig {...props} />
  if (theme === 'ramen') return <NoodleSwirl {...props} />
  return <SakuraBlossom {...props} />
}
