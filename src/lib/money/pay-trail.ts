/**
 * Writing the pay trail a list produced (`payTrail` in
 * lib/money/pay-visibility decides who goes on it; this writes it).
 *
 * Awaited rather than fire-and-forget. A list read is one request and at
 * most a page of people, and the refusal is the evidence that the wall
 * held: a row lost to a serverless freeze after the response is exactly
 * the row somebody asks for afterwards. A failure to write is reported
 * (an Incident and a staff email, lib/alerts) and does not take the page
 * down — the pay figures that needed withholding were already withheld.
 */

import { recordAccess } from '@/lib/access-log'
import { reportError } from '@/lib/alerts'
import type { CallerContext } from '@/lib/api-context'
import { PAY_SHOWN_REASON, PAY_WITHHELD_REASON, type PayTrail } from '@/lib/money/pay-visibility'

export async function writePayTrail(
  caller: Pick<CallerContext, 'person' | 'company'>,
  trail: PayTrail,
  where: string = 'a buy line'
): Promise<void> {
  const base = { actorPersonId: caller.person.id, actorCompanyId: caller.company?.id, action: 'PAYROLL_VIEW' as const }
  try {
    await recordAccess(trail.refused, {
      ...base, allowed: false,
      reason: PAY_WITHHELD_REASON.replace('a buy line', where),
    })
    await recordAccess(trail.read, {
      ...base, allowed: true,
      reason: PAY_SHOWN_REASON.replace('a buy line', where),
    })
  } catch (err) {
    await reportError('pay-trail', err, { personId: caller.person.id, companyId: caller.company?.id ?? null })
  }
}
