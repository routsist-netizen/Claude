/**
 * Shared data shapes. Used by the browser app and the Netlify Function alike,
 * so this file must stay free of DOM- or Node-specific imports.
 */

export interface FlourPart {
  id: string
  name: string
  /** Share of the total flour, in %. All parts of a blend must sum to 100. */
  percent: number
  /** Catalogue id (see flours.ts), e.g. 'ruchmehl'. Absent for a custom flour. */
  kind?: string
}

export interface Inclusion {
  id: string
  name: string
  /** Baker's percentage: grams per 100 g of total flour. */
  percent: number
}

/**
 * A recipe expressed as baker's percentages. Every percentage is relative to
 * the TOTAL flour of the dough, i.e. including the flour inside the levain.
 */
export interface RecipeFormula {
  loaves: number
  /** Target dough weight per loaf in grams (all ingredients incl. inclusions). */
  loafWeight: number
  /** Total water / total flour, in % (levain water and flour included). */
  hydration: number
  salt: number
  /** Levain weight as % of total flour (e.g. 20 → 200 g levain per kg flour). */
  levain: number
  /** Hydration of the levain itself, in % (100 = equal flour and water). */
  levainHydration: number
  /**
   * Which flour the levain is built with: a flour id from `flours`, or
   * 'blend' if it is fed with the same blend as the dough.
   */
  levainFlour: string
  /** Feed ratio for building the levain: 1 part seed starter to N parts flour. */
  levainFeedRatio: number
  /** Instant dry yeast in %, 0 for none. */
  yeast: number
  flours: FlourPart[]
  inclusions: Inclusion[]
}

export type StepKey =
  | 'levain'
  | 'autolyse'
  | 'mix'
  | 'bulk'
  | 'preshape'
  | 'benchRest'
  | 'shape'
  | 'proof'
  | 'preheat'
  | 'bake'

export type ProofMode = 'room' | 'cold'

/** Per-recipe tweakable defaults for the backwards schedule. */
export interface ScheduleSettings {
  /** Base durations in minutes. Fermentation steps are given at the reference temperature. */
  durations: Record<StepKey, number>
  foldCount: number
  foldInterval: number
  proofMode: ProofMode
  /** Cold retard length in minutes (used when proofMode = 'cold'). */
  coldRetard: number
}

export interface Recipe {
  id: string
  name: string
  description: string
  formula: RecipeFormula
  schedule: ScheduleSettings
  /** True for the built-in examples, which are read-only and shared by everyone. */
  isExample?: boolean
  createdAt: string
  updatedAt: string
}

export interface BakeStepLog {
  key: StepKey
  plannedStart: string
  plannedMinutes: number
  actualStart?: string
  actualMinutes?: number
  /** Dough or room temperature measured during this step, °C. */
  temp?: number
}

export type PhotoKind = 'crust' | 'crumb' | 'other'

export interface BakePhoto {
  id: string
  kind: PhotoKind
}

export interface Bake {
  id: string
  /** Bake date (ISO); the planned or actual out-of-oven time. */
  date: string
  recipeId: string | null
  recipeName: string
  /** Copy of the recipe numbers at the time of the bake. */
  snapshot: RecipeFormula
  kitchenTemp: number
  proofMode: ProofMode
  steps: BakeStepLog[]
  notes: string
  rating: number | null
  photos: BakePhoto[]
  createdAt: string
  updatedAt: string
}

export interface StarterFeeding {
  id: string
  fedAt: string
  seed: number
  flour: number
  water: number
  flourType: string
  temp: number | null
  /** Rise at peak, in % of starting volume (100 = doubled). */
  risePercent: number | null
  peakAt: string | null
  notes: string
  createdAt: string
  updatedAt: string
}
