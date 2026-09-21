import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'
import { ensureDefaultRoles } from '@/lib/company-roles'

import { GET as tenure } from '@/app/api/tenure/route'
import { GET as compliance } from '@/app/api/compliance/route'
import { GET as horizon } from '@/app/api/governance/horizon/route'
import { GET as deskQueue } from '@/app/api/data-requests/route'
import { GET as holdList } from '@/app/api/legal-holds/route'
import { GET as breachList } from '@/app/api/breaches/route'
import { GET as myData, POST as askForMyData } from '@/app/api/me/data/route'

/**
 * A program office reads a client's compliance from the desk the client
 * gave it, and every read says so.
 *
 * ── What this closes ─────────────────────────────────────────────────
 *
 * `party-uniform.test.ts` proved the seat exists: a program office with
 * no placement anywhere reads a client's tenure ledger once the client
 * has seated it, and stops the second the seat is revoked. What it did
 * not prove is what happens *inside* the seat, and three things were
 * wrong there.
 *
 * The seat's role decided nothing. `resolveClientCompany` handed the
 * seat back and every compliance route threw it away, so an office
 * seated at the AP clerk's desk read exactly what one seated at the
 * compliance officer's read — the client chose a desk and the choice had
 * no effect on anything.
 *
 * A seat narrowed to one business unit read the whole program. The
 * column has been on `ProgramSeat` since it was written and nothing
 * filtered on it, which is the shape CLAUDE.md warns about: adding a
 * column is not building a feature.
 *
 * And the trail said "Tenure view at Cavanaugh Glassworks", which names
 * neither the firm that read it nor the desk it sat at. The one question
 * a client asks afterwards — who looked at my workforce, and on whose
 * authority — could not be answered out of its own access log.
 *
 * ── Who is in it ─────────────────────────────────────────────────────
 *
 *   Aptiva Workforce   seated at Cavanaugh Glassworks' PROGRAM MANAGER
 *                      desk by the world seed itself. Reads the program;
 *                      is refused the privacy books, because that desk
 *                      does not hold the privacy permission. Seated a
 *                      second time at Northbend Athletic, narrowed to one
 *                      business unit.
 *   Kestrel MSP        seated at Talvern Medical's COMPLIANCE OFFICER
 *                      desk. Reads the program AND the privacy books,
 *                      because that desk holds it. The seat is revoked at
 *                      the end and it goes back to being an office with a
 *                      desk nowhere.
 *
 * The two seats hold two different client roles on purpose. A walk from
 * one desk proves the route opens; only a walk from two proves the
 * client's choice of desk is what decides.
 */

const APTIVA_COMPLIANCE = 'compliance.aptiva@seat.etyme.invalid'
const KESTREL_COMPLIANCE = 'compliance.kestrel@seat.etyme.invalid'

const co = { aptiva: '', kestrel: '', cavanaugh: '', talvern: '', northbend: '' }
const it_ = { unitSeat: '', talvernSeat: '', unitId: '', unitPerson: '', outsidePerson: '' }

/** A fire-and-forget write, waited for rather than raced. */
async function eventually<T>(read: () => Promise<T>, done: (v: T) => boolean, tries = 60): Promise<T> {
  let last = await read()
  for (let i = 0; i < tries && !done(last); i++) {
    await new Promise((r) => setTimeout(r, 50))
    last = await read()
  }
  return last
}

/** A seat at a firm, holding one of that firm's own roles. */
async function seatAt(companyId: string, kind: string, roleName: string, name: string, email: string) {
  await ensureDefaultRoles(companyId, kind)
  const role = await prisma.role.findFirstOrThrow({ where: { companyId, name: roleName } })
  const person = await prisma.person.upsert({
    where: { primaryEmail: email }, update: { name }, create: { name, primaryEmail: email },
  })
  const had = await prisma.context.findFirst({ where: { personId: person.id, companyId } })
  if (!had) {
    await prisma.context.create({
      data: {
        personId: person.id, companyId, roleId: role.id, type: 'EMPLOYEE', side: 'SELL',
        grantReason: `${roleName}, for the seated-compliance walk`,
      },
    })
  }
  return person.id
}

/** A desk one client grants one program office, holding one of the client's own roles. */
async function grantSeat(
  clientCompanyId: string,
  officeCompanyId: string,
  roleName: string,
  reason: string,
  orgUnitId: string | null = null
) {
  await ensureDefaultRoles(clientCompanyId, 'CLIENT')
  const role = await prisma.role.findFirstOrThrow({ where: { companyId: clientCompanyId, name: roleName } })
  const grantor = await prisma.context.findFirstOrThrow({
    where: { companyId: clientCompanyId }, select: { personId: true },
  })
  const row = await prisma.programSeat.create({
    data: { clientCompanyId, officeCompanyId, roleId: role.id, orgUnitId, grantedById: grantor.personId, reason },
  })
  return row.id
}

/** The signed-in address of a client's own desk, by role name. */
async function deskAt(companyId: string, roleName: string): Promise<string> {
  const row = await prisma.context.findFirstOrThrow({
    where: { companyId, role: { name: roleName } },
    select: { person: { select: { primaryEmail: true } } },
  })
  return row.person.primaryEmail!
}

beforeAll(async () => {
  await resetDatabase()
  await seedWorld()

  for (const [key, slug] of [
    ['aptiva', 'world-aptiva'], ['kestrel', 'world-kestrel'],
    ['cavanaugh', 'world-corning'], ['talvern', 'world-terumo-bct'], ['northbend', 'world-nike'],
  ] as const) {
    co[key] = (await prisma.company.findFirstOrThrow({ where: { slug } })).id
  }

  await seatAt(co.aptiva, 'MSP', 'Compliance Officer', 'Imani Sackey', APTIVA_COMPLIANCE)
  await seatAt(co.kestrel, 'MSP', 'Compliance Officer', 'Delphine Aubert', KESTREL_COMPLIANCE)

  // Talvern Medical seats Kestrel at its own Compliance Officer desk —
  // the desk that holds `privacy.manage`, and therefore the privacy
  // books as well as the program.
  it_.talvernSeat = await grantSeat(
    co.talvern, co.kestrel, 'Compliance Officer',
    'Kestrel answers for tenure, work authorization and supplier cover here. They place nobody at Talvern.'
  )

  // Aptiva's seat at Cavanaugh is the world seed's own, at the Program
  // Manager desk. Nothing here creates it: this reads what ships.

  // ── One unit, for the narrowed seat ────────────────────────────────
  //
  // Northbend seats Aptiva at a single business unit. One person on site
  // charged to that unit and one charged to none, so "reads that unit's
  // people only" has something to fail on.
  const unit = await prisma.orgUnit.findFirst({
    where: { companyId: co.northbend }, orderBy: { name: 'asc' }, select: { id: true },
  })
  const live = await prisma.sellContract.findMany({
    where: {
      OR: [{ endClientCompanyId: co.northbend }, { endClientCompanyId: null, clientCompanyId: co.northbend }],
      state: { in: ['IN_PROGRESS', 'ENDED', 'PAUSED'] },
    },
    select: { id: true, personId: true },
    orderBy: { id: 'asc' },
  })
  const distinct = [...new Set(live.map((c) => c.personId))]
  expect(unit, 'Northbend has no org units in the seeded world').not.toBeNull()
  expect(distinct.length, 'Northbend has fewer than two people on site').toBeGreaterThan(1)
  it_.unitId = unit!.id
  it_.unitPerson = distinct[0]
  it_.outsidePerson = distinct[1]

  await prisma.sellContract.updateMany({
    where: { id: { in: live.filter((c) => c.personId === it_.unitPerson).map((c) => c.id) } },
    data: { orgUnitId: it_.unitId },
  })
  await prisma.sellContract.updateMany({
    where: { id: { in: live.filter((c) => c.personId !== it_.unitPerson).map((c) => c.id) } },
    data: { orgUnitId: null },
  })

  it_.unitSeat = await grantSeat(
    co.northbend, co.aptiva, 'Program Manager',
    'Aptiva runs one business unit for us and nothing else. They place nobody here.',
    it_.unitId
  )
}, 300_000)

// ── The tenure ledger, from a seated compliance desk ────────────────

describe('a program office reads the client’s tenure ledger from the desk the client gave it', () => {
  it('a seated compliance officer reads the client’s tenure ledger, and every row of the trail names the seat', async () => {
    as(KESTREL_COMPLIANCE)
    const { status, body } = await json(
      await tenure(req('GET', `/api/tenure?clientCompanyId=${co.talvern}`))
    )
    expect(body?.error, JSON.stringify(body)).toBeUndefined()
    expect(status).toBe(200)
    expect(body.data.client.name).toBe('Talvern Medical')
    expect(body.data.people.length, 'a program office read an empty program').toBeGreaterThan(0)

    const subjects: string[] = body.data.people.map((p: any) => p.personId)
    const trail = await eventually(
      () => prisma.accessLog.findMany({
        where: {
          actorCompanyId: co.kestrel, action: 'PROGRAM_READ',
          reason: { contains: 'Tenure ledger read' },
        },
        select: { subjectId: true, reason: true },
      }),
      (rows) => rows.length >= subjects.length
    )
    expect(trail.length, 'a program office read a client’s workforce and left no trail').toBeGreaterThan(0)
    for (const row of trail) {
      expect(row.reason).toContain('Kestrel MSP')
      expect(row.reason).toContain('Compliance Officer seat')
      expect(row.reason).toContain('Talvern Medical granted it')
      expect(row.reason).toContain(it_.talvernSeat)
    }
    // Every person on the page is in the trail, not merely one of them.
    const logged = new Set(trail.map((r) => r.subjectId))
    for (const id of subjects) expect(logged.has(id), 'somebody on the page is not in the trail').toBe(true)
  })

  it('a read made from a seat is filed as a program read, so a client finds every one of them in one question', async () => {
    const seated = await prisma.accessLog.count({
      where: { actorCompanyId: co.kestrel, action: 'PROGRAM_READ' },
    })
    expect(seated, 'the seated read was filed under somebody else’s action').toBeGreaterThan(0)

    // And never under the actions that mean a customer reading its own
    // book, which is what these rows used to be filed as.
    //
    // One row is still filed that way and it is named rather than
    // quietly excluded: the *admission* read, written by `noteSeatRead`
    // in `lib/program-seat` the moment the seat resolves, is still a
    // CONTRACT_VIEW. That file is the architect's and the action is one
    // line in it; every read a route makes is this domain's and is
    // already a PROGRAM_READ. Its reason always opens "Program read by",
    // so the exception is exact rather than a whole action waved past.
    const misfiled = await prisma.accessLog.findMany({
      where: {
        actorCompanyId: co.kestrel,
        action: { in: ['TENURE_VIEW', 'CONTRACT_VIEW', 'COMPLIANCE_CHECK'] },
        reason: { contains: 'seat' },
      },
      select: { action: true, reason: true },
    })
    const notTheAdmission = misfiled.filter((r) => !r.reason?.startsWith('Program read by'))
    expect(
      notTheAdmission.map((r) => `${r.action}: ${r.reason}`),
      'a route wrote a seated read under an action that means a customer reading its own book'
    ).toEqual([])
  })

  it('the client’s own compliance officer reads the same ledger and no seat is named, because there is none', async () => {
    as(await deskAt(co.talvern, 'Compliance Officer'))
    const { status, body } = await json(await tenure(req('GET', '/api/tenure')))
    expect(body?.error, JSON.stringify(body)).toBeUndefined()
    expect(status).toBe(200)
    expect(body.data.client.name).toBe('Talvern Medical')
    const mine = await eventually(
      () => prisma.accessLog.findFirst({
        where: { actorCompanyId: co.talvern, action: 'TENURE_VIEW' },
        select: { reason: true },
      }),
      (r) => r != null
    )
    expect(mine?.reason).toContain('Talvern Medical')
    expect(mine?.reason).not.toContain('seat')
  })
})

// ── The desk the client chose is the desk that decides ──────────────

describe('what a seated office may read is exactly what the desk it was given may read', () => {
  it('a seat holding the Program Manager role, not Compliance, is refused the privacy queue in a sentence naming the client’s rule', async () => {
    as(APTIVA_COMPLIANCE)
    const { status, body } = await json(
      await deskQueue(req('GET', `/api/data-requests?clientCompanyId=${co.cavanaugh}`))
    )
    expect(status).toBe(403)
    expect(body.error).toContain('Cavanaugh Glassworks')
    expect(body.error).toContain('Aptiva Workforce')
    expect(body.error).toContain('Program Manager')
    expect(body.error).toContain('data requests')
    // A refusal says what is missing and who can fix it, never a code
    // and never a permission key.
    expect(body.error).not.toMatch(/[A-Z]{3,}_[A-Z]/)
    expect(body.error).not.toContain('privacy.manage')
  })

  it('the same seat reads the program it was given — the tenure ledger and the compliance page — because that desk does hold those', async () => {
    as(APTIVA_COMPLIANCE)
    const t = await json(await tenure(req('GET', `/api/tenure?clientCompanyId=${co.cavanaugh}`)))
    expect(t.body?.error, JSON.stringify(t.body)).toBeUndefined()
    expect(t.status).toBe(200)
    const c = await json(await compliance(req('GET', `/api/compliance?clientCompanyId=${co.cavanaugh}`)))
    expect(c.body?.error, JSON.stringify(c.body)).toBeUndefined()
    expect(c.status).toBe(200)
    expect(c.body.data.client.name).toBe('Cavanaugh Glassworks')
  })

  it('a seated compliance officer reads the client’s privacy queue, and it is the client’s book rather than the office’s own', async () => {
    as(KESTREL_COMPLIANCE)
    const { status, body } = await json(
      await deskQueue(req('GET', `/api/data-requests?clientCompanyId=${co.talvern}`))
    )
    expect(body?.error, JSON.stringify(body)).toBeUndefined()
    expect(status).toBe(200)
    expect(body.data.desk.says).toContain('Talvern Medical')
    expect(body.data.desk.says).toContain('Kestrel MSP')
    expect(body.data.desk.says).toContain('Compliance Officer')
    expect(body.data.desk.missing).toBeNull()
  })

  it('a seated compliance officer reads the client’s legal holds, and its own page still shows its own', async () => {
    as(KESTREL_COMPLIANCE)
    const theirs = await json(await holdList(req('GET', `/api/legal-holds?clientCompanyId=${co.talvern}`)))
    expect(theirs.body?.error, JSON.stringify(theirs.body)).toBeUndefined()
    expect(theirs.body.data.desk.companyName).toBe('Talvern Medical')
    expect(theirs.body.data.desk.seat).toBe(it_.talvernSeat)

    const own = await json(await holdList(req('GET', '/api/legal-holds')))
    expect(own.body?.error, JSON.stringify(own.body)).toBeUndefined()
    expect(own.body.data.desk.companyName).toBe('Kestrel MSP')
    expect(own.body.data.desk.seat).toBeNull()
  })

  it('a seat at one client opens nothing at another, and the refusal says a desk is the client’s to grant', async () => {
    as(KESTREL_COMPLIANCE)
    const { status, body } = await json(
      await deskQueue(req('GET', `/api/data-requests?clientCompanyId=${co.northbend}`))
    )
    expect(status).toBe(403)
    expect(body.error).toContain('Kestrel MSP')
    expect(body.error).toMatch(/seat the client grants/)
    expect(body.error).not.toMatch(/[A-Z]{3,}_[A-Z]/)
  })

  it('a client reading its own book is never asked about a seat, however many it has granted', async () => {
    as(await deskAt(co.talvern, 'Compliance Officer'))
    const { status, body } = await json(await deskQueue(req('GET', '/api/data-requests')))
    expect(status).toBe(200)
    expect(body.data.desk.missing).toBeNull()
    expect(body.data.desk.says).toContain('your sites')
  })
})

// ── A seat narrowed to one business unit ────────────────────────────

describe('a seat scoped to one business unit reaches that unit and no further', () => {
  it('a seat scoped to one business unit reads tenure for that unit’s people only', async () => {
    as(APTIVA_COMPLIANCE)
    const { status, body } = await json(
      await tenure(req('GET', `/api/tenure?clientCompanyId=${co.northbend}`))
    )
    expect(body?.error, JSON.stringify(body)).toBeUndefined()
    expect(status).toBe(200)
    const ids = body.data.people.map((p: any) => p.personId)
    expect(ids, 'the unit’s own person is missing').toContain(it_.unitPerson)
    expect(ids, 'a person outside the unit reached a seat scoped to it').not.toContain(it_.outsidePerson)
  })

  it('the same narrowing holds on the compliance page and on what is about to go wrong, because a wall in one screen is not a wall', async () => {
    as(APTIVA_COMPLIANCE)
    const c = await json(await compliance(req('GET', `/api/compliance?clientCompanyId=${co.northbend}`)))
    expect(c.body?.error, JSON.stringify(c.body)).toBeUndefined()
    const people = c.body.data.verifications.persons.map((p: any) => p.personId)
    expect(people).not.toContain(it_.outsidePerson)

    const h = await json(
      await horizon(req('GET', `/api/governance/horizon?clientCompanyId=${co.northbend}&days=365`))
    )
    expect(h.body?.error, JSON.stringify(h.body)).toBeUndefined()
    const subjects = h.body.data.horizon.map((i: any) => i.subject.id)
    expect(subjects).not.toContain(it_.outsidePerson)
  })

  it('the client’s own desk still reads the whole program, because the narrowing is the seat’s and not the client’s', async () => {
    as(await deskAt(co.northbend, 'Compliance Officer'))
    const { body } = await json(await tenure(req('GET', '/api/tenure')))
    const ids = body.data.people.map((p: any) => p.personId)
    expect(ids).toContain(it_.unitPerson)
    expect(ids).toContain(it_.outsidePerson)
  })
})

// ── What the person whose record it was can see ─────────────────────

describe('the person the record is about can see who read it and on whose authority', () => {
  it('a person can see, on their own data page, that a program office read their record under a seat, and which client granted it', async () => {
    // Somebody Aptiva read at Cavanaugh, under the seat the world seeds.
    as(APTIVA_COMPLIANCE)
    const read = await json(await tenure(req('GET', `/api/tenure?clientCompanyId=${co.cavanaugh}`)))
    expect(read.status).toBe(200)

    // The person has to be able to sign in as themselves to read their
    // own page, so pick one who holds a seat of their own.
    const onSite: string[] = read.body.data.people.map((p: any) => p.personId)
    const candidates = await prisma.person.findMany({
      where: { id: { in: onSite }, contexts: { some: {} } },
      select: { id: true, primaryEmail: true },
      orderBy: { id: 'asc' },
    })
    const subject = candidates.find((p) => p.primaryEmail)
    expect(subject, 'nobody Aptiva read can sign in as themselves').toBeTruthy()

    await eventually(
      () => prisma.accessLog.findFirst({
        where: { subjectId: subject!.id, action: 'PROGRAM_READ' }, select: { id: true },
      }),
      (r) => r != null
    )

    as(subject!.primaryEmail!)
    const asked = await json(await askForMyData(req('POST', '/api/me/data', { kind: 'EXPORT' })))
    expect(asked.body?.error, JSON.stringify(asked.body)).toBeUndefined()

    const listed = await json(await myData(req('GET', '/api/me/data')))
    const exportRow = listed.body.data.requests.find((r: any) => r.kind === 'EXPORT' && r.downloadUrl)
    expect(exportRow, 'the export they asked for is not on their own page').toBeTruthy()

    const file = await json(await myData(req('GET', exportRow.downloadUrl)))
    const logs = file.body.categories['Logs'] as any[]
    const seatRow = logs.find((l) => l.action === 'PROGRAM_READ')
    expect(seatRow, 'the seated read is not in the file the person is handed').toBeTruthy()
    expect(seatRow.actorCompany.name).toBe('Aptiva Workforce')
    expect(seatRow.reason).toContain('Cavanaugh Glassworks granted it')
    expect(seatRow.reason).toContain('Program Manager seat')
  })
})

// ── Revocation, and what is left afterwards ─────────────────────────

describe('a seat stops working the second the client takes it back', () => {
  it('a revoked seat reads no tenure the next second', async () => {
    as(KESTREL_COMPLIANCE)
    const before = await json(await tenure(req('GET', `/api/tenure?clientCompanyId=${co.talvern}`)))
    expect(before.status).toBe(200)

    await prisma.programSeat.update({
      where: { id: it_.talvernSeat },
      data: {
        revokedAt: new Date(),
        revokeReason: 'The program is coming back in house from October.',
      },
    })

    as(KESTREL_COMPLIANCE)
    const after = await json(await tenure(req('GET', `/api/tenure?clientCompanyId=${co.talvern}`)))
    expect(after.status).toBeGreaterThanOrEqual(400)
    expect(after.body.error.message).toContain('Kestrel MSP')
    expect(after.body.error.message).not.toMatch(/[A-Z]{3,}_[A-Z]/)

    // And the client's privacy books close in the same second.
    const queue = await json(await deskQueue(req('GET', `/api/data-requests?clientCompanyId=${co.talvern}`)))
    expect(queue.status).toBe(403)

    // The row stays. Who was in the program, from when to when, and why
    // they came out is the answer somebody may have to give later.
    const row = await prisma.programSeat.findUniqueOrThrow({ where: { id: it_.talvernSeat } })
    expect(row.revokedAt).not.toBeNull()
    expect(row.revokeReason).toContain('coming back in house')
  })

  it('the trail of what it read while it was live survives the revocation, because that is the record the revocation is about', async () => {
    const trail = await prisma.accessLog.count({
      where: { actorCompanyId: co.kestrel, action: 'PROGRAM_READ', reason: { contains: it_.talvernSeat } },
    })
    expect(trail).toBeGreaterThan(0)
  })

  it('an office whose only seat has been taken back reads its own book and is told a desk is the client’s to grant', async () => {
    as(KESTREL_COMPLIANCE)
    const own = await json(await deskQueue(req('GET', '/api/data-requests')))
    expect(own.body?.error, JSON.stringify(own.body)).toBeUndefined()
    expect(own.status).toBe(200)
    expect(own.body.data.desk.missing).toContain('Kestrel MSP')
    expect(own.body.data.desk.missing).toContain('granted by the client')
    expect(own.body.data.desk.missing).toContain('owner or the')
    // The seat was built on 2026-09-20 and this sentence went on saying
    // it was not, because the framing was picked off the company kind
    // and nothing else.
    expect(own.body.data.desk.missing).not.toContain('not built yet')
  })

  it('an office that does hold a desk somewhere is told where that client’s queue is, rather than that no seat exists', async () => {
    as(APTIVA_COMPLIANCE)
    const own = await json(await deskQueue(req('GET', '/api/data-requests')))
    expect(own.status).toBe(200)
    expect(own.body.data.desk.missing).toContain('Aptiva Workforce')
    expect(own.body.data.desk.missing).toMatch(/Cavanaugh Glassworks|Northbend Athletic/)
    expect(own.body.data.desk.missing).not.toContain('not built yet')
  })

  it('a client’s own compliance desk is untouched by any of this and still reads its own three books', async () => {
    as(await deskAt(co.northbend, 'Compliance Officer'))
    const queue = await json(await deskQueue(req('GET', '/api/data-requests')))
    expect(queue.status).toBe(200)
    expect(queue.body.data.desk.missing).toBeNull()
    const holds = await json(await holdList(req('GET', '/api/legal-holds')))
    expect(holds.status).toBe(200)
    expect(holds.body.data.desk.companyName).toBe('Northbend Athletic')
    // The breach register is a list or the ordinary "you were in no
    // incident" refusal. Both are unchanged behavior; neither is a crash.
    const breaches = await json(await breachList(req('GET', '/api/breaches')))
    expect([200, 403]).toContain(breaches.status)
  })
})
