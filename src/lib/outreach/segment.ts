/**
 * Saved segments and who is in one now (record 135). Reads the one record.
 *
 * A segment is stored as its definition and nothing else. Who is in it is
 * worked out each time it is asked, from the firm's own record, so a yes
 * taken back or an unsubscribe is respected on the next read. A candidate is
 * in only under her standing yes to updates (`saidYesToUpdates`, record
 * 117), and only while the firm keeps her. A contact is in only at a firm
 * traded with, not unsubscribed, not bounced (record 116): the same reader
 * the outreach batch uses (`audienceOf`).
 */
import { prisma } from '@/lib/db'
import type { Prisma } from '@prisma/client'
import { mailSendsAboutMany } from '@/lib/notify/mail-door'
import { logBulkAccess } from '@/lib/access-log'
import { censusFacts } from '@/lib/agents/census-keeper'
import { censusOn } from '@/lib/agents/census-rules'
import { audienceOf } from './batch'
import { buildCandidateAudience, type CandidateFact } from './candidate-rules'
import { describeSegment, readSegmentDefinition, segmentMatches, type SegmentDefinition } from './segment-rules'
import type { Audience } from './audience-rules'

export interface Refusal { ok: false; status: number; field?: string; says: string }
const refuse = (says: string, field?: string, status = 422): Refusal => ({ ok: false, status, says, ...(field ? { field } : {}) })

export interface SegmentMember {
  /** A person id for a candidate, a rolodex contact id for a company's contact. */
  id: string
  atCompanyId: string
  name: string
  email: string
  companyName: string
}
export interface SegmentRead {
  role: SegmentDefinition['role']
  members: SegmentMember[]
  held: { name: string; says: string }[]
  /** Candidates who match but have not said yes: counted, never named. */
  withoutYes: number
}

export async function saveSegment(seat: { companyId: string; personId: string }, raw: unknown): Promise<Refusal | { ok: true; id: string }> {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const name = typeof b.name === 'string' ? b.name.trim() : ''
  if (!name) return refuse('Give the segment a name.', 'name')
  if (name.length > 80) return refuse('Keep the name under 80 characters.', 'name')
  const read = readSegmentDefinition(b.definition ?? b)
  if (!read.ok) return refuse(read.says, read.field)
  const clash = await prisma.outreachSegment.findFirst({ where: { companyId: seat.companyId, name, archivedAt: null }, select: { id: true } })
  if (clash) return refuse(`A segment called ${name} already exists. Choose another name.`, 'name', 409)
  const row = await prisma.outreachSegment.create({ data: { companyId: seat.companyId, name, definition: read.def as unknown as Prisma.InputJsonValue, createdById: seat.personId } })
  return { ok: true, id: row.id }
}

export async function archiveSegment(companyId: string, id: string): Promise<Refusal | { ok: true }> {
  const row = await prisma.outreachSegment.findFirst({ where: { id, companyId } })
  if (!row) return refuse('There is no such segment at your firm.', undefined, 404)
  const open = await prisma.outreachPack.findFirst({ where: { companyId, segmentId: id, state: { in: ['PROPOSED', 'APPROVED'] } }, select: { name: true } })
  if (open) return refuse(`The pack ${open.name} still writes to this segment. Close the pack first.`, undefined, 409)
  await prisma.outreachSegment.update({ where: { id }, data: { archivedAt: new Date() } })
  return { ok: true }
}

export const defOf = (row: { definition: unknown }): SegmentDefinition => row.definition as SegmentDefinition

export async function segmentsOf(companyId: string) {
  const rows = await prisma.outreachSegment.findMany({ where: { companyId, archivedAt: null }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })
  return rows.map((r) => ({ id: r.id, name: r.name, def: defOf(r), says: describeSegment(defOf(r)), createdAt: r.createdAt }))
}

/** Who is in the segment right now. Writes nothing but the access trail for the names of people read. */
export async function readSegment(companyId: string, def: SegmentDefinition, actorPersonId: string | null, now: Date = new Date()): Promise<SegmentRead> {
  if (def.role === 'CANDIDATE') return readCandidates(companyId, def, actorPersonId, now)
  const side: Audience[] = def.role === 'CLIENT'
    ? [def.stage === 'DORMANT' ? 'DORMANT_CUSTOMERS' : 'ALL_CUSTOMERS']
    : [def.stage === 'DORMANT' ? 'DORMANT_SUPPLIERS' : 'ALL_SUPPLIERS']
  const { to, held } = await audienceOf(companyId, side[0], null, now)
  const standing = new Map(censusOn(await censusFacts(companyId), now).map((r) => [r.key.slice(r.key.indexOf(':') + 1), r]))
  const places = new Map((await prisma.company.findMany({ where: { id: { in: to.map((t) => t.atCompanyId) } }, select: { id: true, country: true } })).map((c) => [c.id, c.country]))
  const members: SegmentMember[] = []
  for (const t of to) {
    const s = standing.get(t.atCompanyId)
    const fact = { skills: [], location: places.get(t.atCompanyId) ?? null, stage: s?.standing ?? null, lastActivityAt: s?.lastActivity ?? null }
    if (segmentMatches(def, fact, now)) members.push({ id: t.contactId, atCompanyId: t.atCompanyId, name: t.name, email: t.email, companyName: t.companyName })
  }
  return { role: def.role, members, held: held.map((h) => ({ name: h.companyName, says: h.says })), withoutYes: 0 }
}

async function readCandidates(companyId: string, def: SegmentDefinition, actorPersonId: string | null, now: Date): Promise<SegmentRead> {
  const profiles = await prisma.consultantProfile.findMany({
    where: {
      OR: [
        { listings: { some: { companyId, revokedAt: null, state: 'GRANTED' } } },
        { person: { contexts: { some: { companyId, revokedAt: null } } } },
      ],
    },
    select: {
      personId: true, skills: true, location: true,
      listings: { where: { companyId, revokedAt: null, state: 'GRANTED' }, select: { grantedAt: true, firmSkills: true, firmLocation: true } },
      person: { select: { name: true, primaryEmail: true, updatesYesAt: true, updatesRevokedAt: true } },
    },
  })
  const ids = profiles.map((p) => p.personId)
  const enrollments = ids.length ? await prisma.enrollment.findMany({ where: { companyId, personId: { in: ids } }, select: { personId: true, status: true, enrolledAt: true, completedAt: true } }) : []
  const letters = ids.length ? await prisma.outreachLetter.findMany({
    where: { companyId, contactId: { in: ids }, state: { not: 'HELD' }, agentTask: { state: { not: 'REFUSED' } } },
    select: { id: true, contactId: true, email: true, createdAt: true },
  }) : []
  const sends = letters.length ? await mailSendsAboutMany(companyId, 'OutreachLetter', letters.map((l) => l.id)) : []
  const bad = new Set(sends.filter((s) => s.outcome === 'FAILED_DELIVERY').map((s) => s.recordId))
  const last = new Map<string, Date>()
  const bounced = new Set<string>()
  for (const l of letters) {
    if (!last.has(l.contactId) || last.get(l.contactId)! < l.createdAt) last.set(l.contactId, l.createdAt)
    if (bad.has(l.id)) bounced.add(`${l.contactId}:${l.email.trim().toLowerCase()}`)
  }
  const facts: CandidateFact[] = []
  let withoutYesMatched = 0
  for (const p of profiles) {
    const mine = enrollments.filter((e) => e.personId === p.personId)
    const stage = mine.some((e) => e.status === 'COMPLETED') ? 'FINISHED' : mine.some((e) => e.status === 'ENROLLED' || e.status === 'IN_PROGRESS') ? 'TRAINING' : 'KEPT'
    const times = [...mine.flatMap((e) => [e.enrolledAt, e.completedAt]), ...p.listings.map((l) => l.grantedAt)].filter((d): d is Date => d !== null)
    const lastActivityAt = times.length ? new Date(Math.max(...times.map((d) => d.getTime()))) : null
    const skills = [...p.skills, ...p.listings.flatMap((l) => l.firmSkills)]
    const location = p.listings.find((l) => l.firmLocation)?.firmLocation ?? p.location
    if (!segmentMatches(def, { skills, location, stage, lastActivityAt }, now)) continue
    facts.push({
      personId: p.personId, name: p.person.name, email: p.person.primaryEmail,
      updatesYesAt: p.person.updatesYesAt, updatesRevokedAt: p.person.updatesRevokedAt,
      bouncedAddress: !!p.person.primaryEmail && bounced.has(`${p.personId}:${p.person.primaryEmail.trim().toLowerCase()}`),
      lastWrittenOn: last.get(p.personId) ?? null,
    })
  }
  const { to, held, withoutYes } = buildCandidateAudience(facts, now)
  withoutYesMatched = withoutYes
  if (actorPersonId && (to.length || held.length)) {
    logBulkAccess([...to, ...held].map((w) => w.personId), { actorPersonId, actorCompanyId: companyId, action: 'TALENT_VIEW_ANON', reason: 'Read on Companies, Outreach: who a saved segment holds, from those who said yes to updates' })
  }
  return {
    role: 'CANDIDATE',
    members: to.map((t) => ({ id: t.personId, atCompanyId: t.personId, name: t.name, email: t.email, companyName: '' })),
    held: held.map((h) => ({ name: h.name, says: h.says })),
    withoutYes: withoutYesMatched,
  }
}
