/**
 * The agreements screen, in a reader's words.
 *
 * ── Why this is a file of its own ────────────────────────────────────
 *
 * A master agreement used to carry one date — `signedAt` — that somebody
 * typed. It now has a term, a standing, two named signatures and an
 * amendment trail, and the screen rendered none of it: the page was
 * still drawing the old shape, so the whole of that work was invisible
 * to the only person who verifies by clicking.
 *
 * Everything here is arithmetic over the row the API already computed.
 * No React, no fetch, no database — so the sentences a person reads can
 * be tested as sentences rather than matched as a regex over JSX, which
 * passes on a page that renders the right words in the wrong place.
 *
 * ── The three things the screen has to be honest about ───────────────
 *
 * 1. Whether we may trade at all, and *when* it runs out. An agreement
 *    with no end date on file is not an agreement that runs forever, and
 *    the two used to look identical.
 * 2. Whether it is actually executed. One side signed is a half-state,
 *    never a green tick — that is the whole point of a counter-signature.
 * 3. What needs somebody today, with a reason code behind every line.
 *    A free-text note collects nothing; a code can be counted across two
 *    hundred agreements and told apart in a report.
 *
 * Owned with `app/dashboard/program`. Tested by
 * `__tests__/invariants/agreement-screen.test.ts`.
 */

import { AGREEMENT_REASONS } from '@/app/api/program/agreements/verdict'

// ── The shapes the API hands back ─────────────────────────────────────

export interface SignatureRow {
  party: string
  signerName: string
  signerTitle: string
  signedAt: string
  method: string
}

export interface FindingRow {
  code: string
  severity: 'WARN' | 'NOTE'
  says: string
  subjectType: 'AGREEMENT' | 'ENGAGEMENT' | 'CONTRACT'
  subjectId: string
}

export interface TermRow {
  paymentTermsDays: number
  paymentTermsSays: string
  currency: string
  minMarginPct: number | null
  marginFloorSays: string | null
  capacity: number | null
  /**
   * Whether this agreement entitles the client to the names of the firms
   * behind a placement. Off unless the client demanded it at signing —
   * a sub-vendor's name is the prime's to keep.
   */
  disclosesSubVendors: boolean
  disclosureSays: string | null
  signedAt: string | null
  effectiveDate: string | null
  expiresAt: string | null
  renewalKind: string
  renewalMonths: number | null
  noticeDays: number | null
}

/** The fields of an agreement row this file reasons about. */
export interface StandingInput {
  id: string
  role: 'VENDOR' | 'CLIENT'
  counterparty: { id: string; name: string }
  status: string
  statusSays: string
  termSays: string
  daysToExpiry: number | null
  endedAt: string | null
  endedReason: string | null
  terms: TermRow
  signing: { says: string; signatures: SignatureRow[] }
  headcount: number
  findings: FindingRow[]
}

export type Tone = 'attention' | 'verified' | 'action' | 'passive'

// ── A day, written out ────────────────────────────────────────────────

/**
 * A date as a person writes it, in UTC.
 *
 * UTC rather than the reader's zone on purpose: an agreement that runs
 * out on 1 January must not read as 31 December to somebody in Denver.
 * The date on the paper has no time of day and does not move.
 */
export function onDay(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

// ── May we trade at all ───────────────────────────────────────────────

/**
 * The chip at the front of the row.
 *
 * Computed from the calendar as well as the stored standing, because the
 * column is moved by a nightly job and the days are counted live. Reading
 * only the column would put "In force" on a row whose own findings say it
 * lapsed this morning, which is worse than either fact alone.
 *
 * An evergreen agreement is never called lapsed however old a stray
 * expiry date on it is: its own paper says it rolls on. That mirrors
 * `calendarStatus` in `lib/agreement-term`, which takes the same care.
 */
export function readStanding(a: {
  status: string
  daysToExpiry: number | null
  terms: { renewalKind: string; renewalMonths: number | null; expiresAt: string | null }
}): { word: string; tone: Tone } {
  if (a.status === 'TERMINATED') return { word: 'Ended', tone: 'attention' }

  const rolls = a.terms.renewalKind === 'EVERGREEN'
  const days = a.daysToExpiry

  if (!rolls && days != null) {
    if (days <= 0) {
      // A term that renews itself has not lapsed on the day it reaches;
      // it rolls, and the nightly job rolls it. Calling that lapsed
      // raises an alarm about a document that says this is what it does.
      if (a.terms.renewalKind === 'AUTO_RENEW' && a.terms.renewalMonths) {
        return { word: 'Renewing', tone: 'action' }
      }
      return { word: 'Lapsed', tone: 'attention' }
    }
    if (days <= 90) return { word: 'Running out', tone: 'attention' }
  }

  // DRAFT is the award path's word for "a row so the contract has a
  // parent". Nobody negotiated it and it must never read as in force.
  if (a.status === 'DRAFT') return { word: 'Not papered', tone: 'passive' }

  return { word: 'In force', tone: 'verified' }
}

/**
 * When it runs out, in the cell where a reader looks for a date.
 *
 * The blank case is the reason this function exists. "—" in a date
 * column reads as "no end", and no end date recorded is the opposite
 * fact from an agreement that runs on forever.
 */
export function runsOutSays(a: {
  status: string
  daysToExpiry: number | null
  endedAt: string | null
  terms: { renewalKind: string; expiresAt: string | null }
}): string {
  if (a.status === 'TERMINATED') {
    const when = onDay(a.endedAt)
    return when ? `Ended ${when}` : 'Ended'
  }
  if (a.terms.renewalKind === 'EVERGREEN') return 'Rolls on — no end date'

  const when = onDay(a.terms.expiresAt)
  if (!when) return 'No end date on file'

  const days = a.daysToExpiry
  if (days == null) return when
  if (days <= 0) return `Ran out ${when}`
  return `${when} — ${plural(days, 'day', 'days')}`
}

// ── Is it actually executed ───────────────────────────────────────────

export type SigningState = 'NONE' | 'HALF' | 'BOTH'

export interface SigningRead {
  state: SigningState
  /** The chip, three or four words. */
  word: string
  tone: Tone
  /** The whole fact, naming the side that still owes a counter-signature. */
  says: string
  vendor: SignatureRow | null
  client: SignatureRow | null
  /** Which side has not signed, or null once both are in. */
  owing: 'VENDOR' | 'CLIENT' | null
}

/**
 * Who has put their name to it, and who has not.
 *
 * Never collapses to a tick. An agreement signed by one side is a
 * document out for counter-signature — a different thing to chase, owed
 * by a different person — and showing it green is how it sits in
 * somebody's drawer for four months.
 */
export function readSigning(a: {
  role: 'VENDOR' | 'CLIENT'
  counterparty: { name: string }
  signing: { signatures: SignatureRow[] }
}): SigningRead {
  const vendor = a.signing.signatures.find((s) => s.party === 'VENDOR') ?? null
  const client = a.signing.signatures.find((s) => s.party === 'CLIENT') ?? null

  // Which side of this agreement the reader is standing on. The words
  // "you" and the counterparty's name are not interchangeable and a
  // client reading "you have not counter-signed" about their supplier is
  // chasing the wrong desk.
  const weAre = a.role
  const ourName = 'You'
  const theirName = a.counterparty.name

  if (vendor && client) {
    return {
      state: 'BOTH',
      word: 'Both sides',
      tone: 'verified',
      says: 'Signed by both sides. The agreement is executed.',
      vendor,
      client,
      owing: null,
    }
  }

  if (!vendor && !client) {
    return {
      state: 'NONE',
      word: 'Nobody has signed',
      tone: 'attention',
      says: 'Nobody has signed it. Nothing on file says this agreement was ever executed.',
      vendor,
      client,
      owing: null,
    }
  }

  const signedParty: 'VENDOR' | 'CLIENT' = vendor ? 'VENDOR' : 'CLIENT'
  const owing: 'VENDOR' | 'CLIENT' = vendor ? 'CLIENT' : 'VENDOR'
  const signedIsUs = signedParty === weAre
  const whoSigned = signedIsUs ? ourName : theirName
  const whoOwes = signedIsUs ? theirName : ourName
  const signedVerb = signedIsUs ? 'have' : 'has'
  const owesVerb = signedIsUs ? 'has' : 'have'

  return {
    state: 'HALF',
    word: signedParty === 'VENDOR' ? 'Supplier only' : 'Client only',
    tone: 'attention',
    says:
      `${whoSigned} ${signedVerb} signed. ${whoOwes} ${owesVerb} not counter-signed it, ` +
      `so it is not executed yet.`,
    vendor,
    client,
    owing,
  }
}

/** Which side a party is, in the words on the page. */
export function partyWord(party: string): string {
  if (party === 'VENDOR') return 'Supplier'
  if (party === 'CLIENT') return 'Client'
  return party
}

/** How it was signed, said rather than spelled in capitals. */
export function methodSays(method: string): string {
  switch (method) {
    case 'WET_INK':
      return 'wet ink'
    case 'ELECTRONIC':
      return 'electronically'
    case 'COUNTERPART':
      return 'in counterparts'
    default:
      return method.toLowerCase().replace(/_/g, ' ')
  }
}

/** One signature, whole, for the line under a signer's name. */
export function signatureSays(s: SignatureRow): string {
  const when = onDay(s.signedAt)
  return `${s.signerName}, ${s.signerTitle} — signed ${when ?? 'on a date that is not readable'} in ${methodSays(s.method)}.`
}

// ── The notice period ─────────────────────────────────────────────────

/**
 * Whether this agreement is now closer to its end than the notice it
 * asks for.
 *
 * Past that line the calm decision has already been missed: notice given
 * today lands after the term ends, and an agreement that renews itself
 * will roll for another term whether anybody meant it to or not. That is
 * why an agreement inside its own notice window needs somebody even when
 * nobody is placed under it — nothing is going wrong on site, and the
 * window to choose is what is closing.
 */
export function insideNoticePeriod(a: {
  status: string
  daysToExpiry: number | null
  terms: { noticeDays: number | null; renewalKind: string }
}): boolean {
  if (a.status === 'TERMINATED') return false
  if (a.terms.renewalKind === 'EVERGREEN') return false
  const notice = a.terms.noticeDays
  if (notice == null || notice <= 0) return false
  const days = a.daysToExpiry
  if (days == null) return false
  return days > 0 && days <= notice
}

/** What being inside the notice window means, said. Null when it is not. */
export function noticeSays(a: {
  status: string
  daysToExpiry: number | null
  counterparty: { name: string }
  terms: {
    noticeDays: number | null
    renewalKind: string
    renewalMonths: number | null
    expiresAt: string | null
  }
}): string | null {
  if (!insideNoticePeriod(a)) return null
  const notice = a.terms.noticeDays!
  const days = a.daysToExpiry!
  const ends = onDay(a.terms.expiresAt)

  // The last day notice could have been given and still landed in time.
  const deadline = a.terms.expiresAt
    ? onDay(new Date(new Date(a.terms.expiresAt).getTime() - notice * 86_400_000).toISOString())
    : null

  const base =
    `This agreement asks for ${plural(notice, 'day', 'days')} notice and has ` +
    `${plural(days, 'day', 'days')} left${ends ? `, to ${ends}` : ''}` +
    `${deadline ? ` — notice would have had to be given by ${deadline}` : ''}.`

  if (a.terms.renewalKind === 'AUTO_RENEW' && a.terms.renewalMonths) {
    return (
      `${base} Unless notice has already been given, it renews itself for another ` +
      `${plural(a.terms.renewalMonths, 'month', 'months')}.`
    )
  }
  return base
}

// ── What needs somebody today ─────────────────────────────────────────

/**
 * The next move for each reason code.
 *
 * Keyed by the closed list in `verdict.ts` rather than typed beside the
 * row, so a refusal on this screen is a sentence and the thing counted
 * behind it is still a code. Every code in that list has an entry here
 * and a test fails when one is added without one.
 */
export const DO_THIS: Record<string, string> = {
  MSA_ENDED:
    'Record the agreement that replaces it, and move anybody still working on to it.',
  MSA_EXPIRED: 'Renew it, or record the agreement that replaces it.',
  MSA_UNSIGNED: 'Get both sides to sign, then record each signature here.',
  MSA_AWAITING_SIGNATURE: 'Chase the counter-signature, then record it here.',
  SOW_MISSING: 'Write what the work is on the engagement, then get it signed.',
  MSA_LAPSING: 'Start the renewal now, so nothing is written under lapsed paper.',
  MARGIN_FLOOR: 'Reprice it, or get the exception approved by whoever owns the floor.',
  CAPACITY_EXCEEDED: 'Raise the cap on the agreement, or take somebody off it.',
  SOW_UNSIGNED: 'Get the statement of work signed.',
  MARGIN_UNKNOWN: 'Record what we pay on the buy contract, so the floor can be checked.',
  MSA_NO_TERM: 'Record the start and end dates from the executed copy.',
}

export interface Task {
  agreementId: string
  counterparty: string
  /** The reason code. Never free text — a text box collects nothing. */
  code: string
  /** The fact, as the API worded it. */
  says: string
  /** The next move. */
  doThis: string
  urgent: boolean
}

/**
 * Worst first, and the order is the same one the API sorts findings by.
 *
 * `AGREEMENT_REASONS` is already in that order, so the screen does not
 * keep a second copy that can drift out of step with the first.
 */
function rankOf(code: string): number {
  const at = AGREEMENT_REASONS.findIndex((r) => r.code === code)
  return at === -1 ? AGREEMENT_REASONS.length : at
}

/** The label for a code, for the chip on the queue row. */
export function reasonLabel(code: string): string {
  return AGREEMENT_REASONS.find((r) => r.code === code)?.label ?? code
}

/**
 * The queue: what needs a person, across every agreement.
 *
 * A WARN is somebody should act. A NOTE is a fact worth surfacing that
 * nobody has done anything wrong about — an unsigned agreement with
 * nobody placed under it is an ordinary negotiation — so notes stay on
 * the row and off the queue, with one exception: an agreement inside its
 * own notice period. Nothing is going wrong on site there either, and
 * the decision still has a last day.
 */
export function tasks(agreements: StandingInput[]): Task[] {
  const out: Task[] = []

  for (const a of agreements) {
    const pressing = insideNoticePeriod(a)
    for (const f of a.findings) {
      const urgent = f.severity === 'WARN'
      if (!urgent && !(pressing && f.code === 'MSA_LAPSING')) continue
      out.push({
        agreementId: a.id,
        counterparty: a.counterparty.name,
        code: f.code,
        says: f.says,
        doThis: DO_THIS[f.code] ?? 'Open the agreement and see what is missing.',
        urgent,
      })
    }
  }

  return out.sort((x, y) => {
    if (x.urgent !== y.urgent) return x.urgent ? -1 : 1
    return rankOf(x.code) - rankOf(y.code)
  })
}

/**
 * The sentence at the top of the screen, about the reader.
 *
 * The client dashboard opens this way and this follows it: a person
 * should know whether this screen wants anything from them before they
 * read a single row.
 */
export function headline(list: Task[]): string {
  if (list.length === 0) return 'Nothing needs you today.'
  const urgent = list.filter((t) => t.urgent).length
  const first = `${plural(list.length, 'thing needs', 'things need')} you.`
  if (urgent === 0) return first
  return `${first} ${urgent} ${urgent === 1 ? 'is' : 'are'} urgent.`
}

/** What to do first, on a screen with nothing on it yet. */
export function emptySays(role: 'VENDOR' | 'CLIENT' | null): {
  message: string
  detail: string
} {
  if (role === 'CLIENT') {
    return {
      message: 'No agreements on file yet.',
      detail:
        'An agreement appears here the first time a supplier is awarded a seat. ' +
        'To get ahead of it, run a supplier through Suppliers and record the ' +
        'master agreement when it is signed.',
    }
  }
  return {
    message: 'No agreements on file yet.',
    detail:
      'An agreement is the answer to “are we allowed to trade at all”, and one ' +
      'appears here the first time somebody is awarded a seat at a client. If you ' +
      'already trade on paper signed off-platform, record it here so the term, the ' +
      'signatures and the payment days are somewhere other than an inbox.',
  }
}

// ── The terms, as lines a person reads ────────────────────────────────

export interface TermLine {
  label: string
  value: string
}

/**
 * A set of terms as label and value pairs, in the trade's words.
 *
 * Used by the term panel and by the amendment trail, so "what were the
 * payment days on 3 March" is answered in the same words on both — and
 * so the trail is history a person reads rather than a dump of columns.
 *
 * The margin floor is the selling firm's own pricing policy. It is left
 * out on the client's side here as well as in the API, because a value
 * that crosses on one screen has crossed.
 */
export function termLines(
  terms: {
    paymentTermsDays?: number
    paymentTerms?: number
    paymentTermsSays?: string
    currency: string
    minMarginPct: number | null
    capacity: number | null
    effectiveDate: string | null
    expiresAt: string | null
    renewalKind: string
    renewalMonths: number | null
    noticeDays: number | null
    disclosesSubVendors?: boolean | null
  },
  role: 'VENDOR' | 'CLIENT'
): TermLine[] {
  const days = terms.paymentTermsDays ?? terms.paymentTerms ?? 0
  const lines: TermLine[] = [
    { label: 'Payment days', value: days <= 0 ? 'Due on receipt' : `Net ${days}` },
    { label: 'Currency', value: terms.currency },
    { label: 'Starts', value: onDay(terms.effectiveDate) ?? 'Not recorded' },
    { label: 'Runs to', value: onDay(terms.expiresAt) ?? 'No end date on file' },
    { label: 'Renews', value: renewalSays(terms.renewalKind, terms.renewalMonths) },
    {
      label: 'Notice',
      value:
        terms.noticeDays == null
          ? 'Nothing on file'
          : `${plural(terms.noticeDays, 'day', 'days')}`,
    },
    {
      label: 'People allowed',
      value: terms.capacity == null ? 'Uncapped' : String(terms.capacity),
    },
  ]

  // Who the client is entitled to be told about. Both sides read this
  // one — unlike the margin floor, which is the supplier's alone — because
  // the client is the party that demands disclosure at signing and should
  // be able to see on the screen whether it was granted.
  //
  // An older amendment snapshot that predates the term carries no answer
  // at all, and the line is left off rather than printed as "Ours to
  // keep", which would be this morning's default passed off as March's
  // agreement.
  if (terms.disclosesSubVendors != null) {
    lines.push({
      label: 'Sub-vendor names',
      value: disclosureValue(terms.disclosesSubVendors, role),
    })
  }

  if (role === 'VENDOR') {
    lines.push({
      label: 'Margin floor',
      value: terms.minMarginPct == null ? 'None set' : `${terms.minMarginPct}%`,
    })
  }

  return lines
}

/** The disclosure term as a value on the terms grid, from where you sit. */
function disclosureValue(discloses: boolean, role: 'VENDOR' | 'CLIENT'): string {
  if (role === 'CLIENT') return discloses ? 'Named to us' : 'Not named to us'
  return discloses ? 'Named to this client' : 'Ours to keep'
}

// ── Who gets named ────────────────────────────────────────────────────

/**
 * The one control on this screen for a decision that is otherwise only
 * reachable through the API.
 *
 * The rule it sets: a sub-vendor's name is the prime's to keep, so a
 * client sees the rung it pays and "Supplied through Computer Systems"
 * below it — unless its agreement with the prime requires disclosure, in
 * which case it sees the sub by name. Off by default, because the NDA
 * between a prime and its sub is what stops the sub going round the
 * prime, and nothing the platform does grants what the paper did not.
 *
 * Recording is not granting. Ticking this box writes down what the two
 * firms agreed; it goes on the version trail with a reason like every
 * other term, so "were we entitled to that name in March" is answered
 * from the trail rather than from today's row.
 */
export interface DisclosureControl {
  /** The checkbox's own words, from the side of the deal reading it. */
  label: string
  /** Whether the agreement as it stands names sub-vendors to the client. */
  checked: boolean
  /** What that means, in a sentence, under the control. */
  says: string
  /** Whether this reader may amend it. */
  editable: boolean
  /** If they may not, why — never a disabled box with no words. */
  whyNot: string | null
}

export function disclosureControl(
  terms: { disclosesSubVendors?: boolean | null; disclosureSays?: string | null },
  role: 'VENDOR' | 'CLIENT',
  status: string,
  counterpartyName: string
): DisclosureControl {
  const checked = terms.disclosesSubVendors === true
  const says =
    terms.disclosureSays ??
    (checked
      ? 'Sub-vendors are named to the client.'
      : 'Sub-vendors are the supplier\u2019s own; the client sees their standing, not their names.')

  const label =
    role === 'VENDOR'
      ? 'Name our sub-vendors to this client'
      : `${counterpartyName} names its sub-vendors to us`

  if (role === 'CLIENT') {
    return {
      label,
      checked,
      says,
      editable: false,
      whyNot:
        `These are ${counterpartyName}\u2019s terms to record. You read them here; they change ` +
        `them. If your agreement says you are entitled to the names of the firms behind the ` +
        `people on your sites and this says otherwise, ask them to amend it.`,
    }
  }

  const amendable = status !== 'TERMINATED'
  return {
    label,
    checked,
    says,
    editable: amendable,
    whyNot: amendable
      ? null
      : 'This agreement was ended, so its terms are history. Who was named under it stays ' +
        'what it was on the day.',
  }
}

// ── What the amendment form sends ─────────────────────────────────────

/** The form as a person filled it in — every field a string or a tick. */
export interface AmendmentForm {
  paymentTermsDays: string
  marginFloor: string
  capacity: string
  starts: string
  ends: string
  renewalKind: string
  renewalMonths: string
  noticeDays: string
  disclosesSubVendors: boolean
  reason: string
}

/**
 * The body of `PATCH /api/program/agreements/:id`, built from the form.
 *
 * Pure, and out here rather than inside the component, so what the screen
 * actually sends can be read by a test that calls it instead of by a
 * regex over JSX. Two things it deliberately does:
 *
 * - **No `signedAt`.** A signature is two named people with titles,
 *   recorded on the Signing panel. The route refuses a bare date for
 *   exactly that reason, and the old form sent one on every save, so
 *   every amendment failed and nobody knew.
 * - **`disclosesSubVendors` goes with the rest.** A change to who gets
 *   named is an amendment, not a setting, so it travels the same path,
 *   carries the same reason, and lands on the same version trail.
 */
export function amendmentBody(form: AmendmentForm): Record<string, unknown> {
  const blank = (v: string) => v.trim() === ''
  return {
    paymentTerms: Number(form.paymentTermsDays),
    minMarginPct: blank(form.marginFloor) ? null : Number(form.marginFloor),
    capacity: blank(form.capacity) ? null : Number(form.capacity),
    effectiveDate: blank(form.starts) ? null : form.starts,
    expiresAt: blank(form.ends) ? null : form.ends,
    renewalKind: form.renewalKind,
    renewalMonths: blank(form.renewalMonths) ? null : Number(form.renewalMonths),
    noticeDays: blank(form.noticeDays) ? null : Number(form.noticeDays),
    disclosesSubVendors: form.disclosesSubVendors,
    reason: blank(form.reason) ? undefined : form.reason.trim(),
  }
}

/** How an agreement renews, said. */
export function renewalSays(kind: string, months: number | null): string {
  switch (kind) {
    case 'EVERGREEN':
      return 'Rolls on until somebody ends it'
    case 'AUTO_RENEW':
      return months
        ? `Renews itself for another ${plural(months, 'month', 'months')}`
        : 'Renews itself, though nothing says for how long'
    case 'FIXED':
      return 'Runs to its end date and stops'
    default:
      return kind
  }
}

/** The three ways an agreement renews, for the picker. */
export const RENEWAL_CHOICES: { value: string; label: string; hint: string }[] = [
  { value: 'FIXED', label: 'Runs to a date and stops', hint: 'The common one. It ends on the day it says.' },
  { value: 'EVERGREEN', label: 'Rolls on with no end date', hint: 'It continues until one side gives notice.' },
  { value: 'AUTO_RENEW', label: 'Renews itself', hint: 'It rolls for a further term unless somebody gives notice.' },
]

export const SIGNING_CHOICES: { value: string; label: string }[] = [
  { value: 'WET_INK', label: 'Wet ink' },
  { value: 'ELECTRONIC', label: 'Electronically' },
  { value: 'COUNTERPART', label: 'In counterparts' },
]

// ── The amendment trail ───────────────────────────────────────────────

export interface AmendmentRow {
  version: number
  action: string
  changed: string[]
  reason: string | null
  changedAt: string
  changedBy: { id: string; name: string } | null
  says: string
  terms: {
    paymentTermsDays: number
    currency: string
    minMarginPct: number | null
    capacity: number | null
    effectiveDate: string | null
    expiresAt: string | null
    renewalKind: string
    renewalMonths: number | null
    noticeDays: number | null
  }
}

/**
 * The line above an entry in the trail — what happened, and when.
 *
 * The API already words the "what"; this puts the day on it, because an
 * amendment trail whose entries have no dates answers neither of the two
 * questions anybody asks it.
 */
export function amendmentHeading(v: AmendmentRow): string {
  const when = onDay(v.changedAt)
  return when ? `${when} — ${v.says}` : v.says
}

/** The filters this list offers, and what each asks. */
export const FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: 'Everyone' },
  { key: 'needs', label: 'Needs you' },
  { key: 'running-out', label: 'Running out' },
  { key: 'unsigned', label: 'Not executed' },
  { key: 'ended', label: 'Ended or lapsed' },
]

/** Whether a row answers the filter. One question per key, and no others. */
export function matchesFilter(a: StandingInput, key: string): boolean {
  switch (key) {
    case 'needs':
      return a.findings.some((f) => f.severity === 'WARN') || insideNoticePeriod(a)
    case 'running-out':
      return readStanding(a).word === 'Running out' || insideNoticePeriod(a)
    case 'unsigned':
      return readSigning(a).state !== 'BOTH'
    case 'ended':
      return a.status === 'TERMINATED' || readStanding(a).word === 'Lapsed'
    default:
      return true
  }
}
