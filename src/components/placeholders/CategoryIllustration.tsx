import type React from 'react'
import type { Category } from '../../types'
import { SteamSwirl, Sparkle, LeafSprig } from '../motifs'

interface Props {
  category: Category
  title?: string
  className?: string
  seed?: string
}

/*
  Layered watercolor-style SVG scenes per category. Uses theme tokens via
  CSS variables so each illustration re-tints with the active palette.
*/

function hashSeed(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function Scene({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`relative w-full h-full overflow-hidden ${className}`}
      style={{
        background: `
          radial-gradient(ellipse at 30% 20%, rgb(var(--color-herb) / 0.35), transparent 60%),
          radial-gradient(ellipse at 80% 80%, rgb(var(--color-terra) / 0.25), transparent 55%),
          linear-gradient(135deg, rgb(var(--color-surface)) 0%, rgb(var(--color-card)) 100%)
        `,
      }}
    >
      {/* paper grain */}
      <div
        className="absolute inset-0 opacity-50 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(rgb(var(--paper-tint) / 0.12) 1px, transparent 1px)',
          backgroundSize: '14px 14px',
        }}
      />
      {children}
    </div>
  )
}

function Breakfast({ seed }: { seed: number }) {
  return (
    <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid slice">
      <ellipse cx="100" cy="130" rx="70" ry="12" fill="rgb(var(--color-tint) / 0.08)" />
      <ellipse cx="100" cy="120" rx="62" ry="18" fill="rgb(var(--color-card))" stroke="rgb(var(--color-tint) / 0.1)" strokeWidth="1" />
      <ellipse cx="85" cy="115" rx="22" ry="14" fill="rgb(var(--color-amber) / 0.85)" />
      <ellipse cx="85" cy="112" rx="8" ry="6" fill="rgb(var(--color-terra))" />
      <ellipse cx="115" cy="118" rx="14" ry="8" fill="rgb(var(--color-herb) / 0.8)" />
      <ellipse cx="125" cy="110" rx="6" ry="4" fill="rgb(var(--color-terra) / 0.7)" />
      <g transform={`translate(${90 + (seed % 10)} 70)`} className="text-amber animate-steam" style={{ color: 'rgb(var(--color-tint) / 0.25)' }}>
        <SteamSwirl width="50" height="60" />
      </g>
    </svg>
  )
}

function Dinner({ seed }: { seed: number }) {
  return (
    <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid slice">
      <ellipse cx="100" cy="140" rx="80" ry="14" fill="rgb(var(--color-tint) / 0.08)" />
      <path d="M30 130 Q 100 175 170 130 Q 160 120 40 120 Z" fill="rgb(var(--color-amber) / 0.9)" />
      <path d="M40 120 Q 100 140 160 120" stroke="rgb(var(--color-tint) / 0.25)" strokeWidth="1.5" fill="none" />
      <ellipse cx="80" cy="120" rx="12" ry="6" fill="rgb(var(--color-terra))" />
      <ellipse cx="120" cy="122" rx="10" ry="5" fill="rgb(var(--color-herb))" />
      <ellipse cx="100" cy="118" rx="8" ry="4" fill="rgb(var(--color-card))" opacity="0.8" />
      <g transform={`translate(${85 + (seed % 8)} 55)`} style={{ color: 'rgb(var(--color-tint) / 0.3)' }} className="animate-steam">
        <SteamSwirl width="60" height="70" />
      </g>
    </svg>
  )
}

function Soup({ seed }: { seed: number }) {
  return (
    <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid slice">
      <ellipse cx="100" cy="150" rx="78" ry="10" fill="rgb(var(--color-tint) / 0.08)" />
      <path d="M25 130 Q 100 190 175 130 L 170 120 Q 100 132 30 120 Z" fill="rgb(var(--color-amber))" />
      <ellipse cx="100" cy="122" rx="70" ry="8" fill="rgb(var(--color-terra) / 0.75)" />
      <path d="M55 122 Q 70 115, 85 122 T 115 122 T 145 122" stroke="rgb(var(--color-card))" strokeWidth="1.5" fill="none" opacity="0.7" />
      <circle cx="80" cy="120" r="3" fill="rgb(var(--color-herb))" />
      <circle cx="115" cy="121" r="2" fill="rgb(var(--color-herb))" />
      <circle cx="130" cy="119" r="2.5" fill="rgb(var(--color-card))" opacity="0.7" />
      <g transform={`translate(${80 + (seed % 10)} 40)`} style={{ color: 'rgb(var(--color-tint) / 0.3)' }} className="animate-steam">
        <SteamSwirl width="60" height="80" />
      </g>
    </svg>
  )
}

function Salad({ seed }: { seed: number }) {
  const leaves = Array.from({ length: 6 }, (_, i) => ({
    x: 50 + ((seed + i * 17) % 100),
    y: 100 + ((seed + i * 23) % 40),
    r: 20 + (i % 3) * 4,
    rot: (seed + i * 41) % 60 - 30,
  }))
  return (
    <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid slice">
      <ellipse cx="100" cy="155" rx="75" ry="10" fill="rgb(var(--color-tint) / 0.08)" />
      <ellipse cx="100" cy="140" rx="72" ry="20" fill="rgb(var(--color-card))" stroke="rgb(var(--color-tint) / 0.1)" />
      {leaves.map((l, i) => (
        <ellipse key={i} cx={l.x} cy={l.y} rx={l.r} ry={l.r * 0.55} fill="rgb(var(--color-herb))" opacity="0.75"
          transform={`rotate(${l.rot} ${l.x} ${l.y})`} />
      ))}
      <circle cx="80" cy="125" r="5" fill="rgb(var(--color-terra))" />
      <circle cx="125" cy="130" r="4" fill="rgb(var(--color-terra))" />
      <circle cx="105" cy="120" r="3" fill="rgb(var(--color-amber))" />
    </svg>
  )
}

function Dessert() {
  return (
    <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid slice">
      <ellipse cx="100" cy="165" rx="70" ry="8" fill="rgb(var(--color-tint) / 0.08)" />
      <rect x="60" y="110" width="80" height="50" rx="4" fill="rgb(var(--color-amber) / 0.85)" />
      <rect x="60" y="105" width="80" height="10" fill="rgb(var(--color-card))" opacity="0.9" />
      <rect x="60" y="130" width="80" height="6" fill="rgb(var(--color-terra) / 0.7)" />
      <path d="M60 110 Q 100 96 140 110" fill="rgb(var(--color-card))" opacity="0.95" />
      <circle cx="85" cy="96" r="4" fill="rgb(var(--color-terra))" />
      <circle cx="115" cy="92" r="4" fill="rgb(var(--color-terra))" />
      <circle cx="100" cy="88" r="4" fill="rgb(var(--color-terra))" />
      <g style={{ color: 'rgb(var(--color-amber))' }} transform="translate(30 40)">
        <Sparkle width="16" height="16" />
      </g>
      <g style={{ color: 'rgb(var(--color-terra))' }} transform="translate(155 55)">
        <Sparkle width="12" height="12" />
      </g>
    </svg>
  )
}

function Bread({ seed }: { seed: number }) {
  return (
    <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid slice">
      <ellipse cx="100" cy="155" rx="70" ry="8" fill="rgb(var(--color-tint) / 0.08)" />
      <ellipse cx="100" cy="130" rx="60" ry="28" fill="rgb(var(--color-amber))" />
      <ellipse cx="100" cy="128" rx="55" ry="22" fill="rgb(var(--color-amber) / 0.5)" />
      {[0, 1, 2, 3, 4].map(i => (
        <path key={i}
          d={`M${60 + i * 20} 115 Q ${70 + i * 20} ${108 + (seed + i) % 6} ${80 + i * 20} 115`}
          stroke="rgb(var(--color-terra) / 0.6)" strokeWidth="1.5" fill="none" />
      ))}
      <g style={{ color: 'rgb(var(--color-herb))' }} transform="translate(150 30)">
        <LeafSprig width="30" height="45" />
      </g>
    </svg>
  )
}

function Snack() {
  return (
    <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid slice">
      <ellipse cx="100" cy="155" rx="70" ry="8" fill="rgb(var(--color-tint) / 0.08)" />
      {[
        [70, 130, 14], [105, 125, 18], [135, 135, 12], [85, 145, 10], [125, 147, 11],
      ].map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill={i % 2 ? 'rgb(var(--color-amber))' : 'rgb(var(--color-terra))'} opacity="0.85" />
      ))}
      <circle cx="95" cy="120" r="6" fill="rgb(var(--color-herb))" opacity="0.85" />
    </svg>
  )
}

function Sauce() {
  return (
    <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid slice">
      <ellipse cx="100" cy="165" rx="60" ry="7" fill="rgb(var(--color-tint) / 0.08)" />
      <rect x="75" y="70" width="50" height="90" rx="8" fill="rgb(var(--color-card))" stroke="rgb(var(--color-tint) / 0.15)" />
      <rect x="72" y="60" width="56" height="14" rx="3" fill="rgb(var(--color-amber))" />
      <rect x="78" y="95" width="44" height="55" fill="rgb(var(--color-terra) / 0.85)" />
      <rect x="82" y="115" width="36" height="18" rx="2" fill="rgb(var(--color-card))" opacity="0.9" />
      <text x="100" y="127" textAnchor="middle" fontSize="9" fill="rgb(var(--color-cream))" fontFamily="serif" fontStyle="italic" opacity="0.7">ご飯</text>
    </svg>
  )
}

const SCENES: Record<Category, (p: { seed: number }) => React.ReactElement> = {
  breakfast: Breakfast,
  lunch: Dinner,
  dinner: Dinner,
  soup: Soup,
  salad: Salad,
  dessert: () => <Dessert />,
  bread: Bread,
  snack: () => <Snack />,
  sauce: () => <Sauce />,
}

export default function CategoryIllustration({ category, title = '', className = '', seed }: Props) {
  const Scn = SCENES[category] || Dinner
  const s = hashSeed(seed || title || category)
  return (
    <Scene className={className}>
      <Scn seed={s} />
    </Scene>
  )
}
