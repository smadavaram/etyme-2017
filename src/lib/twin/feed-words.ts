/**
 * The twin's ledger, said in a line a person reads.
 *
 * One line per entry: who did what, to which record in the reader's
 * words, on whose authority, and where — "Twin approved invoice receipt
 * PR-2026-0441 under Program Manager authority via Teams". The screen
 * adds the moment, in the reader's own zone (`momentFor` in lib/when).
 *
 * Pure: no database, so the page, the route and the export all read the
 * same sentence. Etyme's words, never the vocabulary's names: an
 * `Invoice` the client received is an invoice receipt (CLAUDE.md, "Bill,
 * invoice receipt, payroll"), a time limit is a time limit, and an act
 * name such as `invoice_receipt.approve` never reaches a screen.
 */
import { TWIN_ACTS } from '@/lib/autonomy'

export type FeedSurface = 'TEAMS' | 'WEB' | 'CRON' | string

/** Where it happened, as a phrase that ends a line. */
export function surfaceWords(s: FeedSurface): string {
  if (s === 'TEAMS') return 'via Teams'
  if (s === 'WEB') return 'on the web'
  if (s === 'CRON') return 'on the nightly run'
  return ''
}

/** The short word for a surface, for a column. */
export function surfaceWord(s: FeedSurface): string {
  return s === 'TEAMS' ? 'Teams' : s === 'WEB' ? 'Web' : s === 'CRON' ? 'Nightly run' : '—'
}

/** The record an entry is about, named the way the reader names it. */
export function entityWords(type: string, label: string | null | undefined): string {
  const l = label?.trim() || null
  switch (type) {
    case 'Invoice':
    case 'VendorBill':
      return l ? `invoice receipt ${l}` : 'an invoice receipt'
    case 'Person':
      return l ?? 'a person'
    case 'RoleContract':
      return l ? `the twin’s role contract, version ${l}` : 'the twin’s role contract'
    case 'RuleSet':
      return l ? `the twin’s rules, version ${l}` : 'the twin’s rules'
    case 'ModelSwitch':
      return l === 'on' ? 'Ask Etyme’s model switch to on' : l === 'off' ? 'Ask Etyme’s model switch to off' : 'Ask Etyme’s model switch'
    default:
      return l ?? 'a record'
  }
}

function possessive(e: string): string {
  return /s$/.test(e) ? `${e}’` : `${e}’s`
}

/** Each act as a past tense and an infinitive, over the record's words. */
const PHRASES: Record<string, { past: (e: string) => string; inf: (e: string) => string }> = {
  'tenure.warning.record': {
    past: (e) => `recorded a time-limit warning for ${e}`,
    inf: (e) => `record a time-limit warning for ${e}`,
  },
  'tenure.warning.notify_program_owner': {
    past: (e) => `told the program owner about ${possessive(e)} time limit`,
    inf: (e) => `tell the program owner about ${possessive(e)} time limit`,
  },
  'tenure.warning.notify_supplier': {
    past: (e) => `wrote to the supplier about ${possessive(e)} time limit`,
    inf: (e) => `write to the supplier about ${possessive(e)} time limit`,
  },
  'invoice_receipt.record': {
    past: (e) => `checked ${e} against the accepted hours and the contract rate`,
    inf: (e) => `check ${e}`,
  },
  'invoice_receipt.flag_mismatch': {
    past: (e) => `told the AP clerk that ${e} does not match the accepted hours or the rate`,
    inf: (e) => `tell the AP clerk that ${e} does not match`,
  },
  'invoice_receipt.approve': {
    past: (e) => `approved ${e}`,
    inf: (e) => `approve ${e}`,
  },
  'invoice_receipt.pay': {
    past: (e) => `paid ${e}`,
    inf: (e) => `pay ${e}`,
  },
  'reminder.send': {
    past: (e) => `sent a reminder about ${e}`,
    inf: (e) => `send a reminder about ${e}`,
  },
  'summary.draft': {
    past: (e) => `drafted a summary about ${e}`,
    inf: (e) => `draft a summary about ${e}`,
  },
}

/** An act with no phrase of its own reads its sentence from the vocabulary. */
function plain(action: string): string {
  const says = TWIN_ACTS[action]?.says
  if (!says) return 'do something the role contract does not name'
  const first = says.split('. ')[0].replace(/\.$/, '')
  return first.charAt(0).toLowerCase() + first.slice(1)
}

export function pastOf(action: string, e: string): string {
  return PHRASES[action]?.past(e) ?? `was asked to ${plain(action)}`
}

export function infinitiveOf(action: string, e: string): string {
  return PHRASES[action]?.inf(e) ?? plain(action)
}

/** The question the twin put to a person, as a heading: "Approve invoice receipt INV-1". */
export function questionLine(action: string, entityType: string, label: string | null | undefined): string {
  const s = infinitiveOf(action, entityWords(entityType, label))
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** What a question's heading names: the record, the firm and the person, where the ledger carries them. */
export interface QuestionFacts {
  /** The record's own number: an invoice receipt's or a bill's. */
  number?: string | null
  /** The supplier whose invoice it is, or whose person it is about. */
  supplierName?: string | null
  /** The customer a bill goes to. */
  customerName?: string | null
  /** The billing period, as the bill card says it: "Sep 2026". */
  periodLabel?: string | null
  /** The person a question is about. */
  personName?: string | null
  /** A time-limit question: BREACH when at or past it. */
  tier?: string | null
}

const text = (x: string | null | undefined): string | null => (typeof x === 'string' && x.trim() ? x.trim() : null)

/**
 * The notice that puts the twin's question to a person, as one question
 * in the trade's words: who and what, never "Ask Etyme is asking you to
 * decide" (handoffs station, 2026-10-20). "Pay Techpeple’s invoice
 * INV-1042?", "Send bill INV-2209 to Northbend Athletic?". A fact the
 * ledger does not carry is left out of the sentence, never guessed. Pure.
 */
export function questionTitle(action: string, entityType: string, f: QuestionFacts = {}): string {
  const number = text(f.number)
  const supplier = text(f.supplierName)
  const customer = text(f.customerName)
  const person = text(f.personName)
  switch (action) {
    case 'invoice_receipt.approve':
    case 'invoice_receipt.pay':
      if (supplier && number) return `Pay ${possessive(supplier)} invoice ${number}?`
      if (number) return `Pay invoice ${number}?`
      if (supplier) return `Pay ${possessive(supplier)} invoice?`
      return 'Pay a supplier’s invoice?'
    case 'bill.send': {
      const period = text(f.periodLabel)
      if (number && customer) return `Send bill ${number} to ${customer}?`
      if (customer) return `Send the bill to ${customer}${period ? ` for ${period}` : ''}?`
      if (number) return `Send bill ${number}?`
      return 'Send a drafted bill?'
    }
    case 'tenure.warning.notify_supplier': {
      const where = f.tier === 'BREACH' ? 'is at the time limit' : 'is near the time limit'
      const to = supplier ?? 'the supplier'
      return person ? `Tell ${to} that ${person} ${where}?` : `Tell ${to} about a time limit?`
    }
    default:
      return `${questionLine(action, entityType, number ?? person ?? null)}?`
  }
}

export interface LineInput {
  /** TWIN, PERSON or SYSTEM; CHANGE for an edit of the contract or the rules. */
  actorType: string
  /** The person's name, where the reader may know it. */
  actorName?: string | null
  action: string
  outcome: string
  entityType: string
  label?: string | null
  onAuthorityOfRole: string
  surface: FeedSurface
}

/**
 * One entry, one line, without the time. The reader's screen appends
 * the moment; the export carries it in a column of its own.
 */
export function feedLine(r: LineInput): string {
  const e = entityWords(r.entityType, r.label)
  const where = surfaceWords(r.surface)
  const tail = where ? ` ${where}` : ''
  const who = r.actorName?.trim() || 'A person'
  const authority = r.onAuthorityOfRole ? ` under ${r.onAuthorityOfRole} authority` : ''

  if (r.actorType === 'CHANGE') {
    return `${who} changed ${e}${tail}`
  }
  if (r.outcome === 'OVERTAKEN') {
    return `The twin’s question to ${infinitiveOf(r.action, e)} was closed unanswered: a person dealt with it another way${tail}`
  }
  if (r.actorType === 'TWIN') {
    switch (r.outcome) {
      case 'PERFORMED': return `Twin ${pastOf(r.action, e)}${authority}${tail}`
      case 'AWAITING_APPROVAL': return `Twin asked a person to ${infinitiveOf(r.action, e)}${authority}${tail}`
      case 'REFUSED': return `Twin did not ${infinitiveOf(r.action, e)}: it was refused${authority}${tail}`
      default: return `Twin: ${infinitiveOf(r.action, e)}${authority}${tail}`
    }
  }
  if (r.actorType === 'PERSON') {
    switch (r.outcome) {
      case 'PERFORMED': return `Twin ${pastOf(r.action, e)}${authority}${tail} — ${who} said yes`
      case 'REJECTED': return `${who} said no to the twin: do not ${infinitiveOf(r.action, e)}${tail}`
      case 'REFUSED': return `${who} answered the twin about ${e} and was refused${tail}`
      default: return `${who} answered the twin about ${e}${tail}`
    }
  }
  return `Etyme ${pastOf(r.action, e)}${tail}`
}

/** What happened, in one word a column can sort. */
export function outcomeWord(outcome: string): string {
  switch (outcome) {
    case 'PERFORMED': return 'Done'
    case 'AWAITING_APPROVAL': return 'Asked a person'
    case 'REFUSED': return 'Refused'
    case 'REJECTED': return 'Said no'
    case 'OVERTAKEN': return 'Overtaken'
    default: return outcome
  }
}

/** The three tiers, as the editor and the export say them. */
export function tierWord(tier: string): string {
  switch (tier) {
    case 'ACTS_ALONE': return 'Acts alone'
    case 'NEEDS_APPROVAL': return 'Needs approval'
    case 'NEVER': return 'Never touches'
    default: return '—'
  }
}
