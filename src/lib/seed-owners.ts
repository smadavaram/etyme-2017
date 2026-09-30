/**
 * Whose record is this — said in words a founder can judge, without
 * printing anybody's address.
 *
 * ── Why this exists ──────────────────────────────────────────────────
 *
 * The rebuild (lib/seed-rebuild) refuses when the demo world is tied to
 * something outside it, and the cleanup (lib/seed-cleanup) takes back
 * seed rows that landed on records outside it. On production both found
 * rows, and both said so by table and id. Neither said whose they were,
 * and "whose" is the whole decision: a visitor's sandbox, a test address
 * somebody made while checking a deploy, and a paying customer are three
 * different answers to "may this go".
 *
 * So one door names an owner:
 *
 * - a company by its name and its domain — or its slug where it has none
 *   — and what kind of company it is on the record: a visitor's sandbox,
 *   a census sandbox, or a company outside the demo world, with its seats
 *   and the day it joined, so a test company reads as one.
 * - a person by their name and their address **masked** — `p•••@gmail.com`
 *   — because the page this goes to is read by whoever holds the
 *   deployment secret, and a real person's address is not theirs to read.
 *   An address nobody can register (`.invalid`, `.example`, `.local`) is
 *   shown whole: it names nobody.
 *
 * Reads only.
 */

import { Prisma } from '@prisma/client'
import { reservedAddress } from '@/lib/demo-session'

type Db = { $queryRawUnsafe: (query: string, ...values: any[]) => Promise<unknown> }
type Row = Record<string, unknown>

/** `priya.shah@gmail.com` → `p•••@gmail.com`. A reserved address is shown whole. */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return 'no address'
  if (reservedAddress(email)) return email
  const at = email.lastIndexOf('@')
  if (at <= 0) return '•••'
  return `${email[0]}•••@${email.slice(at + 1)}`
}

export type CompanyStanding = 'DEMO' | 'VISITOR_SANDBOX' | 'CENSUS_SANDBOX' | 'OUTSIDE'
export type PersonStanding = 'MADE_UP' | 'SANDBOX_VISITOR' | 'AT_A_COMPANY' | 'IN_THE_DEMO_ONLY' | 'NO_SEAT'

export interface OwnerWords {
  kind: 'Company' | 'Person'
  id: string
  /** Who, in a phrase: "Acme Industrial (acme-industrial.com)". */
  name: string
  standing: CompanyStanding | PersonStanding
  /** Who, and what they are on the record, in one sentence. */
  says: string
}

const day = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d ?? '').slice(0, 10))
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/**
 * Companies, in words. `demo` is the set the caller counts as the demo
 * world — the rebuild's roots, or the cleanup's demo owners.
 */
export async function describeCompanies(db: Db, ids: string[], demo: Set<string>): Promise<Map<string, OwnerWords>> {
  const out = new Map<string, OwnerWords>()
  if (!ids.length) return out
  const rows = (await db.$queryRawUnsafe(
    `SELECT c."id", c."name", c."slug", c."domain", c."domainVerified", c."isDemo", c."isCensusSandbox", c."createdAt",
            count(x."id") FILTER (WHERE x."revokedAt" IS NULL)::int AS seats
       FROM "Company" c LEFT JOIN "Context" x ON x."companyId" = c."id"
      WHERE c."id" = ANY($1::text[])
      GROUP BY c."id"`,
    [...new Set(ids)]
  )) as Row[]
  for (const c of rows) {
    const id = c.id as string
    const name = `${c.name} (${c.domain ? `${c.domain}${c.domainVerified ? '' : ', not verified'}` : `${c.slug}, no domain`})`
    // A sandbox first: the cleanup counts sandboxes as demo, and a
    // visitor's own sandbox is still the thing worth saying.
    const standing: CompanyStanding = c.isDemo
      ? 'VISITOR_SANDBOX'
      : demo.has(id)
        ? 'DEMO'
        : c.isCensusSandbox
          ? 'CENSUS_SANDBOX'
          : 'OUTSIDE'
    const what = {
      DEMO: 'a demo company',
      VISITOR_SANDBOX: 'a visitor’s demo sandbox',
      CENSUS_SANDBOX: 'a census sandbox',
      OUTSIDE: 'a company outside the demo world',
    }[standing]
    out.set(id, {
      kind: 'Company',
      id,
      name,
      standing,
      says: `${name}, ${what}, ${plural(c.seats as number, 'seat')}, on the record since ${day(c.createdAt)}`,
    })
  }
  return out
}

/**
 * People, in words, with where they are seated — which is what tells a
 * visitor who tried the demo from somebody at a customer.
 */
export async function describePeople(db: Db, ids: string[], demo: Set<string>): Promise<Map<string, OwnerWords>> {
  const out = new Map<string, OwnerWords>()
  if (!ids.length) return out
  const people = (await db.$queryRawUnsafe(
    `SELECT "id", "name", "primaryEmail", "createdAt" FROM "Person" WHERE "id" = ANY($1::text[])`,
    [...new Set(ids)]
  )) as Row[]
  const seats = (await db.$queryRawUnsafe(
    `SELECT x."personId", x."companyId" FROM "Context" x
      WHERE x."personId" = ANY($1::text[]) AND x."companyId" IS NOT NULL AND x."revokedAt" IS NULL`,
    [...new Set(ids)]
  )) as { personId: string; companyId: string }[]
  const firms = await describeCompanies(db, seats.map((s) => s.companyId), demo)
  for (const p of people) {
    const id = p.id as string
    const email = p.primaryEmail as string
    const name = `${p.name} (${maskEmail(email)})`
    const at = seats.filter((s) => s.personId === id).map((s) => firms.get(s.companyId)).filter((f): f is OwnerWords => !!f)
    const outside = at.filter((f) => f.standing === 'OUTSIDE' || f.standing === 'CENSUS_SANDBOX')
    const sandboxes = at.filter((f) => f.standing === 'VISITOR_SANDBOX')
    let standing: PersonStanding
    let where: string
    if (reservedAddress(email)) {
      standing = 'MADE_UP'
      where = 'a made-up address nobody can own'
    } else if (outside.length) {
      standing = 'AT_A_COMPANY'
      where = `seated at ${outside.slice(0, 3).map((f) => f.name).join(', ')}${outside.length > 3 ? ` and ${outside.length - 3} more` : ''}`
    } else if (sandboxes.length) {
      standing = 'SANDBOX_VISITOR'
      where = `a visitor, seated only in ${plural(sandboxes.length, 'demo sandbox', 'demo sandboxes')}`
    } else if (at.length) {
      standing = 'IN_THE_DEMO_ONLY'
      where = 'seated only at demo companies'
    } else {
      standing = 'NO_SEAT'
      where = 'no seat at any company'
    }
    out.set(id, { kind: 'Person', id, name, standing, says: `${name}, ${where}, on the record since ${day(p.createdAt)}` })
  }
  return out
}

// ── Which company or person a row belongs to ──────────────────────────

type DmmfModel = (typeof Prisma.dmmf.datamodel.models)[number]
const MODELS: readonly DmmfModel[] = Prisma.dmmf.datamodel.models
const byName = new Map(MODELS.map((m) => [m.name, m]))
const q = (s: string) => `"${s.replace(/"/g, '""')}"`

/** The foreign keys of a model, company first, then person, then the rest. */
function parentsOf(model: string): { column: string; to: string }[] {
  const m = byName.get(model)
  if (!m) return []
  const fks = m.fields
    .filter((f) => f.kind === 'object' && f.relationFromFields?.length)
    .map((f) => {
      const scalar = m.fields.find((x) => x.name === f.relationFromFields![0])
      return { column: scalar?.dbName ?? f.relationFromFields![0], to: f.type, field: f.relationFromFields![0] }
    })
  const rank = (e: { to: string; field: string }) =>
    e.to === 'Company' ? (e.field === 'companyId' ? 0 : 1) : e.to === 'Person' ? (e.field === 'personId' ? 2 : 3) : 4
  return fks.sort((a, b) => rank(a) - rank(b)).map(({ column, to }) => ({ column, to }))
}

/**
 * The company, or else the person, a row belongs to — its own
 * `companyId` first, then any company it names, then its person, then
 * whatever its parents belong to, three steps up at most.
 */
export async function ownerOf(
  db: Db,
  model: string,
  id: string,
  depth = 0
): Promise<{ kind: 'Company' | 'Person'; id: string } | null> {
  if (model === 'Company' || model === 'Person') return { kind: model, id }
  if (depth > 3) return null
  const parents = parentsOf(model)
  if (!parents.length) return null
  const table = byName.get(model)?.dbName ?? model
  const cols = [...new Set(parents.map((p) => p.column))]
  const [row] = (await db.$queryRawUnsafe(
    `SELECT ${cols.map(q).join(', ')} FROM ${q(table)} WHERE "id" = $1`,
    id
  )) as Row[]
  if (!row) return null
  for (const p of parents) {
    const v = row[p.column] as string | null
    if (!v) continue
    const found = await ownerOf(db, p.to, v, depth + 1)
    if (found) return found
  }
  return null
}
