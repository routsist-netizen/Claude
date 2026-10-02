import { defaultScheduleSettings } from './schedule'
import type { Recipe } from './types'

/**
 * Built-in example recipes. They ship with the app (not stored per user),
 * are shown with an "example" badge, are read-only, and can be duplicated
 * into the user's own recipes.
 *
 * Names and descriptions are Greek data, not UI text, so they live here
 * rather than in the i18n dictionary.
 */

const STAMP = '2026-01-01T00:00:00.000Z'
const defaults = defaultScheduleSettings()

export const EXAMPLE_RECIPES: Recipe[] = [
  {
    id: 'example-country',
    name: 'Χωριάτικο προζυμένιο',
    description:
      'Κλασικό country sourdough: Weissmehl με λίγο Vollkornmehl, 75% υδάτωση, ωρίμανση στο ψυγείο όλη τη νύχτα.',
    isExample: true,
    createdAt: STAMP,
    updatedAt: STAMP,
    formula: {
      loaves: 2,
      loafWeight: 900,
      hydration: 75,
      salt: 2,
      levain: 20,
      levainHydration: 100,
      levainFlour: 'bread',
      levainFeedRatio: 5,
      yeast: 0,
      flours: [
        { id: 'bread', name: 'Weissmehl', kind: 'weissmehl', percent: 90 },
        { id: 'ww', name: 'Vollkornmehl', kind: 'vollkornmehl', percent: 10 },
      ],
      inclusions: [],
    },
    schedule: defaults,
  },
  {
    id: 'example-ruchbrot',
    name: 'Ruchbrot με προζύμι',
    description:
      'Το κλασικό ελβετικό σκούρο ψωμί: κυρίως Ruchmehl με λίγο Halbweissmehl. Το πίτουρο θέλει λίγο περισσότερο νερό.',
    isExample: true,
    createdAt: STAMP,
    updatedAt: STAMP,
    formula: {
      loaves: 1,
      loafWeight: 1000,
      hydration: 76,
      salt: 2,
      levain: 20,
      levainHydration: 100,
      levainFlour: 'halbweiss',
      levainFeedRatio: 5,
      yeast: 0,
      flours: [
        { id: 'ruch', name: 'Ruchmehl', kind: 'ruchmehl', percent: 80 },
        { id: 'halbweiss', name: 'Halbweissmehl', kind: 'halbweissmehl', percent: 20 },
      ],
      inclusions: [],
    },
    schedule: defaults,
  },
  {
    id: 'example-wholewheat',
    name: 'Ψωμί με 20% ολικής',
    description:
      'Πιο γεμάτη γεύση με 20% Vollkornmehl. Η ολική ρουφάει περισσότερο νερό, γι’ αυτό 78% υδάτωση.',
    isExample: true,
    createdAt: STAMP,
    updatedAt: STAMP,
    formula: {
      loaves: 1,
      loafWeight: 950,
      hydration: 78,
      salt: 2.1,
      levain: 20,
      levainHydration: 100,
      levainFlour: 'bread',
      levainFeedRatio: 4,
      yeast: 0,
      flours: [
        { id: 'bread', name: 'Weissmehl', kind: 'weissmehl', percent: 80 },
        { id: 'ww', name: 'Vollkornmehl', kind: 'vollkornmehl', percent: 20 },
      ],
      inclusions: [{ id: 'seeds', name: 'Σπόροι (λιναρόσπορος, ηλιόσπορος)', percent: 8 }],
    },
    schedule: {
      ...defaultScheduleSettings(4),
      durations: { ...defaultScheduleSettings(4).durations, bulk: 270, autolyse: 45 },
    },
  },
  {
    id: 'example-focaccia',
    name: 'Φοκάτσια με προζύμι',
    description:
      'Πολύ υγρή ζύμη στο ταψί, χωρίς πλάσιμο. Ελαιόλαδο στη ζύμη και από πάνω, ωρίμανση σε θερμοκρασία δωματίου.',
    isExample: true,
    createdAt: STAMP,
    updatedAt: STAMP,
    formula: {
      loaves: 1,
      loafWeight: 1400,
      hydration: 80,
      salt: 2.2,
      levain: 15,
      levainHydration: 100,
      levainFlour: 'bread',
      levainFeedRatio: 3,
      yeast: 0,
      flours: [{ id: 'bread', name: 'Pizzamehl (Tipo 00)', kind: 'pizzamehl', percent: 100 }],
      inclusions: [{ id: 'oil', name: 'Ελαιόλαδο', percent: 5 }],
    },
    schedule: {
      ...defaultScheduleSettings(3),
      durations: {
        ...defaultScheduleSettings(3).durations,
        autolyse: 30,
        bulk: 240,
        preshape: 0,
        benchRest: 0,
        shape: 15,
        proof: 150,
        preheat: 45,
        bake: 25,
      },
      foldCount: 3,
      proofMode: 'room',
    },
  },
]

export function findExample(id: string): Recipe | undefined {
  return EXAMPLE_RECIPES.find((r) => r.id === id)
}
