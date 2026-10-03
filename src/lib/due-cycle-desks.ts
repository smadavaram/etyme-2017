import { isMoneyKind, labelOf, sideOf, type MoneyKind, type Side } from '@/lib/cycle-kinds'
import type { Permission } from '@/lib/permissions'

/**
 * Who hears that a cycle is coming, and in whose words.
 *
 * ── Why this is a table and not an if-tree ───────────────────────────
 *
 * The nightly scan told `contract.personId` about every kind of cycle,
 * which is the consultant, for all six. So the contractor on a placement
 * was told to raise her own client's invoice and told about running her
 * own payroll — two things she cannot do and one she must never see.
 *
 * CLAUDE.md, from the client dashboard work: "The desk that acts is the
 * desk that hears. Route every 'needs you' through who may act, not who
 * owns the row." The permission named beside each desk here is the one
 * the route for that action actually checks, so the person told is the
 * person the app will let through when they arrive:
 *
 *   hours filed          the worker              — `POST /api/timesheets`
 *   hours signed         timesheets.approve      — `lib/timesheet-authority`
 *   bill raised          invoices.issue          — `POST /api/invoices/generate`
 *   payroll              payroll.run             — `POST /api/payroll/runs`
 *   supplier's invoice   payments.record         — `POST /api/ap/bills`
 *
 * A table rather than a switch because the failure to protect against is
 * a seventh kind arriving with nobody mapped to it and quietly falling
 * back to the consultant again. `Record<MoneyKind, …>` makes that a
 * compile error, and `__tests__/invariants/due-cycles-desks.test.ts`
 * makes it a red test with a sentence on it.
 */

/**
 * Which company on the placement a desk sits at.
 *
 * Named by the leg rather than by the trade's role, because the same
 * firm is a seller to one counterparty and a buyer to another in the
 * same week, and a name like "vendor" stops being true one hop up.
 */
export type DeskAt =
  /** The firm on the selling side of this placement — it bills, and it employs or supplies. */
  | 'SELL_COMPANY'
  /** The firm it bills: the rung that pays, which is not always the end client. */
  | 'SELL_CLIENT'
  /** The firm on the buying side — it runs payroll, or it pays a sub-vendor. */
  | 'BUY_COMPANY'
  /** The person on the placement. Only ever their own hours. */
  | 'WORKER'

export interface Desk {
  at: DeskAt
  /** The permission the route for this action requires. Null for the worker. */
  needs: Permission | null
  /** Why this desk, in a sentence. Read in the automation log. */
  because: string
}

export const DESKS: Record<MoneyKind, readonly Desk[]> = {
  TIMESHEET_SUBMIT: [
    { at: 'WORKER', needs: null, because: 'The worker files their own week; nobody else may.' },
  ],
  // Both signatures, because either can be the one outstanding: the
  // client signs the work it received, the employer accepts what it pays
  // for, and nobody signs their own hours.
  TIMESHEET_APPROVE: [
    { at: 'SELL_CLIENT', needs: 'timesheets.approve', because: 'The client signs the work it received.' },
    { at: 'SELL_COMPANY', needs: 'timesheets.approve', because: 'The employer accepts the hours it pays for.' },
  ],
  INVOICE_GENERATE: [
    { at: 'SELL_COMPANY', needs: 'invoices.issue', because: 'Accounts receivable raises the bill.' },
  ],
  SALARY_CALCULATE: [
    { at: 'BUY_COMPANY', needs: 'payroll.run', because: 'Payroll is the employer’s own desk.' },
  ],
  SALARY_PAY: [
    { at: 'BUY_COMPANY', needs: 'payroll.run', because: 'Payroll is the employer’s own desk.' },
  ],
  VENDOR_BILL_GENERATE: [
    { at: 'BUY_COMPANY', needs: 'payments.record', because: 'Accounts payable records the supplier’s invoice.' },
  ],
}

/**
 * Empty for a kind this engine no longer generates.
 *
 * `INVOICE_DUE` and `VENDOR_BILL_DUE` rows written before those kinds
 * were retired still sit in production databases, and an old row must
 * still read as a sentence rather than crash — but nobody is told about
 * it, because a date nobody can stand behind is not worth a desk's
 * attention. The scan counts them instead, so they are visible rather
 * than silent.
 */
export function desksFor(kind: string): readonly Desk[] {
  return isMoneyKind(kind) ? DESKS[kind] : []
}

// ── The legs a cycle can sit on ────────────────────────────────────────

export interface SellLeg {
  id: string
  /** The selling firm. */
  companyId: string
  /** The rung it bills. `lib/chain-top`: the client sees the contract it pays. */
  clientCompanyId: string
  personId: string
  personName: string
  clientName: string
  /** Somebody named to sign this contract's hours without the company-wide permission. */
  approverPersonId: string | null
}

export interface BuyLeg {
  id: string
  /** The buying firm — the employer, or the firm paying a sub-vendor. */
  companyId: string
  companyName: string
  /** The firm below, where there is one. Null means we employ the person. */
  vendorCompanyId: string | null
  vendorName: string | null
  /** Who the buy leg is for. A buy contract can carry several people. */
  personNames: string[]
}

export interface Legs {
  sell: SellLeg | null
  buy: BuyLeg | null
}

/**
 * The company a desk sits at for this cycle, or null where the leg the
 * desk needs is not on the cycle.
 *
 * The buy cycles are filed on the buy contract — `lib/cycle-kinds` says
 * why — so reading a company off `sellContract` alone found nothing for
 * three of the six kinds and the scan skipped them. Pay day has never
 * once been surfaced by this job.
 */
export function companyForDesk(desk: Desk, legs: Legs): string | null {
  switch (desk.at) {
    case 'SELL_COMPANY':
      return legs.sell?.companyId ?? null
    case 'SELL_CLIENT':
      return legs.sell?.clientCompanyId ?? null
    case 'BUY_COMPANY':
      return legs.buy?.companyId ?? null
    case 'WORKER':
      // Filed under the firm that employs or supplies them, which is the
      // company the worker's own seat belongs to.
      return legs.sell?.companyId ?? legs.buy?.companyId ?? null
  }
}

/** Every company that would hear about this cycle. Pure — no seats read. */
export function companiesHearing(kind: string, legs: Legs): string[] {
  const out = new Set<string>()
  for (const desk of desksFor(kind)) {
    const companyId = companyForDesk(desk, legs)
    if (companyId) out.add(companyId)
  }
  return [...out]
}

/** Which leg a cycle of this kind belongs to, falling back to whichever exists. */
export function legOf(kind: string, legs: Legs): Side | null {
  const side = sideOf(kind)
  if (side === 'SELL' && legs.sell) return 'SELL'
  if (side === 'BUY' && legs.buy) return 'BUY'
  if (legs.sell) return 'SELL'
  if (legs.buy) return 'BUY'
  return null
}

// ── Who, by name ───────────────────────────────────────────────────────

export interface Told {
  personId: string
  /** The seat this person was told at. Notifications are filed under it. */
  companyId: string
  because: string
  /**
   * True where nobody at that company holds the permission and the owner
   * stood in. CLAUDE.md: a desk nobody has named falls back; it never
   * refuses.
   */
  viaOwner: boolean
}

export interface SeatReader {
  /** Everybody at this company whose role carries this permission. */
  holders(companyId: string, permission: Permission): Promise<string[]>
  /** The fallback: whoever owns the company. */
  owners(companyId: string): Promise<string[]>
}

/**
 * Everybody who should hear about this cycle, deduplicated.
 *
 * The fallback is the owner, and it is deliberate rather than tidy. A
 * client in its first week has a hiring manager and nobody in an
 * accounts seat; a two-person supplier has an owner who is every desk.
 * Telling nobody would mean an invoice nobody raises and a pay day
 * nobody runs, so the owner hears it and can seat somebody. Where even
 * the owner is missing — a seeded shell, a company mid-setup — nobody is
 * told and the scan counts it, because inventing a recipient is worse
 * than a number somebody can see is zero.
 */
export async function whoHears(kind: string, legs: Legs, seats: SeatReader): Promise<Told[]> {
  const out = new Map<string, Told>()

  for (const desk of desksFor(kind)) {
    const companyId = companyForDesk(desk, legs)
    if (!companyId) continue

    if (desk.at === 'WORKER') {
      const personId = legs.sell?.personId
      if (personId) out.set(personId, { personId, companyId, because: desk.because, viaOwner: false })
      continue
    }

    const people = new Set<string>(desk.needs ? await seats.holders(companyId, desk.needs) : [])

    // Somebody named to sign this one contract's hours, who holds no
    // company-wide permission and is exactly the person meant to act.
    if (desk.at === 'SELL_CLIENT' && desk.needs === 'timesheets.approve' && legs.sell?.approverPersonId) {
      people.add(legs.sell.approverPersonId)
    }

    const viaOwner = people.size === 0
    if (viaOwner) for (const id of await seats.owners(companyId)) people.add(id)

    for (const personId of people) {
      if (!out.has(personId)) out.set(personId, { personId, companyId, because: desk.because, viaOwner })
    }
  }

  return [...out.values()]
}

// ── In the words a person would use ────────────────────────────────────

/**
 * The title, in the trade's words rather than the engine's.
 *
 * It read `"SALARY_CALCULATE cycle due in 3 days"` — so a contractor was
 * told SALARY_CALCULATE about her own pay. That is the mistake CLAUDE.md
 * records from 2017, where the timeline filter was the cycle engine's
 * own enum, back in the one file nobody read. `labelOf` has returned
 * "Pay day" and "Hours due" the whole time and nothing called it.
 */
export function titleFor(kind: string, daysUntilDue: number): string {
  const when = daysUntilDue <= 0 ? 'today' : daysUntilDue === 1 ? 'tomorrow' : `in ${daysUntilDue} days`
  return `${labelOf(kind)} — ${when}`
}

/** Who it is about and where, which is what makes a queue readable. */
export function bodyFor(kind: string, legs: Legs, dueOn: Date): string {
  const on = dueOn.toLocaleDateString('en-US', { timeZone: 'UTC' })
  const leg = legOf(kind, legs)

  if (leg === 'BUY' && legs.buy) {
    const who = legs.buy.personNames.length > 0 ? legs.buy.personNames.join(', ') : 'This engagement'
    const where = legs.buy.vendorName
      ? `through ${legs.buy.vendorName}`
      : `on ${legs.buy.companyName}’s own payroll`
    return `${who} ${where} — ${on}`
  }

  if (legs.sell) return `${legs.sell.personName} at ${legs.sell.clientName} — ${on}`
  return `Due ${on}`
}
