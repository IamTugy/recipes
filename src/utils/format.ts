export function formatTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

export function formatSeconds(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function scaleAmount(amount: number, multiplier: number): string {
  const scaled = amount * multiplier
  // Nice fractions
  const frac = scaled % 1
  const whole = Math.floor(scaled)
  if (frac === 0) return whole.toString()
  if (Math.abs(frac - 0.5) < 0.01) return whole > 0 ? `${whole}½` : '½'
  if (Math.abs(frac - 0.25) < 0.01) return whole > 0 ? `${whole}¼` : '¼'
  if (Math.abs(frac - 0.75) < 0.01) return whole > 0 ? `${whole}¾` : '¾'
  if (Math.abs(frac - 0.333) < 0.01) return whole > 0 ? `${whole}⅓` : '⅓'
  if (Math.abs(frac - 0.667) < 0.01) return whole > 0 ? `${whole}⅔` : '⅔'
  // Round to 1 decimal
  return scaled % 1 === 0 ? scaled.toString() : scaled.toFixed(1).replace(/\.0$/, '')
}
