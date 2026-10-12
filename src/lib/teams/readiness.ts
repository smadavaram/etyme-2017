/**
 * The Teams bot as an edge on /ready: missing, set up but never used,
 * proven. The sentence is conversation's, the way `teamsEdge` in
 * lib/notify/teams-link is; lib/readiness (the architect's) puts it on
 * the page.
 *
 *   missing              any of the three keys is not set
 *   set up, never used   the keys are set and nobody has answered a card
 *                        from Teams, nor has the bot delivered a digest
 *   proven               somebody answered the twin from Teams, or the
 *                        bot delivered a digest into somebody's chat
 *
 * Being bound is not proof: a person can open the bot and never press a
 * button. Proof is the outside world doing the thing once.
 */

import { prisma } from '@/lib/db'
import { missingTeamsKeys } from '@/lib/teams/config'
import { boundCount } from '@/lib/teams/store'
import { TEAMS_BOT_SENT_NOTE } from '@/lib/teams/digest'

export interface TeamsBotFacts {
  /** The key names that are not set. Never their values. */
  missingKeys: string[]
  /** People the bot has been bound to. */
  bound: number
  /** Questions from the twin answered in Teams. */
  answeredInTeams: number
  /** Digests the bot delivered into a person's chat. */
  digestsDelivered: number
}

export type TeamsBotEdgeState = 'MISSING' | 'SET' | 'PROVEN'

export const TEAMS_BOT_EDGE_NAME = 'Teams bot'

export function teamsBotEdge(f: TeamsBotFacts): { state: TeamsBotEdgeState; says: string; fix?: string } {
  if (f.missingKeys.length > 0) {
    return {
      state: 'MISSING',
      says: `The Teams bot is switched off: ${f.missingKeys.join(', ')} ${f.missingKeys.length === 1 ? 'is' : 'are'} not set, so every post to it is refused and nobody can approve from Teams.`,
      fix: 'Register the bot in Entra and Azure, set the three keys in Vercel, and sideload the app (docs/teams-setup.md).',
    }
  }
  const used = f.answeredInTeams + f.digestsDelivered
  if (used === 0) {
    return {
      state: 'SET',
      says: f.bound === 0
        ? 'The Teams bot has its keys. Nobody has opened it in Teams yet.'
        : `The Teams bot has its keys and ${f.bound === 1 ? '1 person has' : `${f.bound} people have`} opened it. Nobody has answered the twin from Teams yet.`,
      fix: 'Open Etyme in Teams as a program owner or an AP desk, and approve one invoice receipt from the card.',
    }
  }
  const parts = [
    f.answeredInTeams ? `${f.answeredInTeams === 1 ? '1 question' : `${f.answeredInTeams} questions`} from the twin answered in Teams` : null,
    f.digestsDelivered ? `${f.digestsDelivered === 1 ? '1 digest' : `${f.digestsDelivered} digests`} delivered by the bot` : null,
  ].filter(Boolean)
  return { state: 'PROVEN', says: `${parts.join(', and ')}.` }
}

/** The facts, read from the record. Never throws: a fact it cannot read counts as nothing. */
export async function teamsBotFacts(): Promise<TeamsBotFacts> {
  const missingKeys = missingTeamsKeys()
  const zero = () => 0
  const [bound, answeredInTeams, digestsDelivered] = await Promise.all([
    boundCount().catch(zero),
    prisma.twinApproval.count({ where: { surface: 'TEAMS', decision: { not: 'PENDING' } } }).catch(zero),
    prisma.notification.count({ where: { channel: 'TEAMS', deliveryState: 'SENT', deliveryNote: TEAMS_BOT_SENT_NOTE } }).catch(zero),
  ])
  return { missingKeys, bound, answeredInTeams, digestsDelivered }
}
