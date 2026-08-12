import { heUnit, canonicalUnit } from '../i18n'
import type { Lang } from '../types'

export interface RawShoppingItem {
  name: string
  amount: number | null
  unit: string
}

const MASS_TO_G: Record<string, number> = { g: 1, kg: 1000 }
const VOLUME_TO_ML: Record<string, number> = { ml: 1, l: 1000, liter: 1000, liters: 1000 }

function unitGroup(unit: string): { base: string; factor: number } | null {
  if (unit in MASS_TO_G) return { base: 'g', factor: MASS_TO_G[unit] }
  if (unit in VOLUME_TO_ML) return { base: 'ml', factor: VOLUME_TO_ML[unit] }
  return null
}

// Mass and volume share one aggregation bucket: kitchen convention treats 1g ≈ 1ml,
// so "1L milk" and "300g milk" combine into one line (as the feature request specifies).
// canonicalUnit first, since items added before that normalization shipped may still
// have a raw Hebrew unit word persisted (e.g. "גרם" instead of "g") and would otherwise
// fail to group with, or display correctly against, canonical-unit items.
export function aggregationKey(name: string, unit: string, amount: number | null): string {
  const normName = name.trim().toLowerCase()
  if (amount === null) return `${normName}__none`
  const group = unitGroup(canonicalUnit(unit))
  return `${normName}__${group ? 'weight-or-volume' : canonicalUnit(unit)}`
}

// Converts a raw item's amount into the base unit used for aggregation (g, ml, or the original unit).
export function toBaseAmount(item: RawShoppingItem): { amount: number | null; unit: string } {
  if (item.amount === null) return { amount: null, unit: canonicalUnit(item.unit) }
  const group = unitGroup(canonicalUnit(item.unit))
  if (!group) return { amount: item.amount, unit: canonicalUnit(item.unit) }
  return { amount: item.amount * group.factor, unit: group.base }
}

function roundNice(n: number): string {
  const rounded = Math.round(n * 100) / 100
  return rounded % 1 === 0 ? rounded.toString() : rounded.toFixed(2).replace(/0$/, '').replace(/\.$/, '')
}

export function formatAggregatedAmount(amount: number | null, rawUnit: string, lang: Lang): string {
  if (amount === null) return ''
  let value = amount
  let displayUnit = canonicalUnit(rawUnit)
  if (displayUnit === 'g' && value >= 1000) { value /= 1000; displayUnit = 'kg' }
  else if (displayUnit === 'ml' && value >= 1000) { value /= 1000; displayUnit = 'l' }
  const valueStr = roundNice(value)
  const unitLabel = lang === 'he' ? heUnit(displayUnit, value) : displayUnit
  return unitLabel ? `${valueStr} ${unitLabel}` : valueStr
}
