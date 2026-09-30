/**
 * Writing the trail a list of rates produced (`payTrail` and `billTrail`
 * in lib/money/pay-visibility decide who goes on it; this writes it).
 *
 * Awaited rather than fire-and-forget. A list read is one request and at
 * most a page of people, and the refusal is the evidence that the wall
 * held: a row lost to a serverless freeze after the response is exactly
 * the row somebody asks for afterwards. A failure to write is reported
 * (an Incident and a staff email, lib/alerts) and does not take the page
 * down — the figures that needed withholding were already withheld.
 */

import { recordAccess, type AccessAction } from '@/lib/access-log'
import { reportError } from '@/lib/alerts'
import type { CallerContext } from '@/lib/api-context'
import {
  PAY_SHOWN_REASON, PAY_WITHHELD_REASON, BILL_SHOWN_REASON, BILL_WITHHELD_REASON, type PayTrail,
} from '@/lib/money/pay-visibility'

export async function writeRateTrail(
  caller: Pick<CallerContext, 'person' | 'company'>,
  trail: PayTrail,
  says: { action: AccessAction; refused: string; read: string }
): Promise<void> {
  const base = { actorPersonId: caller.person.id, actorCompanyId: caller.company?.id, action: says.action }
  try {
    await recordAccess(trail.refused, { ...base, allowed: false, reason: says.refused })
    await recordAccess(trail.read, { ...base, allowed: true, reason: says.read })
  } catch (err) {
    await reportError('rate-trail', err, { personId: caller.person.id, companyId: caller.company?.id ?? null })
  }
}

export function writePayTrail(
  caller: Pick<CallerContext, 'person' | 'company'>,
  trail: PayTrail,
  where: string = 'a buy line'
): Promise<void> {
  return writeRateTrail(caller, trail, {
    action: 'PAYROLL_VIEW',
    refused: PAY_WITHHELD_REASON.replace('a buy line', where),
    read: PAY_SHOWN_REASON.replace('a buy line', where),
  })
}

export function writeBillTrail(caller: Pick<CallerContext, 'person' | 'company'>, trail: PayTrail): Promise<void> {
  return writeRateTrail(caller, trail, {
    action: 'CONTRACT_VIEW', refused: BILL_WITHHELD_REASON, read: BILL_SHOWN_REASON,
  })
}
