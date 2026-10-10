/**
 * The step every walk now takes between the award and the start.
 *
 * Since 2026-10-06 the award writes no pay line for a person whose own
 * terms are not on record — a bench listing is consent to be marketed,
 * never consent to be employed (`lib/award/hire-terms`). So a walk that
 * awards somebody and then starts them has to do what a real firm does
 * in between: its contract desk states the terms, and the person says
 * yes on their own page. An employee is told, not asked, so for one the
 * firm's word is the whole step.
 *
 * And a walk whose placement began before the award says so, the way a
 * real awarder must: the work was already under way, and why.
 */
import { expect } from 'vitest'
import { as, req, json } from './harness'
import { POST as actOnTerms } from '@/app/api/submissions/[id]/terms/route'

/** What a walk adds to an award whose start date is already behind it. */
export const UNDER_WAY = {
  workUnderWay: true,
  underWayReason: 'The work began before the award was recorded here.',
} as const

export async function agreeTerms(o: {
  /** The submission the firm that holds the person made — the bottom of any chain. */
  submissionId: string
  /** Somebody at that firm holding the contract desk. */
  firmEmail: string
  /** The person, who says yes. Null for an employee, who is told rather than asked. */
  personEmail: string | null
  engagementType?: 'W2' | 'IND_1099' | 'OWN_COMPANY'
  /** Cents an hour. */
  payRate: number
}) {
  const call = async (body: unknown) =>
    json(await actOnTerms(req('POST', `/api/submissions/${o.submissionId}/terms`, body), {
      params: Promise.resolve({ id: o.submissionId }),
    }))

  as(o.firmEmail)
  const stated = await call({ action: 'state', engagementType: o.engagementType ?? 'W2', payRate: o.payRate })
  expect(stated.body?.error, JSON.stringify(stated.body)).toBeUndefined()
  if (!o.personEmail) return stated.body.data

  as(o.personEmail)
  const agreed = await call({ action: 'agree' })
  expect(agreed.body?.error, JSON.stringify(agreed.body)).toBeUndefined()
  expect(agreed.body.data.onRecord).toBe(true)
  return agreed.body.data
}
