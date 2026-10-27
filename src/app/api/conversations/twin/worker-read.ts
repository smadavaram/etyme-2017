/**
 * What Ask Etyme reads for a worker: her own doors, and nothing else.
 *
 * The four pages that are hers already answer every question the worker
 * greeting asks — `/api/me/work` (her placements and chain, the weeks she
 * can file, every week she sent and where it stands, what is owed and
 * when), `/api/me/papers` (what is asked of her), `/api/me/pipeline` (her
 * interviews) and `/api/me/benches` (who has her consent). They are called
 * here in-process, under her own session, the way the twin's route already
 * calls `/api/program` for a client's picture, so the chat and her pages
 * cannot say two different things about one week.
 *
 * Three small reads go straight to the record, each scoped to her own
 * rows by her person id and never by a request: the period end of each
 * week she sent (her list prints it as words), the hours a week her job
 * runs (for "40 hours are expected"), and her bench stays with their end
 * dates (her list says them as sentences). No read here is of another
 * person, so none writes an access log; nothing here writes at all.
 *
 * A door that fails is reported and named in `unread`, and the greeting
 * says it could not read that part — never "nothing needs you" in its
 * place.
 */

import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { reportError } from '@/lib/alerts'
import { weekStart, weekEnd } from '@/lib/overtime'
import { stayOver, reminderLeadDays, renewFields } from '@/lib/bench-stay'
import { standingAgainstLimit, monthsOf } from '@/lib/tenure-days'
import { GET as myWork } from '@/app/api/me/work/route'
import { GET as myPapers } from '@/app/api/me/papers/route'
import { GET as myPipeline } from '@/app/api/me/pipeline/route'
import { GET as myBenches } from '@/app/api/me/benches/route'
import type { CallerContext } from '@/lib/api-context'
import type {
  WorkerFacts, WorkerPlacement, WeekToFile, ReturnedWeek, SentWeek, SentStage, PaperAsk, PaperRunningOut,
  InterviewFact, StayFact, Tie,
} from './worker'

const DAY = 86_400_000
/** A held document that runs out inside this many days is said in the greeting. */
const RUNNING_OUT_DAYS = 30
/** A stay that ended this long ago or less is offered for renewal; older is on Who has you, unsaid. */
const ENDED_RECENTLY_DAYS = 14
/** Full time, where a job names no hours: the same line the client's check on a week uses (lib/timesheet-flag). */
const FULL_TIME_HOURS = 40

async function bodyOf(res: Response): Promise<any | null> {
  if (!res.ok) return null
  return (await res.json().catch(() => null))?.data ?? null
}

/** How the bottom firm stands to her, read off the last part of her chain line ("employed by Techpeple"). */
export function tieOfChain(chain: string): Tie {
  const last = chain.split(' · ').pop() ?? ''
  return last.startsWith('employed by ') ? 'EMPLOYED' : last.startsWith('paid by ') ? 'PAID' : null
}

const iso = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (day: string, n: number) => iso(new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY))

/**
 * The worker's facts, read from her own doors. `request` is her own
 * request, so every door asks the same "who is this" and gets her.
 */
export async function workerFacts(caller: CallerContext, request: NextRequest, now = new Date()): Promise<WorkerFacts> {
  const me = caller.person.id
  const today = iso(now)
  const unread: WorkerFacts['unread'] = []
  const guard = async <T>(part: WorkerFacts['unread'][number], what: string, read: () => Promise<T | null>): Promise<T | null> => {
    try {
      const got = await read()
      if (got == null) unread.push(part)
      return got
    } catch (err) {
      unread.push(part)
      await reportError(`Ask Etyme could not read a worker’s ${what}`, err, { path: '/api/conversations/twin', personId: me })
      return null
    }
  }

  const [work, papers, pipeline, benches] = await Promise.all([
    guard('weeks', 'work', async () => bodyOf(await myWork(request))),
    guard('papers', 'papers', async () => bodyOf(await myPapers(request))),
    guard('interviews', 'interviews', async () => bodyOf(await myPipeline(request))),
    guard('consent', 'benches', async () => bodyOf(await myBenches(request))),
  ])

  // ── Her placements and chain ─────────────────────────────────────────
  const placements: Array<WorkerPlacement & { id: string }> = (work?.placements ?? []).map((p: any) => ({
    id: p.id,
    site: p.site,
    through: Array.isArray(p.through) ? p.through : [],
    employer: p.payer,
    tie: tieOfChain(String(p.chain ?? '')),
    live: (p.state === 'IN_PROGRESS' || p.state === 'VERIFIED') && (!p.endDate || p.endDate >= today),
    endDate: p.endDate ?? null,
    payRateMinor: typeof p.payRate === 'number' ? p.payRate : null,
    payCurrency: p.payCurrency ?? null,
    rateNote: p.rateNote ?? null,
  }))
  const placementOf = new Map(placements.map((p) => [p.id, p]))

  // Her own rows, read beside each other: none waits on another.
  const sheetsSent: any[] = work?.timesheets ?? []
  const endsRead = sheetsSent.length
    ? prisma.timesheet.findMany({
        where: { personId: me, id: { in: sheetsSent.map((t) => t.id) } },
        select: { id: true, periodEnd: true, sellContractId: true },
      })
    : Promise.resolve([] as Array<{ id: string; periodEnd: Date; sellContractId: string }>)
  const listingsRead = benches
    ? prisma.benchListing.findMany({
        where: { consultant: { personId: me }, state: 'GRANTED', stayDays: { not: null }, staysUntil: { not: null } },
        select: { id: true, stayDays: true, staysUntil: true, lapsedAt: true, revokedAt: true, company: { select: { name: true } } },
      })
    : Promise.resolve([])
  // Whether Your page is on: her own profile row, by her person id.
  const pageRead = prisma.consultantProfile
    .findUnique({ where: { personId: me }, select: { pageLiveAt: true } })
    .then((p) => (p ? p.pageLiveAt !== null : false))
    .catch(() => null)
  const employersRead = benches
    ? prisma.context.findMany({
        where: { personId: me, type: 'EMPLOYEE', revokedAt: null, company: { kind: { not: 'CONSULTANT_CORP' } } },
        select: { company: { select: { name: true } } },
      })
    : Promise.resolve([] as Array<{ company: { name: string } | null }>)

  // ── The hours her job runs, for a whole week ─────────────────────────
  const lines = work
    ? await prisma.sellContract.findMany({
        where: { personId: me },
        select: {
          id: true, startDate: true, endDate: true, state: true, requirement: { select: { hoursPerWeek: true } },
          clientCompanyId: true, endClientCompanyId: true,
          clientCompany: { select: { name: true } }, endClientCompany: { select: { name: true } },
        },
      })
    : []

  // ── Where she stands against each client's time limit ────────────────
  // Her own days at a site she is on today, across every supplier and
  // rung, read the way the ledger reads them (`standingAgainstLimit`),
  // against the limit the client set. Her own rows only, so nothing here
  // is a read of somebody else.
  const SERVED = ['IN_PROGRESS', 'ENDED', 'PAUSED']
  const sites = new Map<string, { name: string; lines: typeof lines }>()
  for (const l of lines) {
    const id = l.endClientCompanyId ?? l.clientCompanyId
    const name = l.endClientCompany?.name ?? l.clientCompany?.name
    if (!id || !name) continue
    const at = sites.get(id) ?? { name, lines: [] }
    at.lines.push(l)
    sites.set(id, at)
  }
  const onSiteAt = [...sites.entries()].filter(([, v]) => v.lines.some((l) => l.state === 'IN_PROGRESS'))
  const limits: NonNullable<WorkerFacts['limits']> = []
  if (onSiteAt.length) {
    const rules = await prisma.governanceRule.findMany({
      where: { policy: { companyId: { in: onSiteAt.map(([id]) => id) }, isActive: true }, ruleType: { in: ['TENURE_CAP', 'BREAK_IN_SERVICE'] }, isActive: true },
      select: { ruleType: true, parameters: true, policy: { select: { companyId: true } } },
    })
    for (const [id, v] of onSiteAt.slice(0, 2)) {
      const cap = rules.find((r) => r.policy.companyId === id && r.ruleType === 'TENURE_CAP')
      const capMonths = Number((cap?.parameters as Record<string, unknown> | null)?.maxMonths ?? NaN)
      if (!cap || !Number.isFinite(capMonths) || capMonths <= 0) continue
      const brk = rules.find((r) => r.policy.companyId === id && r.ruleType === 'BREAK_IN_SERVICE')
      const breakDays = Number((brk?.parameters as Record<string, unknown> | null)?.breakDays ?? NaN)
      const served = v.lines.filter((l) => SERVED.includes(l.state))
      const standing = standingAgainstLimit(
        served.map((l) => ({ startDate: l.startDate, endDate: l.endDate, live: l.state !== 'ENDED' })),
        { capMonths, breakDays: Number.isFinite(breakDays) ? breakDays : null },
        now,
      )
      limits.push({ site: v.name, months: monthsOf(standing.countedDays), capMonths, past: standing.pastLimit })
    }
  }
  const expectedFor = (from: string, to: string): number | null => {
    const over = lines.filter((l) => iso(l.startDate) <= to && (!l.endDate || iso(l.endDate) >= from))
    const named = over.find((l) => l.requirement?.hoursPerWeek != null)
    if (named) return named.requirement!.hoursPerWeek!
    // A job request that leaves the hours blank means full time; no job request says nothing.
    return over.some((l) => l.requirement) ? FULL_TIME_HOURS : null
  }

  // ── Weeks she may file, and weeks sent back ──────────────────────────
  const dues: Array<{ contractId: string; whose: string; dueOn: string }> = work?.due ?? []
  const toFile: WeekToFile[] = []
  const returned: ReturnedWeek[] = []
  for (const f of work?.filing ?? []) {
    for (const w of f.weeks ?? []) {
      const sat = weekEnd(w.periodStart)
      const whole = w.periodStart === weekStart(w.periodStart) && w.periodEnd === sat
      const due = dues
        .filter((d) => d.contractId === f.contractId && d.whose === 'YOU' && d.dueOn > sat && d.dueOn <= addDays(sat, 9))
        .map((d) => d.dueOn).sort()[0] ?? null
      toFile.push({
        periodStart: w.periodStart, periodEnd: w.periodEnd, site: f.site,
        ended: sat < today, wholeWeek: whole,
        expectedHours: whole ? expectedFor(w.periodStart, w.periodEnd) : null,
        dueOn: due,
      })
    }
    for (const r of f.returned ?? []) {
      returned.push({ periodStart: r.periodStart, periodEnd: r.periodEnd, site: f.site, reason: r.reason ?? null })
    }
  }
  const returnedIds = new Set<string>((work?.filing ?? []).flatMap((f: any) => (f.returned ?? []).map((r: any) => r.timesheetId)))

  // ── Every week she sent, where it stands ─────────────────────────────
  const sheets: any[] = sheetsSent
  const ends = new Map((await endsRead).map((t) => [t.id, t]))
  const owedWeeks: any[] = work?.owed?.weeks ?? []
  const waitingBySheet = new Map(owedWeeks.filter((w) => typeof w.sheetId === 'string').map((w) => [w.sheetId, w]))
  const pricedByWeek = new Map(owedWeeks.filter((w) => typeof w.sheetId !== 'string' && w.weekOf).map((w) => [w.weekOf, w]))

  const sent: SentWeek[] = []
  for (const t of sheets) {
    if (returnedIds.has(t.id)) continue
    const row = ends.get(t.id)
    const place = row ? placementOf.get(row.sellContractId) : undefined
    const state = t.state ?? {}
    const waiting = waitingBySheet.get(t.id)
    const priced = pricedByWeek.get(weekStart(t.periodStart))
    let stage: SentStage
    if (t.status === 'REJECTED' || state.kind === 'SENT_BACK') {
      returned.push({ periodStart: t.periodStart, periodEnd: row ? iso(row.periodEnd) : t.periodStart, site: place?.site ?? '', reason: null })
      continue
    } else if (t.status === 'OPEN') stage = 'NOT_SENT'
    else if (waiting) stage = waiting.stage === 'WAITING_FOR_EMPLOYER' ? 'WAITING_FOR_EMPLOYER' : 'WAITING_FOR_CLIENT'
    else if (state.kind === 'WAITING') stage = 'WAITING_FOR_CLIENT'
    else if (state.word === 'paid') stage = 'PAID'
    else if (state.word === 'owed to you') stage = 'OWED'
    else if (t.status === 'APPROVED') stage = 'SIGNED'
    else continue
    const money = stage === 'OWED' && priced?.priced
    sent.push({
      id: t.id,
      periodStart: t.periodStart,
      periodEnd: row ? iso(row.periodEnd) : t.periodStart,
      hours: stage === 'OWED' || stage === 'PAID' ? Number(priced?.hours ?? t.hours) : Number(t.hours),
      stage,
      waitingOn: waiting?.waitingOn ?? state.waitingOn ?? null,
      client: place?.site ?? null,
      employer: waiting?.employer ?? priced?.payer ?? place?.employer ?? null,
      approvedBy: t.approvedBy ?? null,
      stillOwedMinor: money && typeof priced.stillOwedCents === 'number' ? priced.stillOwedCents : null,
      owedHours: money && typeof priced.unpaidHours === 'number' ? priced.unpaidHours : null,
      currency: money ? priced.currency ?? null : null,
      dueOn: money ? priced.dueOn ?? null : null,
      overdue: Boolean(money && priced.overdue),
      paidOn: stage === 'PAID' ? priced?.paidOn ?? null : null,
      // Part of an owed week already paid on an earlier pay day: said beside what is owed.
      partPaid: money && typeof priced.paidHours === 'number' && priced.paidHours > 0 ? { hours: Number(priced.paidHours), on: priced.paidOn ?? null } : null,
    })
  }

  // ── What is asked of her on paper ────────────────────────────────────
  const paperRows: any[] = papers?.papers ?? []
  // The paper she holds that an ask renews: a held row whose name begins
  // the ask's ("Professional license" under "Professional license (RN
  // 154-882, WI)"), with the day it runs out.
  const held = paperRows.filter((p) => p.kind === 'HELD' && typeof p.name === 'string' && typeof p.runsOutOn === 'string')
  const renewed = (name: unknown): { name: string; runsOutOn: string } | null => {
    if (typeof name !== 'string') return null
    const n = name.toLowerCase().trim()
    const h = held
      .filter((x) => { const m = String(x.name).toLowerCase().trim(); return m.length > 2 && (n === m || n.startsWith(`${m} `) || n.startsWith(`${m}(`)) })
      .sort((a, b) => String(a.runsOutOn).localeCompare(String(b.runsOutOn)))[0]
    return h ? { name: String(h.name), runsOutOn: String(h.runsOutOn).slice(0, 10) } : null
  }
  const asks: PaperAsk[] = paperRows
    .filter((p) => p.todo === 'sign' || p.todo === 'upload' || p.todo === 'open')
    .map((p) => ({
      id: String(p.id),
      name: p.name,
      todo: p.todo,
      askedBy: p.askedBy ?? null,
      dueOn: p.dueOn ? String(p.dueOn).slice(0, 10) : null,
      stopsWork: Boolean(p.stopsWork),
      href: typeof p.link === 'string' && p.link.startsWith('/') && !p.link.startsWith('//') ? p.link : '/dashboard/my-work/paperwork',
      renews: renewed(p.name),
    }))
  const soon = addDays(today, RUNNING_OUT_DAYS)
  const runningOut: PaperRunningOut[] = paperRows
    .filter((p) => p.kind === 'HELD' && typeof p.runsOutOn === 'string' && p.runsOutOn.slice(0, 10) >= today && p.runsOutOn.slice(0, 10) <= soon)
    .map((p) => ({ name: p.name, runsOutOn: p.runsOutOn.slice(0, 10), stopsWork: Boolean(p.stopsWork) }))

  // ── Interviews ───────────────────────────────────────────────────────
  // The jobs firms put her forward for, as her own pipeline says each stands.
  const putForward = (pipeline?.submissions ?? []).map((x: any) => ({
    role: String(x.role ?? 'a job'), by: String(x.submittedBy ?? 'A firm'),
    says: typeof x.says === 'string' ? x.says : '—',
    // Open means still in play. A job she got is not open (walk three,
    // 2026-10-26: an ended placement read "It is still open … You got it").
    live: !['REJECTED', 'WITHDRAWN', 'CLOSED', 'PLACED', 'AWARDED', 'HIRED'].includes(String(x.status).toUpperCase()),
  }))

  const interviews: InterviewFact[] = (pipeline?.interviewsAhead ?? []).map((i: any) => ({
    id: i.id, role: i.role, with: i.with, round: i.round,
    waitingOnYou: i.state === 'PROPOSED' && !i.answeredByYou,
    booked: i.state === 'CONFIRMED',
  }))

  // ── Bench stays she may renew, and who has her consent ───────────────
  const listings = await listingsRead
  const stays: StayFact[] = []
  for (const l of listings) {
    if (!l.staysUntil || l.stayDays == null || !renewFields(l, now).ok) continue
    const ended = stayOver(l, now)
    const until = l.staysUntil.getTime()
    const due = ended
      ? now.getTime() - until <= ENDED_RECENTLY_DAYS * DAY
      : until - reminderLeadDays(l.stayDays) * DAY <= now.getTime()
    if (due) stays.push({ listingId: l.id, firm: l.company.name, endsOn: iso(l.staysUntil), ended, days: l.stayDays })
  }
  // The firms that employ her, never her own one-person company: she owns that one.
  const employers = (await employersRead).flatMap((c) => (c.company ? [c.company.name] : []))

  return {
    seat: caller.context.type === 'CONSULTANT' ? 'CONSULTANT' : 'EMPLOYEE',
    seatAt: caller.company?.name ?? null,
    ownFirm: caller.company?.kind === 'CONSULTANT_CORP' ? caller.company.name : null,
    placements: placements.map(({ id: _id, ...p }) => p),
    toFile,
    returned,
    sent,
    ownCompanyBills: work?.owed?.ownCompanyBills ?? null,
    weeksWithNoRate: Number(work?.owed?.weeksWithNoRate ?? 0),
    papers: asks,
    runningOut,
    interviews,
    ...(pipeline ? { putForward } : {}),
    stays,
    limits,
    consent: {
      benches: (benches?.benches ?? []).map((b: any) => ({ firm: b.company, since: b.since ?? null, stay: b.stay ?? null })),
      asking: (benches?.invited ?? []).map((b: any) => b.company),
      employers: [...new Set(employers)],
    },
    unread,
    pageOn: await pageRead,
  }
}
