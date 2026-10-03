/**
 * A client approves a week without signing in — the door.
 *
 * The founder, 2026-09-30 (CLAUDE.md, "A client may approve by email, and
 * the proof travels down the chain"). The rules are demand's, pure, in
 * `app/api/timesheets/approval-by-email.ts`; this file reads and writes the
 * rows they decide about (`WeekApproval`, `WeekApprovalContract`,
 * `WeekApprovalFile`) and nothing else decides anything here.
 *
 * Four things happen through it:
 *
 *   send     the worker on their own week, or a supplier's timesheet desk
 *            on the chain, sends a one-time link to the client's approver
 *   attach   the same people attach evidence of an approval the client
 *            gave by email, naming the approver
 *   answer   the approver opens the link with no account and presses
 *            Approve or Send back
 *   read     every rung the approval applies to reads it and its evidence,
 *            only its own contracts in it, and every read is logged
 *
 * What an approval writes is the client's signature and nothing else: a
 * CLIENT_APPROVAL assertion with no `byId`, because the approver holds no
 * seat here, and the `WeekApproval` row is what says who it was. Every rung
 * below then accepts the week in its own turn through the approve route,
 * exactly as before. Nothing here accepts for a lower rung.
 */
import { createHash, randomBytes } from 'node:crypto'
import { prisma } from '@/lib/db'
import { notify } from '@/lib/notify'
import { attemptDelivery, routeFor } from '@/lib/notification-delivery'
import { postAssertion } from '@/lib/order-postings'
import { reportError } from '@/lib/alerts'
import { seatFor, actingInSeat, seatTrail } from '@/lib/program-seat'
import type { CallerContext } from '@/lib/api-context'
import { configuredSenders } from '@/lib/senders'
import { baseUrl } from '@/lib/signed-link'
import { weekFlag } from '@/lib/timesheet-flag'
import { lineFor, splitWeeks, weeksAwaitingDecision, type Decision, type Treatment } from '@/lib/overtime'
import { ladderAbove } from '@/app/api/timesheets/ladder'
import { topDown, signersOf, tellNext, type LadderRung, type Signer } from '@/app/api/timesheets/chain-turn'
import {
  linkExpiresAt, linkVerdict, checkSendBack, checkEvidence, mayActForTheClient, scopeFor,
  mayReadEvidence, evidenceReadLog, approvedByWords, letterToApprover, signaturesWritten, dayOf,
  whoAskedSentence,
  SEND_BACK_REASONS, EVIDENCE_KINDS, type EvidenceKind, type LinkOutcome, type ReadVerdict, type SentFrom,
} from '@/app/api/timesheets/approval-by-email'

// ── Results ───────────────────────────────────────────────────────────

/** A refusal in a sentence, with the status a route answers it with. */
export interface Refused {
  ok: false
  status: number
  code: string
  says: string
  field?: string
}

const refuse = (status: number, code: string, says: string, field?: string): Refused => ({ ok: false, status, code, says, ...(field ? { field } : {}) })

/** Who is asking: a person, at a company or at none (a worker with no seat). */
export interface Reader {
  personId: string
  personName: string
  companyId: string | null
  companyName?: string | null
  companyKind?: string | null
  permissions: readonly string[]
  /**
   * Set where a program office reads at a client's desk through a seat
   * the client granted. The reader then *is* the client for every rule
   * here, and the trail names the office, never the client, as the firm
   * that read: a log saying the client read its own records would hide
   * the one thing the client would ask about.
   */
  seat?: { officeCompanyId: string | null; trail: string }
}

// ── The token ─────────────────────────────────────────────────────────

/** Twenty-four random bytes, as every bearer token in this codebase. */
export function newLinkToken(): string {
  return randomBytes(24).toString('base64url')
}

/** Only the hash is stored. Whoever holds the token may sign for a client. */
export function hashLinkToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function approveWeekUrl(token: string): string | null {
  const base = baseUrl()
  return base ? `${base}/answer/week/${token}` : null
}

// ── The week, the chain above it, and the names on it ─────────────────

interface Rung {
  id: string
  companyId: string
  clientCompanyId: string
  endClientCompanyId: string | null
  sellerName: string
  buyerName: string
  billRate: number
  overtimeAfterHours: number | null
  overtimeMultiplierBps: number | null
}

export interface WeekChain {
  week: {
    id: string
    personId: string
    personName: string
    personEmail: string
    periodStart: Date
    periodEnd: Date
    totalHours: number
    days: Record<string, number>
    leaveDays: Record<string, number>
    status: string
    submittedAt: Date | null
    clientApprovedAt: Date | null
    employerAcceptedAt: Date | null
    sellContractId: string
    anomalyScore: number | null
    anomalyReason: string | null
    hoursPerWeek: number | null
    contractEnd: Date | null
    decisions: { sellContractId: string; weekOf: Date; treatment: string; appliedBps: number; overtimeHours: unknown; accrualBps: number }[]
  }
  /** Top first; the rung the hours are filed on last. */
  ladder: LadderRung[]
  rungs: Map<string, Rung>
  signers: Signer[]
  clientId: string
  clientName: string
  employerId: string
  names: Map<string, string>
}

/** Read one week and the chain above it. Null where there is no such week. */
export async function readWeekChain(timesheetId: string): Promise<WeekChain | null> {
  const t = await prisma.timesheet.findUnique({
    where: { id: timesheetId },
    select: {
      id: true, personId: true, periodStart: true, periodEnd: true, totalHours: true, days: true, leaveDays: true,
      status: true, submittedAt: true, clientApprovedAt: true, employerAcceptedAt: true, sellContractId: true,
      anomalyScore: true, anomalyReason: true,
      person: { select: { name: true, primaryEmail: true } },
      overtimeDecisions: {
        select: { sellContractId: true, weekOf: true, treatment: true, appliedBps: true, overtimeHours: true, accrualBps: true },
      },
      sellContract: {
        select: {
          id: true, companyId: true, clientCompanyId: true, endClientCompanyId: true, billRate: true,
          overtimeAfterHours: true, overtimeMultiplierBps: true, endDate: true,
          requirement: { select: { hoursPerWeek: true } },
          company: { select: { name: true } },
          clientCompany: { select: { name: true } },
        },
      },
    },
  })
  if (!t) return null

  const sc = t.sellContract
  const above = await ladderAbove(t.sellContractId, {
    sellContractId: sc.id,
    companyId: sc.companyId,
    clientCompanyId: sc.clientCompanyId,
    endClientCompanyId: sc.endClientCompanyId,
    supplierSellContractId: null,
  })
  const ladder = topDown(above.map((r) => r.rung))
  const signers = signersOf(ladder)

  const firmIds = new Set<string>()
  for (const r of ladder) {
    firmIds.add(r.companyId)
    firmIds.add(r.clientCompanyId)
    if (r.endClientCompanyId) firmIds.add(r.endClientCompanyId)
  }
  const names = new Map(
    (await prisma.company.findMany({ where: { id: { in: [...firmIds] } }, select: { id: true, name: true } })).map((c) => [c.id, c.name])
  )

  const rungs = new Map<string, Rung>()
  for (const r of ladder) {
    const c = above.find((a) => a.rung.sellContractId === r.sellContractId)?.contract
    rungs.set(r.sellContractId, {
      id: r.sellContractId,
      companyId: r.companyId,
      clientCompanyId: r.clientCompanyId,
      endClientCompanyId: r.endClientCompanyId ?? null,
      sellerName: names.get(r.companyId) ?? 'A supplier',
      buyerName: names.get(r.clientCompanyId) ?? 'A client',
      billRate: c ? c.billRate : sc.billRate,
      overtimeAfterHours: c ? c.overtimeAfterHours : sc.overtimeAfterHours,
      overtimeMultiplierBps: c ? c.overtimeMultiplierBps : sc.overtimeMultiplierBps,
    })
  }

  const top = ladder[0]
  const clientId = top.endClientCompanyId ?? top.clientCompanyId
  return {
    week: {
      id: t.id,
      personId: t.personId,
      personName: t.person.name,
      personEmail: t.person.primaryEmail,
      periodStart: t.periodStart,
      periodEnd: t.periodEnd,
      totalHours: Number(t.totalHours),
      days: (t.days as Record<string, number>) ?? {},
      leaveDays: (t.leaveDays as Record<string, number>) ?? {},
      status: t.status,
      submittedAt: t.submittedAt,
      clientApprovedAt: t.clientApprovedAt,
      employerAcceptedAt: t.employerAcceptedAt,
      sellContractId: t.sellContractId,
      anomalyScore: t.anomalyScore,
      anomalyReason: t.anomalyReason,
      hoursPerWeek: sc.requirement?.hoursPerWeek ?? null,
      contractEnd: sc.endDate,
      decisions: t.overtimeDecisions,
    },
    ladder,
    rungs,
    signers,
    clientId,
    clientName: names.get(clientId) ?? 'The client',
    employerId: sc.companyId,
    names,
  }
}

/** "Sep 20 – Sep 26", the way the letter and the page say a week. */
export function periodWords(start: Date, end: Date, now: Date): string {
  return `${dayOf(start, now)} – ${dayOf(end, now)}`
}

/**
 * Why this week cannot be approved by email, or null where it can.
 *
 * Two things only a person signing in Etyme can answer, because each asks
 * a question the email does not carry:
 *
 *   - a flagged week — over the job's hours, past the last day, or marked
 *     when filed — is signed with a reason (Addendum E: warn, capture a
 *     reason, proceed; never silently);
 *   - hours over the overtime line on the client's own contract wait for
 *     somebody to say what they are worth, priced on that contract.
 *
 * And a week whose employer is its own client has nobody outside to ask.
 */
export function needsSigningInEtyme(c: WeekChain): string | null {
  const w = c.week
  if (c.employerId === c.clientId) {
    return `${c.clientName} employs ${w.personName} and is also the client on this week, so it approves the week in Etyme.`
  }
  const flag = weekFlag({
    hours: w.totalHours,
    hoursPerWeek: w.hoursPerWeek,
    periodEnd: w.periodEnd,
    contractEnd: w.contractEnd,
    anomalyScore: w.anomalyScore,
    anomalyReason: w.anomalyReason,
  })
  if (flag) {
    return `${flag} A week like this is signed in Etyme by somebody at ${c.clientName}, with the reason it is right, so it cannot be approved by email.`
  }
  const top = c.rungs.get(c.ladder[0].sellContractId)!
  const policy = lineFor(top, { hoursPerWeek: w.hoursPerWeek }, { stillToSign: true, decided: false })
  const decisions: Decision[] = w.decisions
    .filter((d) => d.sellContractId === top.id)
    .map((d) => ({
      weekOf: d.weekOf.toISOString().slice(0, 10),
      treatment: d.treatment as Treatment,
      appliedBps: d.appliedBps,
      overtimeHours: Number(d.overtimeHours),
      accrualBps: d.accrualBps,
    }))
  const pending = weeksAwaitingDecision(splitWeeks(w.days, policy, { leaveDays: w.leaveDays, decisions }))
  if (pending.length > 0) {
    return (
      `${w.personName} worked past the ${policy.afterHours}-hour line this week, and what the extra hours are worth ` +
      `is decided when the week is signed. Somebody at ${c.clientName} signs it in Etyme, so it cannot be approved by email.`
    )
  }
  return null
}

/** Whether the week is still waiting for the client, in a sentence where it is not. */
function notWaiting(c: WeekChain): string | null {
  if (c.week.clientApprovedAt) return `${c.clientName} has already approved this week.`
  if (c.week.status !== 'SUBMITTED') return `This week is not waiting for approval. ${c.week.personName} has not sent it in yet.`
  return null
}

/**
 * Who sent the link, as the client may be told it.
 *
 * The client sees the rung it pays and nothing below it (CLAUDE.md, "A
 * sub-vendor's name is the prime's to keep"). So the firm named to the
 * client's approver is always the client's own supplier on the top rung,
 * and a sender from a firm below it is not named — not the person, not
 * the firm, not that there is one. `askFirm` is who to ask for a new link:
 * the firm the client already deals with.
 */
export function senderAsTheClientSees(
  c: WeekChain,
  sender: { personId: string; name: string; companyId: string | null }
): { sentFrom: SentFrom; askFirm: string } {
  const top = c.rungs.get(c.ladder[0].sellContractId)!
  const askFirm = top.sellerName
  if (sender.personId === c.week.personId || sender.companyId === top.companyId) {
    return { sentFrom: { kind: 'NAMED', name: sender.name, firm: askFirm }, askFirm }
  }
  return { sentFrom: { kind: 'BELOW', askFirm }, askFirm }
}

/** Whether this reader may be told a firm's name on this week: its own, or a party to a rung it is on. */
function mayName(r: Reader, c: WeekChain, companyId: string | null): boolean {
  if (!companyId) return false
  if (r.personId === c.week.personId || r.companyId === companyId) return true
  return c.ladder.some((x) =>
    (x.companyId === r.companyId || x.clientCompanyId === r.companyId || (x === c.ladder[0] && c.clientId === r.companyId)) &&
    (x.companyId === companyId || x.clientCompanyId === companyId || (x === c.ladder[0] && c.clientId === companyId)))
}

/** The approver's name and address, checked in the evidence rule's own words. */
export function checkApprover(name: unknown, email: unknown, clientName: string): { ok: true; name: string; email: string } | { ok: false; field: string; says: string } {
  const n = typeof name === 'string' ? name.trim() : ''
  const e = typeof email === 'string' ? email.trim().toLowerCase() : ''
  if (!n && !e) {
    return { ok: false, field: 'approverName', says: `Name the person at ${clientName} who approves this week, and give their email address.` }
  }
  if (!n) return { ok: false, field: 'approverName', says: `Name the person at ${clientName} who approves this week.` }
  if (!e) return { ok: false, field: 'approverEmail', says: `Give ${n}’s email address, so the link reaches them.` }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
    return { ok: false, field: 'approverEmail', says: `${e} is not an email address. Give the address ${n} reads.` }
  }
  return { ok: true, name: n, email: e }
}

/** Who may send or attach, by the rules, with the reader's seat. */
function actorVerdict(r: Reader, c: WeekChain) {
  return mayActForTheClient(
    { personId: r.personId, companyId: r.companyId, permissions: r.permissions, companyKind: r.companyKind ?? null, companyName: r.companyName ?? null },
    { personId: c.week.personId, personName: c.week.personName },
    c.ladder,
    c.clientName
  )
}

/** A refused attempt to act for the client, logged like any read of the worker's week. */
async function logRefusal(r: Reader, c: WeekChain, action: string, says: string) {
  await prisma.accessLog.create({
    data: { subjectId: c.week.personId, actorPersonId: r.personId, actorCompanyId: actorCompanyOf(r), action, allowed: false, reason: withSeat(r, says) },
  }).catch(() => {})
}

// ── Send a link ───────────────────────────────────────────────────────

export interface SendInput {
  approverName?: unknown
  approverEmail?: unknown
  /** Sell contract ids; null or absent means all of them. */
  contracts?: string[] | null
}

export async function sendApprovalLink(
  r: Reader,
  timesheetId: string,
  input: SendInput,
  now = new Date()
): Promise<{ ok: true; id: string; says: string; delivery: { state: string; note: string }; url: string } | Refused> {
  const c = await readWeekChain(timesheetId)
  if (!c) return refuse(404, 'NOT_FOUND', 'That week is not here.')

  const who = actorVerdict(r, c)
  if (!who.ok) {
    await logRefusal(r, c, 'APPROVAL_LINK_SEND', who.says)
    return refuse(403, 'FORBIDDEN', who.says)
  }
  const waiting = notWaiting(c)
  if (waiting) return refuse(409, 'NOT_WAITING', waiting)
  const inEtyme = needsSigningInEtyme(c)
  if (inEtyme) return refuse(409, 'SIGN_IN_ETYME', inEtyme)

  const approver = checkApprover(input.approverName, input.approverEmail, c.clientName)
  if (!approver.ok) return refuse(422, 'VALIDATION', approver.says, approver.field)
  const scope = scopeFor(input.contracts ?? null, c.ladder, c.clientName)
  if (!scope.ok) return refuse(422, 'VALIDATION', scope.says, 'contracts')

  const token = newLinkToken()
  const url = approveWeekUrl(token)
  if (!url) {
    return refuse(
      409, 'NO_ADDRESS',
      'This deployment does not know its own web address, so a link would not open. Attach the client’s approval as evidence instead.'
    )
  }

  const expiresAt = linkExpiresAt(now)
  const row = await prisma.weekApproval.create({
    data: {
      timesheetId, how: 'LINK', clientCompanyId: c.clientId,
      approverName: approver.name, approverEmail: approver.email,
      sentById: r.personId, sentByCompanyId: r.companyId, sentAs: who.as, sentAt: now,
      tokenHash: hashLinkToken(token), expiresAt,
      contracts: { create: scope.contracts.map((id, position) => ({ sellContractId: id, position })) },
    },
    select: { id: true },
  })

  const told = senderAsTheClientSees(c, { personId: r.personId, name: r.personName, companyId: r.companyId })
  const letter = letterToApprover({
    approverName: approver.name,
    personName: c.week.personName,
    clientName: c.clientName,
    // The two cases themselves, so the letter never reads them back out
    // of a display string. senderName and senderFirm stay only because
    // the letter's signature still asks for them; sentFrom decides.
    sentFrom: told.sentFrom,
    senderName: told.sentFrom.kind === 'NAMED' ? told.sentFrom.name : '',
    senderFirm: told.sentFrom.kind === 'NAMED' ? told.sentFrom.firm : told.askFirm,
    period: periodWords(c.week.periodStart, c.week.periodEnd, now),
    hours: c.week.totalHours,
    url,
    expiresAt,
    now,
  })
  const delivery = await attemptDelivery(
    routeFor({ isConsultant: false, email: approver.email, teamsWebhookUrl: null }),
    approver.email, letter.subject, letter.body, configuredSenders(), now
  )

  // Somebody asked for it, so it is not unprompted — but an email to a
  // stranger outside every company here is the kind of act a reader asks
  // about afterwards, and whether it actually left is the useful half.
  await prisma.automationLog.create({
    data: {
      companyId: r.companyId ?? c.employerId,
      action: 'WEEK_APPROVAL_LINK_SENT',
      summary: `Approval link for ${c.week.personName}’s week sent to ${approver.name} at ${c.clientName}`,
      reason: `${r.personName} asked for it. Delivery: ${delivery.state.toLowerCase()} — ${delivery.note}`,
      payload: { weekApprovalId: row.id, timesheetId, to: approver.email, delivery: delivery.state, contracts: scope.contracts, expiresAt: expiresAt.toISOString() },
      // An email cannot be called back. The link can be overtaken, and runs out on its own.
      reversible: false,
    },
  })

  const sent = delivery.state === 'SENT'
  return {
    ok: true,
    id: row.id,
    url,
    delivery: { state: delivery.state, note: delivery.note },
    says: sent
      ? `Sent to ${approver.name} at ${approver.email}. The link works once and runs out on ${dayOf(expiresAt, now)}.`
      : `The link is ready, but the email did not leave: ${delivery.note} The link works once and runs out on ${dayOf(expiresAt, now)}.`,
  }
}

// ── Attach evidence ───────────────────────────────────────────────────

export interface EvidenceUpload {
  approverName?: unknown
  approverEmail?: unknown
  kind?: unknown
  approvedOn?: Date | null
  file?: { name: string; size: number; type: string; bytes: Buffer } | null
  pastedText?: unknown
  contracts?: string[] | null
}

export async function attachEvidence(
  r: Reader,
  timesheetId: string,
  input: EvidenceUpload,
  now = new Date()
): Promise<{ ok: true; id: string; says: string; words: string } | Refused> {
  const c = await readWeekChain(timesheetId)
  if (!c) return refuse(404, 'NOT_FOUND', 'That week is not here.')

  const who = actorVerdict(r, c)
  if (!who.ok) {
    await logRefusal(r, c, 'APPROVAL_EVIDENCE_ATTACH', who.says)
    return refuse(403, 'FORBIDDEN', who.says)
  }
  const waiting = notWaiting(c)
  if (waiting) return refuse(409, 'NOT_WAITING', waiting)
  const inEtyme = needsSigningInEtyme(c)
  if (inEtyme) return refuse(409, 'SIGN_IN_ETYME', inEtyme)

  const ev = checkEvidence(
    {
      approverName: input.approverName, approverEmail: input.approverEmail, kind: input.kind,
      approvedOn: input.approvedOn ?? null,
      file: input.file ? { name: input.file.name, size: input.file.size } : null,
      pastedText: input.pastedText,
    },
    { periodEnd: c.week.periodEnd },
    now,
    c.clientName
  )
  if (!ev.ok) return refuse(422, 'VALIDATION', ev.says, ev.field)
  const scope = scopeFor(input.contracts ?? null, c.ladder, c.clientName)
  if (!scope.ok) return refuse(422, 'VALIDATION', scope.says, 'contracts')

  const pasted = typeof input.pastedText === 'string' ? input.pastedText.trim() : ''
  const file = input.file
    ? { fileName: input.file.name, contentType: input.file.type || 'application/octet-stream', sizeBytes: input.file.size, bytes: input.file.bytes }
    : { fileName: 'approval-email.txt', contentType: 'text/plain; charset=utf-8', sizeBytes: Buffer.byteLength(pasted), bytes: Buffer.from(pasted, 'utf8') }

  // The day the approver said yes, at the time it was recorded where that
  // is today, so a signature never predates the moment anybody knew of it.
  const sameDay = ev.approvedOn.toISOString().slice(0, 10) === now.toISOString().slice(0, 10)
  const signedAt = sameDay ? now : new Date(`${ev.approvedOn.toISOString().slice(0, 10)}T12:00:00.000Z`)

  const row = await prisma.weekApproval.create({
    data: {
      timesheetId, how: 'EVIDENCE', clientCompanyId: c.clientId,
      approverName: ev.approverName, approverEmail: ev.approverEmail,
      sentById: r.personId, sentByCompanyId: r.companyId, sentAs: who.as, sentAt: now,
      evidenceKind: ev.kind, approvedOn: signedAt,
      contracts: { create: scope.contracts.map((id, position) => ({ sellContractId: id, position })) },
      file: { create: file },
    },
    select: { id: true },
  })

  const words = approvedByWords({ approverName: ev.approverName, on: signedAt, how: 'EVIDENCE', now })
  const signed = await signForClient(c, row.id, signedAt, words, { by: `${r.personName} attached ${EVIDENCE_KINDS[ev.kind as EvidenceKind].toLowerCase()} (${ev.says.replace(/\.$/, '')})` })
  if (!signed.ok) {
    // Nothing was signed, so the evidence stands for nothing: take it back.
    await prisma.weekApproval.delete({ where: { id: row.id } }).catch(() => {})
    return signed
  }
  await tellAfterApproval(c, { words, senderId: r.personId === c.week.personId ? null : r.personId, how: 'EVIDENCE' })
  return { ok: true, id: row.id, words, says: `${words}. ${nextSays(c)}` }
}

// ── Writing the client's signature ────────────────────────────────────

class Refusal extends Error {
  constructor(public status: number, public code: string, public says: string) { super(says) }
}

/**
 * The client's signature, and nothing else.
 *
 * A CLIENT_APPROVAL assertion at the client's own rate on the rung it
 * pays, naming nobody (`byId` null) because nobody here signed — the
 * `WeekApproval` row names who did. The week stays SUBMITTED: every rung
 * below still accepts it in its turn.
 */
async function signForClient(
  c: WeekChain,
  weekApprovalId: string,
  at: Date,
  words: string,
  how: { by: string; outcome?: LinkOutcome }
): Promise<{ ok: true } | Refused> {
  const client = signaturesWritten(c.signers)[0]
  if (!client) return refuse(409, 'NO_CLIENT', 'This week has no client signature to give.')
  const top = c.rungs.get(client.rungId)!
  let signed: string | null = null
  try {
    await prisma.$transaction(async (tx) => {
      const moved = await tx.timesheet.updateMany({
        where: { id: c.week.id, status: 'SUBMITTED', clientApprovedAt: null },
        data: {
          clientApprovedAt: at, clientApprovedById: null, autoApproved: false,
          approvedAt: at, approvedById: null,
          ...(c.week.employerAcceptedAt ? { status: 'APPROVED' } : {}),
        },
      })
      if (moved.count === 0) throw new Refusal(409, 'NOT_WAITING', `${c.clientName} has already approved this week, or it is no longer waiting.`)

      if (await tx.workAssertion.findFirst({ where: { timesheetId: c.week.id, companyId: client.companyId, role: 'CLIENT_APPROVAL', state: 'LIVE' }, select: { id: true } })) {
        throw new Refusal(409, 'ALREADY_SIGNED', `${c.clientName} has already approved this week.`)
      }
      const assertion = await tx.workAssertion.create({
        data: {
          timesheetId: c.week.id, companyId: client.companyId, role: 'CLIENT_APPROVAL',
          hours: c.week.totalHours, rateCents: top.billRate, state: 'LIVE', at,
          byId: null, auto: false, note: words,
        },
        select: { id: true },
      })
      const linked = await tx.weekApproval.updateMany({
        where: { id: weekApprovalId, assertionId: null, ...(how.outcome ? { usedAt: null } : {}) },
        data: { assertionId: assertion.id, ...(how.outcome ? { usedAt: at, outcome: how.outcome } : {}) },
      })
      if (linked.count === 0) throw new Refusal(409, 'USED', 'This approval has already been used.')
      signed = assertion.id

      await tx.automationLog.create({
        data: {
          companyId: top.companyId,
          action: 'TIMESHEET_APPROVED_BY_EMAIL',
          summary: `${c.week.personName}: ${c.week.totalHours} hours approved for ${c.clientName}. ${words}`,
          reason: `${how.by}. This is ${c.clientName}’s signature only; every firm below still accepts the week in its turn.`,
          payload: { timesheetId: c.week.id, weekApprovalId, assertionId: assertion.id, sellContractId: top.id },
          // A signature can be withdrawn on the ledger until the week is billed.
          reversible: true,
        },
      })
    })
  } catch (err) {
    if (err instanceof Refusal) return refuse(err.status, err.code, err.says)
    throw err
  }
  // To the books, the way the approve button posts (`postAssertion`,
  // lib/order-postings): the client's signature is revenue, in the month
  // the work was done. A posting is keyed on its signature, so a week is
  // on the books once whichever door it was approved through. Without
  // this a week approved by email was signed and never earned anything.
  // Nobody at the client signed in, so the posting names nobody. A
  // posting that cannot be made (no exchange rate, a settled order) is
  // reported rather than thrown: the signature already stands, and the
  // approver, who has no account, should not read an error about books.
  if (signed) {
    await postAssertion(signed, null).catch((err) =>
      reportError('week-approval: posting a week approved by email', err),
    )
  }
  return { ok: true }
}

/** Who has the week now, in a sentence. */
function nextSays(c: WeekChain): string {
  const next = c.signers[1]
  if (!next) return ''
  return `${c.names.get(next.companyId) ?? 'The next firm'} accepts it next.`
}

/**
 * The next rung, the worker and the sender are told — the same notice the
 * approve route sends a rung when the week reaches it, so the desk that
 * acts is the desk that hears, on its desk and by email.
 */
async function tellAfterApproval(c: WeekChain, i: { words: string; senderId: string | null; how: 'LINK' | 'EVIDENCE' }) {
  const next = c.signers[1]
  if (next) {
    const pays = next.role === 'EMPLOYER_ACCEPTANCE'
      ? c.week.personName
      : c.rungs.get(next.rungId)?.sellerName ?? 'the firm below you'
    const said = tellNext({
      personName: c.week.personName,
      period: `${c.week.periodStart.toISOString().slice(0, 10)} – ${c.week.periodEnd.toISOString().slice(0, 10)}`,
      hours: c.week.totalHours,
      signedBy: c.clientName,
      signedRole: 'CLIENT_APPROVAL',
      paysName: pays,
    })
    const desk = await prisma.context.findMany({
      where: { companyId: next.companyId, revokedAt: null, role: { permissions: { hasSome: ['timesheets.approve', '*'] } } },
      select: { personId: true },
      take: 5,
    })
    for (const d of desk) {
      void notify({
        personId: d.personId, companyId: next.companyId, type: 'TIMESHEET', channel: 'EMAIL',
        title: said.title, body: `${said.body} ${i.words}.`,
        entityId: c.week.id, data: { timesheetId: c.week.id, href: `/dashboard/weeks/${c.week.id}` },
      })
    }
  }
  void notify({
    personId: c.week.personId, companyId: c.employerId, type: 'TIMESHEET', channel: 'EMAIL',
    title: 'Timesheet approved',
    body: `Your week ${c.week.periodStart.toISOString().slice(0, 10)} – ${c.week.periodEnd.toISOString().slice(0, 10)} (${c.week.totalHours}h). ${i.words}.`,
    entityId: c.week.id, data: { href: `/dashboard/weeks/${c.week.id}` },
  })
  if (i.senderId && i.senderId !== c.week.personId) {
    void notify({
      personId: i.senderId, type: 'TIMESHEET',
      title: `${c.week.personName}’s week is approved`,
      body: `${i.words}. ${nextSays(c)}`,
      entityId: c.week.id, data: { href: `/dashboard/weeks/${c.week.id}` },
    })
  }
}

// ── The link, opened by the approver ──────────────────────────────────

async function rowByToken(token: string) {
  if (!token || token.length < 16) return null
  return prisma.weekApproval.findUnique({
    where: { tokenHash: hashLinkToken(token) },
    select: {
      id: true, how: true, timesheetId: true, approverName: true, sentAt: true, expiresAt: true, usedAt: true,
      outcome: true, sentById: true, sentByCompanyId: true,
      sentBy: { select: { name: true } }, sentByCompany: { select: { name: true } },
    },
  })
}

export interface LinkView {
  approverName: string
  personName: string
  clientName: string
  /** Who asked for the link, in the letter's own sentence (`whoAskedSentence`). */
  askedBy: string
  period: string
  totalHours: number
  days: { day: string; hours: number }[]
  expiresOn: string
  reasons: { code: string; says: string }[]
  /** Where the week can only be signed in Etyme: Send back still works. */
  approveRefused: string | null
}

const NOT_OURS = 'This link is not one of ours, or it has been replaced. Ask whoever sent it for a new one.'

/** What the approver sees, or why the link is closed. Every open is an access log row. */
export async function openLink(token: string, now = new Date()): Promise<{ ok: true; view: LinkView } | Refused> {
  const row = await rowByToken(token)
  if (!row || row.how !== 'LINK' || !row.expiresAt) return refuse(404, 'NOT_FOUND', NOT_OURS)
  const c = await readWeekChain(row.timesheetId)
  if (!c) return refuse(404, 'NOT_FOUND', NOT_OURS)

  const told = senderAsTheClientSees(c, { personId: row.sentById, name: row.sentBy.name, companyId: row.sentByCompanyId })
  const v = linkVerdict(
    { sentAt: row.sentAt, expiresAt: row.expiresAt, usedAt: row.usedAt, outcome: row.outcome as LinkOutcome | null, approverName: row.approverName },
    { status: c.week.status, submittedAt: c.week.submittedAt, clientApprovedAt: c.week.clientApprovedAt, personName: c.week.personName },
    now,
    { clientName: c.clientName, senderFirm: told.askFirm }
  )
  // The approver reads a person's hours. They hold no seat, so the row
  // names their company and the link, and says what they were shown.
  await prisma.accessLog.create({
    data: {
      subjectId: c.week.personId, actorPersonId: null, actorCompanyId: c.clientId,
      action: 'APPROVAL_LINK_VIEW', allowed: v.open, reason: v.open ? null : v.says,
    },
  }).catch(() => {})
  if (!v.open) return refuse(409, v.code, v.says)

  return {
    ok: true,
    view: {
      approverName: row.approverName,
      personName: c.week.personName,
      clientName: c.clientName,
      askedBy: whoAskedSentence(told.sentFrom, c.week.personName),
      period: periodWords(c.week.periodStart, c.week.periodEnd, now),
      totalHours: c.week.totalHours,
      days: Object.entries(c.week.days)
        .filter(([, h]) => Number(h) > 0)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([d, h]) => ({ day: dayName(d), hours: Number(h) })),
      expiresOn: dayOf(row.expiresAt, now),
      reasons: Object.entries(SEND_BACK_REASONS).map(([code, says]) => ({ code, says })),
      approveRefused: needsSigningInEtyme(c),
    },
  }
}

function dayName(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00.000Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/** Approve or Send back, from the link. */
export async function answerLink(
  token: string,
  answer: { answer?: unknown; code?: unknown; note?: unknown },
  now = new Date()
): Promise<{ ok: true; says: string } | Refused> {
  const opened = await openLink(token, now)
  if (!opened.ok) return opened
  const row = (await rowByToken(token))!
  const c = (await readWeekChain(row.timesheetId))!

  if (answer.answer === 'APPROVE') {
    if (opened.view.approveRefused) return refuse(409, 'SIGN_IN_ETYME', opened.view.approveRefused)
    const words = approvedByWords({ approverName: row.approverName, on: now, how: 'LINK', now })
    const signed = await signForClient(c, row.id, now, words, { by: `${row.approverName} pressed Approve on the link ${row.sentBy.name} sent`, outcome: 'APPROVED' })
    if (!signed.ok) return signed
    await tellAfterApproval(c, { words, senderId: row.sentById, how: 'LINK' })
    return { ok: true, says: `Thank you. ${c.week.personName}’s week is approved, with your name, this address and the time. Nothing else is needed from you.` }
  }

  if (answer.answer === 'SEND_BACK') {
    const back = checkSendBack({ code: answer.code, note: answer.note })
    if (!back.ok) return refuse(422, 'VALIDATION', back.says, 'code')
    try {
      await prisma.$transaction(async (tx) => {
        const used = await tx.weekApproval.updateMany({
          where: { id: row.id, usedAt: null },
          data: { usedAt: now, outcome: 'SENT_BACK', sendBackCode: back.code, sendBackNote: back.note },
        })
        if (used.count === 0) throw new Refusal(409, 'USED', 'This link has already been used.')
        const moved = await tx.timesheet.updateMany({
          where: { id: c.week.id, status: 'SUBMITTED', clientApprovedAt: null },
          data: { status: 'OPEN', approvedById: null, approvedAt: null },
        })
        if (moved.count === 0) throw new Refusal(409, 'NOT_WAITING', 'This week is no longer waiting for approval.')
        await tx.automationLog.create({
          data: {
            companyId: c.employerId,
            action: 'TIMESHEET_SENT_BACK_BY_EMAIL',
            summary: `${c.week.personName}’s week sent back by ${row.approverName} at ${c.clientName}: ${back.says}`,
            reason: `${row.approverName} pressed Send back on the link ${row.sentBy.name} sent.`,
            payload: { timesheetId: c.week.id, weekApprovalId: row.id, code: back.code, note: back.note },
            reversible: true,
          },
        })
      })
    } catch (err) {
      if (err instanceof Refusal) return refuse(err.status, err.code, err.says)
      throw err
    }
    const body = `${row.approverName} at ${c.clientName} sent back the week ${c.week.periodStart.toISOString().slice(0, 10)} – ${c.week.periodEnd.toISOString().slice(0, 10)}: ${back.says}. Correct it and send it again; a new link comes with it.`
    void notify({ personId: c.week.personId, companyId: c.employerId, type: 'TIMESHEET', channel: 'EMAIL', title: 'Timesheet returned for correction', body, entityId: c.week.id, data: { href: `/dashboard/weeks/${c.week.id}` } })
    if (row.sentById !== c.week.personId) {
      void notify({ personId: row.sentById, type: 'TIMESHEET', title: `${c.week.personName}’s week was sent back`, body, entityId: c.week.id, data: { href: `/dashboard/weeks/${c.week.id}` } })
    }
    return { ok: true, says: `Thank you. ${c.week.personName} has the week back with your reason, and nobody is paid on it until it is right.` }
  }

  return refuse(422, 'VALIDATION', 'Press Approve or Send back.', 'answer')
}

// ── Reading it, on every rung it applies to ───────────────────────────

export interface ApprovalSeen {
  id: string
  how: 'LINK' | 'EVIDENCE'
  /** WAITING · APPROVED · SENT_BACK · CLOSED */
  state: string
  /** "Approved by email: Dana Whitfield, Oct 2 — evidence attached", where it approved. */
  words: string | null
  approverName: string
  approverEmail: string
  sentBy: string
  sentAt: string
  sendBack: string | null
  evidence: { kind: string; fileName: string; sizeBytes: number; href: string } | null
  /** Only the reader's own contracts in its scope — never another rung's. */
  contracts: { id: string; label: string }[]
}

/** One live signature on the week, as this reader may read it. Never a rate. */
export interface SignatureSeen {
  /** CLIENT_APPROVAL · PASS_THROUGH · EMPLOYER_ACCEPTANCE */
  role: string
  firm: string
  /** The person who signed; null where nobody looked or the client signed outside Etyme. */
  signedBy: string | null
  on: string
  auto: boolean
  /** Why a flagged week was signed anyway — only to the signing firm and the firm directly below it. */
  reason: string | null
  /** The line the page prints. */
  says: string
}

export interface SignatureRow {
  role: string
  companyId: string
  at: Date
  byName: string | null
  auto: boolean
  note: string | null
  /** The approver named on an approval given by email, where this signature came from one. */
  emailApprover: string | null
}

/**
 * Which live signatures a reader may see, and whose reason.
 *
 * A signature names a firm, so it is shown only where `mayName` lets this
 * reader know that firm (CLAUDE.md, "A sub-vendor's name is the prime's to
 * keep"). The reason given for signing a flagged week is the signer's own
 * judgment about another firm's hours: the signing firm reads it, and so
 * does the firm directly below it, whose week it was. Nobody else.
 *
 * Pure. `logged` is one row per signature, shown or not, for the access log.
 */
export function signaturesSeen(
  r: Reader,
  c: WeekChain,
  rows: SignatureRow[],
  now: Date
): { shown: SignatureSeen[]; logged: { allowed: boolean; reason: string | null }[] } {
  const shown: SignatureSeen[] = []
  const logged: { allowed: boolean; reason: string | null }[] = []
  for (const row of rows) {
    if (!mayName(r, c, row.companyId)) {
      logged.push({ allowed: false, reason: 'A signature by a firm this reader may not be told of was withheld.' })
      continue
    }
    logged.push({ allowed: true, reason: null })
    const firm = c.names.get(row.companyId) ?? 'A firm on this week'
    const on = dayOf(row.at, now)
    const below = firmBelow(c, row.companyId)
    const readsReason = r.companyId != null && (r.companyId === row.companyId || r.companyId === below)
    // The email approval's own sentence is the panel below; it is not a reason.
    const reason = readsReason && row.note && !row.emailApprover ? row.note : null
    const signedBy = row.emailApprover ?? row.byName
    const verb = row.role === 'CLIENT_APPROVAL' ? 'Approved' : 'Accepted'
    const says = row.auto
      ? `${verb} automatically — nobody looked · ${firm}, ${on}`
      : `${verb} by ${signedBy ? `${signedBy}, ` : ''}${firm}, ${on}${row.emailApprover ? ' — by email' : ''}${reason ? ` — reason: ${reason}` : ''}`
    shown.push({ role: row.role, firm, signedBy, on, auto: row.auto, reason, says })
  }
  return { shown, logged }
}

/** The firm that sells to this one on the week's chain, if any — the rung directly below it. */
function firmBelow(c: WeekChain, companyId: string): string | null {
  for (let i = 0; i < c.ladder.length; i++) {
    const x = c.ladder[i]
    const buyer = i === 0 ? c.clientId : x.clientCompanyId
    if (buyer === companyId || x.clientCompanyId === companyId) return x.companyId
  }
  return null
}

export interface WeekSeen {
  week: { id: string; personName: string; period: string; totalHours: number; status: string; clientName: string; clientApproved: boolean }
  /** Who signed the week, top first, as this reader may read it. */
  signatures: SignatureSeen[]
  approvals: ApprovalSeen[]
  /** Whether this reader may send a link or attach evidence, and on which contracts. */
  act: { ok: true; as: string; contracts: { id: string; label: string; mine: boolean }[]; refused: string | null } | { ok: false; says: string }
}

/** Whether a reader is on this week at all: the worker, or a firm on the chain. */
function onTheWeek(r: Reader, c: WeekChain): boolean {
  if (r.personId === c.week.personId) return true
  if (!r.companyId) return false
  return c.ladder.some((x) => x.companyId === r.companyId || x.clientCompanyId === r.companyId) || c.clientId === r.companyId
}

/** A contract as a reader may see it named. A rung the reader is not on is not named. */
function labelFor(r: Reader, c: WeekChain, id: string): string {
  const rung = c.rungs.get(id)!
  const own = r.personId === c.week.personId ||
    rung.companyId === r.companyId || rung.clientCompanyId === r.companyId ||
    (id === c.ladder[0].sellContractId && c.clientId === r.companyId)
  if (!own) return 'Another contract on this placement'
  return `${rung.sellerName} bills ${id === c.ladder[0].sellContractId ? c.clientName : rung.buyerName}`
}

export async function readWeekApprovals(r: Reader, timesheetId: string, now = new Date()): Promise<{ ok: true; seen: WeekSeen } | Refused> {
  const c = await readWeekChain(timesheetId)
  if (!c) return refuse(404, 'NOT_FOUND', 'That week is not here.')
  if (!onTheWeek(r, c)) {
    const says = 'This week is not on a contract your company is on.'
    await logRefusal(r, c, 'WEEK_APPROVAL_VIEW', says)
    return refuse(403, 'FORBIDDEN', says)
  }

  const rows = await prisma.weekApproval.findMany({
    where: { timesheetId },
    orderBy: { sentAt: 'desc' },
    select: {
      id: true, how: true, approverName: true, approverEmail: true, sentAt: true, expiresAt: true, usedAt: true, sentById: true, sentByCompanyId: true,
      outcome: true, sendBackCode: true, sendBackNote: true, evidenceKind: true, approvedOn: true, assertionId: true,
      sentBy: { select: { name: true } }, sentByCompany: { select: { name: true } },
      contracts: { select: { sellContractId: true }, orderBy: { position: 'asc' } },
      file: { select: { fileName: true, sizeBytes: true } },
    },
  })

  const approvals: ApprovalSeen[] = []
  for (const a of rows) {
    const scope = a.contracts.map((x) => x.sellContractId)
    const v = mayReadEvidence({ personId: r.personId, companyId: r.companyId }, { personId: c.week.personId }, scope, c.ladder)
    await writeReadLog(r, c, v)
    if (!v.ok) continue
    const approvedAt = a.how === 'EVIDENCE' ? a.approvedOn : a.usedAt
    const state = a.assertionId
      ? 'APPROVED'
      : a.outcome === 'SENT_BACK'
        ? 'SENT_BACK'
        : a.how === 'LINK' && !a.usedAt && a.expiresAt && a.expiresAt > now && !c.week.clientApprovedAt && c.week.status === 'SUBMITTED'
          ? 'WAITING'
          : 'CLOSED'
    approvals.push({
      id: a.id,
      how: a.how as 'LINK' | 'EVIDENCE',
      state,
      words: state === 'APPROVED' && approvedAt
        ? approvedByWords({ approverName: a.approverName, on: approvedAt, how: a.how as 'LINK' | 'EVIDENCE', now })
        : null,
      approverName: a.approverName,
      approverEmail: a.approverEmail,
      // A sender from a firm this reader may not know is not named at all.
      sentBy: mayName(r, c, a.sentByCompanyId)
        ? a.sentByCompany ? `${a.sentBy.name}, ${a.sentByCompany.name}` : a.sentBy.name
        : a.sentById === c.week.personId
          ? a.sentBy.name
          : 'A supplier on this placement',
      sentAt: dayOf(a.sentAt, now),
      sendBack: a.sendBackCode
        ? `${SEND_BACK_REASONS[a.sendBackCode as keyof typeof SEND_BACK_REASONS] ?? a.sendBackCode}${a.sendBackNote ? `: ${a.sendBackNote}` : ''}`
        : null,
      evidence: a.file && a.evidenceKind
        ? { kind: EVIDENCE_KINDS[a.evidenceKind as EvidenceKind] ?? a.evidenceKind, fileName: a.file.fileName, sizeBytes: a.file.sizeBytes, href: `/api/week-approvals/${a.id}/file` }
        : null,
      contracts: v.contracts.map((id) => ({ id, label: labelFor(r, c, id) })),
    })
  }

  // ── The signatures, each read logged like the evidence ──
  const live = await prisma.workAssertion.findMany({
    where: { timesheetId, state: 'LIVE' },
    orderBy: { at: 'asc' },
    select: { role: true, companyId: true, at: true, byId: true, auto: true, note: true, weekApproval: { select: { approverName: true } } },
  })
  const byIds = [...new Set(live.map((a) => a.byId).filter((x): x is string => !!x))]
  const people = new Map((await prisma.person.findMany({ where: { id: { in: byIds } }, select: { id: true, name: true } })).map((x) => [x.id, x.name]))
  const order = (companyId: string) => {
    if (companyId === c.clientId) return -1
    const i = c.ladder.findIndex((x) => x.clientCompanyId === companyId)
    return i < 0 ? c.ladder.length : i
  }
  const sigRows: SignatureRow[] = live
    .map((a) => ({
      role: a.role, companyId: a.companyId, at: a.at, auto: a.auto, note: a.note,
      byName: a.byId ? people.get(a.byId) ?? null : null,
      emailApprover: a.weekApproval?.approverName ?? null,
    }))
    .sort((a, b) => order(a.companyId) - order(b.companyId) || a.at.getTime() - b.at.getTime())
  const sigs = signaturesSeen(r, c, sigRows, now)
  for (const l of sigs.logged) {
    await prisma.accessLog.create({
      data: {
        subjectId: c.week.personId, actorPersonId: r.personId, actorCompanyId: actorCompanyOf(r),
        action: 'WEEK_SIGNATURE_VIEW', allowed: l.allowed, reason: r.seat ? withSeat(r, l.reason) : l.reason,
      },
    }).catch(() => {})
  }

  const who = actorVerdict(r, c)
  const act: WeekSeen['act'] = who.ok
    ? {
        ok: true,
        as: who.as,
        contracts: c.ladder.map((x) => ({ id: x.sellContractId, label: labelFor(r, c, x.sellContractId), mine: labelFor(r, c, x.sellContractId) !== 'Another contract on this placement' })),
        refused: notWaiting(c) ?? needsSigningInEtyme(c),
      }
    : { ok: false, says: who.says }

  return {
    ok: true,
    seen: {
      week: {
        id: c.week.id,
        personName: c.week.personName,
        period: periodWords(c.week.periodStart, c.week.periodEnd, now),
        totalHours: c.week.totalHours,
        status: c.week.status,
        clientName: c.clientName,
        clientApproved: !!c.week.clientApprovedAt,
      },
      signatures: sigs.shown,
      approvals,
      act,
    },
  }
}

async function writeReadLog(r: Reader, c: WeekChain, v: ReadVerdict) {
  const row = evidenceReadLog({ personId: r.personId, companyId: actorCompanyOf(r) }, { personId: c.week.personId }, v)
  await prisma.accessLog.create({ data: { ...row, reason: r.seat ? withSeat(r, row.reason) : row.reason } }).catch(() => {})
}

/** The firm that actually read: the office where it reads through a seat. */
function actorCompanyOf(r: Reader): string | null {
  return r.seat ? r.seat.officeCompanyId : r.companyId
}

/** A log reason, with the seat it was read under where there was one. */
function withSeat(r: Reader, reason: string | null): string | null {
  if (!r.seat) return reason
  return reason ? `${reason} ${r.seat.trail}.` : `${r.seat.trail}.`
}

/** The evidence file itself, for a reader on a rung it applies to. Logged either way. */
export async function readEvidenceFile(
  r: Reader,
  weekApprovalId: string
): Promise<{ ok: true; fileName: string; contentType: string; bytes: Buffer } | Refused> {
  const a = await prisma.weekApproval.findUnique({
    where: { id: weekApprovalId },
    select: { timesheetId: true, contracts: { select: { sellContractId: true } }, file: { select: { fileName: true, contentType: true, bytes: true } } },
  })
  if (!a || !a.file) return refuse(404, 'NOT_FOUND', 'There is no evidence file here.')
  const c = await readWeekChain(a.timesheetId)
  if (!c) return refuse(404, 'NOT_FOUND', 'There is no evidence file here.')
  const v = mayReadEvidence({ personId: r.personId, companyId: r.companyId }, { personId: c.week.personId }, a.contracts.map((x) => x.sellContractId), c.ladder)
  await writeReadLog(r, c, v)
  if (!v.ok) return refuse(403, 'FORBIDDEN', v.says)
  return { ok: true, fileName: a.file.fileName, contentType: a.file.contentType, bytes: Buffer.from(a.file.bytes) }
}

/**
 * The words for many weeks at once, for a list that shows approvals.
 *
 * Only for a reader the approval applies to; a week approved some other way
 * has no entry. One query for the lot. The list that calls this has already
 * decided the reader may see these weeks; the evidence itself is opened
 * through `readEvidenceFile`, which logs.
 */
export async function approvalWordsFor(
  r: { personId: string; companyId: string | null },
  weeks: { id: string; personId: string; ladder: LadderRung[] }[],
  now = new Date()
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (weeks.length === 0) return out
  const rows = await prisma.weekApproval.findMany({
    where: { timesheetId: { in: weeks.map((w) => w.id) }, assertionId: { not: null } },
    select: { timesheetId: true, how: true, approverName: true, usedAt: true, approvedOn: true, contracts: { select: { sellContractId: true } } },
  })
  for (const a of rows) {
    const w = weeks.find((x) => x.id === a.timesheetId)!
    const v = mayReadEvidence(r, { personId: w.personId }, a.contracts.map((x) => x.sellContractId), w.ladder)
    const on = a.how === 'EVIDENCE' ? a.approvedOn : a.usedAt
    if (v.ok && on) out.set(a.timesheetId, approvedByWords({ approverName: a.approverName, on, how: a.how as 'LINK' | 'EVIDENCE', now }))
  }
  return out
}

/**
 * The reader a signed-in caller is on one week: through a seat, where the
 * caller's firm runs the program of the client this week is worked at.
 *
 * The same rule the approve button follows: a program office acts at the
 * client's desk, holding the client's permissions, as the client's side
 * of the paper. Read as its own company it was a stranger to every week of
 * the program it runs. The person stays the real person at the office.
 */
export async function readerAtWeek(
  caller: CallerContext,
  week: { timesheetId: string } | { weekApprovalId: string }
): Promise<Reader> {
  const own = readerOf(caller)
  if (!caller.company) return own
  const timesheetId = 'timesheetId' in week
    ? week.timesheetId
    : (await prisma.weekApproval.findUnique({ where: { id: week.weekApprovalId }, select: { timesheetId: true } }))?.timesheetId
  if (!timesheetId) return own
  const t = await prisma.timesheet.findUnique({
    where: { id: timesheetId },
    select: { sellContract: { select: { clientCompanyId: true, endClientCompanyId: true } } },
  })
  const clientId = t ? (t.sellContract.endClientCompanyId ?? t.sellContract.clientCompanyId) : null
  if (!clientId || clientId === caller.company.id) return own
  const seat = await seatFor(caller, clientId)
  if (!seat) return own
  return {
    ...own,
    companyId: seat.clientCompany.id,
    companyName: seat.clientCompany.name,
    companyKind: 'CLIENT',
    permissions: actingInSeat(caller, seat).permissions,
    seat: { officeCompanyId: caller.company.id, trail: seatTrail(seat, 'Read') },
  }
}

/** The reader a signed-in caller is, for the functions above. */
export function readerOf(caller: {
  person: { id: string; name: string }
  company: { id: string; name: string; kind: string } | null
  permissions: readonly string[]
}): Reader {
  return {
    personId: caller.person.id,
    personName: caller.person.name,
    companyId: caller.company?.id ?? null,
    companyName: caller.company?.name ?? null,
    companyKind: caller.company?.kind ?? null,
    permissions: caller.permissions,
  }
}
