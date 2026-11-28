/**
 * The one door every email leaves through (record 110, 2026-11-22).
 *
 * The email law, as the tester wrote it: BCC and never CC on a send to
 * several people; the verified sender is the only way out; every send on
 * the ledger; a failure is "failed delivery" and silence is never
 * delivery; no bulk sends; a chase is per record and rate-limited.
 *
 * What this file does about each:
 *
 *   - It is the only file that talks to an email provider. `emailSender`
 *     in lib/senders hands every send here, so no caller can go round it,
 *     and a test fails on a provider address in any other file.
 *   - CC is refused. The first addressed party is in To; every other
 *     recipient is in BCC. More than `MAIL_MAX_RECIPIENTS` is refused.
 *   - The From address is the configured verified sender
 *     (NOTIFY_FROM_EMAIL). A send that names another is refused.
 *   - A chase about one record goes at most once in `CHASE_WINDOW_HOURS`
 *     to one address. Where that cannot be checked, nothing is sent.
 *   - Every attempt writes one `MailSend` row, whatever came of it. The
 *     letter's body is never kept: it may carry a one-time link.
 *
 * It never throws. A refusal by a rule is a sentence; a provider's no is
 * a `MailRefused`, kept for the caller, who reopens its own item.
 */
import { prisma } from '@/lib/db'
import { demoAddress, DEMO_ADDRESS_NOTE } from '@/lib/notification-delivery'
import { mailLeaves } from './mail-leaves'
import {
  MailRefused, cleanProviderWords, providerMessageOf, type MailFailure, type MailProvider,
  MAIL_MAX_RECIPIENTS, CHASE_WINDOW_HOURS, NO_CC_SAYS, NOBODY_NAMED_SAYS, OTHER_SENDER_SAYS, CHASE_UNCHECKED_SAYS,
  tooManySays, chaseTooSoonSays,
} from './mail-failure'

export {
  MAIL_MAX_RECIPIENTS, CHASE_WINDOW_HOURS, NO_CC_SAYS, NOBODY_NAMED_SAYS, OTHER_SENDER_SAYS, CHASE_UNCHECKED_SAYS,
  tooManySays, chaseTooSoonSays,
}

/** The template version a caller gets where it names none. */
export const FIRST_TEMPLATE_VERSION = '1'

/** The template name on a row whose caller named none. A test keeps the callers from leaving it so. */
export const TEMPLATE_NOT_NAMED = 'not-named'

export type MailOutcome = 'SENT' | 'FAILED_DELIVERY' | 'REFUSED' | 'NOT_CONFIGURED' | 'DEMO_SKIPPED'

/** What the ledger row says the email was for. Every field the caller holds, it gives. */
export interface MailAbout {
  /** The tenant. Null or absent for Etyme's own mail (a sign-in link, a letter to staff). */
  companyId?: string | null
  /** The legal entity acted for, where the caller chose one. */
  actingEntityId?: string | null
  /** The person whose act sent it. Absent where no person's act did. */
  actorPersonId?: string | null
  /** The role or queue she held, as text. */
  heldAs?: string | null
  /** Set where an agent drafted the letter. */
  agentKey?: string | null
  /** The approved task an agent's send belongs to. An agent's send without one is refused. */
  agentTaskId?: string | null
  /** Which send of this letter this is: 1 the first, 2 its first retry. Left out, 1. */
  agentAttempt?: number
  recordType?: string | null
  recordId?: string | null
  /** The letter's template or rule. */
  template: string
  templateVersion?: string
  /** True for a reminder about a record: the door limits these. */
  chase?: boolean
}

export interface MailToSend {
  to: string | string[]
  /** Here only so the door can refuse it. An email from Etyme never uses CC. */
  cc?: string[] | null
  bcc?: string[] | null
  /** Left out, the verified sender. Anything else is refused. */
  from?: string | null
  subject: string
  text: string
  html?: string | null
  about?: MailAbout | null
}

// ── The rules, pure ──────────────────────────────────────────────────

/** The bare address out of "Name <a@b.c>" or "a@b.c", lower case. */
export function bareAddress(raw: string | null | undefined): string {
  const s = (raw ?? '').trim()
  const m = /<([^<>]+)>\s*$/.exec(s)
  return (m ? m[1] : s).trim().toLowerCase()
}

export type Addressing =
  | { ok: true; from: string; to: string[]; bcc: string[] }
  | { ok: false; says: string; to: string[]; bcc: string[] }

/**
 * Who the email goes to and how, or why it does not go. Pure.
 *
 * The first addressed party stays in To. Every other recipient, whether
 * the caller wrote it under To or BCC, goes as BCC, so no recipient reads
 * another's address. One address is never written twice.
 */
export function addressing(
  mail: Pick<MailToSend, 'to' | 'cc' | 'bcc' | 'from'>,
  verifiedSender: string,
): Addressing {
  const seen = new Set<string>()
  const all: string[] = []
  for (const raw of [...(Array.isArray(mail.to) ? mail.to : [mail.to]), ...(mail.bcc ?? [])]) {
    const a = (raw ?? '').trim()
    if (!a || seen.has(a.toLowerCase())) continue
    seen.add(a.toLowerCase())
    all.push(a)
  }
  const to = all.slice(0, 1)
  const bcc = all.slice(1)
  if ((mail.cc ?? []).some((c) => (c ?? '').trim())) return { ok: false, says: NO_CC_SAYS, to, bcc }
  if (all.length === 0) return { ok: false, says: NOBODY_NAMED_SAYS, to, bcc }
  if (all.length > MAIL_MAX_RECIPIENTS) return { ok: false, says: tooManySays(all.length), to, bcc }
  if (mail.from && bareAddress(mail.from) !== bareAddress(verifiedSender)) return { ok: false, says: OTHER_SENDER_SAYS, to, bcc }
  return { ok: true, from: verifiedSender, to, bcc }
}

/** When the next chase may go, given the last one that left; null where one may go now. Pure. */
export function nextChaseAt(lastSentAt: Date | null, now: Date): Date | null {
  if (!lastSentAt) return null
  const again = new Date(lastSentAt.getTime() + CHASE_WINDOW_HOURS * 3_600_000)
  return again.getTime() > now.getTime() ? again : null
}

// ── The ledger ───────────────────────────────────────────────────────

export interface MailLedgerRow {
  companyId: string | null
  actingEntityId: string | null
  actorPersonId: string | null
  heldAs: string | null
  agentKey: string | null
  agentTaskId: string | null
  recordType: string | null
  recordId: string | null
  fromAddress: string
  toAddresses: string[]
  bccAddresses: string[]
  subject: string
  template: string
  templateVersion: string
  chase: boolean
  outcome: MailOutcome
  note: string | null
  provider: string | null
  providerMessageId: string | null
}

/** The row for one attempt. Pure. Never the body. */
export function ledgerRowFor(a: {
  about: MailAbout | null | undefined
  from: string
  to: string[]
  bcc: string[]
  subject: string
  outcome: MailOutcome
  note: string | null
  provider: string | null
  providerMessageId: string | null
}): MailLedgerRow {
  const about = a.about ?? null
  return {
    companyId: about?.companyId ?? null,
    actingEntityId: about?.actingEntityId ?? null,
    actorPersonId: about?.actorPersonId ?? null,
    heldAs: about?.heldAs?.trim() || null,
    agentKey: about?.agentKey ?? null,
    agentTaskId: about?.agentTaskId ?? null,
    recordType: about?.recordType ?? null,
    recordId: about?.recordId ?? null,
    fromAddress: a.from,
    toAddresses: a.to,
    bccAddresses: a.bcc,
    subject: a.subject.slice(0, 500),
    template: about?.template?.trim() || TEMPLATE_NOT_NAMED,
    templateVersion: about?.templateVersion?.trim() || FIRST_TEMPLATE_VERSION,
    chase: about?.chase === true,
    outcome: a.outcome,
    note: a.note ? a.note.slice(0, 500) : null,
    provider: a.provider,
    providerMessageId: a.providerMessageId,
  }
}

// ── The provider ─────────────────────────────────────────────────────

interface Envelope { from: string; to: string[]; bcc: string[]; subject: string; text: string; html?: string | null }

/** Hand one email to the provider. Throws `MailRefused` where it said no or never answered. */
async function handToProvider(e: Envelope, env: Record<string, string | undefined>): Promise<{ provider: MailProvider; messageId: string | null }> {
  const resend = env.RESEND_API_KEY
  if (resend) {
    const res = await asked('Resend', () => fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resend}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // One address stays a plain string, as it always was.
        from: e.from, to: e.to.length === 1 ? e.to[0] : e.to,
        ...(e.bcc.length ? { bcc: e.bcc } : {}),
        subject: e.subject, text: e.text, ...(e.html ? { html: e.html } : {}),
      }),
    }))
    if (!res.ok) throw await refusal('Resend', res)
    const body = await res.json().catch(() => null) as { id?: unknown } | null
    return { provider: 'Resend', messageId: typeof body?.id === 'string' ? body.id : null }
  }
  const res = await asked('SendGrid', () => fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.SENDGRID_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{
        to: e.to.map((email) => ({ email })),
        ...(e.bcc.length ? { bcc: e.bcc.map((email) => ({ email })) } : {}),
      }],
      from: { email: e.from },
      subject: e.subject,
      content: [{ type: 'text/plain', value: e.text }, ...(e.html ? [{ type: 'text/html', value: e.html }] : [])],
    }),
  }))
  if (!res.ok) throw await refusal('SendGrid', res)
  return { provider: 'SendGrid', messageId: res.headers?.get?.('x-message-id') ?? null }
}

/**
 * The provider's answer to a send it did not take, as a `MailRefused`
 * carrying its status and its own words (cleaned in lib/notify/mail-failure:
 * no address, nothing key-like, at most 300 characters).
 */
async function refusal(provider: MailProvider, res: Response): Promise<MailRefused> {
  let body: unknown = null
  try {
    const text = await res.text()
    try { body = JSON.parse(text) } catch { body = text }
  } catch {
    body = null
  }
  return new MailRefused(provider, res.status, providerMessageOf(body))
}

/** A fetch that never answered is the provider not answering, said the same way. */
async function asked(provider: MailProvider, call: () => Promise<Response>): Promise<Response> {
  try {
    return await call()
  } catch (err) {
    throw new MailRefused(provider, null, err instanceof Error ? err.message : String(err))
  }
}

// ── The door ─────────────────────────────────────────────────────────

export type MailResult =
  | { outcome: 'SENT'; left: true; note: null; provider: MailProvider; providerMessageId: string | null }
  | { outcome: 'FAILED_DELIVERY'; left: false; note: string; failure: MailFailure; refused: MailRefused | null }
  | { outcome: 'REFUSED'; left: false; note: string }
  | { outcome: 'NOT_CONFIGURED'; left: false; note: string }
  | { outcome: 'DEMO_SKIPPED'; left: false; note: string }

export interface MailDoorDeps {
  env?: Record<string, string | undefined>
  now?: Date
  /** Whether an address is a reserved demo one; `demoAddress` when not given. */
  isDemo?: (address: string) => boolean
  /** Writes the ledger row; the database when not given. */
  record?: (row: MailLedgerRow) => Promise<void>
  /** When an earlier chase with this template last left for this record and address. The first letter is not a chase. */
  lastChase?: (q: { recordType: string; recordId: string; template: string; address: string; since: Date }) => Promise<Date | null>
  /** Hands the email over; the provider when not given. */
  hand?: (e: Envelope, env: Record<string, string | undefined>) => Promise<{ provider: MailProvider; messageId: string | null }>
  /** Whether an agent may send this letter now: a sentence when not, null when it may. The approved-task rule when not given. */
  agentGate?: (q: { agentTaskId: string | null; companyId: string | null; agentKey: string; recordType: string | null; recordId: string | null; template: string; attempt: number }) => Promise<string | null>
  /** Told that an agent's letter left, so its task counts it. */
  agentSent?: (agentTaskId: string) => Promise<void>
  /** Told when a ledger row could not be written. */
  onLedgerLost?: (err: unknown, row: MailLedgerRow) => void
}

const AGENT_UNCHECKED_SAYS = 'Whether this task was approved could not be checked, so nothing was sent.'
const NO_TASK_SAYS = 'An agent sends only inside a task a person approved. This send names no task, so nothing was sent.'

// Loaded when an agent sends, so the door does not pull the decision queue in with it.
async function agentGateFromTasks(q: Parameters<NonNullable<MailDoorDeps['agentGate']>>[0]): Promise<string | null> {
  if (!q.agentTaskId || !q.agentKey || !q.companyId) return NO_TASK_SAYS
  const { mayAgentSend } = await import('@/lib/agents/tasks')
  const got = await mayAgentSend(q.agentTaskId, { companyId: q.companyId, agentKey: q.agentKey, recordType: q.recordType, recordId: q.recordId, template: q.template, attempt: q.attempt })
  return got.ok ? null : got.says
}

async function agentSentToTasks(agentTaskId: string): Promise<void> {
  const { noteSent } = await import('@/lib/agents/tasks')
  await noteSent(agentTaskId)
}

const NOT_SET_UP_SAYS = 'No email sender is set up on this deployment, so nothing was sent.'

async function writeRow(row: MailLedgerRow): Promise<void> {
  await prisma.mailSend.create({ data: row })
}

async function lastChaseFromLedger(q: { recordType: string; recordId: string; template: string; address: string; since: Date }): Promise<Date | null> {
  const row = await prisma.mailSend.findFirst({
    where: {
      recordType: q.recordType, recordId: q.recordId, template: q.template, outcome: 'SENT', chase: true,
      createdAt: { gte: q.since },
      OR: [{ toAddresses: { has: q.address } }, { bccAddresses: { has: q.address } }],
    },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  })
  return row?.createdAt ?? null
}

/** Writes the ledger row for one attempt and gives the result back. Never throws. */
async function written<R extends MailResult>(
  mail: MailToSend,
  verified: string,
  plan: { to: string[]; bcc: string[] },
  record: (row: MailLedgerRow) => Promise<void>,
  deps: Pick<MailDoorDeps, 'onLedgerLost'>,
  result: R,
  extra: { provider?: string | null; providerMessageId?: string | null } = {},
): Promise<R> {
  const row = ledgerRowFor({
    about: mail.about, from: verified, to: plan.to, bcc: plan.bcc, subject: mail.subject,
    outcome: result.outcome, note: result.note,
    provider: extra.provider ?? null, providerMessageId: extra.providerMessageId ?? null,
  })
  try {
    await record(row)
  } catch (err) {
    if (deps.onLedgerLost) deps.onLedgerLost(err, row)
    // No address and no subject in the log: the outcome and the template only.
    else console.error(`[mail-door] A ${row.outcome} send of "${row.template}" could not be written to the mail ledger.`)
  }
  return result
}

/**
 * An email its caller already knows cannot leave: no sender is set up, or
 * the address is a reserved demo one. Every attempt is on the ledger
 * (walk, 2026-11-22: an invitation that could not leave wrote no row,
 * because its caller answered before the door). This writes the row the
 * door would have written, and never talks to a provider. Never throws.
 */
export async function recordNotSent(
  mail: MailToSend,
  outcome: 'NOT_CONFIGURED' | 'DEMO_SKIPPED',
  deps: Pick<MailDoorDeps, 'env' | 'record' | 'onLedgerLost'> = {},
): Promise<MailResult> {
  const verified = (deps.env ?? process.env).NOTIFY_FROM_EMAIL ?? ''
  const plan = addressing(mail, verified)
  const note = outcome === 'DEMO_SKIPPED' ? DEMO_ADDRESS_NOTE : NOT_SET_UP_SAYS
  return written(mail, verified, plan, deps.record ?? writeRow, deps, { outcome, left: false, note })
}

/**
 * Send one email, and write down what came of it. Never throws.
 *
 * The ledger row is written after the attempt, once, with its outcome. A
 * row that cannot be written does not call the email back: the outcome is
 * still returned, and the loss is said loudly on the server log.
 */
export async function sendMail(mail: MailToSend, deps: MailDoorDeps = {}): Promise<MailResult> {
  const env = deps.env ?? process.env
  const now = deps.now ?? new Date()
  const record = deps.record ?? writeRow
  const verified = env.NOTIFY_FROM_EMAIL ?? ''
  const plan = addressing(mail, verified)

  const finish = <R extends MailResult>(result: R, extra: { provider?: string | null; providerMessageId?: string | null } = {}): Promise<R> =>
    written(mail, verified, plan, record, deps, result, extra)

  // An agent sends only inside a task a person said yes to (record 112).
  const agentAbout = mail.about
  if (agentAbout?.agentKey || agentAbout?.agentTaskId) {
    const q = {
      agentTaskId: agentAbout.agentTaskId ?? null, companyId: agentAbout.companyId ?? null, agentKey: agentAbout.agentKey ?? '',
      recordType: agentAbout.recordType ?? null, recordId: agentAbout.recordId ?? null,
      template: agentAbout.template?.trim() || TEMPLATE_NOT_NAMED, attempt: agentAbout.agentAttempt ?? 1,
    }
    let held: string | null
    try { held = await (deps.agentGate ?? agentGateFromTasks)(q) } catch { held = AGENT_UNCHECKED_SAYS }
    if (held) return finish({ outcome: 'REFUSED', left: false, note: held })
  }

  if (!mailLeaves(env)) return finish({ outcome: 'NOT_CONFIGURED', left: false, note: NOT_SET_UP_SAYS })
  if (!plan.ok) return finish({ outcome: 'REFUSED', left: false, note: plan.says })

  const everyone = [...plan.to, ...plan.bcc]
  // A reserved demo address is never handed to the provider.
  if (everyone.some(deps.isDemo ?? demoAddress)) return finish({ outcome: 'DEMO_SKIPPED', left: false, note: DEMO_ADDRESS_NOTE })

  const about = mail.about
  if (about?.chase && about.recordType && about.recordId) {
    const since = new Date(now.getTime() - CHASE_WINDOW_HOURS * 3_600_000)
    const template = about.template?.trim() || TEMPLATE_NOT_NAMED
    try {
      for (const address of everyone) {
        const last = await (deps.lastChase ?? lastChaseFromLedger)({ recordType: about.recordType, recordId: about.recordId, template, address, since })
        const again = nextChaseAt(last, now)
        if (again) return finish({ outcome: 'REFUSED', left: false, note: chaseTooSoonSays(again) })
      }
    } catch {
      return finish({ outcome: 'REFUSED', left: false, note: CHASE_UNCHECKED_SAYS })
    }
  }

  try {
    const took = await (deps.hand ?? handToProvider)(
      { from: plan.from, to: plan.to, bcc: plan.bcc, subject: mail.subject, text: mail.text, html: mail.html ?? null },
      env,
    )
    if (agentAbout?.agentTaskId) {
      try { await (deps.agentSent ?? agentSentToTasks)(agentAbout.agentTaskId) } catch { /* the mail ledger row below is the record of the send */ }
    }
    return finish(
      { outcome: 'SENT', left: true, note: null, provider: took.provider, providerMessageId: took.messageId },
      { provider: took.provider, providerMessageId: took.messageId },
    )
  } catch (err) {
    if (err instanceof MailRefused) {
      return finish(
        { outcome: 'FAILED_DELIVERY', left: false, note: err.message, failure: err.failure, refused: err },
        { provider: err.providerName },
      )
    }
    const words = cleanProviderWords(err instanceof Error ? err.message : String(err)) || 'Sending failed'
    return finish({
      outcome: 'FAILED_DELIVERY', left: false, note: words, refused: null,
      failure: { kind: 'DOWN', status: null, provider: null, words },
    })
  }
}

/**
 * Thrown by `emailSender().send` where a rule of the door held the email.
 * Its message is the sentence, which is what the caller's row keeps.
 */
export class MailHeld extends Error {
  constructor(says: string) {
    super(says)
    this.name = 'MailHeld'
  }
}

/** Whether a thrown thing is the door's own refusal (by shape, so a copy across bundles still counts). */
export function isMailHeld(err: unknown): err is MailHeld {
  return err instanceof MailHeld || (Boolean(err) && typeof err === 'object' && (err as { name?: unknown }).name === 'MailHeld')
}

// ── Reading the ledger ───────────────────────────────────────────────

/**
 * The sends about one record, oldest first, for a caller that has already
 * shown it may read that record: the caller names its company and the
 * record, and nothing outside both comes back. There is no read of the
 * ledger by company alone, on purpose: the addresses are other people's.
 */
export function mailSendsAbout(companyId: string, recordType: string, recordId: string) {
  return prisma.mailSend.findMany({
    where: { companyId, recordType, recordId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })
}

/**
 * The same read for several records of one kind at once, narrowed to the
 * fields a tracker needs (which record, how it ended, when). Company and
 * record kind are named, and only the listed records come back.
 */
export function mailSendsAboutMany(companyId: string, recordType: string, recordIds: string[]) {
  return prisma.mailSend.findMany({
    where: { companyId, recordType, recordId: { in: recordIds } },
    select: { id: true, recordId: true, outcome: true, createdAt: true },
  })
}
