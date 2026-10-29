/**
 * One pass of the supplier's own acts over one firm that sells people
 * (founder, 2026-10-29, "Tapin gets agents, not a website"). Beside
 * money's bill run (lib/money/supplier-bills-run), on the same night, for
 * the same firms.
 *
 *   who is coming free     one summary a week to the people who put people
 *                          forward: off a project in the next 30 days, on
 *                          the bench past 14 (`rollingOffAt`, `benchAt`,
 *                          the Today page's own reads)
 *   start papers           a line not started whose required set still asks
 *                          the worker for something, and no open ask:
 *                          regulatory's clearance ask, alone
 *   a bench person to a    a match already scored, with its reasons, between
 *   job the firm was sent  a job sent to this firm and somebody on its bench
 *                          today: asked, at most three a job a night
 *
 * The twin scores nobody. A put-forward question rides on a `Match` row the
 * match engine wrote, which carries factors, basis, confidence and
 * unknowns; a person with no such row is not offered. Every act goes
 * through `act` in lib/twin/ledger, under the role contract, on the
 * Owner's authority, so this file writes no ledger row itself.
 */

import { prisma } from '@/lib/db'
import { recordAccess } from '@/lib/access-log'
import { act, runMemo, type ActResult, type Authority, type Surface } from '@/lib/twin/ledger'
import { supplierAuthorityAt } from '@/lib/twin/run'
import { rollingOffAt, benchAt } from '@/app/api/today/reads'
import { startAskRefusal, comingFreeTitle, type ComingFreeRow } from '@/lib/twin/supplier-performers'
import { possessive } from '@/lib/requisition-approval'

const DAY = 86_400_000

/** On the bench this long, a person is named as waiting. */
export const IDLE_AFTER_DAYS = 14
/** Coming off a project inside this many days. */
export const COMING_FREE_DAYS = 30
/**
 * A match the twin will put to a person: a score of at least this, and a
 * confidence that is not LOW. Coordinator's call, 2026-10-29, reversible
 * in a sentence; a company's own figure belongs on its rule set the day
 * one asks.
 */
export const PUT_FORWARD_MIN_SCORE = 70
/** At most this many people put to a person per job per night. */
export const PUT_FORWARD_PER_JOB = 3
/** A refusal is not written again for the same record inside this many days. */
const REFUSED_QUIET_DAYS = 7

const ACTS = ['bench.put_forward', 'papers.ask_for_start', 'bench.coming_free'] as const

export interface SupplierActsRun {
  companyId: string
  comingFree: number
  idle: number
  startAsks: number
  putForward: number
  outcomes: Record<ActResult['outcome'], number>
}

/** The Sunday a week starts on, YYYY-MM-DD, in UTC. Pure. */
export function weekOf(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  d.setUTCDate(d.getUTCDate() - d.getUTCDay())
  return d.toISOString().slice(0, 10)
}

/** Whether the twin was refused this act on this record lately, so a nightly refusal is written once a week, not every night. */
async function refusedLately(companyId: string, action: string, entityId: string, now: Date, findingKey?: string): Promise<boolean> {
  const last = await prisma.twinAction.findFirst({
    where: { companyId, action, entityId, ts: { gte: new Date(now.getTime() - REFUSED_QUIET_DAYS * DAY) } },
    select: { outcome: true, payload: true },
    orderBy: { ts: 'desc' },
  })
  if (!last || last.outcome !== 'REFUSED') return false
  if (!findingKey) return true
  return ((last.payload ?? {}) as Record<string, unknown>).findingKey === findingKey
}

export async function runSupplierActs(
  companyId: string,
  opts: { surface?: Surface; now?: Date; authority?: Authority } = {}
): Promise<SupplierActsRun> {
  const surface = opts.surface ?? 'CRON'
  const now = opts.now ?? new Date()
  const authority = opts.authority ?? (await supplierAuthorityAt(companyId))
  const memo = await runMemo(companyId, ACTS, 'SUPPLIER')
  const outcomes: SupplierActsRun['outcomes'] = { PERFORMED: 0, AWAITING_APPROVAL: 0, REFUSED: 0, ALREADY: 0, FAILED: 0 }
  const tally = (r: ActResult) => { outcomes[r.outcome]++; return r }
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true } })
  const firm = company?.name ?? 'this firm'
  const reads = { actorPersonId: authority.personId ?? undefined, actorCompanyId: companyId, actorKind: 'TWIN' as const, actorTwinKind: 'SUPPLIER' as const }

  // ── Who is coming free ──
  const [rolling, bench] = await Promise.all([rollingOffAt(companyId, now, COMING_FREE_DAYS), benchAt(companyId, now)])
  const coming: ComingFreeRow[] = rolling.map((r) => ({ personId: r.personId, name: r.name, days: r.days, client: r.client }))
  const idle: ComingFreeRow[] = bench
    .map((b) => ({ personId: b.personId, name: b.name, days: Math.floor((now.getTime() - Date.parse(`${b.since}T00:00:00Z`)) / DAY) }))
    .filter((b) => b.days > IDLE_AFTER_DAYS)
  if (coming.length || idle.length) {
    if (coming.length) await recordAccess(coming.map((r) => r.personId), { ...reads, action: 'CONTRACT_VIEW', reason: 'Who comes off a project in the next 30 days, read by Ask Etyme for the firm’s recruiters' })
    if (idle.length) await recordAccess(idle.map((r) => r.personId), { ...reads, action: 'TALENT_VIEW_ANON', reason: 'Who has waited on the bench past 14 days, read by Ask Etyme for the firm’s recruiters' })
    tally(await act({
      companyId, twin: 'SUPPLIER', action: 'bench.coming_free',
      entity: { type: 'Company', id: companyId },
      rule: `Off a project in the next ${COMING_FREE_DAYS} days, or on the bench more than ${IDLE_AFTER_DAYS} days, as the Today page counts them.`,
      rationale: `${comingFreeTitle(coming, idle)}. Told to the people at ${firm} who put people forward.`,
      surface, authority, memo,
      payload: { comingFree: coming, idle },
      dedupKey: `week:${weekOf(now)}`,
    }))
  }

  // ── Start papers ──
  const lines = await prisma.sellContract.findMany({
    where: {
      companyId, state: { in: ['DRAFT', 'PENDING_VERIFICATION', 'VERIFIED'] },
      startDate: { gte: new Date(now.getTime() - 7 * DAY), lte: new Date(now.getTime() + COMING_FREE_DAYS * DAY) },
    },
    select: { id: true, personId: true, person: { select: { name: true } }, requirement: { select: { title: true } } },
    orderBy: { startDate: 'asc' },
    take: 40,
  })
  let startAsks = 0
  if (lines.length) {
    const open = new Set((await prisma.documentPacket.findMany({
      where: {
        companyId, subjectPersonId: { in: lines.map((l) => l.personId) }, purpose: 'CONTRACT_START',
        completedAt: null, cancelledAt: null, expiresAt: { gt: now },
      },
      select: { subjectPersonId: true },
    })).map((p) => p.subjectPersonId))
    const { previewFor } = await import('@/app/api/compliance/clearance/ask')
    for (const l of lines) {
      if (open.has(l.personId)) continue
      const day = now.toISOString().slice(0, 10)
      const base = {
        companyId, twin: 'SUPPLIER' as const, action: 'papers.ask_for_start',
        entity: { type: 'SellContract', id: l.id }, surface, authority, memo, dedupKey: `${l.id}:${day}`,
      }
      const refusal = await startAskRefusal(companyId, l.id)
      if (refusal) {
        if (await refusedLately(companyId, base.action, l.id, now)) continue
        tally(await act({ ...base, rule: 'Papers are chased only where the firm confirmed the set for that kind of worker.', rationale: `${l.person.name} starts soon and their papers are not all in.` }))
        continue
      }
      const found = await previewFor(l.id, now)
      const asks = found?.preview.askOfPerson ?? []
      if (asks.length === 0) continue
      startAsks++
      tally(await act({
        ...base,
        rule: `The line’s required set still asks ${l.person.name} for ${asks.map((a) => a.said ?? a.label).join(', ')}.`,
        rationale: `${l.person.name} starts${l.requirement?.title ? ` on ${l.requirement.title}` : ''} soon and has not been asked for these. Asked once, never for what is already on file.`,
        payload: { personId: l.personId, personName: l.person.name, asks: asks.map((a) => a.key) },
      }))
    }
  }

  // ── A bench person to a job the firm was sent ──
  let putForward = 0
  const onBench = new Map(bench.map((b) => [b.personId, b.name]))
  if (onBench.size) {
    const invitations = await prisma.requirementInvitation.findMany({
      where: {
        toCompanyId: companyId, status: { in: ['SENT', 'ACCEPTED'] }, expiresAt: { gt: now },
        requirement: { status: 'OPEN', approvalState: { not: 'PENDING_APPROVAL' } },
      },
      select: {
        requirementId: true, payMin: true, payMax: true,
        requirement: { select: { title: true, company: { select: { name: true } }, endClientCompany: { select: { name: true } } } },
      },
      take: 50,
    })
    if (invitations.length) {
      const jobIds = invitations.map((i) => i.requirementId)
      const [matches, submitted] = await Promise.all([
        prisma.match.findMany({
          where: {
            requirementId: { in: jobIds }, score: { gte: PUT_FORWARD_MIN_SCORE }, confidence: { not: 'LOW' },
            consultant: { personId: { in: [...onBench.keys()] } },
          },
          select: {
            id: true, requirementId: true, score: true, confidence: true, factors: true, basis: true, unknowns: true,
            consultant: { select: { personId: true } },
          },
          orderBy: [{ score: 'desc' }, { id: 'asc' }],
        }),
        prisma.submission.findMany({ where: { requirementId: { in: jobIds }, personId: { in: [...onBench.keys()] } }, select: { requirementId: true, personId: true } }),
      ])
      const taken = new Set(submitted.map((s) => `${s.requirementId}\u0000${s.personId}`))
      const asked = new Map<string, number>()
      const people = [...new Set(matches.map((m) => m.consultant.personId))]
      if (people.length) await recordAccess(people, { ...reads, action: 'MATCH_VIEW', reason: 'A match between a job sent to the firm and somebody on its bench, read by Ask Etyme to ask a recruiter' })
      for (const m of matches) {
        const personId = m.consultant.personId
        if (taken.has(`${m.requirementId}\u0000${personId}`)) continue
        if ((asked.get(m.requirementId) ?? 0) >= PUT_FORWARD_PER_JOB) continue
        const inv = invitations.find((i) => i.requirementId === m.requirementId)!
        const key = `${m.requirementId}:${personId}`
        if (memo.seen.has(`bench.put_forward\u0000${key}`)) { asked.set(m.requirementId, (asked.get(m.requirementId) ?? 0) + 1); continue }
        if (await refusedLately(companyId, 'bench.put_forward', m.requirementId, now, key)) continue
        const name = onBench.get(personId) ?? 'Somebody on the bench'
        const client = inv.requirement.endClientCompany?.name ?? inv.requirement.company.name
        const r = tally(await act({
          companyId, twin: 'SUPPLIER', action: 'bench.put_forward',
          entity: { type: 'Requirement', id: m.requirementId },
          rule: `Match ${m.score} of 100, ${m.confidence.toLowerCase()} confidence: ${m.basis}`,
          rationale: `${name} is on ${possessive(firm, '’')} bench, and ${client} sent ${inv.requirement.title} to ${firm}.`,
          surface, authority, memo, dedupKey: key,
          payload: {
            personId, personName: name, jobTitle: inv.requirement.title, clientName: client,
            matchId: m.id, score: m.score, confidence: m.confidence, factors: m.factors, basis: m.basis, unknowns: m.unknowns,
            bandMinCents: inv.payMin, bandMaxCents: inv.payMax,
          },
        }))
        if (r.outcome === 'AWAITING_APPROVAL' || r.outcome === 'ALREADY') {
          asked.set(m.requirementId, (asked.get(m.requirementId) ?? 0) + 1)
          if (r.outcome === 'AWAITING_APPROVAL') putForward++
        }
      }
    }
  }

  return { companyId, comingFree: coming.length, idle: idle.length, startAsks, putForward, outcomes }
}
