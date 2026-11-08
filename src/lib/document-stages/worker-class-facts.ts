/**
 * The facts `workerClassStart` reads, gathered for many people in a
 * fixed number of reads: the class on the person's own profile, the cards
 * and arrival records on file, the petitions and the student's CPT page,
 * and the firm that pays the person on a payroll line.
 *
 * Where the record cannot hold a fact yet, it is null and the rule says
 * so rather than guessing:
 *  - which firm petitioned for an H-1B, and which employer a CPT page
 *    names, have no column (`VisaPetition.petitionerCompanyId` is asked of
 *    the architect). Until then they are read from the FILED event's
 *    words, written by one helper (`employerNamedNote`).
 *  - days unemployed on OPT are not recorded anywhere, so that rule
 *    speaks only when a caller passes them.
 *
 * Owned by regulatory.
 */
import type { Prisma, PrismaClient } from '@prisma/client'
import { CPT_PAGE_TYPE } from './cpt-page'
import {
  classOfWorkAuth, employerNamedIn,
  type CptFact, type I94Fact, type PermitFact, type PetitionFact, type WorkerClassFacts,
} from './worker-class'

type Db = PrismaClient | Prisma.TransactionClient

export type PersonClassFacts = Omit<WorkerClassFacts, 'workCountry' | 'on'>

/** The kinds of status record the petitions table holds for a student. */
export const CPT_RECORD = CPT_PAGE_TYPE

const PAYROLL_STATES = ['DRAFT', 'PENDING_VERIFICATION', 'VERIFIED', 'IN_PROGRESS', 'BENCH_PAID', 'INTERNAL', 'TRAINING', 'PAUSED'] as const

function json(x: unknown): Record<string, unknown> {
  return x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {}
}
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const date = (v: unknown): Date | null => {
  if (v instanceof Date) return v
  if (typeof v !== 'string') return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Pure: one person's facts from the rows read for them. */
export function factsFrom(input: {
  personName: string
  workAuth: string | null
  permits: { validFrom: Date | null; issuedAt?: Date | null; expiresAt: Date | null; status: string; result: unknown }[]
  i94: { expiresAt: Date | null; status: string; result: unknown }[]
  petitions: {
    type: string; status: string; filedAt: Date | null; approvedAt: Date | null; expiresAt: Date | null
    /** The firm that petitioned, by id and name, where the column holds it. */
    petitionerCompanyId?: string | null
    petitionerName?: string | null
    /** The employer the I-20's CPT page names, as the school spelled it, where the column holds it. */
    employerNamed?: string | null
    events: { eventType: string; notes: string | null }[]
  }[]
  employerName: string | null
  employerCompanyId?: string | null
}): PersonClassFacts {
  const held = (s: string) => s === 'CLEAR' || s === 'CONDITIONAL'
  const permits: PermitFact[] = input.permits.filter((p) => held(p.status)).map((p) => {
    const r = json(p.result)
    return {
      validFrom: p.validFrom ?? null,
      expiresAt: p.expiresAt,
      category: str(r.category),
      stem: r.stem === true,
      renewalFiledOn: date(r.renewalFiledOn),
    }
  })
  const i94: I94Fact[] = input.i94.filter((p) => held(p.status)).map((p) => {
    const r = json(p.result)
    return { admitUntil: p.expiresAt, classOfAdmission: str(r.classOfAdmission), employerNamed: str(r.employerNamed) }
  })
  const named = (events: { eventType: string; notes: string | null }[]) =>
    events.map((e) => employerNamedIn(e.notes)).find((n): n is string => !!n) ?? null
  const cpt: CptFact[] = input.petitions
    .filter((p) => p.type.toUpperCase() === CPT_RECORD && !['DENIED', 'EXPIRED'].includes(p.status.toUpperCase()))
    .map((p) => ({ employerNamed: p.employerNamed ?? named(p.events), from: p.approvedAt ?? p.filedAt, to: p.expiresAt }))
  const petitions: PetitionFact[] = input.petitions
    .filter((p) => p.type.toUpperCase() === 'H1B')
    .map((p) => ({
      // The column first; a petition recorded before it keeps the name its FILED event wrote.
      petitionerCompanyId: p.petitionerCompanyId ?? null,
      petitionerName: p.petitionerName ?? named(p.events),
      status: p.status, filedAt: p.filedAt, expiresAt: p.expiresAt,
    }))
  return { personName: input.personName, cls: classOfWorkAuth(input.workAuth), employerName: input.employerName, employerCompanyId: input.employerCompanyId ?? null, permits, i94, cpt, petitions }
}

/** Every person's facts, in six reads however many people. */
export async function workerClassFactsFor(personIds: string[], db: Db): Promise<Map<string, PersonClassFacts>> {
  const ids = [...new Set(personIds.filter(Boolean))]
  const out = new Map<string, PersonClassFacts>()
  if (ids.length === 0) return out
  const [people, profiles, verifications, petitions, payroll] = await Promise.all([
    db.person.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
    db.consultantProfile.findMany({ where: { personId: { in: ids } }, select: { personId: true, workAuth: true } }),
    db.verification.findMany({
      where: { personId: { in: ids }, type: { in: ['WORK_PERMIT', 'I94'] } },
      select: { personId: true, type: true, status: true, validFrom: true, issuedAt: true, expiresAt: true, result: true },
      orderBy: { id: 'asc' },
    }),
    db.visaPetition.findMany({
      where: { personId: { in: ids } },
      select: {
        personId: true, type: true, status: true, filedAt: true, approvedAt: true, expiresAt: true,
        petitionerCompanyId: true, employerNamed: true, petitioner: { select: { name: true } },
        events: { where: { eventType: 'FILED' }, select: { eventType: true, notes: true }, orderBy: { occurredAt: 'asc' } },
      },
      orderBy: { id: 'asc' },
    }),
    // The firm that pays the person on its own payroll: a buy line with no vendor below.
    db.buyContract.findMany({
      where: { vendorCompanyId: null, state: { in: [...PAYROLL_STATES] }, candidates: { some: { personId: { in: ids } } } },
      select: { createdAt: true, company: { select: { id: true, name: true } }, candidates: { select: { personId: true } } },
      orderBy: { createdAt: 'desc' },
    }),
  ])
  const auth = new Map(profiles.map((p) => [p.personId, p.workAuth]))
  const employerOf = new Map<string, { id: string; name: string }>()
  for (const b of payroll) for (const c of b.candidates) if (!employerOf.has(c.personId)) employerOf.set(c.personId, b.company)
  for (const p of people) {
    const mine = verifications.filter((v) => v.personId === p.id)
    out.set(p.id, factsFrom({
      personName: p.name,
      workAuth: auth.get(p.id) ?? null,
      permits: mine.filter((v) => v.type === 'WORK_PERMIT'),
      i94: mine.filter((v) => v.type === 'I94'),
      petitions: petitions.filter((v) => v.personId === p.id).map((v) => ({ ...v, petitionerName: v.petitioner?.name ?? null })),
      employerName: employerOf.get(p.id)?.name ?? null,
      employerCompanyId: employerOf.get(p.id)?.id ?? null,
    }))
  }
  return out
}
