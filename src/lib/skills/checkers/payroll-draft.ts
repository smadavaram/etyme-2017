/**
 * The answer key for `payroll.draft` (record 123, plan C3 and C9).
 *
 * The run is about one pay period a draft was stored for (`start:end`). This
 * finds the draft written in the run's window, works the period out again
 * with the payroll run's own calculation in its mode that writes nothing
 * (`runPayroll` with `dryRun`, the function the run itself uses), and
 * compares what it gives with the draft row by row: the people, the hours,
 * the gross in the person's own currency and the weeks held with their
 * reasons. Then it reads the record for what a draft must never leave: no
 * payroll run logged and no pay day marked in the run's window. The card
 * must be owed by AP & Payroll, else the Owner. A draft since replaced by a
 * newer one cannot be compared with today's figures and is not graded.
 *
 * `runPayroll` reads through the one database client and takes no handle,
 * so the calculation itself is not read through the checker's own; it is
 * proven to write nothing by the two counts above and by its own tests.
 */
import type { PrismaClient } from '@prisma/client'
import { runPayroll } from '@/lib/money/payroll-run'
import { draftRows, draftHash, type DraftRow, type RunDetail } from '@/lib/money/payroll-draft'
import { paidByPayroll } from '@/lib/money/paid-through'
import { PAYROLL_ROLES } from '@/lib/money/agent-owners'
import { paysByPeriod } from '@/lib/money/pay-periods'
import { rhythmFrom } from '@/lib/pay-dates'
import { PAYROLL_DRAFT } from '@/lib/agents/payroll-draft'
import { unknownBecause, type CheckerResult, type SkillChecker } from '../checker'
import { ownerFor } from './cards'

const atDay = (k: string) => new Date(`${k}T00:00:00.000Z`)
const FIGURES = (r: DraftRow) => JSON.stringify([r.hours, r.grossPay, r.currency, r.overtimeHours, r.held])

export const payrollDraft: SkillChecker<PrismaClient> = async (companyId, _key, window, refs, read): Promise<CheckerResult> => {
  const ref = refs[0]
  const [start, end] = (ref?.recordId ?? '').split(':')
  if (!ref || !/^\d{4}-\d{2}-\d{2}$/.test(start ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(end ?? '')) return unknownBecause('The run does not say which pay period it drafted, so there is nothing to re-read.')
  const evidence = `Pay period ${start} to ${end}`
  const draft = await read.payrollDraft.findFirst({
    where: { companyId, periodStart: atDay(start), periodEnd: atDay(end), createdAt: { gte: window.from, lte: window.to } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  })
  if (!draft) return { verdict: 'FAIL', reason: 'The run drafted a period and no draft was written for it in its window.', evidence, unitsFound: 0 }
  if (draft.state !== 'DRAFT') return unknownBecause('A newer draft has replaced this one, so its figures cannot be compared with a calculation made today.')

  // What a draft must never leave: a run logged, or a pay day marked, in the window.
  const logged = await read.automationLog.count({ where: { companyId, action: 'PAYROLL_RUN', at: { gte: window.from, lte: window.to } } })
  if (logged > 0) return { verdict: 'FAIL', reason: 'A payroll run was logged in the same window, and a draft never logs a run.', evidence, unitsFound: 0 }

  const lines = await read.buyContract.findMany({
    where: { companyId, state: { in: ['IN_PROGRESS', 'BENCH_PAID', 'INTERNAL', 'TRAINING', 'ENDED', 'PAUSED'] } },
    select: { id: true, contractType: true, vendorCompanyId: true, supplierSellContractId: true },
  })
  const buyContractIds = lines.filter((l) => paidByPayroll(l)).map((l) => l.id)
  const marked = buyContractIds.length === 0 ? 0 : await read.cycle.count({ where: { buyContractId: { in: buyContractIds }, completedAt: { gte: window.from, lte: window.to } } })
  if (marked > 0) return { verdict: 'FAIL', reason: `${marked} pay ${marked === 1 ? 'day was' : 'days were'} marked done in the same window, and a draft marks none.`, evidence, unitsFound: 0 }
  if (buyContractIds.length === 0) return { verdict: 'FAIL', reason: 'The firm pays nobody through payroll, so there was nothing to draft.', evidence, unitsFound: 0 }

  // The same period the agent asked for: a month for a firm that does not pay by its own periods, else the period itself.
  const company = await read.company.findUnique({
    where: { id: companyId },
    select: { payPeriod: true, payCalcOffsetDays: true, payDayOffsetDays: true, payDaysOfMonth: true, payCalcDaysBefore: true, payFirstPeriodStart: true },
  })
  const ask = paysByPeriod(rhythmFrom(company as any)) ? { start, end } : start.slice(0, 7)
  const sw = await read.agentSwitch.findUnique({ where: { companyId_agentKey: { companyId, agentKey: PAYROLL_DRAFT } }, select: { changedById: true } })
  const by = sw ? await read.person.findUnique({ where: { id: sw.changedById }, select: { id: true, name: true } }) : null
  if (!by) return unknownBecause('The agent has no switch to name who the calculation is for, so it cannot be worked out again.')
  const out = await runPayroll({ companyId, buyContractIds, period: ask, action: 'calculate', runBy: by, dryRun: true })
  if (out.status !== 200) return unknownBecause('The payroll run’s own calculation did not answer for this period, so the draft cannot be compared.')
  const fresh = draftRows((out.body?.data?.details ?? []) as RunDetail[])

  const kept = (Array.isArray(draft.rows) ? draft.rows : []) as unknown as DraftRow[]
  const problems: string[] = []
  for (const f of fresh) {
    const k = kept.find((r) => r.buyContractCandidateId === f.buyContractCandidateId)
    if (!k) problems.push(`${f.person} is in a fresh calculation and not in the draft`)
    else if (FIGURES(k) !== FIGURES(f)) problems.push(`${f.person}’s hours, gross or held weeks differ from a fresh calculation`)
  }
  for (const k of kept) if (!fresh.some((f) => f.buyContractCandidateId === k.buyContractCandidateId)) problems.push(`${k.person} is in the draft and not in a fresh calculation`)
  if (draftHash(kept) !== draft.contentHash) problems.push('the draft’s own hash does not match its rows')
  const agreeing = fresh.filter((f) => { const k = kept.find((r) => r.buyContractCandidateId === f.buyContractCandidateId); return k && FIGURES(k) === FIGURES(f) }).length
  if (problems.length) return { verdict: 'FAIL', reason: `${problems.join('; ')}.`, evidence, unitsFound: agreeing }

  const card = draft.decisionId ? await read.decisionItem.findUnique({ where: { id: draft.decisionId }, select: { ownerPersonId: true } }) : null
  if (!card) return { verdict: 'FAIL', reason: 'The draft has no card asking a person to review and run it.', evidence, unitsFound: 0 }
  const expected = await ownerFor(read, companyId, PAYROLL_ROLES, window.to)
  if (expected && card.ownerPersonId !== expected) return { verdict: 'FAIL', reason: 'The draft’s card is owed by a seat the owner reader does not name.', evidence, unitsFound: 0 }
  return { verdict: 'PASS', reason: 'Every person, hour, gross and held week equals a fresh calculation by the payroll run’s own function, and nothing was run or marked.', evidence, unitsFound: fresh.length }
}
