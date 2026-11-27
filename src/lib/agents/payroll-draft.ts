/**
 * The payroll draft agent (record 112, chain 4, "Run the week": "Payroll
 * draft from approved weeks"). Key `payroll-draft`.
 *
 * For each pay period that has ended and has accepted weeks still to pay,
 * it stores a DRAFT of what the payroll run would hold: people, hours,
 * gross, and each held week with its reason. The figures are the run's own
 * (`runPayroll` in `calculate` with `dryRun`, which writes nothing: no pay
 * day is marked and no run is logged), never a second computation.
 *
 * It opens one card on the decision queue per new draft, owed by AP &
 * Payroll (else the Owner): "Payroll draft for <period> is ready: N people.
 * Review and run it in Payroll."
 *
 * It never runs, approves, processes or releases payroll, marks a pay day,
 * pays anyone, or sends anything. A period already run has nothing left to
 * pay and so no rows, so it is skipped; a period whose draft is unchanged
 * is skipped; a draft that changed replaces the earlier one.
 *
 * Both Drafts only and On do the same: preparing a draft is what Drafts
 * only allows. Off, the runner never calls it.
 */

import { prisma } from '@/lib/db'
import { LedgerRefusal } from '@/lib/record-ledger'
import { openDecision, firmToday } from '@/lib/decision-items'
import { companyPayPeriods } from '@/lib/money/company-pay-periods'
import { periodsAround } from '@/lib/money/pay-periods'
import { paidByPayroll } from '@/lib/money/paid-through'
import { runPayroll } from '@/lib/money/payroll-run'
import { ownerForRoles, PAYROLL_ROLES } from '@/lib/money/agent-owners'
import { draftRows, draftHash, cardQuestion, cardProof, type DraftRow, type RunDetail } from '@/lib/money/payroll-draft'
import { daySpan } from '@/lib/plain-date'
import { formatMonthLong } from '@/lib/format-date'
import { AGENT_HELD_AS, registerAgent, type AgentContext, type AgentDef } from './runner'
import { registerPlan } from './plans'
import { runSkill } from '@/lib/skills/runner'

export const PAYROLL_DRAFT = 'payroll-draft'
export const PAYROLL_DRAFT_RULE = 'payroll-draft-v1'
export const PAYROLL_DRAFT_RECORD = 'PayrollDraft'
/** What a draft run is about: the pay period, as `start:end`, since the draft's own id is not known until it is written. */
export const PAY_PERIOD_RECORD = 'PayPeriod'

// The skills this agent runs (record 123), registered where the agent is defined so every door that runs it holds the plan.
registerPlan({ agentKey: PAYROLL_DRAFT, skills: ['payroll.draft'], outputSkill: 'payroll.draft' })
/** How many ended periods back it looks. */
const LOOK_BACK = 6

const dayKey = (d: Date) => d.toISOString().slice(0, 10)
const atDay = (k: string) => new Date(`${k}T00:00:00.000Z`)

interface Wanted { start: string; end: string; label: string; ask: { start: string; end: string } | string }

/** The ended periods to read: the company's own where it pays by period, else calendar months. */
async function endedPeriods(companyId: string, today: Date): Promise<Wanted[]> {
  const co = await companyPayPeriods(companyId)
  const todayKey = dayKey(today)
  if (co.byPeriod) {
    return (periodsAround(todayKey, co.rhythm, co.rule, { earlier: LOOK_BACK, later: 0 }) ?? [])
      .filter((p) => p.end < todayKey)
      .map((p) => ({ start: p.start, end: p.end, label: daySpan(p.start, p.end), ask: { start: p.start, end: p.end } }))
  }
  const out: Wanted[] = []
  for (let i = 1; i <= LOOK_BACK; i++) {
    const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1))
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0))
    out.push({ start: dayKey(first), end: dayKey(last), label: formatMonthLong(first), ask: dayKey(first).slice(0, 7) })
  }
  return out
}

export async function payrollDraftStep(ctx: AgentContext): Promise<void> {
  const { companyId, now } = ctx
  const sw = await prisma.agentSwitch.findUnique({ where: { companyId_agentKey: { companyId, agentKey: ctx.agentKey } } })
  if (!sw) return
  const person = await prisma.person.findUniqueOrThrow({ where: { id: sw.changedById }, select: { id: true, name: true } })
  const owner = await ownerForRoles(companyId, PAYROLL_ROLES, now)
  const entities = await prisma.legalEntity.findMany({ where: { companyId }, select: { id: true } })
  const entityId = entities.length === 1 ? entities[0].id : null

  const lines = await prisma.buyContract.findMany({
    where: { companyId, state: { in: ['IN_PROGRESS', 'BENCH_PAID', 'INTERNAL', 'TRAINING', 'ENDED', 'PAUSED'] } },
    select: { id: true, contractType: true, vendorCompanyId: true, supplierSellContractId: true },
  })
  const buyContractIds = lines.filter((l) => paidByPayroll(l)).map((l) => l.id)
  if (buyContractIds.length === 0) return

  const today = await firmToday(companyId, now)
  for (const p of await endedPeriods(companyId, today)) {
    // The run's own calculation, writing nothing.
    const out = await runPayroll({
      companyId, buyContractIds, period: p.ask, action: 'calculate', runBy: { id: person.id, name: person.name }, dryRun: true,
    })
    if (out.status !== 200) continue
    const rows = draftRows((out.body?.data?.details ?? []) as RunDetail[])

    const latest = await prisma.payrollDraft.findFirst({
      where: { companyId, periodStart: atDay(p.start), periodEnd: atDay(p.end), state: 'DRAFT' },
      orderBy: { createdAt: 'desc' },
    })
    // Nothing left to pay, as a period already run reads: a draft still standing for it is no longer current.
    if (rows.length === 0) {
      if (latest) await prisma.payrollDraft.updateMany({ where: { id: latest.id, state: 'DRAFT' }, data: { state: 'SUPERSEDED' } })
      continue
    }
    const hash = draftHash(rows)
    if (latest?.contentHash === hash) continue
    if (!owner) continue
    if (!(await ctx.mayAct())) return

    // One run for each period drafted, a person for each row on it.
    await runSkill(ctx, 'payroll.draft', { recordType: PAY_PERIOD_RECORD, recordId: `${p.start}:${p.end}`, unitsPlanned: rows.length }, async () => {
      let draftId: string | null = null
      try {
        draftId = await prisma.$transaction(async (tx) => {
          await tx.payrollDraft.updateMany({
            where: { companyId, periodStart: atDay(p.start), periodEnd: atDay(p.end), state: 'DRAFT' }, data: { state: 'SUPERSEDED' },
          })
          const draft = await tx.payrollDraft.create({
            data: { companyId, periodStart: atDay(p.start), periodEnd: atDay(p.end), contentHash: hash, rows: rows as unknown as DraftRow[] as never, agentKey: ctx.agentKey },
          })
          const card = await openDecision({
            companyId, personId: person.id, heldAs: AGENT_HELD_AS, actingEntityId: entityId,
            question: cardQuestion(p.label, rows), ownerPersonId: owner, openedOn: today,
            proof: cardProof(p.label, rows, !!latest), proofLinks: [{ recordType: PAYROLL_DRAFT_RECORD, recordId: draft.id }],
          }, now, tx)
          await tx.payrollDraft.update({ where: { id: draft.id }, data: { decisionId: card.id } })
          return draft.id
        })
      } catch (e) {
        if (e instanceof LedgerRefusal) return { result: false, verdict: 'FAIL' as const, failReason: e.message.slice(0, 300) }
        throw e
      }
      await ctx.act({
        recordType: PAYROLL_DRAFT_RECORD, recordId: draftId, action: 'PAYROLL_DRAFTED',
        summary: `Drafted payroll for ${p.label}: ${rows.length} ${rows.length === 1 ? 'line' : 'lines'}. Not run: running it is a person’s.`,
      })
      return { result: true }
    })
  }
}

export const payrollDraftAgent: AgentDef = { ruleVersion: PAYROLL_DRAFT_RULE, step: payrollDraftStep }

/** Put the step in the runner's registry. Called by the cron route that runs agents. */
export function registerPayrollDraft() { registerAgent(PAYROLL_DRAFT, payrollDraftAgent) }
