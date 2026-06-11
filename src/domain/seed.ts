import type { IngredientState } from './types'

/* First-run seed data, ported from the prototype (amma-data.jsx). Registries are meant to be
 * pre-built and tapped forever, so we ship Amma's pantry + tools rather than starting empty.
 * Utensil photos use "tone:" gradient tokens until she replaces them with real photos. */

export interface SeedIngredient {
  name_ta: string
  name_en: string
  default_state: IngredientState
}

export const SEED_INGREDIENTS: SeedIngredient[] = [
  { name_ta: 'Nallennai', name_en: 'sesame oil', default_state: 'liquid' },
  { name_ta: 'Kadugu', name_en: 'mustard seeds', default_state: 'solid' },
  { name_ta: 'Ulundhu', name_en: 'urad dal', default_state: 'solid' },
  { name_ta: 'Kadalai paruppu', name_en: 'chana dal', default_state: 'solid' },
  { name_ta: 'Karuveppilai', name_en: 'curry leaves', default_state: 'solid' },
  { name_ta: 'Perungayam', name_en: 'asafoetida', default_state: 'solid' },
  { name_ta: 'Chinna vengayam', name_en: 'small onion', default_state: 'solid' },
  { name_ta: 'Poondu', name_en: 'garlic', default_state: 'solid' },
  { name_ta: 'Thakkali', name_en: 'tomato', default_state: 'solid' },
  { name_ta: 'Puli', name_en: 'tamarind', default_state: 'solid' },
  { name_ta: 'Manjal podi', name_en: 'turmeric', default_state: 'solid' },
  { name_ta: 'Milagai podi', name_en: 'chilli powder', default_state: 'solid' },
  { name_ta: 'Kothamalli podi', name_en: 'coriander powder', default_state: 'solid' },
  { name_ta: 'Vatha kuzhambu podi', name_en: 'spice mix', default_state: 'solid' },
  { name_ta: 'Uppu', name_en: 'salt', default_state: 'solid' },
  { name_ta: 'Vellam', name_en: 'jaggery', default_state: 'solid' },
]

export interface SeedUtensil {
  name_ta: string
  name_en: string
  tone: [string, string]
}

export const SEED_UTENSILS: SeedUtensil[] = [
  { name_ta: 'Kal chatti', name_en: 'clay pot', tone: ['#C98A5E', '#9A5E34'] },
  { name_ta: 'Vaanali', name_en: 'kadai', tone: ['#B7773F', '#7E4E22'] },
  { name_ta: 'Aatukkal', name_en: 'grinding stone', tone: ['#9E9285', '#6E6055'] },
  { name_ta: 'Karandi', name_en: 'ladle', tone: ['#C2A878', '#8C7038'] },
  { name_ta: 'Thugavu', name_en: 'flat spatula', tone: ['#B89B6A', '#7E6230'] },
  { name_ta: 'Idi kal', name_en: 'pestle', tone: ['#A88F6E', '#6E5638'] },
  { name_ta: 'Vatti', name_en: 'steel bowl', tone: ['#AEB4B8', '#7C8488'] },
  { name_ta: 'Tharazhu', name_en: 'scale', tone: ['#9CA98E', '#6A7656'] },
]

/** Build the "tone:" photo_uri token a seeded utensil renders from. */
export function toneUri(tone: [string, string]): string {
  return `tone:${tone[0]},${tone[1]}`
}

export const SEED_DISH_TYPES = ['main', 'side', 'sweet', 'savory', 'snack', 'health']

export interface SeedStageName {
  value: string // english value used as the stage name default
  label_ta: string
}

/** Stage-name suggestions (fully free-text; these are just taps). */
export const SEED_STAGE_NAMES: SeedStageName[] = [
  { value: 'Prep', label_ta: 'Aayatham' },
  { value: 'Tempering', label_ta: 'Thaalichu' },
  { value: 'Main cooking', label_ta: 'Kuzhambu kaaichu' },
  { value: 'Final touches', label_ta: 'Kadaisi thoduppu' },
  { value: 'Cooling / rest', label_ta: 'Aaravippu' },
]
