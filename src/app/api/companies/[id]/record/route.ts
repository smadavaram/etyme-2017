import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { recordRefusal } from '@/lib/access-log'
import { mayEditRecord, identityDomain, notedDomain, sameDomainRefused, sameNameRefused, namesakeSays, NEVER_EMAILS } from '@/lib/counterparty'
import { dealsWith, NOT_ON_YOUR_LIST } from '../../dealing'
import { ownDomainsFor, twinFor } from '../../twins'

/**
 * PATCH /api/companies/:id/record — { name, domain, entityType }
 *
 * Correct a company on your own list (2026-11-15): its name, the domain
 * you typed for it and its entity type. Without this a mistyped domain, or
 * a name made from a domain, stayed wrong for good, and the domain rule
 * would make twins nobody could repair. Only a record the caller made that
 * nobody has claimed and nobody is seated at: a firm on Etyme keeps its
 * own name. The same twin rule as Add a company is asked on save. One
 * activity-log row names who changed what from what to what. The domain
 * is kept as the caller's note, never in the column a company's own people
 * join by. Nothing is emailed. Every refusal is written to the access log
 * before it is sent.
 */

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'Companies')
  if (notStaff) return notStaff
  if (!caller.company) {
    return NextResponse.json({ error: { code: 'NO_COMPANY', message: 'You are not signed in at a company.' } }, { status: 403 })
  }
  const me = caller.company
  const body = await request.json().catch(() => ({}))
  const other = await prisma.company.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, entityType: true, website: true, claimedAt: true, listedById: true, isDemo: true, _count: { select: { contexts: true } } },
  })

  const refuse = async (status: number, code: string, says: string, extra: Record<string, unknown> = {}) => {
    await recordRefusal([{ companyId: other?.id ?? me.id }], {
      actorPersonId: caller.isService ? undefined : caller.person.id,
      actorCompanyId: me.id,
      action: 'CONTRACT_VIEW',
      reason: `Refused correcting ${other?.id ?? params.id} on ${me.name}'s list: ${says}`,
    })
    return NextResponse.json({ error: { code, message: says, ...extra } }, { status })
  }

  // A company the caller has no business with is answered as an id that
  // does not exist (record 61): never its name, never that it is on Etyme.
  if (!other || other.isDemo !== (me.isDemo === true) || !(await dealsWith(me.id, other))) return refuse(404, 'NOT_FOUND', NOT_ON_YOUR_LIST)

  const verdict = mayEditRecord({
    me: { id: me.id, name: me.name },
    permissions: caller.permissions,
    other: { id: other.id, name: other.name, claimedAt: other.claimedAt, listedById: other.listedById, seats: other._count.contexts },
  })
  if (!verdict.ok) return refuse(verdict.status, verdict.code, verdict.says)

  const name = String(body?.name ?? '').trim()
  if (name.length < 2) return refuse(422, 'VALIDATION', 'Give the company’s name, at least two letters.', { field: 'name' })
  if (name.length > 120) return refuse(422, 'VALIDATION', 'Keep the name under 120 letters.', { field: 'name' })

  const typed = typeof body?.domain === 'string' ? body.domain.trim() : ''
  const domain = typed ? identityDomain(typed) : null
  if (typed && !notedDomain(typed)) {
    return refuse(422, 'VALIDATION', `${typed} does not read as a domain. Type it like northwind-staffing.example, or leave the box empty.`, { field: 'domain' })
  }
  if (typed && !domain) {
    return refuse(422, 'VALIDATION', `${notedDomain(typed)} is a personal email domain, so it cannot be their company's domain. Leave the box empty instead.`, { field: 'domain' })
  }
  const entityType = typeof body?.entityType === 'string' && body.entityType.trim() ? body.entityType.trim().slice(0, 60) : null

  const read = await twinFor(me.id, { name, domain }, prisma, other.id)
  if (read.twin) {
    const byDomain = read.by === 'DOMAIN'
    return refuse(409, byDomain ? 'SAME_DOMAIN_ON_YOUR_LIST' : 'SAME_NAME_ON_YOUR_LIST', byDomain ? sameDomainRefused(read.twin) : sameNameRefused(read.twin), {
      field: byDomain ? 'domain' : 'name', companyId: read.twin.id, company: read.twin.name,
    })
  }

  const wasDomain = (await ownDomainsFor(me.id, [other])).get(other.id)?.domain ?? null
  const changes: { box: string; from: string | null; to: string | null }[] = []
  if (name !== other.name) changes.push({ box: 'name', from: other.name, to: name })
  if (domain !== wasDomain) changes.push({ box: 'domain', from: wasDomain, to: domain })
  if (entityType !== (other.entityType ?? null)) changes.push({ box: 'entity type', from: other.entityType ?? null, to: entityType })
  if (changes.length === 0) {
    return NextResponse.json({ data: { companyId: other.id, changed: false, message: `Nothing changed on ${other.name}.` } })
  }

  const said = (v: string | null) => (v == null ? 'nothing' : v)
  const what = changes.map((c) => `the ${c.box} from ${said(c.from)} to ${said(c.to)}`).join(', ')
  const message = [`${name} is corrected on your Companies list. ${NEVER_EMAILS}`, read.namesake ? namesakeSays(read.namesake) : null].filter(Boolean).join(' ')
  const written = await prisma.$transaction(async (tx) => {
    // Guarded again inside the write: only the caller's own record nobody has claimed.
    const done = await tx.company.updateMany({
      where: { id: other.id, listedById: me.id, claimedAt: null },
      data: {
        name,
        entityType,
        // The caller's own note of the domain, never the claim column.
        ...(changes.some((c) => c.box === 'domain') ? { website: domain } : {}),
      },
    })
    if (done.count === 0) return false
    await tx.automationLog.create({
      data: {
        companyId: me.id,
        action: 'COMPANY_RECORD_EDITED',
        summary: `${caller.person.name} changed ${what}`,
        reason: 'Corrected on the Companies list by a person who manages who the firm trades with. Nothing was sent.',
        payload: { otherCompanyId: other.id, byName: caller.person.name, personId: caller.person.id, position: null, changes },
        reversible: true,
      },
    })
    return true
  })
  if (!written) return refuse(409, 'ON_ETYME', `${other.name} joined Etyme a moment ago, so it keeps its own name and domain. Nothing was changed.`)
  return NextResponse.json({ data: { companyId: other.id, changed: true, changes, namesake: read.namesake?.name ?? null, message } })
}
