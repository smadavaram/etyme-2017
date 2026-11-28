/**
 * What the supplier's own three acts do to the record (founder,
 * 2026-10-29, "Tapin gets agents, not a website"), once the role contract
 * and, where it must, a person have said yes.
 *
 *   bench.put_forward     asked; the yes goes through the submission door
 *                         itself (POST /api/submissions), as the person who
 *                         said yes, at the rate they entered
 *   papers.ask_for_start  alone; regulatory's clearance ask
 *                         (`askForClearance`), which reads the line's
 *                         required set, asks once and never for what is held
 *   bench.coming_free     alone; a summary to the people who put people
 *                         forward, inside the firm
 *
 * Nothing here decides who may be put forward, what a start needs or who
 * is on the bench: each is another domain's door, called and quoted. This
 * file imports only the Performer type from ./performers, so the ledger can
 * import it without importing itself.
 */

import { prisma } from '@/lib/db'
import { notifyBulk } from '@/lib/notify'
import { NOT_THE_SAMPLE_SEAT } from '@/lib/sample-seat'
import { mayChasePaper } from '@/lib/setup-gates'
import { workerPartyAt } from '@/lib/document-stages/chase-gate'
import type { DoorResult, PerformContext, Performer } from '@/lib/twin/performers'

// ── Sentences ─────────────────────────────────────────────────────────

/** Said to a yes on a put-forward card with no rate on it. */
export const NEEDS_RATE = 'Enter the rate you are putting them forward at. Ask Etyme does not choose a rate for you.'

/** Said where the yes did not come from a signed-in session of the person saying it (Teams, today). */
export const PUT_FORWARD_SIGNED_IN =
  'Put them forward from Ask Etyme on the web, signed in as yourself, or from the job’s page. The submission goes out in your name, so it is made from your own session.'

/** Live seats at the firm that put people forward. */
export async function recruitersAt(companyId: string, take = 25): Promise<string[]> {
  const rows = await prisma.context.findMany({
    where: {
      companyId, revokedAt: null, type: { not: 'CONSULTANT' },
      role: { permissions: { hasSome: ['submissions.create', '*'] } },
      ...NOT_THE_SAMPLE_SEAT,
    },
    select: { personId: true },
    take,
  })
  return [...new Set(rows.map((r) => r.personId))]
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

function rateOf(c: PerformContext): number | null {
  const a = (c.payload.answer && typeof c.payload.answer === 'object' ? c.payload.answer : {}) as Record<string, unknown>
  const r = a.rateCents
  return typeof r === 'number' && Number.isInteger(r) && r > 0 ? r : null
}

// ── Consent ───────────────────────────────────────────────────────────

/**
 * Why this firm may put this person forward at all, or null. The two
 * consents the submission door reads (CLAUDE.md, "Who sells and who
 * buys"): a listing the person granted to this firm and still running, or
 * the firm employing them. Read here so the twin never asks a question the
 * door would refuse; the door reads them again on the yes.
 */
export async function consentAt(companyId: string, personId: string, now: Date = new Date()): Promise<'LISTING' | 'EMPLOYEE' | null> {
  const [listing, employed] = await Promise.all([
    prisma.benchListing.findFirst({
      where: {
        companyId, revokedAt: null, state: 'GRANTED',
        consultant: { personId },
        OR: [{ staysUntil: null }, { staysUntil: { gt: now } }],
      },
      select: { id: true },
    }),
    prisma.context.findFirst({
      where: { companyId, personId, type: 'EMPLOYEE', revokedAt: null },
      select: { id: true },
    }),
  ])
  return listing ? 'LISTING' : employed ? 'EMPLOYEE' : null
}

// ── Putting a bench person forward ────────────────────────────────────

const OPEN_INVITATION = ['SENT', 'ACCEPTED']

const putForward: Performer = {
  async check(c) {
    if (c.entity.type !== 'Requirement') return 'Ask Etyme puts somebody forward only to a job.'
    const personId = str(c.payload.personId)
    if (!personId) return 'Say who to put forward.'
    const name = str(c.payload.personName) ?? 'This person'
    const [job, invited, already, consent] = await Promise.all([
      prisma.requirement.findUnique({ where: { id: c.entity.id }, select: { status: true, approvalState: true, title: true } }),
      prisma.requirementInvitation.findUnique({
        where: { requirementId_toCompanyId: { requirementId: c.entity.id, toCompanyId: c.companyId } },
        select: { status: true, expiresAt: true },
      }),
      prisma.submission.findFirst({ where: { requirementId: c.entity.id, personId }, select: { id: true } }),
      consentAt(c.companyId, personId),
    ])
    if (!job) return 'That job is not on the record.'
    if (job.status !== 'OPEN' || job.approvalState === 'PENDING_APPROVAL') return `${job.title} is not taking candidates now.`
    if (!invited || !OPEN_INVITATION.includes(invited.status) || invited.expiresAt.getTime() <= Date.now()) {
      return `${job.title} was not sent to this firm, or the invitation has closed. Ask Etyme puts people forward only to jobs the firm was sent.`
    }
    if (already) return `${name} has already been put forward to ${job.title}.`
    if (!consent) {
      return `${name} has not said yes to this firm’s bench and is not employed here, so Ask Etyme does not put them forward.`
    }
    // On the yes, the rate the person entered. Asked first, never filled.
    if (c.approverPersonId && !rateOf(c)) return NEEDS_RATE
    return null
  },
  async door(c): Promise<DoorResult> {
    const personId = str(c.payload.personId)
    const rateCents = rateOf(c)
    if (!c.approverPersonId) return { ok: false, says: 'A person is put forward only on a person’s yes.' }
    if (!personId) return { ok: false, says: 'Say who to put forward.' }
    if (!rateCents) return { ok: false, says: NEEDS_RATE }
    const { NextRequest } = await import('next/server')
    const { getCallerContext } = await import('@/lib/api-context')
    // The submission goes out in the name of whoever said yes, so it is
    // made from their own session and nobody else's. A yes that arrived
    // without one (a Teams card, today) is refused in a sentence.
    const who = await getCallerContext(new NextRequest('http://localhost/api/submissions', { method: 'POST' }))
    if (who.error || !who.caller || who.caller.isService || who.caller.person.id !== c.approverPersonId) {
      return { ok: false, says: PUT_FORWARD_SIGNED_IN }
    }
    const { POST } = await import('@/app/api/submissions/route')
    const res = await POST(new NextRequest('http://localhost/api/submissions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ requirementId: c.entity.id, personIds: [personId], rate: rateCents, fromCompanyId: c.companyId }),
    }))
    const body = (await res.json().catch(() => null)) as {
      data?: { results?: { status?: string; error?: string; submissionId?: string; message?: string }[] }
      error?: { message?: string }
    } | null
    if (!res.ok) return { ok: false, says: body?.error?.message ?? 'The submission was refused.' }
    const item = body?.data?.results?.[0]
    if (!item || item.status !== 'created' || !item.submissionId) {
      return { ok: false, says: item?.error ?? item?.message ?? 'The submission was not made.' }
    }
    return { ok: true, result: { submissionId: item.submissionId, requirementId: c.entity.id, personId, rateCents } }
  },
}

// ── Asking for the papers a start needs ───────────────────────────────

const NOT_STARTED = ['DRAFT', 'PENDING_VERIFICATION', 'VERIFIED']

/** Why the twin may not ask for this line's start papers, or null. Shared by the check and the nightly run. */
export async function startAskRefusal(companyId: string, contractId: string): Promise<string | null> {
  const line = await prisma.sellContract.findUnique({
    where: { id: contractId },
    select: { companyId: true, personId: true, state: true, person: { select: { name: true } } },
  })
  if (!line || line.companyId !== companyId) return 'That line is not on this firm’s books.'
  if (!NOT_STARTED.includes(line.state)) return `${line.person.name} has already started or the line has ended, so there is no start to ask papers for.`
  // The set this firm confirmed for this kind of worker (lib/setup-gates):
  // never confirmed, nobody is chased, and the sentence names the step.
  const gate = await mayChasePaper(companyId, await workerPartyAt(line.personId, companyId))
  return gate.ok ? null : gate.says
}

const askForStart: Performer = {
  async check(c) {
    if (c.entity.type !== 'SellContract') return 'Ask Etyme asks for start papers only on a line.'
    return startAskRefusal(c.companyId, c.entity.id)
  },
  async door(c): Promise<DoorResult> {
    // Regulatory's own ask: it reads the line's required set, asks the
    // worker once for what is theirs to produce, never for what is held,
    // and tells HR what is the firm's own. Recorded as asked by HR, the
    // desk whose chase it is.
    const { askForClearance } = await import('@/app/api/compliance/clearance/ask')
    const out = await askForClearance({ contractId: c.entity.id, actorPersonId: null })
    if (!out.preview) return { ok: false, says: out.says }
    if (!('packetId' in out) || !out.packetId || out.alreadyAsked) return { ok: false, says: out.says }
    return { ok: true, result: { packetId: out.packetId, says: out.says, told: out.told } }
  },
}

// ── Who is coming free ────────────────────────────────────────────────

export interface ComingFreeRow { personId: string; name: string; days: number; client?: string | null }

/** The notice's title: names, never a bare count (founder, 2026-10-19). Pure. */
export function comingFreeTitle(coming: readonly ComingFreeRow[], idle: readonly ComingFreeRow[]): string {
  const first = (rows: readonly ComingFreeRow[], say: (r: ComingFreeRow) => string) =>
    rows.length === 0 ? null : `${say(rows[0])}${rows.length > 1 ? ` and ${rows.length - 1} more` : ''}`
  const parts = [
    first(coming, (r) => `${r.name} comes off a project in ${r.days} day${r.days === 1 ? '' : 's'}`),
    first(idle, (r) => `${r.name} has waited on the bench ${r.days} days`),
  ].filter((x): x is string => !!x)
  return parts.length ? parts.join('; ') : 'Nobody is coming free'
}

/** The notice's body, one line a person. Pure. */
export function comingFreeBody(coming: readonly ComingFreeRow[], idle: readonly ComingFreeRow[]): string {
  const lines: string[] = []
  if (coming.length) {
    lines.push('Coming off a project in the next 30 days:')
    for (const r of coming) lines.push(`${r.name}, in ${r.days} day${r.days === 1 ? '' : 's'}${r.client ? ` (at ${r.client})` : ''}`)
  }
  if (idle.length) {
    lines.push('On the bench for more than 14 days:')
    for (const r of idle) lines.push(`${r.name}, ${r.days} days`)
  }
  return lines.join('\n')
}

function rows(v: unknown): ComingFreeRow[] {
  return Array.isArray(v)
    ? v.filter((r): r is ComingFreeRow => !!r && typeof r === 'object' && typeof (r as ComingFreeRow).name === 'string')
    : []
}

const comingFree: Performer = {
  async check(c) {
    if (c.entity.type !== 'Company' || c.entity.id !== c.companyId) return 'Ask Etyme tells a firm only about its own bench.'
    if (rows(c.payload.comingFree).length === 0 && rows(c.payload.idle).length === 0) {
      return 'Nobody comes off a project in the next 30 days and nobody has waited on the bench past 14, so there is nothing to tell.'
    }
    return null
  },
  async after(c) {
    const coming = rows(c.payload.comingFree)
    const idle = rows(c.payload.idle)
    const to = await recruitersAt(c.companyId)
    if (to.length === 0) return
    await notifyBulk(to.map((personId) => ({
      personId,
      companyId: c.companyId,
      type: 'SYSTEM' as const,
      title: comingFreeTitle(coming, idle).slice(0, 120),
      body: comingFreeBody(coming, idle),
      entityId: c.companyId,
      data: { twinAction: c.action, entityType: 'Company', entityId: c.companyId },
    })))
  },
}

export const SUPPLIER_ACT_PERFORMERS: Readonly<Record<string, Performer>> = {
  'bench.put_forward': putForward,
  'papers.ask_for_start': askForStart,
  'bench.coming_free': comingFree,
}
