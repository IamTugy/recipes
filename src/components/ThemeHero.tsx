import { motion, AnimatePresence } from 'framer-motion'
import type { Theme } from '../context/ThemeContext'
import type { Lang } from '../types'
import { t } from '../i18n'
import { Mountain, CloudPuff, Lantern, SakuraBlossom, LeafSprig, SteamSwirl } from './motifs'

interface Props {
  theme: Theme
  lang: Lang
}

const SUBTITLE: Record<Theme, { en: string; he: string }> = {
  matcha: { en: 'Muted Matcha — stone garden, earthy calm', he: 'מאצ\'ה — גינת אבן, שלווה אדמתית' },
  ramen:  { en: 'Midnight Ramen — lantern glow, neon nights',  he: 'ראמן חצות — זוהר פנסים, לילות ניאון' },
  sakura: { en: 'Sakura Pastels — blossom drift, chalky calm', he: 'סאקורה פסטלים — פריחה רכה, שקט גירי' },
}

export default function ThemeHero({ theme, lang }: Props) {
  const tx = t[lang]
  const sub = SUBTITLE[theme][lang]

  return (
    <section className="relative h-[340px] md:h-[400px] overflow-hidden" dir="ltr">
      <AnimatePresence mode="wait">
        <motion.div
          key={theme}
          initial={{ opacity: 0, scale: 1.04 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8 }}
          className="absolute inset-0"
        >
          {theme === 'matcha' && <MatchaScene />}
          {theme === 'ramen' && <RamenScene />}
          {theme === 'sakura' && <SakuraScene />}
        </motion.div>
      </AnimatePresence>

      <div className="absolute inset-0 flex items-center">
        <div className="max-w-6xl mx-auto w-full px-6 md:px-10">
          <motion.div
            key={theme + lang}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15 }}
            className="max-w-xl"
            dir={lang === 'he' ? 'rtl' : 'ltr'}
          >
            <p className="smallcaps text-accent mb-3">{sub}</p>
            <h1 className="font-serif text-5xl md:text-6xl font-medium text-ink leading-[1.05] tracking-tight mb-4">
              {tx.heroLine1}
            </h1>
            <p className="text-ink/60 text-base md:text-lg max-w-md font-light leading-relaxed">
              {tx.heroLine2}
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

function MatchaScene() {
  return (
    <svg viewBox="0 0 1200 400" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="mSky" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="rgb(var(--color-bg))" />
          <stop offset="60%" stopColor="rgb(var(--color-surface))" />
          <stop offset="100%" stopColor="rgb(var(--color-herb) / 0.55)" />
        </linearGradient>
        <radialGradient id="mSun" cx="0.75" cy="0.2" r="0.35">
          <stop offset="0%" stopColor="rgb(var(--color-terra) / 0.35)" />
          <stop offset="100%" stopColor="rgb(var(--color-terra) / 0)" />
        </radialGradient>
      </defs>
      <rect width="1200" height="400" fill="url(#mSky)" />
      <rect width="1200" height="400" fill="url(#mSun)" />

      {/* distant hills */}
      <g opacity="0.55" fill="rgb(var(--color-herb))">
        <path d="M0 250 Q 150 200 300 240 T 600 230 T 900 245 T 1200 235 L 1200 400 L 0 400 Z" />
      </g>
      <g opacity="0.8" fill="rgb(var(--color-herb))">
        <path d="M0 290 Q 200 250 400 280 T 800 275 T 1200 285 L 1200 400 L 0 400 Z" />
      </g>

      {/* stone bridge */}
      <g transform="translate(760 230)" opacity="0.9">
        <path d="M0 60 Q 90 -10 180 60 L 180 70 Q 90 0 0 70 Z" fill="rgb(var(--color-cream) / 0.35)" stroke="rgb(var(--color-cream) / 0.5)" strokeWidth="1" />
        <path d="M20 65 L 20 100 M 60 58 L 60 100 M 120 58 L 120 100 M 160 65 L 160 100"
              stroke="rgb(var(--color-cream) / 0.3)" strokeWidth="2" />
      </g>

      {/* terracotta pot */}
      <g transform="translate(120 290)">
        <path d="M0 0 L 60 0 L 52 60 L 8 60 Z" fill="rgb(var(--color-terra) / 0.85)" />
        <rect x="-4" y="-6" width="68" height="10" fill="rgb(var(--color-terra))" />
        <g transform="translate(15 -55)" style={{ color: 'rgb(var(--color-herb))' }}>
          <LeafSprig width="30" height="60" />
        </g>
      </g>

      {/* willow / leaves hanging */}
      <g transform="translate(40 30)" opacity="0.7" style={{ color: 'rgb(var(--color-herb))' }}>
        {[0, 30, 60, 90, 120, 160, 200].map((x, i) => (
          <g key={i} transform={`translate(${x} ${(i % 3) * 20})`}>
            <LeafSprig width="24" height="90" />
          </g>
        ))}
      </g>

      {/* stepping stones */}
      <g fill="rgb(var(--color-cream) / 0.25)">
        <ellipse cx="440" cy="340" rx="26" ry="8" />
        <ellipse cx="530" cy="350" rx="22" ry="7" />
        <ellipse cx="620" cy="345" rx="28" ry="9" />
      </g>
    </svg>
  )
}

function RamenScene() {
  return (
    <svg viewBox="0 0 1200 400" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="rSky" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="rgb(var(--color-bg))" />
          <stop offset="100%" stopColor="rgb(var(--color-surface))" />
        </linearGradient>
        <radialGradient id="rGlow" cx="0.78" cy="0.5" r="0.35">
          <stop offset="0%" stopColor="rgb(var(--color-amber) / 0.6)" />
          <stop offset="100%" stopColor="rgb(var(--color-amber) / 0)" />
        </radialGradient>
        <radialGradient id="rNeon" cx="0.22" cy="0.4" r="0.28">
          <stop offset="0%" stopColor="rgb(var(--color-terra) / 0.55)" />
          <stop offset="100%" stopColor="rgb(var(--color-terra) / 0)" />
        </radialGradient>
      </defs>
      <rect width="1200" height="400" fill="url(#rSky)" />
      <rect width="1200" height="400" fill="url(#rGlow)" />
      <rect width="1200" height="400" fill="url(#rNeon)" />

      {/* stars */}
      {Array.from({ length: 30 }).map((_, i) => (
        <circle key={i} cx={(i * 73) % 1200} cy={(i * 37) % 180} r={i % 3 === 0 ? 1.2 : 0.7}
                fill="rgb(var(--color-cream) / 0.5)" />
      ))}

      {/* distant mountain silhouette */}
      <g opacity="0.4" style={{ color: 'rgb(var(--color-ink) / 0.4)' }} transform="translate(0 200)">
        <path d="M0 100 L 200 30 L 350 70 L 550 10 L 750 80 L 950 40 L 1200 90 L 1200 200 L 0 200 Z"
              fill="rgb(var(--color-surface))" opacity="0.8" />
      </g>

      {/* ramen stall */}
      <g transform="translate(780 180)">
        <rect x="0" y="40" width="320" height="10" fill="rgb(var(--color-cream) / 0.15)" />
        <rect x="10" y="50" width="300" height="140" fill="rgb(var(--color-card))" opacity="0.75" />
        <rect x="10" y="50" width="300" height="20" fill="rgb(var(--color-terra))" opacity="0.85" />
        <text x="160" y="66" textAnchor="middle" fill="rgb(var(--color-cream))" fontFamily="serif" fontSize="14" fontStyle="italic">RAMEN 拉麺</text>
        {/* curtains */}
        {[0, 1, 2, 3, 4, 5, 6].map(i => (
          <rect key={i} x={20 + i * 42} y="70" width="32" height="36" fill="rgb(var(--color-terra))" opacity="0.7" />
        ))}
        {/* patrons */}
        <circle cx="80" cy="150" r="14" fill="rgb(var(--color-ink) / 0.5)" />
        <rect x="66" y="160" width="28" height="30" fill="rgb(var(--color-ink) / 0.5)" />
        <circle cx="140" cy="150" r="14" fill="rgb(var(--color-ink) / 0.5)" />
        <rect x="126" y="160" width="28" height="30" fill="rgb(var(--color-ink) / 0.5)" />
      </g>

      {/* lanterns */}
      <g transform="translate(200 50)" style={{ color: 'rgb(var(--color-terra))' }}>
        <Lantern width="40" height="60" />
      </g>
      <g transform="translate(300 90)" style={{ color: 'rgb(var(--color-amber))' }}>
        <Lantern width="30" height="45" />
      </g>
      <g transform="translate(100 110)" style={{ color: 'rgb(var(--color-terra))' }}>
        <Lantern width="26" height="40" />
      </g>

      {/* steam */}
      <g transform="translate(900 150)" style={{ color: 'rgb(var(--color-cream) / 0.4)' }} className="animate-steam">
        <SteamSwirl width="80" height="100" />
      </g>
    </svg>
  )
}

function SakuraScene() {
  return (
    <svg viewBox="0 0 1200 400" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="sSky" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="rgb(var(--color-bg))" />
          <stop offset="100%" stopColor="rgb(var(--color-surface))" />
        </linearGradient>
      </defs>
      <rect width="1200" height="400" fill="url(#sSky)" />

      {/* distant mountain */}
      <g transform="translate(500 100)" opacity="0.65" style={{ color: 'rgb(var(--color-terra) / 0.6)' }}>
        <Mountain width="500" height="240" />
      </g>
      <g transform="translate(200 140)" opacity="0.5" style={{ color: 'rgb(var(--color-terra) / 0.45)' }}>
        <Mountain width="350" height="180" />
      </g>

      {/* clouds */}
      <g transform="translate(140 60)" style={{ color: 'rgb(var(--color-card))' }}>
        <CloudPuff width="160" height="70" />
      </g>
      <g transform="translate(700 30)" style={{ color: 'rgb(var(--color-card))' }}>
        <CloudPuff width="120" height="55" />
      </g>

      {/* temple roof right */}
      <g transform="translate(960 200)">
        <path d="M 0 40 Q 90 -30 180 40 Z" fill="rgb(var(--color-terra) / 0.8)" />
        <rect x="30" y="40" width="120" height="80" fill="rgb(var(--color-cream) / 0.4)" />
        <rect x="60" y="70" width="15" height="50" fill="rgb(var(--color-terra) / 0.7)" />
        <rect x="105" y="70" width="15" height="50" fill="rgb(var(--color-terra) / 0.7)" />
        <path d="M -20 40 Q 90 -40 200 40 L 180 40 Q 90 -30 0 40 Z" fill="rgb(var(--color-terra))" />
      </g>

      {/* cherry tree trunk + canopy left */}
      <g transform="translate(60 120)">
        <path d="M 80 280 Q 95 200 110 120 Q 90 100 85 60 Q 60 30 30 20" stroke="rgb(var(--color-ink) / 0.6)" strokeWidth="6" fill="none" strokeLinecap="round" />
        <path d="M 95 180 Q 70 150 40 140" stroke="rgb(var(--color-ink) / 0.55)" strokeWidth="4" fill="none" strokeLinecap="round" />
        <path d="M 100 140 Q 150 120 190 110" stroke="rgb(var(--color-ink) / 0.55)" strokeWidth="4" fill="none" strokeLinecap="round" />
        {/* blossom canopy */}
        {[
          [0, 20, 70], [60, 0, 85], [140, 20, 80], [200, 50, 65], [30, 80, 60],
          [100, 70, 75], [170, 90, 55], [40, 140, 50], [110, 150, 55],
        ].map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} fill="rgb(var(--color-accent) / 0.8)"
                  style={{ fill: 'rgb(var(--color-amber) / 0.65)' }} />
        ))}
      </g>

      {/* falling petals */}
      <g style={{ color: 'rgb(var(--color-amber))' }}>
        {[
          [400, 120], [520, 180], [630, 90], [720, 220], [840, 160], [470, 260], [560, 300],
        ].map(([x, y], i) => (
          <g key={i} transform={`translate(${x} ${y}) rotate(${i * 47})`}>
            <SakuraBlossom width="18" height="18" />
          </g>
        ))}
      </g>
    </svg>
  )
}
