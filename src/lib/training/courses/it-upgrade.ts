import type { Track } from './types'
import { IT_UPGRADE_SIMPLE, IT_UPGRADE_GOOD_AT } from './it-upgrade-simple'
import { IT_UPGRADE_MEDIUM } from './it-upgrade-medium'
import { IT_UPGRADE_COMPLEX, IT_UPGRADE_RECAP } from './it-upgrade-complex'

/**
 * IT — Upgrade: a product walkthrough in three levels (a chatbot, then
 * answering from documents, then an agent), nine chapters in order. Each
 * level is its own file; the recap that closes the track is in the last.
 */
export const IT_UPGRADE: Track = {
  key: 'it-upgrade',
  title: 'IT — Upgrade',
  goodAt: IT_UPGRADE_GOOD_AT,
  levels: [IT_UPGRADE_SIMPLE, IT_UPGRADE_MEDIUM, IT_UPGRADE_COMPLEX],
  recap: IT_UPGRADE_RECAP,
}
