/* A deterministic warm gradient per dish, derived from its id - replaces the prototype's
 * hardcoded per-dish tones so newly created dishes still get a consistent clay/sage/turmeric hue
 * until a real cover photo is chosen. */

const PAIRS: [string, string][] = [
  ['#BE5E37', '#8E3F22'],
  ['#C56A3A', '#9A4422'],
  ['#7E8E5E', '#566237'],
  ['#C29A52', '#94702E'],
  ['#B6863C', '#7E5A22'],
  ['#C0894E', '#8C5C26'],
  ['#A8623A', '#7A3E20'],
  ['#9A8A5A', '#6E5E34'],
]

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

export function dishTone(id: string): [string, string] {
  return PAIRS[hash(id) % PAIRS.length]
}

export function dishGradient(id: string): string {
  const [a, b] = dishTone(id)
  return `linear-gradient(140deg, ${a}, ${b})`
}
