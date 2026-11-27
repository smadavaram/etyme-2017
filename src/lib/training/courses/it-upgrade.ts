import type { Track } from './types'
import { IT_UPGRADE_SIMPLE, IT_UPGRADE_GOOD_AT } from './it-upgrade-simple'

/**
 * IT — Upgrade, built first: a product walkthrough in three levels (a
 * chatbot, then answering from documents, then an agent). Each level is its
 * own file. The track stays a placeholder until all three are here.
 */
export const IT_UPGRADE: Track = {
  key: 'it-upgrade',
  title: 'IT — Upgrade',
  placeholder: true,
  goodAt: IT_UPGRADE_GOOD_AT,
  levels: [IT_UPGRADE_SIMPLE],
}
