/**
 * The job twin's invoice rule: is an invoice receipt something the
 * program manager has to look at, or not?
 *
 * The founder's brief, 2026-10-12: a headless twin watches the record
 * daily and surfaces only exceptions and approvals. This is its rule
 * for an invoice receipt — what a supplier sent — and it is built ON the
 * three-way check, never beside it. `matchInvoice` (lib/invoice-match)
 * loads the order, the payer's signature on each week and the invoice,
 * and `threeWayMatch` (lib/three-way-match) decides. This file reads that
 * answer and adds the one thing the check does not have: a tolerance the
 * company sets, so a receipt a few minutes off is not raised to a person.
 *
 * Three verdicts:
 *
 *   CLEAN     nothing for a person to decide
 *   MISMATCH  outside what the company allows — an exception for a human
 *   BLOCKED   nobody may wave it through, whatever the tolerance
 *
 * ── What the tolerance does NOT do ───────────────────────────────────
 *
 * It decides what the twin raises. It does not decide what is paid. The
 * three-way check still fails QUANTITY on any difference, and the AP
 * desk still records a reason before a bill that differs is paid. So a
 * receipt clean under the tolerance carries `payable: false` and says so
 * in its rationale. That is decided (CLAUDE.md, "Nine decisions", item
 * 3): the founder's own rule stands ("a firm bills only the hours the
 * firm above it accepted"), payment stays strict, and a client wanting a
 * payment tolerance asks for it as a setting with its reason beside it.
 *
 * ── Why the rate has no tolerance ────────────────────────────────────
 *
 * The rate rule is "inside the contracted band", and a contract carries
 * one rate on any given day: the rate in force when the work was done,
 * effective-dated and approved (lib/contract-rate). A rate that really
 * changed is an amendment, which is why the check's PRICE failure is not
 * waivable. A rate tolerance would mark as clean a receipt that can never
 * be paid until somebody amends the contract — a quiet receipt stuck
 * forever. So the band is the contract's rate, and the rule set carries
 * no knob for it.
 *
 * ── The harder rule, kept ────────────────────────────────────────────
 *
 * A receipt that includes a week the paying firm has not accepted is
 * BLOCKED (CLAUDE.md, "What each rung may bill", rule 3). The check
 * already fails RECEIPT on it and refuses any waiver; this reads that
 * failure and never weighs it against a tolerance. The same holds for
 * every other check nobody may waive except PRICE, which is a mismatch
 * a person resolves by amending the contract or asking for a new bill.
 *
 * Hours are compared at the check's own precision; money is in minor
 * units and formatted in the invoice's currency.
 */

import { prisma } from '@/lib/db'
import { ruleSetFor } from '@/lib/twin/rule-set'
import { CHECK_NAME, decimalToCents, type MatchCode } from '@/lib/three-way-match'
import { matchInvoice, matchInvoices, type MatchWithLines, type LineFact } from '@/lib/invoice-match'
import { amount } from '@/lib/money-display'
import { formatDay } from '@/lib/format-date'
import { directionFrom, invoiceBetween, partiesOf } from '@/lib/money/invoice-parties'

// ── The rule set ─────────────────────────────────────────────────────

/**
 * The numbers a company sets for the invoice rule. Read through the
 * twin's one rule-set door (`ruleSetFor` in lib/twin/rule-set), whose
 * `TwinRuleSet` carries `hoursTolerancePct` and `source` and so is an
 * `InvoiceRuleSet`. The two refusal ceilings agree (25%), so a number
 * saved there is a number this rule uses.
 */
export interface InvoiceRuleSet {
  /** How far billed hours may sit from accepted hours, in per cent, either way. */
  hoursTolerancePct: number
  /** Where the numbers came from, so a sentence never passes a default off as a choice. */
  source: 'DEFAULT' | 'COMPANY'
}

/**
 * The founder's rule, 2026-10-12: hours within half a per cent (50 basis
 * points), at or under the line inside. It was two per cent until he
 * said: "Not % but .5% is better".
 */
export const DEFAULT_INVOICE_RULES: InvoiceRuleSet = { hoursTolerancePct: 0.5, source: 'DEFAULT' }

/**
 * The rules a company runs under: its own numbers where it saved some,
 * the default otherwise, and `source` says which.
 */
export async function invoiceRulesFor(companyId: string): Promise<InvoiceRuleSet> {
  return ruleSetFor(companyId)
}

/**
 * A tolerance nobody can stand behind is refused rather than used:
 * negative, not a number, or wide enough to wave through a quarter of a
 * week. Returns the sentence, or null when the number is usable.
 */
export function refuseRules(rules: InvoiceRuleSet): string | null {
  const t = rules.hoursTolerancePct
  if (!Number.isFinite(t) || t < 0) return 'The hours tolerance must be a number of per cent, zero or more.'
  if (t > 25) return `An hours tolerance of ${t}% would let a quarter of a week through unseen. Set 25% or less.`
  return null
}

// ── The verdict ──────────────────────────────────────────────────────

export type InvoiceVerdictKind = 'CLEAN' | 'MISMATCH' | 'BLOCKED'

export interface LineVerdict {
  lineId: string
  personName: string
  periodStart: string | null
  periodEnd: string | null
  hoursBilled: number
  /** What the paying firm accepted. Null where nobody has, or on a line with no hours. */
  hoursAccepted: number | null
  /** Billed against accepted, in per cent, signed: positive is over. Null where it cannot be said. */
  hoursOffPct: number | null
  rateCents: number
  contractRateCents: number | null
  outcome: InvoiceVerdictKind
  /** Which rule the outcome is about. */
  on: 'HOURS' | 'RATE' | 'RECEIPT' | 'NONE'
  /** One sentence with the numbers. */
  ruleCited: string
}

export interface InvoiceVerdict {
  invoiceId: string
  number: string | null
  supplierName: string | null
  dueAt: string | null
  verdict: InvoiceVerdictKind
  /** One sentence, with the numbers, naming the rule that decided. */
  ruleCited: string
  /** What it means and what somebody does next. */
  rationale: string
  /**
   * Whether the three-way check would let it be paid now, on the facts
   * or with a waiver already recorded. A clean verdict under the
   * tolerance is not a payment; this is the payment gate's own answer.
   */
  payable: boolean
  /** The checks that failed, by code, for the machine. */
  failing: MatchCode[]
  lines: LineVerdict[]
  rules: InvoiceRuleSet
}

export interface ReceiptHeader {
  id: string
  number?: string | null
  supplierName?: string | null
  currency?: string
  dueAt?: Date | null
}

const RANK: Record<InvoiceVerdictKind, number> = { BLOCKED: 0, MISMATCH: 1, CLEAN: 2 }

/** "41.5" · "40" — hours as a clerk writes them. */
function hrs(n: number): string {
  return String(Math.round(n * 100) / 100)
}

/** "3.75%" · "0.5%" — at most two decimals, no trailing zeroes. */
function pct(n: number): string {
  return `${Math.round(n * 100) / 100}%`
}

/** A check's reason without its closing stop, so a sentence can carry it. */
function clause(reason: string): string {
  return reason.replace(/[.\s]+$/, '')
}

function plain(isoDay: string | null): string {
  if (!isoDay) return ''
  return formatDay(isoDay)
}

function weekOf(l: { personName: string; periodStart: string | null; periodEnd: string | null }): string {
  return l.periodStart && l.periodEnd
    ? `${l.personName}, ${plain(l.periodStart)} to ${plain(l.periodEnd)}`
    : l.personName
}

/** Comparing per cent at the precision a sentence prints it. */
const EPSILON = 1e-9

function judgeLine(l: LineFact, rules: InvoiceRuleSet, currency: string | undefined): LineVerdict {
  const base = {
    lineId: l.lineId,
    personName: l.personName,
    periodStart: l.periodStart,
    periodEnd: l.periodEnd,
    hoursBilled: l.hoursBilled,
    hoursAccepted: l.kind === 'HOURS' ? l.hoursSigned : null,
    rateCents: l.rateCents,
    contractRateCents: l.contractRateCents,
  }

  if (l.kind !== 'HOURS') {
    // An expense or a milestone is witnessed by its own approval, which
    // the check's RECEIPT already read. No hours, no rate to weigh.
    return { ...base, hoursOffPct: null, outcome: 'CLEAN', on: 'NONE', ruleCited: `${l.personName}: an approved ${l.kind === 'EXPENSE' ? 'expense' : 'milestone'} for ${amount(l.amountCents, currency)}.` }
  }

  if (l.hoursSigned == null) {
    // Nobody at the paying firm accepted this week. The check fails
    // RECEIPT on it; the verdict for the whole receipt is BLOCKED.
    return {
      ...base, hoursOffPct: null, outcome: 'BLOCKED', on: 'RECEIPT',
      ruleCited: `${weekOf(l)}: ${hrs(l.hoursBilled)} hours billed and none accepted by the paying firm.`,
    }
  }

  const accepted = l.hoursSigned
  const diff = l.hoursBilled - accepted
  const offPct = accepted > 0 ? (diff / accepted) * 100 : diff === 0 ? 0 : null

  // Rate: the contract's rate in force on the day worked, and nothing else.
  if (l.contractRateCents != null && l.rateCents !== l.contractRateCents) {
    return {
      ...base, hoursOffPct: offPct, outcome: 'MISMATCH', on: 'RATE',
      ruleCited:
        `Rate ${amount(l.rateCents, currency)}/hr against the contract's ${amount(l.contractRateCents, currency)}/hr ` +
        `for ${weekOf(l)}; the band is the contract's rate on the day worked.`,
    }
  }

  const tol = rules.hoursTolerancePct
  if (offPct == null) {
    // Hours billed on a week accepted at zero: no per cent exists, and
    // inventing one would be a number nobody can stand behind.
    return {
      ...base, hoursOffPct: null, outcome: 'MISMATCH', on: 'HOURS',
      ruleCited: `Hours ${hrs(l.hoursBilled)} against 0 accepted for ${weekOf(l)}; nothing was accepted to bill.`,
    }
  }

  const off = Math.abs(offPct)
  const way = diff > 0 ? 'over' : 'under'
  if (off <= tol + EPSILON) {
    return {
      ...base, hoursOffPct: offPct, outcome: 'CLEAN', on: 'HOURS',
      ruleCited: diff === 0 || Math.abs(diff) < 0.005
        ? `Hours ${hrs(l.hoursBilled)} against ${hrs(accepted)} accepted, at the contract's ${amount(l.rateCents, currency)}/hr.`
        : `Hours ${hrs(l.hoursBilled)} against ${hrs(accepted)} accepted, ${pct(off)} ${way}, inside the ${pct(tol)} allowed.`,
    }
  }
  return {
    ...base, hoursOffPct: offPct, outcome: 'MISMATCH', on: 'HOURS',
    ruleCited: `Hours ${hrs(l.hoursBilled)} against ${hrs(accepted)} accepted, ${pct(off)} ${way} the ${pct(tol)} allowed.`,
  }
}

/**
 * The verdict, from a three-way check already run. No database in here,
 * so a test is a test about the rule and not about a seed.
 */
export function verdictFrom(
  match: MatchWithLines,
  rules: InvoiceRuleSet = DEFAULT_INVOICE_RULES,
  header: ReceiptHeader,
): InvoiceVerdict {
  const refused = refuseRules(rules)
  if (refused) throw new Error(refused)

  const currency = header.currency
  const failing = match.checks.filter((c) => c.outcome === 'FAIL').map((c) => c.code)
  const lines = match.lines.map((l) => judgeLine(l, rules, currency))
  const shell = {
    invoiceId: header.id,
    number: header.number ?? null,
    supplierName: header.supplierName ?? null,
    dueAt: header.dueAt ? header.dueAt.toISOString() : null,
    payable: match.matched,
    failing,
    lines,
    rules,
  }
  const from = header.supplierName ?? 'The supplier'

  // ── BLOCKED: a check nobody may waive, PRICE apart ──────────────────
  // The week nobody accepted first, because that is the one the founder
  // named, and its sentence comes from the check itself.
  const hard = match.checks.filter(
    (c) => c.outcome === 'FAIL' && c.overridable === false && c.code !== 'PRICE'
  )
  if (hard.length > 0) {
    const first = hard.find((c) => c.code === 'RECEIPT') ?? hard[0]
    const unaccepted = first.code === 'RECEIPT'
    return {
      ...shell,
      verdict: 'BLOCKED',
      ruleCited: unaccepted
        ? `A receipt that includes a week the paying firm has not accepted is held whatever the tolerance. ${clause(first.reason)}.`
        : `${CHECK_NAME[first.code]} — no. ${clause(first.reason)}. Nobody may wave this through.`,
      rationale: unaccepted
        ? 'Approve the timesheet first, or send the invoice back. It cannot be paid, and no waiver changes that.'
        : `Send it back to ${from === 'The supplier' ? 'the supplier' : from} to correct. It cannot be paid, and no waiver changes that.`,
    }
  }

  // ── MISMATCH: a line outside the rule, or a commercial variance ─────
  const outside = lines.filter((l) => l.outcome !== 'CLEAN')
  if (outside.length > 0) {
    // The widest miss decides the sentence; a rate miss before an hours one.
    const worst = [...outside].sort((a, b) => {
      const ar = a.on === 'RATE' ? 1 : 0
      const br = b.on === 'RATE' ? 1 : 0
      if (ar !== br) return br - ar
      return Math.abs(b.hoursOffPct ?? Infinity) - Math.abs(a.hoursOffPct ?? Infinity)
    })[0]
    const more = outside.length > 1 ? ` ${outside.length - 1} more line${outside.length === 2 ? ' is' : 's are'} outside the rule too.` : ''
    const isRate = worst.on === 'RATE'
    return {
      ...shell,
      verdict: 'MISMATCH',
      ruleCited: worst.ruleCited,
      rationale:
        (isRate
          ? `Ask ${from === 'The supplier' ? 'the supplier' : from} for a bill at the contract's rate, or amend the contract if the rate really changed. A rate is never waived on a bill.`
          : `Ask ${from === 'The supplier' ? 'the supplier' : from} to bill the hours accepted, or have the AP clerk record why the difference stands. Nothing is paid until the three-way check passes.`) + more,
    }
  }

  // Waivable checks the tolerance does not speak to: the period, the
  // contract's billing period, the order. Each is a commercial variance
  // a person resolves — never clean on the twin's say-so.
  const soft = match.checks.filter(
    (c) => c.outcome === 'FAIL' && c.code !== 'QUANTITY' && c.code !== 'PRICE'
  )
  if (soft.length > 0) {
    const first = soft[0]
    return {
      ...shell,
      verdict: 'MISMATCH',
      ruleCited: `${CHECK_NAME[first.code]} — no. ${clause(first.reason)}.`,
      rationale: 'The hours and the rate are inside the rule; this is for the AP clerk to resolve or waive with a reason.',
    }
  }

  // ── CLEAN ────────────────────────────────────────────────────────────
  const hoursLines = lines.filter((l) => l.hoursAccepted != null)
  const inside = hoursLines.filter((l) => (l.hoursOffPct ?? 0) !== 0 && Math.abs(l.hoursBilled - (l.hoursAccepted ?? 0)) >= 0.005)
  const ruleCited =
    lines.length === 1
      ? lines[0].ruleCited
      : inside.length > 0
        ? `${inside.length} of ${hoursLines.length} weeks differ from the hours accepted, the widest by ${pct(Math.max(...inside.map((l) => Math.abs(l.hoursOffPct ?? 0))))}, inside the ${pct(rules.hoursTolerancePct)} allowed; every rate is the contract's.`
        : `All ${lines.length} lines bill the hours accepted at the contract's rate.`
  const allowed = rules.source === 'DEFAULT' ? `the default ${pct(rules.hoursTolerancePct)}` : `your ${pct(rules.hoursTolerancePct)}`
  return {
    ...shell,
    verdict: 'CLEAN',
    ruleCited,
    // One receipt, one decision (browser walk, 2026-10-22: a row counted
    // as a decision read "Nothing to decide"). A clean match is the
    // decision to pay it; a difference inside the tolerance is held on the
    // exception path, where the AP clerk records why it stands.
    rationale: match.matched
      ? 'Approve it for payment: it matches the signed hours and the contract rate.'
      : `Held for the AP clerk: the difference is inside ${allowed}, and the AP clerk still records the difference before it is paid, because the three-way check pays only the hours accepted.`,
  }
}

// ── Reading the record ───────────────────────────────────────────────

const HEADER_SELECT = {
  id: true, number: true, currency: true, dueAt: true, status: true, total: true, paid: true,
  engagement: {
    select: {
      msa: {
        select: {
          vendorId: true, clientId: true,
          vendor: { select: { id: true, name: true } },
          client: { select: { id: true, name: true } },
        },
      },
    },
  },
  workOrder: {
    select: {
      issuedById: true, issuedToId: true, number: true,
      issuedBy: { select: { id: true, name: true } },
      issuedTo: { select: { id: true, name: true } },
    },
  },
} as const

/**
 * The verdict on one invoice receipt. Null where the invoice does not
 * exist. Who may read it is the caller's question, as it is for
 * `matchInvoice`.
 */
export async function invoiceVerdict(
  invoiceReceiptId: string,
  rules: InvoiceRuleSet = DEFAULT_INVOICE_RULES,
): Promise<InvoiceVerdict | null> {
  const head = await prisma.invoice.findUnique({ where: { id: invoiceReceiptId }, select: HEADER_SELECT })
  if (!head) return null
  const match = await matchInvoice(invoiceReceiptId)
  if (!match) return null
  const parties = partiesOf({ agreement: head.engagement.msa, order: head.workOrder })
  return verdictFrom(match, rules, {
    id: head.id, number: head.number, currency: head.currency, dueAt: head.dueAt,
    supplierName: parties.vendor?.name ?? null,
  })
}

/** Nothing is owed on these, the same list the payable book uses. */
const NOT_PENDING = ['PAID', 'VOID', 'CANCELLED', 'DRAFT']

/** Exceptions first — blocked, then mismatched — then clean; soonest due first inside each. */
export function exceptionsFirst(verdicts: ReadonlyArray<InvoiceVerdict>): InvoiceVerdict[] {
  return [...verdicts].sort((a, b) => {
    const r = RANK[a.verdict] - RANK[b.verdict]
    if (r !== 0) return r
    return (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999')
  })
}

/**
 * What the twin's daily run reads at a client: every invoice receipt it
 * is being asked to pay and has not paid, with its verdict, exceptions
 * first.
 *
 * Payable only — an invoice this company raised is its bill, not its
 * receipt, and a supplier twin reading its own bills is not built yet.
 * The company's own rule set is used unless one is passed.
 */
export async function pendingReceiptsFor(
  companyId: string,
  rules?: InvoiceRuleSet,
): Promise<InvoiceVerdict[]> {
  const using = rules ?? (await invoiceRulesFor(companyId))
  const rows = await prisma.invoice.findMany({
    where: { AND: [invoiceBetween(companyId), { status: { notIn: NOT_PENDING } }] },
    select: HEADER_SELECT,
    orderBy: { dueAt: 'asc' },
    take: 500,
  })

  const pending = rows.flatMap((head) => {
    const parties = partiesOf({ agreement: head.engagement.msa, order: head.workOrder })
    if (directionFrom(parties, companyId) !== 'PAYABLE') return []
    // Settled to the cent is not pending, whatever the status says.
    if (decimalToCents(head.total) - decimalToCents(head.paid) <= 1) return []
    return [{ head, parties }]
  })
  // Every pending receipt checked in one pass rather than one receipt at a
  // time (regulatory's profile, 2026-10-20): the same check, read once.
  const matches = await matchInvoices(pending.map((p) => p.head.id))

  const verdicts: InvoiceVerdict[] = []
  for (const { head, parties } of pending) {
    const match = matches.get(head.id)
    if (!match) continue
    verdicts.push(verdictFrom(match, using, {
      id: head.id, number: head.number, currency: head.currency, dueAt: head.dueAt,
      supplierName: parties.vendor?.name ?? null,
    }))
  }
  return exceptionsFirst(verdicts)
}
