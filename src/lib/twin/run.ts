/**
 * One pass of the program manager's twin over one client program.
 *
 * The rules are regulatory's and money's; this only takes what they found
 * and puts each finding through `act`, so every finding is one ledger
 * entry and every act passes the role contract:
 *
 *   a person near or past the time limit   recorded, then the program
 *                                          owner told — each once per
 *                                          tier and limit day
 *   an invoice receipt                     its verdict recorded; a
 *                                          mismatch or a held receipt
 *                                          told to the paying desk; a
 *                                          clean receipt the three-way
 *                                          check would pay put to a
 *                                          person to approve
 *
 * Why a mismatched receipt is not put up for approval: approving one is
 * refused by money's own three-way check (lib/invoice-match), which the
 * tolerance does not loosen. Asking a person a question whose only
 * possible yes is refused would be a card nobody can act on, so a
 * mismatch is told to the desk that resolves it instead. Whether two per
 * cent should also clear payment is with the founder.
 *
 * The numbers are the company's `RuleSet` (lib/twin/rule-set); the time
 * limit and break stay its own governance rules.
 */

import { prisma } from '@/lib/db'
import { reportError } from '@/lib/alerts'
import { NOT_THE_SAMPLE_SEAT } from '@/lib/sample-seat'
import { tenureWarnings } from '@/lib/twin/rules/tenure'
import { pendingReceiptsFor } from '@/lib/twin/rules/invoice'
import { ruleSetFor } from '@/lib/twin/rule-set'
import { act, closeOvertaken, runMemo, type ActResult, type Authority, type Surface } from '@/lib/twin/ledger'
import { tierIn } from '@/lib/twin/role-contract'
import { invoiceSupplierIds } from '@/lib/twin/performers'

/** The role the twin acts in, by its name on a client's roles. */
export const PROGRAM_MANAGER_ROLE = 'Program Manager'

/**
 * The person whose seat the twin acts under. A desk nobody has named
 * falls back rather than refusing (CLAUDE.md, Addendum E): with no
 * Program Manager seated, the twin still records what it finds, on the
 * authority of the role and no person, and the notices that need a
 * person are refused in the ledger with the reason.
 */
export async function programManagerAt(companyId: string): Promise<Authority> {
  const seat = await prisma.context.findFirst({
    // Never the shared sample's seat, which holds the role to read as
    // the program manager does and acts on nobody's authority.
    where: { companyId, revokedAt: null, type: { not: 'CONSULTANT' }, role: { name: PROGRAM_MANAGER_ROLE }, ...NOT_THE_SAMPLE_SEAT },
    orderBy: { id: 'asc' },
    select: { personId: true, person: { select: { name: true } } },
  })
  return seat
    ? { personId: seat.personId, role: PROGRAM_MANAGER_ROLE, personName: seat.person.name }
    : { personId: null, role: `${PROGRAM_MANAGER_ROLE} (nobody seated)`, personName: null }
}

/**
 * The roles the supplier's twin acts in, first seated wins: the firm's
 * Owner, else its Admin. Decided by the coordinator on 2026-10-18,
 * reversible by the founder in one line. Not Accounts Receivable's:
 * nobody signs their own, so the person the twin acts for may never say
 * yes to its questions, and the people who send bills — Accounts
 * Receivable, Finance, Admin — are exactly the ones who must be able to
 * say yes to `bill.send`. Acting on the owner's authority keeps every one
 * of them free to answer. A firm where only that person may send bills
 * (a one-person firm, sixteen of the nineteen seeded suppliers) asks that
 * person: the owner-only exception (founder, 2026-10-19, decision 2;
 * `ownerOnlyException` in lib/twin/ledger), for `bill.send` only, recorded
 * on the question and on the answer, and taken back the moment a second
 * seat that sends bills exists. Where not even the owner may send bills,
 * the ledger still refuses the question in a sentence that names the
 * Bills page (NO_OTHER_APPROVER).
 * Falls back to the role and no person, the same way the program
 * manager's does, never to a refusal.
 */
export const SUPPLIER_TWIN_ROLES = ['Owner', 'Admin'] as const

/** The person whose seat the supplier's twin acts under. */
export async function supplierAuthorityAt(companyId: string): Promise<Authority> {
  for (const role of SUPPLIER_TWIN_ROLES) {
    const seat = await prisma.context.findFirst({
      where: { companyId, revokedAt: null, type: { not: 'CONSULTANT' }, role: { name: role }, ...NOT_THE_SAMPLE_SEAT },
      orderBy: { id: 'asc' },
      select: { personId: true, person: { select: { name: true } } },
    })
    if (seat) return { personId: seat.personId, role, personName: seat.person.name }
  }
  return { personId: null, role: `${SUPPLIER_TWIN_ROLES[0]} (nobody seated)`, personName: null }
}

export interface RunSummary {
  companyId: string
  warnings: number
  receipts: number
  outcomes: Record<ActResult['outcome'], number>
  /**
   * The morning digest, counted by how each person was reached: by the
   * Teams bot, by the in-app and email fallback, or not at all. ABSENT
   * where the digest module could not be loaded; FAILED where it threw.
   */
  teamsDigest: { bot: number; fallback: number; nothing: number } | 'ABSENT' | 'FAILED'
}

/**
 * Conversation's proactive digest (`tellProgramOwnerOnTeams` in
 * lib/teams/digest), loaded when it is asked for and never at build
 * time, so a run is never stopped by it: a module that will not load is
 * ABSENT, and a digest that throws is reported to staff and is FAILED.
 * The run's own entries are written before this is asked and stand
 * either way. The count says how each person was actually reached, so a
 * fallback to email is never reported as a Teams message.
 */
export async function tellOnTeams(companyId: string): Promise<RunSummary['teamsDigest']> {
  let tell: ((companyId: string) => Promise<{ via: 'BOT' | 'FALLBACK' | 'NOTHING' }[]>) | null = null
  try {
    tell = (await import('@/lib/teams/digest')).tellProgramOwnerOnTeams
  } catch {
    return 'ABSENT'
  }
  if (typeof tell !== 'function') return 'ABSENT'
  try {
    const sent = (await tell(companyId)) ?? []
    return {
      bot: sent.filter((r) => r.via === 'BOT').length,
      fallback: sent.filter((r) => r.via === 'FALLBACK').length,
      nothing: sent.filter((r) => r.via === 'NOTHING').length,
    }
  } catch (err) {
    await reportError('twin/teams-digest', err, { companyId }).catch(() => undefined)
    return 'FAILED'
  }
}

/** Every act a program run takes, so the run reads their recorded keys once. */
const RUN_ACTS = [
  'tenure.warning.record', 'tenure.warning.notify_program_owner',
  'invoice_receipt.record', 'invoice_receipt.flag_mismatch', 'invoice_receipt.approve', 'invoice_receipt.pay',
] as const

const RECEIPT_APPROVE = 'invoice_receipt.approve'
const RECEIPT_PAY = 'invoice_receipt.pay'

/** What closes an open `approve` question when the twin asks to pay the receipt instead. */
export const APPROVE_SUPERSEDED =
  'Asked again as a question to pay it: a yes now records the payment, with the bank reference.'

/**
 * Which receipts already hold an `approve` question, by its state: open
 * ones are closed when `pay` is asked (2026-10-26); one a person said no
 * to is not asked again as `pay`, because a no to paying is a no.
 */
async function approveQuestions(companyId: string, invoiceIds: readonly string[]): Promise<{ open: Set<string>; declined: Set<string> }> {
  const open = new Set<string>()
  const declined = new Set<string>()
  if (invoiceIds.length === 0) return { open, declined }
  const rows = await prisma.twinApproval.findMany({
    where: {
      companyId, decision: { in: ['PENDING', 'REJECTED'] },
      twinAction: { companyId, action: RECEIPT_APPROVE, entityType: 'Invoice', entityId: { in: [...invoiceIds] } },
    },
    select: { decision: true, twinAction: { select: { entityId: true } } },
  })
  for (const r of rows) (r.decision === 'PENDING' ? open : declined).add(r.twinAction.entityId)
  return { open, declined }
}

const PAY_ASKED_AGAIN =
  'Asked again the day before it falls due: the earlier question was put off, and this one replaces it.'

/**
 * Which receipts hold a `pay` question, by its state (2026-10-27): open
 * ones with the day they were asked, and ones a person said no to. "Not
 * now" changes nothing on the record, so a question put off reads open.
 */
async function payQuestions(companyId: string, invoiceIds: readonly string[]): Promise<{ open: Map<string, { since: Date; entryId: string }>; declined: Set<string> }> {
  const open = new Map<string, { since: Date; entryId: string }>()
  const declined = new Set<string>()
  if (invoiceIds.length === 0) return { open, declined }
  const rows = await prisma.twinApproval.findMany({
    where: {
      companyId, decision: { in: ['PENDING', 'REJECTED'] },
      twinAction: { companyId, action: RECEIPT_PAY, entityType: 'Invoice', entityId: { in: [...invoiceIds] } },
    },
    select: { decision: true, requestedAt: true, twinActionId: true, twinAction: { select: { entityId: true } } },
  })
  for (const r of rows) {
    if (r.decision === 'REJECTED') declined.add(r.twinAction.entityId)
    else open.set(r.twinAction.entityId, { since: r.requestedAt, entryId: r.twinActionId })
  }
  return { open, declined }
}

/** Midnight UTC of the day before a date. */
function dayBefore(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - 1))
}

/**
 * Whether a receipt's open pay question is asked once more tonight: it was
 * asked before the day before the receipt falls due, and that day has come.
 * Pure. Never a third time: the second question has its own key.
 */
export function askPayAgain(o: { openSince: Date | null | undefined; dueAt: Date | null | undefined; now: Date }): boolean {
  if (!o.openSince || !o.dueAt) return false
  const eve = dayBefore(o.dueAt)
  return o.now.getTime() >= eve.getTime() && o.openSince.getTime() < eve.getTime()
}

export async function runTwin(companyId: string, opts: { surface?: Surface; now?: Date } = {}): Promise<RunSummary> {
  const surface = opts.surface ?? 'CRON'
  const authority = await programManagerAt(companyId)
  const rules = await ruleSetFor(companyId)
  // The role contract and every finding key already recorded, read once
  // for the run rather than once per act (2026-10-20).
  const memo = await runMemo(companyId, RUN_ACTS)
  const outcomes: RunSummary['outcomes'] = { PERFORMED: 0, AWAITING_APPROVAL: 0, REFUSED: 0, ALREADY: 0, FAILED: 0 }
  const tally = (r: ActResult) => { outcomes[r.outcome]++; return r }

  // ── The time limit ──
  const warnings = await tenureWarnings(companyId, { warnAtDays: rules.tenureWarnAtDays }, {
    now: opts.now,
    actor: { personId: authority.personId ?? undefined, companyId },
  })
  for (const w of warnings) {
    const entity = { type: 'Person', id: w.personId, partyCompanyIds: [companyId] }
    const payload = { tier: w.tier, daysOnSite: w.daysOnSite, daysToLimit: w.daysToLimit, limitOn: w.limitOn.toISOString(), capMonths: w.capMonths, suppliers: w.suppliers, ruleSetVersion: rules.version }
    const recorded = tally(await act({
      companyId, action: 'tenure.warning.record', entity, rule: w.ruleCited, rationale: w.rationale,
      surface, authority, payload, dedupKey: w.key, memo,
    }))
    if (recorded.outcome !== 'PERFORMED') continue
    tally(await act({
      companyId, action: 'tenure.warning.notify_program_owner', entity, rule: w.ruleCited, rationale: w.rationale,
      surface, authority, dedupKey: w.key, memo,
      payload: { ...payload, title: w.tier === 'BREACH' ? `${w.personName} is at the time limit` : `${w.personName} is ${w.daysToLimit} days from the time limit` },
    }))
  }

  // ── Invoice receipts ──
  const verdicts = await pendingReceiptsFor(companyId, { hoursTolerancePct: rules.hoursTolerancePct, source: rules.source })
  const suppliers = await invoiceSupplierIds(verdicts.map((v) => v.invoiceId))
  // The twin asks to PAY a clean receipt (2026-10-26) wherever this
  // company's role contract places the act; a contract saved before the
  // act existed never placed it, so that company keeps the old question
  // until its contract is edited, rather than getting none.
  const asksPay = tierIn(memo.contract, RECEIPT_PAY) !== 'NEVER'
  const toPay = verdicts.filter((v) => v.verdict === 'CLEAN' && v.payable).map((v) => v.invoiceId)
  const approves = asksPay ? await approveQuestions(companyId, toPay) : { open: new Set<string>(), declined: new Set<string>() }
  const pays = asksPay ? await payQuestions(companyId, toPay) : { open: new Map<string, { since: Date; entryId: string }>(), declined: new Set<string>() }
  const dueAt = new Map(
    toPay.length === 0 ? [] : (await prisma.invoice.findMany({ where: { id: { in: toPay } }, select: { id: true, dueAt: true } })).map((i) => [i.id, i.dueAt])
  )
  const now = opts.now ?? new Date()
  for (const v of verdicts) {
    const supplier = suppliers.get(v.invoiceId) ?? null
    const entity = { type: 'Invoice', id: v.invoiceId, partyCompanyIds: supplier ? [companyId, supplier] : [companyId] }
    const payload = { number: v.number, supplierName: v.supplierName, verdict: v.verdict, payable: v.payable, failing: v.failing, ruleSetVersion: rules.version }
    const key = `${v.invoiceId}:${v.verdict}`
    const recorded = tally(await act({
      companyId, action: 'invoice_receipt.record', entity, rule: v.ruleCited, rationale: v.rationale,
      surface, authority, payload, dedupKey: key, memo,
    }))
    // A receipt checked on an earlier night is still asked to be paid:
    // the question is keyed by the receipt and by the act, so a receipt
    // that already holds an `approve` question gets its `pay` question once.
    if (asksPay && v.verdict === 'CLEAN' && v.payable && (recorded.outcome === 'PERFORMED' || recorded.outcome === 'ALREADY')) {
      if (approves.declined.has(v.invoiceId)) continue
      // A no to paying, with its reason, is a no: never asked again.
      if (pays.declined.has(v.invoiceId)) continue
      const asked = tally(await act({
        companyId, action: RECEIPT_PAY, entity, rule: v.ruleCited, rationale: v.rationale,
        surface, authority, payload, dedupKey: v.invoiceId, memo,
      }))
      if ((asked.outcome === 'AWAITING_APPROVAL' || asked.outcome === 'ALREADY') && approves.open.has(v.invoiceId)) {
        // One card per receipt: the old question closes, unanswered, in the
        // ledger. Retried on the next night if this fails, because the pay
        // question then reads ALREADY and the approve one is still open.
        await prisma.$transaction((tx) => closeOvertaken(tx, {
          companyId, entity: { type: 'Invoice', id: v.invoiceId }, action: RECEIPT_APPROVE,
          what: APPROVE_SUPERSEDED, by: { personId: null, name: 'the twin' }, surface,
        })).catch((err) => reportError(`twin/approve-superseded ${v.invoiceId}`, err, { companyId }).catch(() => undefined))
      }
      // Put off with Not now, the question is asked once more the day
      // before the receipt falls due (coordinator's call, 2026-10-27,
      // reversible by the founder), and the earlier one closes, so the
      // person still reads one card for the receipt.
      const open = pays.open.get(v.invoiceId)
      if (asked.outcome === 'ALREADY' && open && askPayAgain({ openSince: open.since, dueAt: dueAt.get(v.invoiceId), now })) {
        const again = tally(await act({
          companyId, action: RECEIPT_PAY, entity, rule: v.ruleCited, rationale: v.rationale, replacesQuestion: open.entryId,
          surface, authority, payload: { ...payload, askedAgain: true }, dedupKey: `${v.invoiceId}:day-before-due`, memo,
        }))
        if (again.outcome === 'AWAITING_APPROVAL') {
          await prisma.$transaction((tx) => closeOvertaken(tx, {
            companyId, entity: { type: 'Invoice', id: v.invoiceId }, action: RECEIPT_PAY, keepTwinActionId: again.entryId,
            what: PAY_ASKED_AGAIN, by: { personId: null, name: 'the twin' }, surface,
          })).catch((err) => reportError(`twin/pay-asked-again ${v.invoiceId}`, err, { companyId }).catch(() => undefined))
        }
      }
      continue
    }
    if (recorded.outcome !== 'PERFORMED') continue
    if (v.verdict !== 'CLEAN') {
      tally(await act({
        companyId, action: 'invoice_receipt.flag_mismatch', entity, rule: v.ruleCited, rationale: v.rationale,
        surface, authority, payload, dedupKey: key, memo,
      }))
    } else if (v.payable) {
      tally(await act({
        companyId, action: RECEIPT_APPROVE, entity, rule: v.ruleCited, rationale: v.rationale,
        surface, authority, payload, dedupKey: v.invoiceId, memo,
      }))
    } else {
      // Inside the hours tolerance but not payable — a week not accepted,
      // a draft, past its ceiling. Never silently permitted: the paying
      // team is told why, the same way a mismatch is.
      tally(await act({
        companyId, action: 'invoice_receipt.flag_mismatch', entity, rule: v.ruleCited, rationale: v.rationale,
        surface, authority, payload, dedupKey: key, memo,
      }))
    }
  }

  const teamsDigest = await tellOnTeams(companyId)
  return { companyId, warnings: warnings.length, receipts: verdicts.length, outcomes, teamsDigest }
}

/** The client programs the nightly run reads: real or demo, never a census sandbox. */
export async function programsToRun(take = 200): Promise<string[]> {
  const rows = await prisma.company.findMany({
    where: { kind: 'CLIENT', isCensusSandbox: false },
    select: { id: true },
    orderBy: { id: 'asc' },
    take,
  })
  return rows.map((r) => r.id)
}

/**
 * The supplier firms the supplier's twin reads (2026-10-18): staffing
 * vendors, integrators and one-person corporations, real or the seeded
 * world, never a census sandbox (a client's real rows held for a census)
 * and never a visitor's own demo sandbox (`isDemo`), which nobody watches
 * and which is removed after thirty days unused.
 *
 * Read by the nightly run (cron/twin): money's bill run, then the
 * supplier's own acts (lib/twin/supplier-run, 2026-10-29).
 */
export async function suppliersToRun(take = 500): Promise<string[]> {
  const rows = await prisma.company.findMany({
    where: { kind: { in: ['VENDOR', 'GSI', 'CONSULTANT_CORP'] }, isCensusSandbox: false, isDemo: false },
    select: { id: true },
    orderBy: { id: 'asc' },
    take,
  })
  return rows.map((r) => r.id)
}
