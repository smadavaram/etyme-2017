/**
 * Noticing, and doing something about it.
 *
 * Everything built so far records. A packet reopens when insurance
 * expires — but only when somebody opens the packets page. Access expires
 * — but nobody is told. A purchase order runs out — and the first anybody
 * hears is a supplier chasing a payment that will not match.
 *
 * That is a filing cabinet. The thesis in CLAUDE.md is the opposite:
 * automate the commodity workflows so a recruiter becomes a human capital
 * developer. Chasing an insurance certificate is the commodity workflow.
 *
 * So this decides what is worth acting on, and how urgently, from state
 * the system already holds. Pure functions — the cron does the database
 * work and the sending; these decide.
 *
 * Two rules run through all of it.
 *
 * **Warn before the block, not after.** Lapsed insurance already stops a
 * placement. Telling somebody the day it lapses means a placement is
 * already blocked and a broker needs a week. Telling them at sixty days
 * costs one email and stops nothing.
 *
 * **Say what will happen, not that something is wrong.** "Certificate
 * expires in 12 days" is a fact. "In 12 days you will not be able to place
 * anybody through Cloudepa" is the same fact in the form somebody acts on.
 */

export type Urgency = 'BLOCKING' | 'SOON' | 'WORTH_KNOWING'

/**
 * A sentence ending in a company name.
 *
 * "Cloudepa Inc.." is the kind of thing that makes automated text read as
 * automated, and half the names in this industry end in a full stop.
 */
function endingWith(name: string): string {
  return name.endsWith('.') ? name : `${name}.`
}

export interface Finding {
  kind: string
  urgency: Urgency
  /** Which company should hear about it. */
  companyId: string
  /** What it is about, for linking. */
  subjectType: string
  subjectId: string
  /** One line, in the form somebody acts on. */
  headline: string
  /** What will happen, and what to do. */
  detail: string
  /** Whether the watcher should also do something rather than only say it. */
  action: 'REOPEN_PACKET' | 'NOTIFY_ONLY' | 'DISABLE'
  /** Days until it bites. Negative means it already has. */
  daysUntil: number | null
}

const DAY = 86_400_000
const daysBetween = (a: Date, b: Date) => Math.ceil((a.getTime() - b.getTime()) / DAY)

// ── Verifications and insurance ───────────────────────────────────────

export interface WatchedVerification {
  id: string
  companyId: string | null
  personId: string | null
  type: string
  status: string
  expiresAt: Date | null
  /** The name of whoever it is about, for the sentence. */
  subjectName: string
}

/**
 * Insurance and work authorisation, which are the two that stop work.
 *
 * Addendum E makes lapsed supplier insurance and lapsed work authorisation
 * BLOCK conditions. This is the only warning anybody gets before that
 * happens.
 */
export function watchVerifications(rows: WatchedVerification[], now: Date): Finding[] {
  const BLOCKS_WORK = new Set([
    'INSURANCE_GL', 'INSURANCE_WC', 'INSURANCE_EO', 'INSURANCE_CYBER', 'I9_EVERIFY',
  ])

  const out: Finding[] = []

  for (const v of rows) {
    if (!v.expiresAt) continue
    if (!['CLEAR', 'CONDITIONAL'].includes(v.status)) continue

    const days = daysBetween(v.expiresAt, now)
    const blocks = BLOCKS_WORK.has(v.type)
    const what = readable(v.type)

    if (days < 0) {
      out.push({
        kind: 'VERIFICATION_EXPIRED',
        urgency: blocks ? 'BLOCKING' : 'SOON',
        companyId: v.companyId ?? '',
        subjectType: 'Verification',
        subjectId: v.id,
        headline: `${v.subjectName}: ${what} expired ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`,
        detail: blocks
          ? `Nobody can be placed through ${v.subjectName} until this is renewed. It is already stopping work.`
          : `${what} for ${v.subjectName} is out of date and is being asked for again.`,
        action: 'REOPEN_PACKET',
        daysUntil: days,
      })
      continue
    }

    // Sixty days, because a broker needs a week and a company needs a
    // reason to ask them.
    if (days <= 60) {
      out.push({
        kind: 'VERIFICATION_EXPIRING',
        urgency: days <= 14 && blocks ? 'BLOCKING' : days <= 30 ? 'SOON' : 'WORTH_KNOWING',
        companyId: v.companyId ?? '',
        subjectType: 'Verification',
        subjectId: v.id,
        headline: `${v.subjectName}: ${what} expires in ${days} day${days === 1 ? '' : 's'}`,
        detail: blocks
          ? `On ${v.expiresAt.toISOString().slice(0, 10)} you will not be able to place anybody through ${v.subjectName}. Asking now costs one email.`
          : `Worth renewing before ${v.expiresAt.toISOString().slice(0, 10)}.`,
        // Reopened rather than only announced, so the request is already
        // waiting when somebody looks.
        action: days <= 45 ? 'REOPEN_PACKET' : 'NOTIFY_ONLY',
        daysUntil: days,
      })
    }
  }

  return out
}

function readable(type: string): string {
  const names: Record<string, string> = {
    INSURANCE_GL: 'general liability insurance',
    INSURANCE_WC: "workers' compensation",
    INSURANCE_EO: 'errors and omissions cover',
    INSURANCE_CYBER: 'cyber liability cover',
    I9_EVERIFY: 'work authorisation',
    BACKGROUND_CHECK: 'background check',
    DRUG_SCREENING: 'drug screening',
    EDUCATION_EVALUATION: 'credential evaluation',
    BUSINESS_PARTNER: 'business registration',
    REFERENCE_CHECK: 'references',
  }
  return names[type] ?? type.toLowerCase().replace(/_/g, ' ')
}

// ── Purchase orders ───────────────────────────────────────────────────

export interface WatchedPo {
  id: string
  companyId: string
  number: string
  supplierName: string
  amountCents: number
  invoicedCents: number
  endDate: Date | null
  status: string
  liveContracts: number
}

/**
 * A purchase order quietly running out.
 *
 * Nothing announces this. The invoice simply fails its balance check, and
 * the supplier finds out by not being paid.
 */
export function watchPurchaseOrders(rows: WatchedPo[], now: Date): Finding[] {
  const out: Finding[] = []

  for (const po of rows) {
    if (po.status !== 'OPEN') continue

    const remaining = po.amountCents - po.invoicedCents
    const consumed = po.amountCents > 0 ? po.invoicedCents / po.amountCents : 1
    const money = (c: number) => `$${Math.round(c / 100).toLocaleString()}`

    if (remaining <= 0) {
      out.push({
        kind: 'PO_EXHAUSTED',
        urgency: 'BLOCKING',
        companyId: po.companyId,
        subjectType: 'PurchaseOrder',
        subjectId: po.id,
        headline: `${po.number} is spent`,
        detail: `${po.supplierName} has billed the whole ${money(po.amountCents)}. Their next invoice will not match, and ${po.liveContracts} contract(s) are still running against it. Raise the ceiling or issue a new order.`,
        action: 'NOTIFY_ONLY',
        daysUntil: null,
      })
      continue
    }

    if (consumed >= 0.85 && po.liveContracts > 0) {
      out.push({
        kind: 'PO_NEARLY_SPENT',
        urgency: consumed >= 0.95 ? 'SOON' : 'WORTH_KNOWING',
        companyId: po.companyId,
        subjectType: 'PurchaseOrder',
        subjectId: po.id,
        headline: `${po.number} is ${Math.round(consumed * 100)}% spent`,
        detail: `${money(remaining)} left, with ${po.liveContracts} contract(s) still billing against it. When it runs out their invoices stop matching.`,
        action: 'NOTIFY_ONLY',
        daysUntil: null,
      })
    }

    if (po.endDate) {
      const days = daysBetween(po.endDate, now)
      if (days >= 0 && days <= 30 && po.liveContracts > 0) {
        out.push({
          kind: 'PO_ENDING',
          urgency: days <= 7 ? 'SOON' : 'WORTH_KNOWING',
          companyId: po.companyId,
          subjectType: 'PurchaseOrder',
          subjectId: po.id,
          headline: `${po.number} ends in ${days} day${days === 1 ? '' : 's'}`,
          detail: `${po.liveContracts} contract(s) bill against it. After ${po.endDate.toISOString().slice(0, 10)} their invoices will not match.`,
          action: 'NOTIFY_ONLY',
          daysUntil: days,
        })
      }
    }
  }

  return out
}

// ── Access nobody is using ────────────────────────────────────────────

export interface WatchedAccess {
  contextId: string
  companyId: string
  personName: string
  roleName: string | null
  expiresAt: Date | null
  lastUsedAt: Date | null
  grantedAt: Date
}

/**
 * Access that has expired, is about to, or was never used.
 *
 * The access screen already reports this to whoever opens it. Nobody
 * opens it. A grant nobody has touched in three months is exposure, and
 * exposure that only exists on a page nobody visits is exposure.
 */
export function watchAccess(rows: WatchedAccess[], now: Date): Finding[] {
  const out: Finding[] = []

  for (const a of rows) {
    if (a.expiresAt) {
      const days = daysBetween(a.expiresAt, now)
      if (days < 0) {
        out.push({
          kind: 'ACCESS_EXPIRED',
          urgency: 'SOON',
          companyId: a.companyId,
          subjectType: 'Context',
          subjectId: a.contextId,
          headline: `${a.personName} lost access ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`,
          detail: `Their ${a.roleName ?? 'access'} expired and has not been renewed. If they still work here they cannot do their job; if they do not, this is tidy.`,
          action: 'NOTIFY_ONLY',
          daysUntil: days,
        })
        continue
      }
      if (days <= 14) {
        out.push({
          kind: 'ACCESS_EXPIRING',
          urgency: days <= 3 ? 'SOON' : 'WORTH_KNOWING',
          companyId: a.companyId,
          subjectType: 'Context',
          subjectId: a.contextId,
          headline: `${a.personName} loses access in ${days} day${days === 1 ? '' : 's'}`,
          detail: `Renewing is a click. Doing nothing is also fine — that is what an expiry is for.`,
          action: 'NOTIFY_ONLY',
          daysUntil: days,
        })
        continue
      }
    }

    // Never used, and long enough ago that it was not going to be.
    if (!a.lastUsedAt && daysBetween(now, a.grantedAt) >= 30) {
      out.push({
        kind: 'ACCESS_NEVER_USED',
        urgency: 'WORTH_KNOWING',
        companyId: a.companyId,
        subjectType: 'Context',
        subjectId: a.contextId,
        headline: `${a.personName} has never used their access`,
        detail: `Granted ${daysBetween(now, a.grantedAt)} days ago and not once used. Either they do not need it, or nobody told them it was there.`,
        action: 'NOTIFY_ONLY',
        daysUntil: null,
      })
      continue
    }

    if (a.lastUsedAt && daysBetween(now, a.lastUsedAt) >= 90) {
      out.push({
        kind: 'ACCESS_DORMANT',
        urgency: 'WORTH_KNOWING',
        companyId: a.companyId,
        subjectType: 'Context',
        subjectId: a.contextId,
        headline: `${a.personName} has not used their access in ${daysBetween(now, a.lastUsedAt)} days`,
        detail: `Held but not doing anything, which is exposure rather than access.`,
        action: 'NOTIFY_ONLY',
        daysUntil: null,
      })
    }
  }

  return out
}

// ── Packets nobody answered ───────────────────────────────────────────

export interface WatchedPacket {
  id: string
  companyId: string
  label: string
  recipientEmail: string
  expiresAt: Date
  createdAt: Date
  outstandingRequired: number
}

/**
 * A request that expired unanswered.
 *
 * This one is invisible in the worst way: to the person who sent it, an
 * expired link and an ignored request look identical, and they conclude
 * the supplier is unresponsive when the supplier saw a dead page.
 */
export function watchPackets(rows: WatchedPacket[], now: Date): Finding[] {
  const out: Finding[] = []

  for (const p of rows) {
    if (p.outstandingRequired === 0) continue
    const days = daysBetween(p.expiresAt, now)

    if (days < 0) {
      out.push({
        kind: 'PACKET_LINK_DEAD',
        urgency: 'SOON',
        companyId: p.companyId,
        subjectType: 'DocumentPacket',
        subjectId: p.id,
        headline: `${p.recipientEmail} cannot reply to "${p.label}" any more`,
        detail: `The link expired ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago with ${p.outstandingRequired} item(s) still outstanding. To them this looks like a dead page, not a reminder. Send a new request.`,
        action: 'NOTIFY_ONLY',
        daysUntil: days,
      })
      continue
    }

    // Sent a fortnight ago, nothing back, and the link is running out.
    if (days <= 7 && daysBetween(now, p.createdAt) >= 14) {
      out.push({
        kind: 'PACKET_GOING_QUIET',
        urgency: 'WORTH_KNOWING',
        companyId: p.companyId,
        subjectType: 'DocumentPacket',
        subjectId: p.id,
        headline: `"${p.label}" runs out in ${days} day${days === 1 ? '' : 's'} with ${p.outstandingRequired} still outstanding`,
        detail: `${p.recipientEmail} has had this for ${daysBetween(now, p.createdAt)} days. Worth a nudge before the link dies.`,
        action: 'NOTIFY_ONLY',
        daysUntil: days,
      })
    }
  }

  return out
}

// ── Ordering ──────────────────────────────────────────────────────────

const RANK: Record<Urgency, number> = { BLOCKING: 0, SOON: 1, WORTH_KNOWING: 2 }

/**
 * What somebody should look at first.
 *
 * Blocking before soon, and within a band the thing that bites soonest.
 * A list ordered by when it was found is a list nobody finishes.
 */
export function ordered(findings: Finding[]): Finding[] {
  return findings.slice().sort((a, b) => {
    if (RANK[a.urgency] !== RANK[b.urgency]) return RANK[a.urgency] - RANK[b.urgency]
    const da = a.daysUntil ?? 9999
    const db = b.daysUntil ?? 9999
    return da - db
  })
}

/**
 * One line for whoever is being told.
 *
 * Silence when there is nothing, rather than a cheerful report that
 * everything is fine — a daily message saying nothing is how a daily
 * message stops being read.
 */
export function digest(findings: Finding[]): string | null {
  if (findings.length === 0) return null

  const blocking = findings.filter((f) => f.urgency === 'BLOCKING')
  const soon = findings.filter((f) => f.urgency === 'SOON')

  if (blocking.length > 0) {
    return blocking.length === 1
      ? blocking[0].headline
      : `${blocking[0].headline}, and ${blocking.length - 1} other thing(s) already stopping work.`
  }
  if (soon.length > 0) {
    return soon.length === 1 ? soon[0].headline : `${soon[0].headline}, and ${soon.length - 1} other thing(s) coming up.`
  }
  return `${findings.length} thing(s) worth knowing about.`
}
