import type { TrackKey } from './types'

/** "What are you?": four large cards. The answer routes; there is no catalog. */
export const OPENING_QUESTION = 'What are you?'
export const OPENING_CARDS: { track: TrackKey; label: string; line: string }[] = [
  { track: 'kids', label: 'Kids / student', line: 'Learning at school or at home.' },
  { track: 'entry', label: 'Entry Level', line: 'Starting your first job.' },
  { track: 'non-it', label: 'Non-IT', line: 'Working in another field.' },
  { track: 'it-upgrade', label: 'IT — Upgrade', line: 'Already in IT, moving up.' },
]

/** Pure. Where an answer goes. An unknown answer goes nowhere, never to a catalog. */
export function routeFor(tenant: string, answer: string): string | null {
  return OPENING_CARDS.some((c) => c.track === answer) ? `/learn/${tenant}/${answer}` : null
}
