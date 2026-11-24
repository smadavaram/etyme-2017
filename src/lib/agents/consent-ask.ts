/**
 * Consent before a submission (record 112, chain 2, "Fill it"): the pure
 * half of the match ranker's per-person cards.
 *
 * A person who matches a job gets at most one of two cards, both for a
 * person to read and neither one an act:
 *  - ASK: the reader is the client, the person is a supplier's, and the
 *    consent sits with that supplier. The card says who to ask. The ask
 *    itself is a person pressing Ask on the job's page.
 *  - READY: the reader sells, and the person may go forward: a live bench
 *    listing the person granted, or the firm's own employee. The card says
 *    so. Putting them forward is a person's, by the submissions route with
 *    every check it has.
 *
 * Which card is read off `actionFor`, the rule the ask route and the job's
 * page already read, never a second copy of it. Nothing here asks, sends,
 * submits or names the submission kind (the route computes that). Where
 * the listing holds no rate the card says so and gives no number.
 */

import { askState } from '@/app/api/requirements/[id]/matches/asked'
import type { MatchAction } from '@/lib/match-pool'
import type { Card } from './open-once'

/** The dedupe labels of the two cards. Not tables: the record view opens the job from the card's other link. */
export const ASK_CARD_RECORD = 'ConsentAsk'
export const READY_CARD_RECORD = 'ReadyToSubmit'
/** How many people on one job may get a card in one run. */
export const PEOPLE_CARDED = 5

export const RATE_NOT_ON_RECORD = 'The rate is not on record. You type it.'

export type CardKind = 'ASK' | 'READY'

/** Which card a person gets from what the firm may do with them; null for none. A person the firm has no name for gets none. Pure. */
export function cardFor(action: Pick<MatchAction, 'kind'>, name: string | null): CardKind | null {
  if (!name) return null
  if (action.kind === 'ASK') return 'ASK'
  if (action.kind === 'SUBMIT') return 'READY'
  return null
}

/** The first people on a ranked list that may be carded, the list's own order kept. Pure. */
export function namedForCards<T>(ranked: readonly T[]): T[] {
  return ranked.slice(0, PEOPLE_CARDED)
}

/** Whether an ask card is due: never asked, or asked longer ago than the route's own window. Pure. */
export function askIsDue(lastAskedAt: Date | null, now: Date): boolean {
  const s = askState(lastAskedAt, now)
  return s === null || s.mayAskAgain
}

const pageOf = (id: string) => `/dashboard/requirements/${id}`
const money = (cents: number) => (cents / 100).toFixed(2)

/** The listing's rate as the listing holds it, or that none is on record. The listing keeps no currency, so none is named. Pure. */
export function rateWords(min: number | null, max: number | null): string {
  const lo = min ?? max
  const hi = max ?? min
  if (lo === null || hi === null) return RATE_NOT_ON_RECORD
  return lo === hi ? `The listing says ${money(lo)} an hour.` : `The listing says ${money(Math.min(lo, hi))} to ${money(Math.max(lo, hi))} an hour.`
}

export function askCard(o: { person: string; firm: string; job: { id: string; title: string } }): Card {
  return {
    question: `Ask ${o.firm} about ${o.person} for ${o.job.title}?`,
    proof: [
      `${o.person} matches ${o.job.title}, and ${o.firm} holds their consent to be put forward.`,
      `A yes here sends nothing and asks nobody. To ask ${o.firm}, a person presses Ask on the job’s page: ${pageOf(o.job.id)}.`,
      'Nobody has been submitted.',
    ].join(' '),
  }
}

export function readyCard(o: { person: string; job: { id: string; title: string }; employee: boolean; rateMin: number | null; rateMax: number | null }): Card {
  const consent = o.employee
    ? `${o.person} is your own employee, so the employment is the consent, and they are told where they went.`
    : `${o.person} granted a bench listing, so the consent is on record.`
  return {
    question: `${o.person} can be put forward for ${o.job.title}`,
    proof: [
      consent,
      rateWords(o.rateMin, o.rateMax),
      `A yes here submits nobody. A person puts them forward from the job’s page: ${pageOf(o.job.id)}, and every check runs then.`,
    ].join(' '),
  }
}
