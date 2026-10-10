/**
 * The worker is told when their own pay rate is approved.
 *
 * The founder, 2026-09-29: "The worker is told when a new rate is
 * approved." In the app and by email, in one plain sentence:
 *
 *   "Your pay rate changes from $66 to $70 an hour from Wednesday, July 1."
 *
 * ── Who is told, and who is not ──────────────────────────────────────
 *
 * Only the worker the BUY line pays. A buy line that buys from another
 * firm — a sub-vendor, a supplier's own contract — carries a price
 * between two firms, not anybody's pay, and the worker is not a party to
 * it: telling them would put a rung's rate in front of somebody the rung
 * is closed to (CLAUDE.md, "the worker knows the complete chain … rates
 * of rungs the worker is not party to stay closed"). A SELL line is what
 * a client is billed, and is never said to a worker at all.
 *
 * A rate row sits on the line, not on a person, so on a line paying more
 * than one live person it cannot say whose pay moved. Nobody is told
 * rather than the wrong person, and the approval says so.
 */

import { prisma } from '@/lib/db'
import { notify } from '@/lib/notify'
import { amount, compact } from '@/lib/money-display'
import { weeksSay, type BackPayProposal } from '@/lib/money/back-pay'

const PER: Record<string, string> = { HOURLY: 'an hour', DAILY: 'a day', WEEKLY: 'a week', MONTHLY: 'a month' }

/** "Wednesday, July 1" — and the year too, where it is not this one. */
export function payDay(iso: string, now: Date = new Date()): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`)
  const sameYear = d.getUTCFullYear() === now.getUTCFullYear()
  return d.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }), timeZone: 'UTC',
  })
}

export interface PayChangeNotice {
  title: string
  body: string
}

/**
 * What the worker reads. Their own pay, old and new, and the day it
 * starts; the back pay only as what it is — proposed to their employer's
 * payroll desk, not yet paid.
 */
export function payChangeNotice(input: {
  fromCents: number | null
  toCents: number
  currency: string
  rateType?: string | null
  effectiveFrom: string
  employerName: string
  backPayCents?: number | null
  backPayWeeks?: string[]
  now?: Date
}): PayChangeNotice {
  const per = PER[String(input.rateType ?? 'HOURLY').toUpperCase()] ?? 'an hour'
  const when = payDay(input.effectiveFrom, input.now)
  const first =
    input.fromCents != null && input.fromCents > 0 && input.fromCents !== input.toCents
      ? `Your pay rate changes from ${compact(input.fromCents, input.currency)} to ${compact(input.toCents, input.currency)} ${per} from ${when}.`
      : `Your pay rate is ${compact(input.toCents, input.currency)} ${per} from ${when}.`
  const back =
    input.backPayCents && input.backPayCents > 0
      ? ` Days since then were already paid at the old rate, so back pay of ` +
        `${amount(input.backPayCents, input.currency)} for ${weeksSay(input.backPayWeeks ?? [])} has been put ` +
        `to ${input.employerName}'s payroll desk to approve. It is not paid yet.`
      : ''
  return {
    title: 'Your pay rate has changed',
    body: `${first}${back} ${input.employerName} approved it.`,
  }
}

export interface Told {
  personId: string | null
  /** Why nobody was told, where nobody was. */
  why: string | null
}

/**
 * Tell the worker a BUY change was approved. Writes one notification —
 * in the app, and sent by email — to the one person the line pays.
 */
export async function tellWorkerOfPayChange(rateHistoryId: string, backPay?: BackPayProposal | null): Promise<Told> {
  const change = await prisma.rateHistory.findUnique({ where: { id: rateHistoryId } })
  if (!change || change.contractType.toUpperCase() !== 'BUY' || change.approvalState !== 'APPROVED') {
    return { personId: null, why: 'Only an approved change to what somebody is paid is told to them.' }
  }
  const bc = await prisma.buyContract.findUnique({
    where: { id: change.contractId },
    select: {
      id: true, companyId: true, vendorCompanyId: true, supplierSellContractId: true, payCurrency: true,
      company: { select: { name: true } },
      candidates: { where: { state: 'ACTIVE' }, select: { personId: true, payCurrency: true } },
    },
  })
  if (!bc) return { personId: null, why: 'The line this change is on no longer exists.' }
  if (bc.vendorCompanyId || bc.supplierSellContractId) {
    return {
      personId: null,
      why: 'This line buys from another firm, so its rate is a price between two firms and not anybody’s pay. Nobody is told.',
    }
  }
  if (bc.candidates.length !== 1) {
    return {
      personId: null,
      why:
        bc.candidates.length === 0
          ? 'Nobody is working on this line now, so nobody is told.'
          : `This line pays ${bc.candidates.length} people and a rate change cannot say whose pay moved, so nobody is told.`,
    }
  }

  const worker = bc.candidates[0]
  const currency = worker.payCurrency || bc.payCurrency
  const notice = payChangeNotice({
    fromCents: change.previousRate,
    toCents: change.rate,
    currency,
    rateType: change.rateType,
    effectiveFrom: change.fromDate.toISOString().slice(0, 10),
    employerName: bc.company.name,
    backPayCents: backPay?.applies ? backPay.figure.totalCents : null,
    backPayWeeks: backPay?.applies ? backPay.figure.weeks : [],
  })

  await notify({
    personId: worker.personId,
    companyId: bc.companyId,
    type: 'CONTRACT',
    // In the app and by email: the row is the in-app notice, and the
    // channel sends it (lib/notify).
    channel: 'EMAIL',
    title: notice.title,
    body: notice.body,
    entityId: change.id,
    // Their own pay and nothing else. Never the bill rate.
    data: { rateHistoryId: change.id, href: '/dashboard/my-work' },
  })
  return { personId: worker.personId, why: null }
}

