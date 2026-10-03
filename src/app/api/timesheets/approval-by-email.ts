/**
 * A client approves a week without signing in: by a link, or by evidence.
 *
 * The founder, 2026-09-30 (CLAUDE.md, "A client may approve by email, and
 * the proof travels down the chain"). Two ways a week is approved at the
 * top without the client signing in:
 *
 *   - **Approve by email.** A one-time link to the client's approver, with
 *     Approve and Send back, no account. It is recorded as their signature,
 *     with their name, their address and the time.
 *   - **Evidence attached.** The client's approval email, a PDF, or an
 *     export from the client's own system, with the approver's name and
 *     address. Always a named person behind it; evidence without both is
 *     refused. The worker, on their own week, or the supplier's timesheet
 *     desk may attach it, and nobody else.
 *
 * Whoever sends the link or attaches the evidence picks which contracts in
 * the chain it applies to, all of them by default. Once the top approval
 * stands, each lower rung accepts the same week in turn, exactly as before
 * (`chain-turn.ts`). Nothing here signs for a lower rung.
 *
 * Pure. No database, no clock of its own: the route reads the rows and
 * passes `now`. What the route needs from the schema is not there yet —
 * see the `WeekApproval` request in the matrix row L3.3.2.1 — so today
 * these rules are the whole of it, tested, and nothing calls them.
 */
import type { LadderRung, Signer } from './chain-turn'
import { askTheDesk, hasPermission } from '@/lib/permissions'

// ── The link ──────────────────────────────────────────────────────────

/**
 * How long a link lasts.
 *
 * Seven days, because that is the widest window a company may give its
 * approvers: by default a week is approved by the Wednesday after it is
 * due, and a company may add at most one more week (CLAUDE.md, "When a
 * Sunday-to-Saturday week is due"). A link that outlived that window
 * would let a week be signed later than any company is allowed to set.
 */
export const LINK_LIFETIME_DAYS = 7

const DAY_MS = 86_400_000

export function linkExpiresAt(sentAt: Date): Date {
  return new Date(sentAt.getTime() + LINK_LIFETIME_DAYS * DAY_MS)
}

export type LinkOutcome = 'APPROVED' | 'SENT_BACK'

export interface LinkRow {
  sentAt: Date
  expiresAt: Date
  usedAt: Date | null
  outcome: LinkOutcome | null
  approverName: string
}

export interface WeekNow {
  /** OPEN · SUBMITTED · APPROVED · REJECTED */
  status: string
  submittedAt: Date | null
  clientApprovedAt: Date | null
  /** Whose hours, by name, for the sentence. */
  personName: string
}

export interface LinkNames {
  /** The client whose approval this is. */
  clientName: string
  /** The firm that sent the link, which is who to ask for a new one. */
  senderFirm: string
}

export type LinkVerdict =
  | { open: true }
  | { open: false; code: 'USED' | 'SENT_BACK' | 'APPROVED_ELSEWHERE' | 'FILED_AGAIN' | 'NOT_WAITING' | 'EXPIRED'; says: string }

/**
 * Whether a link may still be used, and if not, why, in a sentence.
 *
 * Order matters, because more than one can be true at once and the reader
 * deserves the most useful one: what this link already did comes first,
 * then what happened to the week, and only then the date on the link.
 */
export function linkVerdict(link: LinkRow, week: WeekNow, now: Date, names: LinkNames): LinkVerdict {
  if (link.usedAt && link.outcome === 'APPROVED') {
    return {
      open: false, code: 'USED',
      says: `${link.approverName} approved this week on ${dayOf(link.usedAt, now)}. Nothing else is needed here.`,
    }
  }
  if (link.usedAt && link.outcome === 'SENT_BACK') {
    return {
      open: false, code: 'SENT_BACK',
      says:
        `This week was sent back on ${dayOf(link.usedAt, now)}. ` +
        `If ${week.personName} files it again, a new link comes with it.`,
    }
  }
  if (week.clientApprovedAt || week.status === 'APPROVED') {
    return {
      open: false, code: 'APPROVED_ELSEWHERE',
      says: `${names.clientName} has already approved this week, so this link is no longer needed.`,
    }
  }
  if (week.submittedAt && week.submittedAt.getTime() > link.sentAt.getTime()) {
    return {
      open: false, code: 'FILED_AGAIN',
      says:
        `${week.personName} sent this week again after this link was made, so it may not show what ` +
        `was filed. Ask ${names.senderFirm} for a new link.`,
    }
  }
  if (week.status !== 'SUBMITTED') {
    return {
      open: false, code: 'NOT_WAITING',
      says: `This week is not waiting for approval now. ${week.personName} has it back to correct.`,
    }
  }
  if (now.getTime() >= link.expiresAt.getTime()) {
    return {
      open: false, code: 'EXPIRED',
      says: `This link ran out on ${dayOf(link.expiresAt, now)}. Ask ${names.senderFirm} for a new one.`,
    }
  }
  return { open: true }
}

// ── Sending a week back ───────────────────────────────────────────────

/**
 * Why an approver sends a week back, from a closed list.
 *
 * A reason code and not a text box: the reasons are the data. A note may
 * ride beside the code, and is required only where the code is OTHER,
 * because "something else" with nothing said is no reason at all.
 */
export const SEND_BACK_REASONS = {
  HOURS_WRONG: 'The hours are not right',
  DAYS_WRONG: 'Hours are on the wrong days',
  NOT_FOR_US: 'This work was not done for us',
  NEEDS_DETAIL: 'We need more detail before we approve',
  OTHER: 'Something else',
} as const

export type SendBackCode = keyof typeof SEND_BACK_REASONS

export function checkSendBack(input: { code?: unknown; note?: unknown }):
  | { ok: true; code: SendBackCode; note: string | null; says: string }
  | { ok: false; says: string } {
  const code = typeof input.code === 'string' && input.code in SEND_BACK_REASONS ? (input.code as SendBackCode) : null
  const note = typeof input.note === 'string' && input.note.trim() ? input.note.trim() : null
  if (!code) {
    return { ok: false, says: 'Pick why you are sending it back, so the worker knows what to fix.' }
  }
  if (code === 'OTHER' && !note) {
    return { ok: false, says: 'Say in a line what is wrong, so the worker knows what to fix.' }
  }
  return { ok: true, code, note, says: note ? `${SEND_BACK_REASONS[code]}: ${note}` : SEND_BACK_REASONS[code] }
}

// ── Evidence ──────────────────────────────────────────────────────────

export type EvidenceKind = 'EMAIL' | 'PDF' | 'EXPORT'

export const EVIDENCE_KINDS: Record<EvidenceKind, string> = {
  EMAIL: 'The approval email',
  PDF: 'A PDF',
  EXPORT: 'An export from their own system',
}

/**
 * What an approval can arrive as.
 *
 * Wider than the document door's list on purpose: an approval is often a
 * saved email (.eml, .msg) or a spreadsheet exported from the client's
 * own time system, and neither is a document a compliance desk collects.
 * Still only files a reader can open without installing anything unusual.
 */
/**
 * Ten megabytes, the same limit the document door sets, and for its
 * reason: a phone photograph of a page is commonly six to eight. Not
 * imported from `lib/document-request`, which reaches the database, and
 * this file must not.
 */
export const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024

function sizeSaid(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${Math.round((bytes / 1024 / 1024) * 10) / 10}MB`
  return `${Math.max(1, Math.round(bytes / 1024))}KB`
}

const EVIDENCE_EXTENSIONS: Record<string, string> = {
  pdf: 'PDF', eml: 'saved email', msg: 'saved email', txt: 'text file',
  png: 'image', jpg: 'image', jpeg: 'image', heic: 'image', webp: 'image',
  csv: 'spreadsheet', xlsx: 'spreadsheet', xls: 'spreadsheet',
}

export interface EvidenceInput {
  approverName?: unknown
  approverEmail?: unknown
  kind?: unknown
  /** The day the approver said yes. Defaults to today. */
  approvedOn?: Date | null
  file?: { name: string; size: number } | null
  /** An approval email pasted as text, where there is no file to attach. */
  pastedText?: unknown
}

export type EvidenceVerdict =
  | {
      ok: true
      approverName: string
      approverEmail: string
      kind: EvidenceKind
      approvedOn: Date
      /** What was attached, for the row: "PDF, 120KB." or "pasted email text." */
      says: string
    }
  | { ok: false; field: string; says: string }

/**
 * Whether evidence of a client's approval may be recorded.
 *
 * Checked before anything is written. The order is the order a person
 * fills the form in, so the first refusal is the first thing to fix.
 */
export function checkEvidence(
  input: EvidenceInput,
  week: { periodEnd: Date },
  now: Date,
  clientName: string
): EvidenceVerdict {
  const name = typeof input.approverName === 'string' ? input.approverName.trim() : ''
  const email = typeof input.approverEmail === 'string' ? input.approverEmail.trim().toLowerCase() : ''

  if (!name && !email) {
    return {
      ok: false, field: 'approverName',
      says:
        `Name the person at ${clientName} who approved this week, and give their email address. ` +
        'An approval nobody can be traced to is not an approval.',
    }
  }
  if (!name) {
    return { ok: false, field: 'approverName', says: `Name the person at ${clientName} who approved this week.` }
  }
  if (!email) {
    return {
      ok: false, field: 'approverEmail',
      says: `Give ${name}’s email address, so anybody reading this can see who said yes.`,
    }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return {
      ok: false, field: 'approverEmail',
      says: `${email} is not an email address. Give the address the approval came from.`,
    }
  }

  const kind = typeof input.kind === 'string' && input.kind in EVIDENCE_KINDS ? (input.kind as EvidenceKind) : null
  if (!kind) {
    return {
      ok: false, field: 'kind',
      says: `Say what it is: the approval email, a PDF, or an export from ${clientName}’s own system.`,
    }
  }

  const approvedOn = input.approvedOn ?? now
  if (dayKey(approvedOn) < dayKey(week.periodEnd)) {
    return {
      ok: false, field: 'approvedOn',
      says: `That day is before the week ended. Nobody can approve hours before they are worked.`,
    }
  }
  if (dayKey(approvedOn) > dayKey(now)) {
    return { ok: false, field: 'approvedOn', says: 'That day has not happened yet. Give the day the approval was sent.' }
  }

  const pasted = typeof input.pastedText === 'string' ? input.pastedText.trim() : ''
  if (!input.file && !pasted) {
    return {
      ok: false, field: 'file',
      says: `Attach the approval — the email itself, a PDF, or an export from ${clientName}’s own system.`,
    }
  }
  if (input.file) {
    if (!input.file.size) {
      return { ok: false, field: 'file', says: 'That file is empty. Pick it again.' }
    }
    if (input.file.size > MAX_EVIDENCE_BYTES) {
      return {
        ok: false, field: 'file',
        says: `That is ${sizeSaid(input.file.size)} and ten megabytes is the limit. Save the page with the approval on its own.`,
      }
    }
    const ext = (input.file.name.toLowerCase().split('.').pop() ?? '').trim()
    const what = EVIDENCE_EXTENSIONS[ext]
    if (!what) {
      return {
        ok: false, field: 'file',
        says: 'A saved email, a PDF, an image, or a spreadsheet. Every firm this reaches has to be able to open it.',
      }
    }
    return { ok: true, approverName: name, approverEmail: email, kind, approvedOn, says: `${what}, ${sizeSaid(input.file.size)}.` }
  }
  return { ok: true, approverName: name, approverEmail: email, kind, approvedOn, says: 'pasted email text.' }
}

// ── Who may send a link or attach evidence ────────────────────────────

export interface Actor {
  personId: string
  companyId: string | null
  permissions: readonly string[]
  companyKind?: string | null
  companyName?: string | null
}

export type ActorVerdict =
  | { ok: true; as: 'WORKER' | 'SUPPLIER_DESK' }
  | { ok: false; says: string }

/** The client on a ladder: whoever buys on the top rung. */
export function clientOf(ladderTopDown: LadderRung[]): string | null {
  const top = ladderTopDown[0]
  return top ? top.endClientCompanyId ?? top.clientCompanyId : null
}

/**
 * Whether this person may send the link or attach the evidence.
 *
 * The worker on their own week, or the desk that accepts hours at a
 * supplier on this week's chain. Not the client's own desk: a client
 * that is here approves in Etyme, and evidence is for an approval given
 * outside it. Nobody else at all.
 */
export function mayActForTheClient(
  a: Actor,
  week: { personId: string; personName: string },
  ladderTopDown: LadderRung[],
  clientName: string
): ActorVerdict {
  if (a.personId === week.personId) return { ok: true, as: 'WORKER' }

  const client = clientOf(ladderTopDown)
  if (a.companyId && a.companyId === client) {
    return {
      ok: false,
      says: `${clientName} approves this week in Etyme itself. Evidence is for an approval given outside it.`,
    }
  }

  const suppliers = new Set(ladderTopDown.map((r) => r.companyId))
  if (a.companyId && suppliers.has(a.companyId)) {
    if (hasPermission(a.permissions, 'timesheets.approve')) return { ok: true, as: 'SUPPLIER_DESK' }
    return {
      ok: false,
      says: askTheDesk({
        doing: 'Attaching a client’s approval',
        needs: 'timesheets.approve',
        kind: a.companyKind ?? null,
        companyName: a.companyName ?? null,
      }),
    }
  }

  return {
    ok: false,
    says: `Only ${week.personName}, or the timesheet desk at a supplier on this placement, can attach the client’s approval.`,
  }
}

// ── Which contracts it applies to ─────────────────────────────────────

export type ScopeVerdict = { ok: true; contracts: string[] } | { ok: false; says: string }

/**
 * The contracts the approval applies to. All of them unless fewer are
 * picked, and always the client's own, because that is the contract the
 * client's signature is given on.
 */
export function scopeFor(requested: readonly string[] | null | undefined, ladderTopDown: LadderRung[], clientName: string): ScopeVerdict {
  const all = ladderTopDown.map((r) => r.sellContractId)
  if (requested == null) return { ok: true, contracts: all }
  const picked = [...new Set(requested)]
  if (picked.length === 0) {
    return { ok: false, says: 'Pick the contracts this approval applies to. All of them is the usual answer.' }
  }
  if (picked.some((id) => !all.includes(id))) {
    return { ok: false, says: 'One of the contracts picked is not on this week’s chain. Pick from the list.' }
  }
  if (all.length > 0 && !picked.includes(all[0])) {
    return {
      ok: false,
      says: `The approval is given on ${clientName}’s own contract, so that one has to be included.`,
    }
  }
  // Kept in the chain's own order, top first, whatever order they were picked in.
  return { ok: true, contracts: all.filter((id) => picked.includes(id)) }
}

// ── Who may read the evidence ─────────────────────────────────────────

/**
 * A firm's contracts in the scope: the ones it sells on or buys on.
 *
 * The end client counts as a party on the top rung only. A lower rung
 * names the end client as the site the work is done at, and the client
 * is not a party to it — reading it as one handed the client the
 * sub-vendor's contract, which is the prime's to keep.
 */
export function ownRungsInScope(companyId: string | null, scope: readonly string[], ladderTopDown: LadderRung[]): string[] {
  if (!companyId) return []
  const top = ladderTopDown[0]
  return ladderTopDown
    .filter((r) =>
      r.companyId === companyId ||
      r.clientCompanyId === companyId ||
      (r === top && r.endClientCompanyId === companyId))
    .filter((r) => scope.includes(r.sellContractId))
    .map((r) => r.sellContractId)
}

export type ReadVerdict = { ok: true; contracts: string[] } | { ok: false; says: string }

/**
 * Whether this reader may see the evidence, and which of the contracts
 * it applies to they are shown: their own, never another rung's. A
 * client reading its own approval does not learn a sub-vendor's contract
 * is under it (CLAUDE.md, "A sub-vendor's name is the prime's to keep").
 */
export function mayReadEvidence(
  reader: { personId: string; companyId: string | null },
  week: { personId: string },
  scope: readonly string[],
  ladderTopDown: LadderRung[]
): ReadVerdict {
  if (reader.personId === week.personId) {
    // The worker knows the complete chain (CLAUDE.md, 2026-09-28).
    return { ok: true, contracts: [...scope] }
  }
  const mine = ownRungsInScope(reader.companyId, scope, ladderTopDown)
  if (mine.length === 0) {
    return { ok: false, says: 'This approval was not attached to a contract your company is on.' }
  }
  return { ok: true, contracts: mine }
}

/**
 * The access log row for one read, allowed or refused. Every read of the
 * evidence writes one: it names a person, their week and their client.
 */
export function evidenceReadLog(
  reader: { personId: string; companyId: string | null },
  week: { personId: string },
  verdict: ReadVerdict
): { subjectId: string; actorPersonId: string; actorCompanyId: string | null; action: string; allowed: boolean; reason: string | null } {
  return {
    subjectId: week.personId,
    actorPersonId: reader.personId,
    actorCompanyId: reader.companyId,
    action: 'APPROVAL_EVIDENCE_VIEW',
    allowed: verdict.ok,
    reason: verdict.ok ? null : verdict.says,
  }
}

// ── What a screen says ────────────────────────────────────────────────

/**
 * How a week approved this way reads, on every screen.
 *
 * "Approved by email", never that the client signed in Etyme — because it
 * did not, and a reader deciding whether to pay on it deserves to know.
 */
export function approvedByWords(i: { approverName: string; on: Date; how: 'LINK' | 'EVIDENCE'; now: Date }): string {
  const base = `Approved by email: ${i.approverName}, ${dayOf(i.on, i.now)}`
  return i.how === 'EVIDENCE' ? `${base} — evidence attached` : base
}

/**
 * Who asked for the letter, as the client's approver may be told it.
 *
 * NAMED: the worker, or a person at the firm the client pays — named, with
 * their firm. BELOW: a desk at a firm under that one. The client sees the
 * rung it pays and nothing below it (CLAUDE.md, "A sub-vendor's name is the
 * prime's to keep"), so the letter names neither the person nor the firm,
 * nor says that there is a firm below at all. It names the one firm the
 * client already deals with, as the place to ask.
 */
export type SentFrom =
  | { kind: 'NAMED'; name: string; firm: string }
  | { kind: 'BELOW'; askFirm: string }

/**
 * The sender as `senderAsTheClientSees` (lib/week-approval) hands it over
 * today: a name and a firm, where a desk below the client's supplier comes
 * as "The timesheet desk" at "<supplier>’s side of this placement". Read
 * back into the two cases so the letter can say each plainly. Once that
 * function passes `sentFrom` itself, this reading is no longer needed.
 */
const BELOW_SUFFIX = '’s side of this placement'
export function sentFromOf(senderName: string, senderFirm: string): SentFrom {
  if (senderName === 'The timesheet desk' && senderFirm.endsWith(BELOW_SUFFIX)) {
    return { kind: 'BELOW', askFirm: senderFirm.slice(0, -BELOW_SUFFIX.length) }
  }
  return { kind: 'NAMED', name: senderName, firm: senderFirm }
}

/** The one sentence in the letter that says who asked for it. */
export function whoAskedSentence(from: SentFrom, personName: string): string {
  return from.kind === 'NAMED'
    ? `${from.name} at ${from.firm} asked us to send you the week to approve.`
    : `${personName}’s supplier asked us to send you the week to approve. If anything in it looks wrong, ask ${from.askFirm}.`
}

/**
 * The letter to the client's approver.
 *
 * Hours and days only, and never a rate: the approver is saying the work
 * happened, and what each firm pays for it is on each firm's own contract.
 */
export function letterToApprover(i: {
  approverName: string
  personName: string
  clientName: string
  senderName: string
  senderFirm: string
  /** Who asked, where the caller knows; otherwise read from the two names. */
  sentFrom?: SentFrom
  period: string
  hours: number
  url: string
  expiresAt: Date
  now: Date
}): { subject: string; body: string } {
  const hello = i.approverName.trim() ? `${i.approverName.trim().split(' ')[0]},` : 'Hello,'
  const from = i.sentFrom ?? sentFromOf(i.senderName, i.senderFirm)
  return {
    subject: `${i.personName}’s hours for ${i.period}: approve or send back`,
    body:
      `${hello}\n\n` +
      `${i.personName} worked ${i.hours} hours for ${i.clientName} in the week ${i.period}. ` +
      `${whoAskedSentence(from, i.personName)}\n\n` +
      `Open it here, then press Approve or Send back. You do not need an account:\n\n${i.url}\n\n` +
      `The link works once and runs out on ${dayOf(i.expiresAt, i.now)}. ` +
      `Your answer is recorded with your name, this address and the time.`,
  }
}

/**
 * The access log row for a list that shows an approval's sentence.
 *
 * The sentence names who approved a person's week, so reading it is a read
 * of that week, as opening the evidence is, and it is logged by the same
 * rule: allowed where the approval applies to a contract the reader is on,
 * refused — and still written — where it does not.
 */
export function approvalWordsReadLog(
  reader: { personId: string; companyId: string | null },
  week: { personId: string },
  shown: boolean
): { subjectId: string; actorPersonId: string; actorCompanyId: string | null; action: string; allowed: boolean; reason: string | null } {
  return {
    subjectId: week.personId,
    actorPersonId: reader.personId,
    actorCompanyId: reader.companyId,
    action: 'WEEK_APPROVAL_WORDS_VIEW',
    allowed: shown,
    reason: shown ? null : 'This approval was not attached to a contract your company is on.',
  }
}

/**
 * The signatures an approval by email writes: the client's, and nothing
 * else. Every rung below still accepts the week in its own turn — this is
 * the rule that keeps a lower rung from being accepted for it.
 */
export function signaturesWritten(signersTopDown: Signer[]): Signer[] {
  const top = signersTopDown[0]
  return top && top.role === 'CLIENT_APPROVAL' ? [top] : []
}

// ── Dates ─────────────────────────────────────────────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Oct 2", with the year only where it is not this year. UTC, as the dates are stored. */
export function dayOf(d: Date, now: Date): string {
  const s = `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`
  return d.getUTCFullYear() === now.getUTCFullYear() ? s : `${s}, ${d.getUTCFullYear()}`
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}
