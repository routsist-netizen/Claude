import type { Bake } from './types'

/** Numbers about a bake that can be compared with its rating. */
export type Metric = 'bulkHours' | 'hydration' | 'kitchenTemp' | 'proofHours'

export const METRICS: Metric[] = ['bulkHours', 'hydration', 'kitchenTemp', 'proofHours']

function stepMinutes(bake: Bake, key: 'bulk' | 'proof'): number | null {
  const step = bake.steps.find((s) => s.key === key)
  if (!step) return null
  const m = step.actualMinutes ?? step.plannedMinutes
  return Number.isFinite(m) ? m : null
}

/** Value of a metric for one bake; actual times win over planned ones. */
export function metricValue(bake: Bake, metric: Metric): number | null {
  switch (metric) {
    case 'bulkHours': {
      const m = stepMinutes(bake, 'bulk')
      return m === null ? null : m / 60
    }
    case 'proofHours': {
      const m = stepMinutes(bake, 'proof')
      return m === null ? null : m / 60
    }
    case 'hydration':
      return bake.snapshot?.hydration ?? null
    case 'kitchenTemp':
      return Number.isFinite(bake.kitchenTemp) ? bake.kitchenTemp : null
  }
}

export interface Point {
  x: number
  y: number
  id: string
  label: string
}

export function points(bakes: Bake[], metric: Metric): Point[] {
  const out: Point[] = []
  for (const b of bakes) {
    const x = metricValue(b, metric)
    if (x === null || b.rating === null) continue
    out.push({ x, y: b.rating, id: b.id, label: b.recipeName })
  }
  return out
}

/** Pearson correlation; null when fewer than 3 points or no spread. */
export function correlation(pts: { x: number; y: number }[]): number | null {
  const n = pts.length
  if (n < 3) return null
  const mx = pts.reduce((s, p) => s + p.x, 0) / n
  const my = pts.reduce((s, p) => s + p.y, 0) / n
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (const p of pts) {
    sxy += (p.x - mx) * (p.y - my)
    sxx += (p.x - mx) ** 2
    syy += (p.y - my) ** 2
  }
  if (sxx === 0 || syy === 0) return null
  return sxy / Math.sqrt(sxx * syy)
}

/** Plain-language strength bucket for a correlation coefficient. */
export function strength(r: number | null): 'none' | 'weak' | 'moderate' | 'strong' {
  if (r === null) return 'none'
  const a = Math.abs(r)
  if (a < 0.2) return 'none'
  if (a < 0.4) return 'weak'
  if (a < 0.7) return 'moderate'
  return 'strong'
}

export interface BakeFilter {
  recipeId?: string
  minRating?: number
  from?: string
  to?: string
}

export function filterBakes(bakes: Bake[], f: BakeFilter): Bake[] {
  return bakes
    .filter((b) => !f.recipeId || b.recipeId === f.recipeId)
    .filter((b) => !f.minRating || (b.rating ?? 0) >= f.minRating)
    .filter((b) => !f.from || b.date.slice(0, 10) >= f.from)
    .filter((b) => !f.to || b.date.slice(0, 10) <= f.to)
    .sort((a, b) => b.date.localeCompare(a.date))
}

export function averageRating(bakes: Bake[]): number | null {
  const rated = bakes.filter((b) => b.rating !== null)
  if (rated.length === 0) return null
  return rated.reduce((s, b) => s + (b.rating ?? 0), 0) / rated.length
}
