/**
 * Stage: handoffs. Owned by conversation.
 *
 * The chaos is between people (CLAUDE.md, 2026-10-19), and the record is
 * what makes each handoff plain. So this station runs last and reads,
 * as each seat, what that seat was told and what Ask Etyme says to it,
 * and holds it against what happened:
 *
 *   - a job sent: each invited supplier's account manager has a notice
 *     about that job and a thread on it;
 *   - a candidate put forward: the hiring manager's greeting names them;
 *   - a week filed: the signer's greeting says whose week waits and by when;
 *   - a week the client signed: the next firm's AP & Payroll is told it
 *     reached them, and the worker's greeting says it is signed;
 *   - a bill sent: the payer's AP clerk reads it;
 *   - an invoice receipt on hold: the supplier's owner reads "on hold"
 *     with the reason;
 *   - a week paid or owed: the worker's "owed to you" line answers.
 *
 * And for every seat it reads: the greeting names people rather than
 * counting them, "Since you last looked" says who and what with no
 * machine talk, the chips and the closing line are the party's own, and
 * the number on the Ask Etyme mark (`?only=owed`) equals the greeting's
 * count. The greeting is timed per party under load, and every message
 * the run would have sent by email or Teams is grouped by kind and by the
 * party that received it, with anybody told twice of one thing, or told
 * nothing of a thing that needed them, named.
 *
 * A handoff the earlier stations made this run is held to both halves —
 * told, and named in the greeting. A handoff that was already in the
 * seeded world is held to the greeting alone, because the seed writes
 * its rows directly and sends nobody anything; that is said, not
 * counted as a fault.
 *
 * It reads and never writes, with three exceptions that are the reader's
 * own and the product's: a greeting marks the notices it said as read
 * (which is why every seat's notices are read before its greeting), and
 * a worker asked "What am I owed?" keeps nothing on a seeded seat.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { closeFor, questionsFor, type Party } from '@/app/api/conversations/twin/ask'
import { WORKER_CLOSE, WORKER_QUESTIONS } from '@/app/api/conversations/twin/worker'
import type { Actor, SeatSpec } from '../../actors'
import { defineStage, type Ctx } from '../../stage'
import {
  SINCE, blocksOf, countSaid, holdReasonOf, machineTalk, names, outboundBy, pct, sinceLines, subjectOf, textOf,
  teamsToWorkers, toldTwice, type NoticeRow,
} from './handoffs-read'

/** The founder's line for "falls over", the ledger's own. */
const SLOW_MS = 2000
/** How many weeks, bills or people of one kind a seat is checked for. Beyond it the greeting names the first three and the list holds the rest. */
const PER_KIND = 60
/** Workers asked "What am I owed?" at most. */
const OWED_ASKED = 25

type Mode = 'RUN' | 'SEED'

interface Notice { id: string; type: string; title: string; body: string; entityId: string | null; status: string; channel: string }

/** One seat as it was read. */
interface SeatRead {
  key: string
  name: string
  company: string | null
  companyKind: string | null
  expected: Party | 'WORKER' | null
  party: string | null
  client: string | null
  notices: Notice[]
  unread: Notice[]
  owed: number | null
  owedMs: number | null
  greetMs: number[]
  status: number
  answer: any
  text: string
  lines: string[]
  count: number | null
  faults: string[]
}

/** One handoff: who should have been told, about what, and what they should read. */
interface Handoff {
  kind: 'JOB_SENT' | 'PUT_FORWARD' | 'WEEK_WAITS' | 'WEEK_SIGNED' | 'BILL_SENT' | 'ON_HOLD'
  mode: Mode
  /** The seats that should hear, the first the one named in the brief. */
  seats: string[]
  /** The thing, for a notice's entityId. */
  entityId: string
  /** Other ids a notice about it may carry (the job a submission is for). */
  alsoAbout?: string[]
  /** Still waiting on the seat at the end of the run, so the greeting should name it. */
  waiting: boolean
  /** What the greeting should say: a person's name, a job, a bill number. Any one of them counts. */
  name: string[]
  /** A word the line about it must carry ("on hold", the reason). */
  must?: string[]
  /** The job a thread should be on. */
  threadOn?: string
  /** For the report: who and what, in a few words. */
  what: string
  told?: boolean
  /** For a candidate put forward: the notice names them. */
  toldWho?: boolean
  thread?: boolean
  named?: boolean
  carried?: boolean
}

/**
 * Which handoffs must reach the person as a notice, and which are the
 * greeting's to say. A job sent, a week passed down and a hold are news
 * from another firm: a notice, by email or Teams. A candidate put forward
 * and a week to sign are decisions on the reader's own list: the greeting
 * names them. A bill sent is either.
 */
const NEEDS_NOTICE: Record<Handoff['kind'], 'NOTICE' | 'GREETING' | 'EITHER'> = {
  JOB_SENT: 'NOTICE', PUT_FORWARD: 'GREETING', WEEK_WAITS: 'GREETING', WEEK_SIGNED: 'NOTICE', BILL_SENT: 'EITHER', ON_HOLD: 'NOTICE',
}

const KIND_SAYS: Record<Handoff['kind'], string> = {
  JOB_SENT: 'A job sent: the supplier’s account manager has a notice and a thread',
  PUT_FORWARD: 'A candidate put forward: the hiring manager’s greeting names them',
  WEEK_WAITS: 'A week filed: the signer’s greeting says whose week waits and by when',
  WEEK_SIGNED: 'A week signed by the client: the next firm’s AP & Payroll is told',
  BILL_SENT: 'A bill sent: the payer’s AP clerk reads it',
  ON_HOLD: 'An invoice receipt on hold: the supplier’s owner reads “on hold” and why',
}

function partyLabel(kind: string | null, worker: boolean): string {
  if (worker) return 'worker'
  switch (kind) {
    case 'CLIENT': return 'client'
    case 'VENDOR': return 'supplier'
    case 'GSI': return 'integrator'
    case 'MSP': return 'MSP'
    case 'CONSULTANT_CORP': return 'one-person firm'
    default: return 'no firm'
  }
}

/** The party a seat should read Ask Etyme as, from the seat alone. Null where the seat decides (a firm's staff with no desk reads as a worker). */
function expectedParty(s: SeatSpec): Party | 'WORKER' | null {
  // A one-person firm's owner is the firm and the worker at once, and reads her firm's Ask Etyme.
  if (s.key.startsWith('person/') && s.company?.kind === 'CONSULTANT_CORP') return 'SOLO'
  if (s.key.startsWith('person/') || s.key.startsWith('worker/')) return 'WORKER'
  if (s.key.startsWith('staff/')) return null
  switch (s.company?.kind) {
    case 'CLIENT': return 'CLIENT'
    case 'MSP': return 'MSP'
    case 'CONSULTANT_CORP': return 'SOLO'
    case 'VENDOR':
    case 'GSI': return 'FIRM'
    default: return null
  }
}

/**
 * Whose a seat's fault is, from what it says. A notice said without what
 * it is about is the title its writer gave it; the greeting says the
 * title, so the writer owns the words.
 */
const TITLE_OWNERS: [RegExp, string][] = [
  [/“New requirement from/, 'demand — app/api/requisitions/[id]/distribute writes the title, and says “requirement”'],
  [/“New submission for/, 'demand — app/api/submissions writes the title, with no candidate named'],
  [/week is yours to accept”/, 'demand — app/api/timesheets/chain-turn writes the title, with no week named'],
  [/“Timesheet approved”/, 'demand — app/api/timesheets/[id]/approve writes the title, with no week named'],
  [/“Contract (activated|.*may begin)/, 'money — app/api/contracts/[id]/activate writes the title, with no client named'],
  [/document\(s\) before you start/, 'regulatory — app/api/compliance/clearance/ask writes the title'],
  [/is asking you to decide”/, 'architect — lib/twin/ledger writes the title; conversation now leaves it out where its card is in the greeting'],
  [/interview|round \d+ .*is booked|through to round/, 'conversation — lib/interview-notices'],
  [/put you forward to/, 'demand — app/api/submissions writes the title, with no job named'],
  [/An expense of yours was accepted/, 'money — app/api/expenses/[id]/accept writes it once per firm that accepts'],
]
function ownerOfTitle(title: string): string {
  return TITLE_OWNERS.find(([re]) => re.test(`“${title}”`))?.[1] ?? 'whoever writes that notice'
}
function ownerOfFault(f: string): string {
  if (/nobody has given you a seat yet/.test(f)) return 'architect — lib/api-context refuses a placed worker with no seat before Ask Etyme’s own door for a candidate with no company'
  if (/^The mark says/.test(f)) return 'conversation, with demand where the decisions queue moved between the two reads'
  if (/is said without what it is about/.test(f)) return TITLE_OWNERS.find(([re]) => re.test(f))?.[1] ?? 'whoever writes that notice'
  return 'conversation'
}

function stampNow(d = new Date()): string {
  return d.toISOString().replace(/[-:T]/g, '').slice(0, 14)
}

export default defineStage({
  name: 'handoffs',
  domain: 'CONVERSATION',
  async run(ctx) {
    const t0 = Date.now()
    // What this run made is what happened after the first call of a station
    // before this one; the seed is older. A world copied from an earlier
    // run's kept database (--template) names that run's start instead, in
    // HANDOFFS_SINCE, so the station can be read again without the run.
    const others = ctx.ledger.calls.filter((c) => c.stage !== 'handoffs')
    const since = process.env.HANDOFFS_SINCE ? new Date(process.env.HANDOFFS_SINCE) : null
    const runStart = since && !Number.isNaN(since.getTime()) ? since : others.length ? new Date(others[0].at) : new Date()
    const touched = new Set(others.map((c) => c.seat).filter((k) => k !== 'cron' && ctx.cast.seats.some((s) => s.key === k)))
    const seatOf = (key: string | null | undefined): Actor | null => (key && ctx.cast.seats.some((s) => s.key === key) ? ctx.cast.seat(key) : null)
    const seatFor = (personId: string | null, companyId: string | null): string | null =>
      personId ? ctx.cast.seats.find((s) => s.personId === personId && (!companyId || s.company?.id === companyId))?.key ?? null : null
    const deskAt = (slug: string, ...desks: string[]): string | null => {
      for (const d of desks) {
        const key = `${slug}/${d}`
        if (ctx.cast.seats.some((s) => s.key === key)) return key
      }
      return null
    }
    const workerSeat = (email: string): string | null => {
      try {
        return ctx.cast.worker(email).key
      } catch {
        return null
      }
    }

    // ── 1. What happened, and who should have heard ─────────────────────
    //
    // A handoff is an event (a job sent, a week signed), so every one this
    // run made is held to "told", whatever became of it afterwards. Only
    // the ones still waiting on the seat at the end are held to "named in
    // the greeting", because a greeting is what needs you now. Where the
    // run made none of a kind, the seeded rows still waiting are read
    // from the greeting alone.
    const handoffs: Handoff[] = []
    const pick = <T extends { at: Date | null; waiting: boolean }>(rows: T[]): { mode: Mode; rows: T[] } => {
      const made = rows.filter((r) => r.at && r.at >= runStart)
      return made.length ? { mode: 'RUN', rows: made } : { mode: 'SEED', rows: rows.filter((r) => r.waiting) }
    }
    // Every waiting row is held to the greeting; of the rest, enough to show the notices, not all of them.
    const some = <T extends { waiting: boolean }>(rows: T[]): T[] => [...rows.filter((r) => r.waiting), ...rows.filter((r) => !r.waiting).slice(0, PER_KIND * 3)]

    // A job sent to a supplier.
    {
      const rows = await ctx.read.$queryRawUnsafe<{ id: string; requirementId: string; title: string; toSlug: string; toName: string; client: string; at: Date; waiting: boolean }[]>(`
        select i.id, i."requirementId", r.title, co.slug as "toSlug", co.name as "toName", cl.name as client, i."createdAt" as at,
               (i.status = 'SENT') as waiting
        from "RequirementInvitation" i
        join "Requirement" r on r.id = i."requirementId"
        join "Company" co on co.id = i."toCompanyId"
        join "Company" cl on cl.id = i."fromCompanyId"
        where co.slug like 'world-%'
        order by i."createdAt" desc`)
      const { mode, rows: use } = pick(rows)
      for (const r of some(use)) {
        const am = deskAt(r.toSlug, 'account', 'owner')
        if (!am) continue
        handoffs.push({
          kind: 'JOB_SENT', mode, waiting: r.waiting, seats: [am], entityId: r.requirementId, alsoAbout: [r.id], name: [r.title], threadOn: r.requirementId,
          what: `${r.client} sent the ${r.title} job to ${r.toName}`,
        })
      }
    }

    // A candidate put forward to a client.
    {
      const rows = await ctx.read.$queryRawUnsafe<{ id: string; requirementId: string; candidate: string; title: string; clientId: string; clientSlug: string; ownerId: string | null; raisedById: string | null; supplier: string; at: Date; waiting: boolean }[]>(`
        select s.id, s."requirementId", p.name as candidate, r.title, cl.id as "clientId", cl.slug as "clientSlug", r."ownerId", r."raisedById",
               fc.name as supplier, s."submittedAt" as at, (s.status in ('SUBMITTED', 'SCREENING', 'SHORTLISTED', 'UNDER_REVIEW')) as waiting
        from "Submission" s
        join "Person" p on p.id = s."personId"
        join "Requirement" r on r.id = s."requirementId"
        join "Company" cl on cl.id = s."toCompanyId"
        join "Company" fc on fc.id = s."fromCompanyId"
        where cl.kind = 'CLIENT' and cl.slug like 'world-%'
        order by s."submittedAt" desc`)
      const { mode, rows: use } = pick(rows)
      for (const r of some(use)) {
        const hm = seatFor(r.ownerId, r.clientId) ?? seatFor(r.raisedById, r.clientId) ?? deskAt(r.clientSlug, 'hiring', 'programme')
        if (!hm) continue
        handoffs.push({
          kind: 'PUT_FORWARD', mode, waiting: r.waiting, seats: [hm], entityId: r.id, alsoAbout: [r.requirementId], name: [r.candidate],
          what: `${r.supplier} put ${r.candidate} forward for ${r.title}`,
        })
      }
    }

    // A week filed and waiting on the client, and a week the client signed that goes to the firm below.
    {
      const rows = await ctx.read.$queryRawUnsafe<{ id: string; worker: string; status: string; signedAt: Date | null; acceptedAt: Date | null; submittedAt: Date | null;
        siteSlug: string; siteKind: string; nextSlug: string; nextKind: string; periodStart: Date }[]>(`
        select t.id, p.name as worker, t.status, t."clientApprovedAt" as "signedAt", t."employerAcceptedAt" as "acceptedAt",
               t."submittedAt", site.slug as "siteSlug", site.kind::text as "siteKind", nxt.slug as "nextSlug", nxt.kind::text as "nextKind", t."periodStart"
        from "Timesheet" t
        join "Person" p on p.id = t."personId"
        join "SellContract" sc on sc.id = t."sellContractId"
        join "Company" site on site.id = coalesce(sc."endClientCompanyId", sc."clientCompanyId")
        -- The week sits on the worker's own rung. The firm the client signed it to is the one it
        -- pays: the firm above her employer where there is a chain, her employer where there is none.
        join "Company" nxt on nxt.id = case when sc."clientCompanyId" <> coalesce(sc."endClientCompanyId", sc."clientCompanyId") then sc."clientCompanyId" else sc."companyId" end
        where site.slug like 'world-%' and t.status in ('SUBMITTED', 'APPROVED')
        order by t."periodStart" desc`)
      const week = (r: { periodStart: Date }) => r.periodStart.toISOString().slice(0, 10)
      const filed = rows.filter((r) => r.siteKind === 'CLIENT').map((r) => ({ ...r, at: r.submittedAt, waiting: r.status === 'SUBMITTED' && !r.signedAt }))
      const w = pick(filed)
      for (const r of some(w.rows)) {
        const signers = [deskAt(r.siteSlug, 'hiring'), deskAt(r.siteSlug, 'programme')].filter((x): x is string => !!x)
        if (!signers.length) continue
        handoffs.push({
          kind: 'WEEK_WAITS', mode: w.mode, waiting: r.waiting, seats: signers, entityId: r.id, name: [r.worker],
          must: ['by', 'due', 'today', 'tomorrow', 'overdue', 'since', 'waiting'],
          what: `${r.worker}’s week of ${week(r)} was filed for the client to sign`,
        })
      }
      // A one-person firm accepting its own owner's week is nobody's handoff: nobody signs their own.
      const signed = rows
        .filter((r) => r.signedAt && r.nextKind !== 'CLIENT' && r.nextKind !== 'CONSULTANT_CORP')
        .map((r) => ({ ...r, at: r.signedAt, waiting: !r.acceptedAt }))
      const s = pick(signed)
      for (const r of some(s.rows)) {
        const ap = deskAt(r.nextSlug, 'ap', 'payroll', 'finance', 'owner')
        if (!ap) continue
        handoffs.push({
          kind: 'WEEK_SIGNED', mode: s.mode, waiting: r.waiting, seats: [ap], entityId: r.id, name: [r.worker],
          what: `${r.worker}’s week of ${week(r)} was signed by the client and went to the firm below`,
        })
      }
    }

    // A bill sent to the client, and an invoice receipt the client put on hold.
    {
      const rows = await ctx.read.$queryRawUnsafe<{ id: string; number: string; status: string; at: Date | null; payerSlug: string | null; vendorSlug: string | null; vendor: string | null; payer: string | null }[]>(`
        select i.id, i.number, i.status, coalesce(i."submittedAt", i."issuedAt") as at,
               payer.slug as "payerSlug", vendor.slug as "vendorSlug", vendor.name as vendor, payer.name as payer
        from "Invoice" i
        join "Engagement" e on e.id = i."engagementId"
        left join "MasterAgreement" m on m.id = e."msaId"
        left join lateral (
          select sc."companyId", sc."clientCompanyId" from "InvoiceLine" l join "SellContract" sc on sc.id = l."sellContractId"
          where l."invoiceId" = i.id limit 1
        ) line on true
        left join "Company" payer on payer.id = coalesce(i."payerId", m."clientId", line."clientCompanyId")
        left join "Company" vendor on vendor.id = coalesce(m."vendorId", line."companyId")
        where i.status not in ('DRAFT', 'VOID', 'CANCELLED') and payer.slug like 'world-%'
        order by coalesce(i."submittedAt", i."issuedAt") desc nulls last`)
      const sent = pick(rows.filter((r) => r.status !== 'HELD').map((r) => ({ ...r, waiting: ['SUBMITTED', 'SENT', 'ISSUED', 'PARTIALLY_PAID'].includes(r.status) })))
      for (const r of some(sent.rows)) {
        const ap = r.payerSlug ? deskAt(r.payerSlug, 'ap', 'finance', 'owner') : null
        if (!ap) continue
        handoffs.push({
          kind: 'BILL_SENT', mode: sent.mode, waiting: r.waiting, seats: [ap], entityId: r.id, name: [r.number, ...(r.vendor ? [r.vendor] : [])],
          what: `${r.vendor ?? 'A supplier'} sent bill ${r.number} to ${r.payer ?? 'its client'}`,
        })
      }
      const held = rows.filter((r) => r.status === 'HELD')
      if (held.length) {
        const reasons = await ctx.read.$queryRawUnsafe<{ invoiceId: string; reason: string | null; at: Date }[]>(`
          select payload->>'invoiceId' as "invoiceId", payload->>'reason' as reason, "createdAt" as at
          from "AutomationLog" where action = 'INVOICE_HELD' order by "createdAt" desc`)
        const h = pick(held.map((r) => ({ ...r, at: reasons.find((x) => x.invoiceId === r.id)?.at ?? null, waiting: true })))
        for (const r of h.rows.slice(0, PER_KIND)) {
          const owner = r.vendorSlug ? deskAt(r.vendorSlug, 'owner') : null
          if (!owner) continue
          const reason = reasons.find((x) => x.invoiceId === r.id)?.reason ?? null
          handoffs.push({
            kind: 'ON_HOLD', mode: h.mode, waiting: true, seats: [owner], entityId: r.id, name: [r.number],
            must: ['on hold', ...(reason ? [reason] : [])],
            what: `${r.payer ?? 'The client'} put ${r.number} on hold${reason ? `: ${reason}` : ''}`,
          })
        }
      }
    }

    // ── 2. Which seats to read ──────────────────────────────────────────
    const keys = new Set<string>([...touched, ...handoffs.flatMap((h) => h.seats)])
    // Nothing else ran: every seat the world holds, so the seeded greetings are read too.
    if (touched.size === 0) for (const s of ctx.cast.seats) keys.add(s.key)
    // The workers whose weeks moved: their greeting says where the week stands.
    const workerRows = await ctx.read.$queryRawUnsafe<{ email: string; name: string; latestSigned: boolean; accepted: number; at: Date | null }[]>(`
      select p."primaryEmail" as email, p.name,
             bool_or(t."clientApprovedAt" is not null and t."periodStart" = (select max(t2."periodStart") from "Timesheet" t2 where t2."personId" = p.id and t2.status <> 'OPEN')) as "latestSigned",
             count(*) filter (where t."employerAcceptedAt" is not null)::int as accepted,
             max(coalesce(t."employerAcceptedAt", t."clientApprovedAt", t."submittedAt")) as at
      from "Timesheet" t join "Person" p on p.id = t."personId"
      where t.status in ('SUBMITTED', 'APPROVED')
      group by p.id`)
    const workersMoved = pick(workerRows.map((w) => ({ ...w, waiting: true })))
    for (const w of workersMoved.rows) {
      const k = workerSeat(w.email)
      if (k) keys.add(k)
    }

    // ── 3. Read every seat: its notices first, then the mark, then the greeting ──
    const specs = new Map(ctx.cast.seats.map((s) => [s.key, s]))
    const order = [...keys].filter((k) => specs.has(k) || k.startsWith('worker/'))
    const reads = new Map<string, SeatRead>()
    // One person at two seats (Colleen Byrne at her corporation and by name) is read one seat
    // after the other: a greeting marks her notices read, and the other seat must see that.
    const byPerson = new Map<string, Promise<void>>()
    await ctx.parallel(order, async (key) => {
      const a = ctx.cast.seat(key)
      const spec = specs.get(key) ?? a.spec
      const who = spec.personId || key
      const before = byPerson.get(who) ?? Promise.resolve()
      let done!: () => void
      const gate = new Promise<void>((resolve) => (done = resolve))
      byPerson.set(who, before.then(() => gate))
      await before
      try {
        await readSeat(key, a, spec)
      } finally {
        done()
      }
    })
    async function readSeat(key: string, a: Actor, spec: SeatSpec): Promise<void> {
      const r: SeatRead = {
        key, name: spec.personName, company: spec.company?.name ?? null, companyKind: spec.company?.kind ?? null,
        expected: expectedParty(spec), party: null, client: null, notices: [], unread: [], owed: null, owedMs: null,
        greetMs: [], status: 0, answer: null, text: '', lines: [], count: null, faults: [],
      }
      reads.set(key, r)
      try {
        // The notices as the seat lists them, before the greeting marks the ones it says as read.
        const n = await a.get('/api/notifications?limit=100')
        r.notices = n.ok && Array.isArray(n.json?.data?.notifications) ? n.json.data.notifications : []
        r.unread = r.notices.filter((x) => x.status === 'UNREAD')
        const o = await a.get('/api/conversations/twin?only=owed')
        r.owedMs = o.ms
        r.owed = o.ok && typeof o.json?.data?.total === 'number' ? o.json.data.total : null
        if (!o.ok) r.faults.push(`The mark’s number could not be read (${o.status}${o.sentence ? `: ${o.sentence}` : ''}).`)
        const g = await a.get('/api/conversations/twin')
        r.status = g.status
        r.greetMs.push(g.ms)
        if (!g.ok) {
          r.faults.push(`The greeting did not open (${g.status}${g.sentence ? `: ${g.sentence}` : ''}).`)
          return
        }
        const d = g.json?.data ?? {}
        r.answer = d.answer
        r.party = typeof d.party === 'string' ? d.party : null
        r.client = typeof d.client === 'string' ? d.client : null
        r.text = textOf(d.answer)
        r.lines = [...(d.answer?.more ?? []), ...(d.answer?.tail ?? [])].map((l: any) => (typeof l?.says === 'string' ? l.says : '')).filter(Boolean)
        r.count = countSaid(d.answer?.says)
      } catch (e: any) {
        r.faults.push(`The seat could not be read: ${String(e?.message ?? e)}`)
      }
    }

    // ── 4. Judge every greeting ─────────────────────────────────────────
    // Where each unread notice was written, and where its reader holds a desk: a notice
    // written at another firm where she holds a desk waits for that seat, on purpose.
    const unreadIds = [...reads.values()].flatMap((r) => r.unread.map((n) => n.id))
    const writtenAt = new Map(
      (unreadIds.length ? await ctx.read.notification.findMany({ where: { id: { in: unreadIds } }, select: { id: true, companyId: true } }) : []).map((n) => [n.id, n.companyId])
    )
    const deskSeats = await ctx.read.context.findMany({ where: { revokedAt: null, type: { not: 'CONSULTANT' } }, select: { personId: true, companyId: true } })
    const holdsDesk = new Set(deskSeats.map((c) => `${c.personId}\u0000${c.companyId}`))
    // Read after every greeting: a notice the greeting handled is READ, whether it said it or
    // left it out on purpose (its card is above it, or Etyme's question was already answered).
    const stillUnread = new Set(
      (unreadIds.length ? await ctx.read.notification.findMany({ where: { id: { in: unreadIds }, status: 'UNREAD' }, select: { id: true } }) : []).map((n) => n.id)
    )
    let countsAgree = 0
    let countsCompared = 0
    const countNotSaid: string[] = []
    for (const r of reads.values()) {
      if (!r.answer) continue
      // The number on the mark is the greeting's own count.
      if (r.owed != null && r.count != null) {
        countsCompared++
        if (r.owed === r.count) countsAgree++
        else r.faults.push(`The mark says ${r.owed} and the greeting says ${r.count}.`)
      } else if (r.owed != null && r.owed > 0 && r.count == null) {
        countNotSaid.push(`${r.name} (${r.key}): the mark says ${r.owed}; the greeting opens “${String(r.answer?.says ?? '').slice(0, 90)}”`)
      }
      // The party's own chips and closing line.
      const party = r.party as Party | 'WORKER' | null
      if (r.expected && party && r.expected !== party && !(r.expected === 'FIRM' && party === 'MSP' && r.client)) {
        r.faults.push(`Read as ${party}, but the seat is ${r.expected}.`)
      }
      if (party) {
        const chips = party === 'WORKER' ? WORKER_QUESTIONS : questionsFor(party)
        const close = party === 'WORKER' ? WORKER_CLOSE : closeFor(party, r.client)
        if (!r.lines.includes(close)) r.faults.push(`The closing line is not the ${party.toLowerCase()}’s own.`)
        if (party !== 'CLIENT' && party !== 'MSP' && chips.some((c) => /time limit/i.test(c))) r.faults.push('A firm or a worker is offered the client’s time-limit chip.')
        if (party === 'SOLO' && /about the program/i.test(r.text)) r.faults.push('A one-person firm is told about “the program”.')
      }
      // "Since you last looked" says who and what.
      const closing = party === 'WORKER' ? [WORKER_CLOSE] : party ? [closeFor(party as Party, r.client)] : []
      const since = sinceLines(r.lines, closing)
      const spec = specs.get(r.key)
      const unreadNotes = r.unread.filter((x) => {
        if (x.type === 'CONVERSATION' || (x.entityId ?? '').startsWith('twin-digest:')) return false
        const at = writtenAt.get(x.id) ?? null
        return !at || at === spec?.company?.id || !holdsDesk.has(`${spec?.personId}\u0000${at}`)
      })
      const lost = unreadNotes.filter((x) => stillUnread.has(x.id))
      if (lost.length && !r.lines.includes(SINCE) && !r.answer?.held?.length) {
        r.faults.push(`${lost.length} unread ${lost.length === 1 ? 'notice was' : 'notices were'} neither said under “Since you last looked” nor marked read: “${lost[0].title}”.`)
      }
      for (const line of [...since, ...r.lines.slice(0, 1), String(r.answer?.says ?? '')]) {
        const why = machineTalk(line)
        if (why) r.faults.push(`Machine talk (${why}): “${line.slice(0, 120)}”`)
      }
      // A notice that names a thing in its body is said with that thing, not only the title.
      for (const n of unreadNotes.slice(0, 5)) {
        const what = subjectOf(n.body)
        // "Your round 1 with Northbend Athletic is booked" is her own thing, and she knows which;
        // and a question whose card is in the greeting is said by the card, not by its notice.
        // Only a notice the greeting actually said: one left out (its card is above, or it was answered) is not said without anything.
        const said = since.some((l) => names(l, n.title.replace(/[\s.!:;,]+$/u, '').replace(/!/g, '')))
        if (what && said && !/^Your\b/.test(n.title) && !names(r.text, what) && !names(n.title, what)) {
          r.faults.push(`“${n.title}” is said without what it is about (${what}).`)
        }
      }
    }

    // ── 5. Each handoff: told, threaded, named ───────────────────────────
    const threadChecks = handoffs.filter((h) => h.kind === 'JOB_SENT' && h.mode === 'RUN').slice(0, PER_KIND * 2)
    await ctx.parallel(threadChecks, async (h) => {
      const a = seatOf(h.seats[0])
      if (!a) return
      const res = await a.get(`/api/conversations?topic=REQUIREMENT&topicId=${encodeURIComponent(h.threadOn!)}`)
      h.thread = res.ok && Array.isArray(res.json?.data?.conversations) && res.json.data.conversations.length > 0
    })
    // Every notice about any of these things to any of these people, read once. The seat's own list
    // (read above, the newest hundred) is what it sees; the record says whether an older one exists.
    const people = [...new Set(handoffs.flatMap((h) => h.seats.map((k) => specs.get(k)?.personId)).filter((x): x is string => !!x))]
    const about = [...new Set(handoffs.flatMap((h) => [h.entityId, ...(h.alsoAbout ?? [])]))]
    const told = people.length && about.length
      ? await ctx.read.notification.findMany({ where: { personId: { in: people }, entityId: { in: about } }, select: { personId: true, entityId: true, title: true, body: true } })
      : []
    for (const h of handoffs) {
      if (h.mode === 'RUN') {
        const mine = h.seats.map((k) => specs.get(k)?.personId)
        const ids = [h.entityId, ...(h.alsoAbout ?? [])]
        const hits = told.filter((n) => mine.includes(n.personId) && n.entityId && ids.includes(n.entityId))
        h.told = hits.length > 0
        // A notice about the job rather than the person must name the person, or it says the same thing for every candidate.
        if (h.kind === 'PUT_FORWARD') h.toldWho = hits.some((n) => n.entityId === h.entityId || h.name.some((x) => names(`${n.title}\n${n.body}`, x)))
      }
      // Named, for the kinds the greeting must name, while they still wait on the seat.
      if (h.kind !== 'JOB_SENT' && h.waiting) {
        const texts = h.seats.map((k) => reads.get(k)?.text ?? '')
        h.named = texts.some((t) => h.name.some((x) => names(t, x)))
        if (h.named && h.must) {
          const blocks = h.seats.flatMap((k) => blocksOf(reads.get(k)?.answer)).filter((b) => h.name.some((x) => names(b, x)))
          h.carried = h.kind === 'WEEK_WAITS'
            // Whose week, and by when: the piece that names her carries a day.
            ? blocks.some((b) => h.must!.some((w) => new RegExp(`\\b${w}\\b`, 'i').test(b)) || /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*day\b|\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}\b/.test(b))
            // On hold, and why: both said, wherever the greeting says them.
            : h.must.every((m) => names(h.seats.map((k) => reads.get(k)?.text ?? '').join('\n'), m))
        }
      }
    }

    // The worker's own greeting after the client signed, and her "owed to you".
    const workerFaults: string[] = []
    let workersSigned = 0
    let workersSaySigned = 0
    for (const w of workersMoved.rows) {
      if (!w.latestSigned) continue
      const k = workerSeat(w.email)
      const r = k ? reads.get(k) : undefined
      if (!r?.answer) continue
      workersSigned++
      if (/\b(signed|approved|owed to you|paid)\b/i.test(r.text)) workersSaySigned++
      else workerFaults.push(`${w.name}’s greeting does not say her latest week is signed.`)
    }
    const owedAsks: { name: string; says: string; accepted: number; fault: string | null }[] = []
    const askOwed = workersMoved.rows.filter((w) => workerSeat(w.email)).slice(0, OWED_ASKED)
    await ctx.parallel(askOwed, async (w) => {
      const a = ctx.cast.seat(workerSeat(w.email)!)
      const res = await a.post('/api/conversations/twin', { text: 'What am I owed?' })
      const says = res.ok ? textOf(res.json?.data?.answer) : ''
      let fault: string | null = null
      if (!res.ok) fault = `“What am I owed?” was not answered (${res.status}${res.sentence ? `: ${res.sentence}` : ''}).`
      // "Owed to you" never follows a client's signature alone: a worker no employer accepted a week for is owed nothing yet.
      else if (w.accepted === 0 && /\$[\d,]+(\.\d\d)? is owed to you/.test(says)) fault = `${w.name} is told money is owed with no week accepted by her employer.`
      owedAsks.push({ name: w.name, says: says.split('\n')[0] ?? '', accepted: w.accepted, fault })
    })

    // ── 6. The greeting under load ──────────────────────────────────────
    // A second pass over the same seats at the run's width: the greeting
    // as a reader meets it while every other seat is opening theirs.
    const timed = [...reads.values()].filter((r) => r.answer)
    await ctx.parallel(timed, async (r) => {
      const g = await ctx.cast.seat(r.key).get('/api/conversations/twin')
      r.greetMs.push(g.ms)
    })
    const byParty = new Map<string, { greet: number[]; owed: number[]; seats: number; slowest: { key: string; ms: number } | null }>()
    for (const r of reads.values()) {
      const p = (r.party ?? r.expected ?? 'unknown').toString()
      const e = byParty.get(p) ?? { greet: [], owed: [], seats: 0, slowest: null }
      e.seats++
      e.greet.push(...r.greetMs)
      if (r.owedMs != null) e.owed.push(r.owedMs)
      const worst = Math.max(0, ...r.greetMs)
      if (!e.slowest || worst > e.slowest.ms) e.slowest = { key: r.key, ms: worst }
      byParty.set(p, e)
    }
    const timing = [...byParty.entries()].map(([party, e]) => {
      const p95 = pct(e.greet, 95)
      const owedP95 = pct(e.owed, 95)
      const slow = p95 != null && p95 > SLOW_MS
      return {
        party, seats: e.seats, p50: pct(e.greet, 50), p95, max: pct(e.greet, 100), owedP95, slowest: e.slowest,
        slow,
        // A worker's mark and greeting read her own pages (worker-read), not the decisions queue.
        owner: !slow ? null
          : party === 'WORKER' ? 'conversation (a worker’s greeting reads her own pages, twin/worker-read)'
            : owedP95 != null && owedP95 > SLOW_MS ? 'demand (the decisions queue the greeting and the mark both read)' : 'conversation (the greeting itself)',
      }
    }).sort((a, b) => (b.p95 ?? 0) - (a.p95 ?? 0))

    // ── 7. Who was told what, how many times ─────────────────────────────
    const rowsOf = async (since: Date | null): Promise<NoticeRow[]> => {
      const raw = await ctx.read.$queryRawUnsafe<{ id: string; personId: string; personName: string; type: string; title: string; body: string; entityId: string | null; channel: string; deliveryState: string; companyKind: string | null; workerOnly: boolean; createdAt: Date }[]>(`
        select n.id, n."personId", p.name as "personName", n.type, n.title, n.body, n."entityId", n.channel, n."deliveryState",
               co.kind::text as "companyKind",
               not exists (select 1 from "Context" x where x."personId" = n."personId" and x."revokedAt" is null and x.type <> 'CONSULTANT') as "workerOnly",
               n."createdAt"
        from "Notification" n join "Person" p on p.id = n."personId" left join "Company" co on co.id = n."companyId"
        ${since ? `where n."createdAt" >= $1` : ''}`, ...(since ? [since] : []))
      return raw.map((x) => ({ ...x, party: partyLabel(x.companyKind, x.workerOnly) }))
    }
    const madeRows = await rowsOf(runStart)
    const seedCount = await ctx.read.notification.count({ where: { createdAt: { lt: runStart } } })
    const outbound = madeRows.filter((r) => r.channel === 'EMAIL' || r.channel === 'TEAMS')
    const twice = toldTwice(madeRows)
    const teamsToWorker = teamsToWorkers(madeRows)
    const missing = handoffs.filter((h) => h.mode === 'RUN' && h.told === false && (NEEDS_NOTICE[h.kind] === 'NOTICE' || (NEEDS_NOTICE[h.kind] === 'EITHER' && h.waiting && h.named === false)))

    // ── 8. Say it ───────────────────────────────────────────────────────
    const kinds = Object.keys(KIND_SAYS) as Handoff['kind'][]
    const seatFaults = [...reads.values()].filter((r) => r.faults.length)
    const lines: string[] = []
    const L = (s = '') => lines.push(s)
    L(`# Handoffs — what each seat was told, and what Ask Etyme said to it`)
    L()
    L(`Read ${reads.size} seats at ${ctx.base}, ${new Date().toISOString()}. Handoffs this run made: ${handoffs.filter((h) => h.mode === 'RUN').length}; already in the seeded world: ${handoffs.filter((h) => h.mode === 'SEED').length}. ` +
      `A seeded handoff is held to the greeting only, because the seed writes rows and sends nobody anything.`)
    L()
    L('## Each handoff')
    L()
    L('| Handoff | Made | Checked | Told by a notice | Thread | Still waiting, named in the greeting | Said with when / why |')
    L('|---|---|---|---|---|---|---|')
    for (const k of kinds) {
      for (const mode of ['RUN', 'SEED'] as Mode[]) {
        const hs = handoffs.filter((h) => h.kind === k && h.mode === mode)
        if (!hs.length) continue
        const toldWho = k === 'PUT_FORWARD' && mode === 'RUN' ? `; ${hs.filter((h) => h.toldWho).length} name the candidate` : ''
        const told = mode === 'RUN' ? `${hs.filter((h) => h.told).length} of ${hs.length}${toldWho}${NEEDS_NOTICE[k] === 'GREETING' ? ' (the greeting’s to say)' : ''}` : 'not held (seed)'
        const thread = k === 'JOB_SENT' && mode === 'RUN' ? `${hs.filter((h) => h.thread).length} of ${hs.filter((h) => h.thread !== undefined).length}` : '—'
        const waiting = hs.filter((h) => h.waiting)
        const named = k === 'JOB_SENT' ? '—' : `${waiting.filter((h) => h.named).length} of ${waiting.length}`
        const carried = hs.some((h) => h.must) ? `${hs.filter((h) => h.carried).length} of ${hs.filter((h) => h.named && h.must).length}` : '—'
        L(`| ${KIND_SAYS[k]} | ${mode === 'RUN' ? 'this run' : 'seed'} | ${hs.length} | ${told} | ${thread} | ${named} | ${carried} |`)
      }
    }
    if (!handoffs.length) L('| (none: nothing in the world waits on anybody) | | | | | | |')
    L()
    const notNamed = handoffs.filter((h) => h.named === false)
    if (notNamed.length) {
      L('A greeting names the first three of what needs a seat, so a seat with more than three waiting names three and the list holds the rest. Not named, by seat:')
      L()
      const bySeat = new Map<string, Handoff[]>()
      for (const h of notNamed) bySeat.set(`${h.seats[0]}\u0000${h.kind}`, [...(bySeat.get(`${h.seats[0]}\u0000${h.kind}`) ?? []), h])
      for (const hs of [...bySeat.values()].slice(0, 30)) {
        const k = hs[0].seats[0]
        const r = reads.get(k)
        const all = handoffs.filter((h) => h.seats[0] === k && h.kind === hs[0].kind && h.waiting).length
        L(`- ${r?.name ?? k} (${k}), ${all - hs.length} of ${all} named; first not named: ${hs[0].what}. The greeting opens: “${String(r?.answer?.says ?? '(no greeting)').slice(0, 160)}”`)
      }
      L()
    }
    if (missing.length) {
      L('## Told nothing of a thing that needed them')
      L()
      for (const k of kinds) {
        const hs = missing.filter((h) => h.kind === k)
        if (!hs.length) continue
        L(`${KIND_SAYS[k]}: ${hs.length} told nobody. For example:`)
        for (const h of hs.slice(0, 6)) L(`- ${h.what}: ${h.seats.map((x) => `${specs.get(x)?.personName ?? x} (${x})`).join(' or ')} has no notice about it.`)
        L()
      }
    }
    L('## The greeting, per party, under load')
    L()
    L(`Every seat read twice at ${ctx.options.concurrency} at once. A party whose greeting p95 passes ${SLOW_MS / 1000}s is a fault.`)
    L()
    L('| Party | Seats | p50 | p95 | Slowest | Mark p95 | Fault, and whose |')
    L('|---|---|---|---|---|---|---|')
    for (const t of timing) {
      L(`| ${t.party} | ${t.seats} | ${t.p50 ?? '—'}ms | ${t.p95 ?? '—'}ms | ${t.slowest ? `${t.slowest.ms}ms (${t.slowest.key})` : '—'} | ${t.owedP95 ?? '—'}ms | ${t.slow ? t.owner : 'none'} |`)
    }
    L()
    L('## The mark and the greeting')
    L()
    L(`The mark’s number equals the greeting’s count on ${countsAgree} of ${countsCompared} seats where both say a number.`)
    for (const c of countNotSaid.slice(0, 20)) L(`- Not compared, the greeting leads with no count: ${c}`)
    L()
    if (seatFaults.length) {
      L('## What each seat read that it should not have')
      L()
      const grouped = new Map<string, string[]>()
      const shape = (f: string) => f.replace(/signed in as \S+/g, 'signed in as …').replace(/\d+/g, 'n')
      for (const r of seatFaults) for (const f of r.faults) grouped.set(shape(f), [...(grouped.get(shape(f)) ?? []), `${r.name} (${r.key})`])
      for (const [f, who] of [...grouped.entries()].sort((a, b) => b[1].length - a[1].length)) {
        const sample = seatFaults.flatMap((r) => r.faults).find((x) => shape(x) === f) ?? f
        L(`- ${who.length} ${who.length === 1 ? 'seat' : 'seats'}: ${sample} Owner: ${ownerOfFault(sample)}. Seats: ${who.slice(0, 6).join('; ')}${who.length > 6 ? `; and ${who.length - 6} more` : ''}`)
      }
      L()
    }
    L('## Workers')
    L()
    L(`Whose latest week the client signed, and whose greeting says so: ${workersSaySigned} of ${workersSigned}.`)
    for (const f of workerFaults.slice(0, 20)) L(`- ${f}`)
    L(`Asked “What am I owed?”: ${owedAsks.length} workers, ${owedAsks.filter((o) => o.fault).length} answered wrongly.`)
    for (const o of owedAsks.filter((x) => x.fault).slice(0, 20)) L(`- ${o.fault}`)
    for (const o of owedAsks.filter((x) => !x.fault).slice(0, 5)) L(`- ${o.name}: “${o.says.slice(0, 160)}”`)
    L()
    L('## Who was told what, how many times')
    L()
    L(`${madeRows.length} notices written this run (${seedCount} were in the seeded world before it). ${outbound.length} would have left by email or Teams; the server runs without the keys, so none did.`)
    L()
    if (madeRows.length) {
      L('| Channel | Kind | To | Messages | People |')
      L('|---|---|---|---|---|')
      for (const g of outboundBy(madeRows)) L(`| ${g.channel} | ${g.type} | ${g.party} | ${g.messages} | ${g.people} |`)
      L()
    }
    if (twice.length) {
      const same = twice.filter((t) => !t.alike)
      const alike = twice.filter((t) => t.alike)
      L(`Told the same thing, word for word, more than once: ${same.length}. One title for different news, so the list reads the same line again: ${alike.length}.`)
      // By title, so each writer reads its own count once.
      const byTitle = (list: typeof twice) => {
        const m = new Map<string, { people: number; times: number; example: (typeof twice)[number] }>()
        for (const t of list) {
          const k = t.title.replace(/"[^"]*"|“[^”]*”/g, '“…”').replace(/^[A-Z][\w’'.-]+(?: [A-Z][\w’'.-]+)*’s /, '…’s ')
          const e = m.get(k) ?? { people: 0, times: 0, example: t }
          e.people++
          e.times += t.times
          m.set(k, e)
        }
        return [...m.entries()].sort((a, b) => b[1].times - a[1].times)
      }
      for (const [k, e] of byTitle(same).slice(0, 10)) {
        L(`- word for word: “${k}”, ${e.times} notices to ${e.people} people (e.g. ${e.example.personName}, ${e.example.party}, ${e.example.times} times). Owner: ${ownerOfTitle(e.example.title)}.`)
      }
      for (const [k, e] of byTitle(alike).slice(0, 10)) {
        L(`- one title for different news: “${k}”, ${e.times} notices to ${e.people} people (e.g. ${e.example.personName}, ${e.example.party}, ${e.example.times} under “${e.example.title}”). Owner: ${ownerOfTitle(e.example.title)}.`)
      }
      L()
    }
    if (teamsToWorker.length) {
      L(`A Teams message to a worker reaches nobody: ${teamsToWorker.length}.`)
      for (const t of teamsToWorker.slice(0, 10)) L(`- ${t.personName}: “${t.title}”`)
      L()
    }

    const file = join(process.cwd(), 'reports', `simulation-${stampNow()}-handoffs.md`)
    try {
      mkdirSync(join(process.cwd(), 'reports'), { recursive: true })
      writeFileSync(file, lines.join('\n') + '\n')
    } catch (e: any) {
      ctx.log(`could not write ${file}: ${String(e?.message ?? e)}`)
    }
    for (const l of lines) if (l.startsWith('|') || l.startsWith('- ')) ctx.log(l)

    const greetP95 = pct(timing.flatMap((t) => (byParty.get(t.party)?.greet ?? [])), 95)
    const slowParties = timing.filter((t) => t.slow).map((t) => `${t.party} ${t.p95}ms (${t.owner})`)
    const madeChecked = handoffs.filter((h) => h.mode === 'RUN')
    const named = handoffs.filter((h) => h.named !== undefined)
    const closed = madeChecked.filter((h) => h.told !== false).length + handoffs.filter((h) => h.mode === 'SEED' && h.named !== false).length
    return {
      closed,
      of: handoffs.length,
      says:
        `Read ${reads.size} seats in ${((Date.now() - t0) / 1000).toFixed(0)}s. ` +
        (madeChecked.length ? `${madeChecked.filter((h) => h.told).length} of ${madeChecked.length} handoffs this run made were told by a notice. ` : 'No earlier station made a handoff this run; the seeded ones were read from the greeting. ') +
        `${named.filter((h) => h.named).length} of ${named.length} were named in the greeting. ` +
        `The mark matched the greeting on ${countsAgree} of ${countsCompared} seats. ` +
        `${seatFaults.length} seats read something wrong. ` +
        `Greeting p95 ${greetP95 ?? '—'}ms${slowParties.length ? `; slow: ${slowParties.join(', ')}` : ''}. ` +
        `${outbound.length} messages would have left by email or Teams; ${twice.filter((t) => !t.alike).length} told the same thing twice, word for word; ${twice.filter((t) => t.alike).length} read one title for different news; ${missing.length} handoffs told nobody. ` +
        `Detail: reports/${file.split('/reports/')[1]}.`,
    }
  },
})
