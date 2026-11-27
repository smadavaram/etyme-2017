import type { TrackKey } from './types'

/** A card with live false reads "Not live yet" and still routes. */
export const NOT_LIVE_YET = 'Not live yet'

/** "What are you?": four large cards. The answer routes; there is no catalog. */
export const OPENING_QUESTION = 'What are you?'
export const OPENING_CARDS: { track: TrackKey; label: string; line: string; live: boolean }[] = [
  { track: 'kids', label: 'Kids / student', line: 'Learning at school or at home.', live: false },
  { track: 'entry', label: 'Entry Level', line: 'Starting your first job.', live: false },
  { track: 'non-it', label: 'Non-IT', line: 'Working in another field.', live: false },
  { track: 'it-upgrade', label: 'IT — Upgrade', line: 'Already in IT, moving up.', live: true },
]

/** Pure. Where an answer goes. An unknown answer goes nowhere, never to a catalog. */
export function routeFor(tenant: string, answer: string): string | null {
  return OPENING_CARDS.some((c) => c.track === answer) ? `/learn/${tenant}/${answer}` : null
}
