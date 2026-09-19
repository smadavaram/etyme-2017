import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'
import { ensureDefaultRoles } from '@/lib/company-roles'

import { GET as myData, POST as askForMyData } from '@/app/api/me/data/route'
import { GET as deskQueue, POST as deskAct } from '@/app/api/data-requests/route'
import { GET as holdList, POST as holdAct } from '@/app/api/legal-holds/route'
import { GET as breachList, POST as breachAct } from '@/app/api/breaches/route'
import { runRetentionSweep, deskRefusal } from '@/lib/data-request'
import { isTombstone } from '@/lib/erasure'

/**
 * "Implement it across the app and not for client." — the founder,
 * 2026-09-19, on retention, export, erasure and the breach clock.
 *
 * `data-rights.test.ts` walks a consultant and two clients. This one
 * walks everybody else, because a right that only works from a client's
 * compliance desk is a right three quarters of the people on this
 * platform do not have.
 *
 * ── Who is in it ─────────────────────────────────────────────────────
 *
 *   CloudEPA            a bench vendor. Its own compliance desk logs a
 *                       request for one of its own consultants, holds
 *                       them, and is refused on a stranger.
 *   Teleworld · Karthik an integrator and its own W2 — the person the
 *                       work is about who also holds a seat at the firm
 *                       that employs him.
 *   Aptiva Workforce    a program office that places nobody and holds no
 *                       seat in anybody's program. It is told what is
 *                       missing rather than shown an empty list.
 *   Northbend Athletic  its AP clerk and its hiring manager, asking for
 *                       themselves from a seat and nothing else.
 *
 * ── The seat this had to invent, and why ─────────────────────────────
 *
 * Neither CloudEPA nor Wrenfield Technical seeds a compliance officer —
 * `lib/seed-world` gives every supplier exactly one seat, its owner, and
 * only the three client programs in `lib/seed-programmes` get a desk per
 * job. An owner holds `*`, which passes every permission gate without
 * proving any of them, so a walk done from an owner's seat proves
 * nothing about the desk the page is named for.
 *
 * So this seats a real Compliance Officer and a real Account Manager at
 * CloudEPA out of `rolesFor('VENDOR')` — the product's own role set,
 * through `ensureDefaultRoles`, never a permission list written here.
 * Seeding them into the world is `etyme-architect`'s to do and is worth
 * doing: a supplier's compliance desk is unreachable on the demo today.
 */

const D = '@demo.etyme.local'
const STAFF = 'ops@etyme.example'

const CLOUDEPA_COMPLIANCE = 'compliance.cloudepa@seed.etyme.invalid'
const CLOUDEPA_ACCOUNTS = 'accounts.cloudepa@seed.etyme.invalid'
const APTIVA_COMPLIANCE = 'compliance.aptiva@seed.etyme.invalid'
const CLOUDEPA_OWNER = `world-cloudepa${D}`
const HARLOW_OWNER = `world-harlow-health${D}`
const NORTHBEND_AP = `world-nike-ap${D}`
const NORTHBEND_HIRING = `world-nike-hiring${D}`
const KARTHIK = 'karthik.menon@seed.etyme.invalid'
const ANDERS = 'anders.lund@seed.etyme.invalid'

const co = { cloudepa: '', teleworld: '', aptiva: '', northbend: '', harlow: '' }
const who = { karthik: '', anders: '', cloudepaConsultant: '', ap: '', hiring: '', cloudepaOwner: '' }
let cloudepaConsultantName = ''

/** A fire-and-forget write, waited for rather than raced. */
async function eventually<T>(read: () => Promise<T>, done: (v: T) => boolean, tries = 40): Promise<T> {
  let last = await read()
  for (let i = 0; i < tries && !done(last); i++) {
    await new Promise((r) => setTimeout(r, 50))
    last = await read()
  }
  return last
}

/** A seat at a firm, holding one of that firm's own roles. */
async function seat(companyId: string, kind: string, roleName: string, name: string, email: string) {
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
        grantReason: `${roleName}, for the data-rights walk`,
      },
    })
  }
  return person.id
}

beforeAll(async () => {
  await resetDatabase()
  await seedWorld()
  process.env.ETYME_STAFF_EMAILS = STAFF

  const staffPerson = await prisma.person.upsert({
    where: { primaryEmail: STAFF }, update: {},
    create: { name: 'Etyme operations', primaryEmail: STAFF },
  })
  const etyme = await prisma.company.upsert({
    where: { slug: 'etyme-platform' }, update: {},
    create: { name: 'Etyme', slug: 'etyme-platform', kind: 'VENDOR', currency: 'USD', defaultPaymentTerms: 30 },
  })
  if (!(await prisma.context.findFirst({ where: { personId: staffPerson.id, companyId: etyme.id } }))) {
    const role = await prisma.role.create({
      data: { companyId: etyme.id, name: 'Operations', permissions: ['governance.read'] },
    })
    await prisma.context.create({
      data: {
        personId: staffPerson.id, companyId: etyme.id, roleId: role.id, type: 'EMPLOYEE',
        side: 'SELL', grantReason: 'Etyme operations, for the integration walk',
      },
    })
  }

  for (const [key, slug] of [
    ['cloudepa', 'world-cloudepa'], ['teleworld', 'world-teleworld'],
    ['aptiva', 'world-aptiva'], ['northbend', 'world-nike'], ['harlow', 'world-harlow-health'],
  ] as const) {
    co[key] = (await prisma.company.findFirstOrThrow({ where: { slug } })).id
  }

  await seat(co.cloudepa, 'VENDOR', 'Compliance Officer', 'Nadia Farrell', CLOUDEPA_COMPLIANCE)
  await seat(co.cloudepa, 'VENDOR', 'Account Manager', 'Ronan Deeley', CLOUDEPA_ACCOUNTS)
  await seat(co.aptiva, 'MSP', 'Compliance Officer', 'Imani Sackey', APTIVA_COMPLIANCE)

  who.karthik = (await prisma.person.findUniqueOrThrow({ where: { primaryEmail: KARTHIK } })).id
  who.anders = (await prisma.person.findUniqueOrThrow({ where: { primaryEmail: ANDERS } })).id
  who.ap = (await prisma.person.findUniqueOrThrow({ where: { primaryEmail: NORTHBEND_AP } })).id
  who.hiring = (await prisma.person.findUniqueOrThrow({ where: { primaryEmail: NORTHBEND_HIRING } })).id
  who.cloudepaOwner = (await prisma.person.findUniqueOrThrow({ where: { primaryEmail: CLOUDEPA_OWNER } })).id

  const line = await prisma.sellContract.findFirstOrThrow({
    where: { companyId: co.cloudepa },
    select: { personId: true },
  })
  who.cloudepaConsultant = line.personId
  cloudepaConsultantName =
    (await prisma.person.findUniqueOrThrow({ where: { id: line.personId } })).name
}, 300_000)

// ── A supplier, from its own compliance desk ─────────────────────────

describe('a supplier answers for its own people, from its own desk', () => {
  it('a supplier’s compliance officer can log a request that arrived by email for one of its own consultants, and it is counted against a deadline', async () => {
    as(CLOUDEPA_COMPLIANCE)
    const { status, body } = await json(
      await deskAct(req('POST', '/api/data-requests', {
        kind: 'EXPORT',
        subjectPersonId: who.cloudepaConsultant,
        note: 'Emailed the bench desk asking for everything on file.',
      }))
    )
    expect(status).toBe(200)
    expect(body.dueAt).not.toBeNull()
    expect(body.dueBasis.length).toBeGreaterThan(40)
    expect(body.dueBasis).not.toMatch(/[A-Z]{3,}_[A-Z]/)
  })

  it('a supplier’s compliance officer sees the requests its own desk logged, and not a request another company logged about somebody else', async () => {
    // Another firm's desk logs one about its own person, on the same day.
    as(`world-terumo-bct-compliance${D}`)
    await deskAct(req('POST', '/api/data-requests', { kind: 'EXPORT', subjectPersonId: who.anders }))

    as(CLOUDEPA_COMPLIANCE)
    const { status, body } = await json(await deskQueue(req('GET', '/api/data-requests')))
    expect(status).toBe(200)
    expect(body.data.requests.length).toBe(1)
    expect(body.data.requests[0].subject).toBe(cloudepaConsultantName)
    expect(body.data.requests.map((r: { subject: string }) => r.subject)).not.toContain('Anders Lund')
  })

  it('the page a supplier opens says whose requests these are in a supplier’s words, not a client’s', async () => {
    as(CLOUDEPA_COMPLIANCE)
    const { body } = await json(await deskQueue(req('GET', '/api/data-requests')))
    expect(body.data.desk.says).toContain('CloudEPA')
    expect(body.data.desk.says).toContain('employs or lists')
    expect(body.data.desk.says).not.toContain('your sites')
    expect(body.data.desk.missing).toBeNull()
  })

  it('a supplier can place a hold on a person it employs, and the client whose site that person stands on cannot lift it', async () => {
    as(CLOUDEPA_COMPLIANCE)
    const placed = await json(
      await holdAct(req('POST', '/api/legal-holds', {
        subjectPersonId: who.cloudepaConsultant,
        reason: 'An unemployment claim is open and these records are the evidence in it.',
        matter: 'UI-2026-0114',
      }))
    )
    expect(placed.status).toBe(200)
    expect(placed.body.subjectWouldRead).toContain('An unemployment claim is open')
    expect(placed.body.subjectWouldRead).not.toContain('UI-2026-0114')

    const hold = await prisma.legalHold.findFirstOrThrow({
      where: { subjectPersonId: who.cloudepaConsultant, liftedAt: null },
    })
    as(HARLOW_OWNER)
    const lifted = await json(
      await holdAct(req('POST', '/api/legal-holds', { lift: hold.id, because: 'We would rather it went.' }))
    )
    expect(lifted.status).toBe(403)
    expect(lifted.body.error).toContain('placed this hold')
  })

  it('a supplier that never engaged a person cannot hold them, and is told why in a sentence with no code in it', async () => {
    as(CLOUDEPA_COMPLIANCE)
    const { status, body } = await json(
      await holdAct(req('POST', '/api/legal-holds', {
        subjectPersonId: who.anders,
        reason: 'We would like these records kept, for reasons of our own.',
      }))
    )
    expect(status).toBe(403)
    expect(body.error).toContain('suspends a person’s erasure everywhere')
    expect(body.error).not.toMatch(/[A-Z]{3,}_[A-Z]/)

    const refused = await eventually(
      () => prisma.accessLog.findFirst({
        where: { subjectId: who.anders, actorCompanyId: co.cloudepa, allowed: false },
      }),
      (r) => r != null
    )
    expect(refused, 'a refusal is recorded as carefully as a grant').not.toBeNull()
  })
})

// ── A systems integrator, and its own W2 ────────────────────────────

describe('an integrator’s own employee is both a worker and a seat', () => {
  it('Karthik Menon opens his own data page and is shown the categories about candidates as well as the ones about everybody', async () => {
    as(KARTHIK)
    const { status, body } = await json(await myData(req('GET', '/api/me/data')))
    expect(status).toBe(200)
    // The work he is the subject of.
    for (const c of ['Resumes', 'Work authorization and immigration', 'Time on site', 'Money about a person']) {
      expect(body.data.aboutYou, `${c} is held about him and was not listed`).toContain(c)
    }
    // Everybody's.
    expect(body.data.aboutYou).toContain('Identity and sign-in')
    expect(body.data.aboutYou).toContain('Logs')
    // And the seat at the firm that employs him.
    expect(body.data.aboutYou).toContain('A seat at a company, and what was decided from it')
    expect(body.data.youAre).toEqual(['business', 'candidate'])
  })

  it('he is told which firms will be written to if he asks to be forgotten, and the integrator that employs him is one of them', async () => {
    as(KARTHIK)
    const { body } = await json(await myData(req('GET', '/api/me/data')))
    const names = (body.data.whoWouldBeTold as { name: string }[]).map((h) => h.name)
    expect(names).toContain('Teleworld Solutions')
  })

  it('his file carries the seat his employer granted him, with the reason it was granted', async () => {
    as(KARTHIK)
    const asked = await json(await askForMyData(req('POST', '/api/me/data', { kind: 'EXPORT' })))
    expect(asked.status).toBe(200)
    const file = await json(await myData(req('GET', `/api/me/data?download=${asked.body.id}`)))
    expect(file.status).toBe(200)
    const category = file.body.categories['A seat at a company, and what was decided from it']
    expect(category).toBeTruthy()
    expect(category.seats.length).toBeGreaterThan(0)
    expect(category.seats[0].company).toBe('Teleworld Solutions')
    expect(category.seats[0].whyItWasGranted).toContain('practice')
  })

  it('his erasure leaves Teleworld’s own record of its own decisions standing under a marker', async () => {
    as(KARTHIK)
    const asked = await json(await askForMyData(req('POST', '/api/me/data', { kind: 'ERASURE' })))
    expect(asked.status).toBe(200)

    const row = await prisma.dataRequest.findFirstOrThrow({
      where: { subjectPersonId: who.karthik, kind: 'ERASURE' },
    })
    const seatsBefore = await prisma.context.count({ where: { personId: who.karthik } })
    const weeksBefore = await prisma.timesheet.findMany({
      where: { personId: who.karthik }, select: { totalHours: true },
    })

    await runRetentionSweep(new Date(row.receivedAt.getTime() + 15 * 86_400_000))

    const erased = await prisma.person.findUniqueOrThrow({ where: { id: who.karthik } })
    expect(erased.name).toBe('Erased person')
    expect(isTombstone(erased.primaryEmail)).toBe(true)
    // The seat is Teleworld's record that it granted somebody access, and
    // it keeps its dates and its reason while it names nobody.
    expect(await prisma.context.count({ where: { personId: who.karthik } })).toBe(seatsBefore)
    const weeksAfter = await prisma.timesheet.findMany({
      where: { personId: who.karthik }, select: { totalHours: true },
    })
    expect(weeksAfter.length).toBe(weeksBefore.length)
    for (const w of weeksAfter) expect(Number(w.totalHours)).toBeGreaterThan(0)
  })

  it('the integrator that employs him is written to, and told there is nothing for it to do', async () => {
    const rows = await prisma.automationLog.findMany({
      where: { action: 'ERASURE_COMPLETE', companyId: co.teleworld },
      select: { reversible: true, summary: true },
    })
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) expect(r.reversible, 'nothing puts a tombstone back').toBe(false)
  })
})

// ── A program office that is not the client ─────────────────────────

describe('a program office is told what it is missing, rather than shown an empty list', () => {
  it('an MSP’s compliance officer reads its own desk and is told in a sentence that a client’s requests need a desk the client grants', async () => {
    as(APTIVA_COMPLIANCE)
    const { status, body } = await json(await deskQueue(req('GET', '/api/data-requests')))
    expect(status).toBe(200)
    expect(body.data.requests).toEqual([])
    expect(body.data.desk.missing).toContain('Aptiva Workforce')
    expect(body.data.desk.missing).toContain('program office')
    expect(body.data.desk.missing).toContain('not built yet')
    expect(body.data.desk.missing).not.toMatch(/[A-Z]{3,}_[A-Z]/)
  })

  it('the program office’s read of that desk is in the trail like any other read', async () => {
    const imani = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: APTIVA_COMPLIANCE } })
    const row = await eventually(
      () => prisma.accessLog.findFirst({
        where: { subjectId: imani.id, actorCompanyId: co.aptiva, action: 'DATA_EXPORT' },
        select: { reason: true },
      }),
      (r) => r != null
    )
    expect(row).not.toBeNull()
    expect(row!.reason).toContain('queue')
  })

  it('an MSP cannot place a hold as if it were the client it runs the program for', async () => {
    const atNorthbend = await prisma.sellContract.findFirstOrThrow({
      where: { clientCompanyId: co.northbend },
      select: { personId: true },
    })
    as(APTIVA_COMPLIANCE)
    const { status, body } = await json(
      await holdAct(req('POST', '/api/legal-holds', {
        subjectPersonId: atNorthbend.personId,
        reason: 'The program office would like these records kept for the client.',
      }))
    )
    expect(status).toBe(403)
    expect(body.error).toContain('actually engaged')
    expect(body.error).toContain('There is none on file')
    expect(body.error).not.toMatch(/[A-Z]{3,}_[A-Z]/)
  })
})

// ── A business user asking for themselves ───────────────────────────

describe('a business user asks for their own data from their firm’s seat', () => {
  it('an AP clerk asks for her own data and is asked for no permission at all', async () => {
    const clerk = await prisma.context.findFirstOrThrow({
      where: { personId: who.ap }, select: { role: { select: { permissions: true } } },
    })
    expect(clerk.role!.permissions).not.toContain('privacy.manage')
    expect(clerk.role!.permissions).not.toContain('governance.read')

    as(NORTHBEND_AP)
    const { status, body } = await json(await askForMyData(req('POST', '/api/me/data', { kind: 'EXPORT' })))
    expect(status).toBe(200)
    expect(body.says).toContain('ready')
  })

  it('her file has the seat category in it, because a seat is the whole of what is held about her', async () => {
    as(NORTHBEND_AP)
    const listed = await json(await myData(req('GET', '/api/me/data')))
    const request_ = listed.body.data.requests[0]
    const file = await json(await myData(req('GET', `/api/me/data?download=${request_.id}`)))
    expect(file.status).toBe(200)

    const seatCategory = file.body.categories['A seat at a company, and what was decided from it']
    expect(seatCategory).toBeTruthy()
    expect(seatCategory.seats.length).toBeGreaterThan(0)
    expect(seatCategory.seats[0].company).toBe('Northbend Athletic')
    expect(seatCategory.seats[0].role).toBe('AP Clerk')
    expect(listed.body.data.aboutYou).toContain('A seat at a company, and what was decided from it')
  })

  it('a supplier’s account manager gets the same file from a supplier’s seat, and the same category is in it', async () => {
    as(CLOUDEPA_ACCOUNTS)
    const asked = await json(await askForMyData(req('POST', '/api/me/data', { kind: 'EXPORT' })))
    expect(asked.status).toBe(200)
    const file = await json(await myData(req('GET', `/api/me/data?download=${asked.body.id}`)))
    expect(file.status).toBe(200)
    expect(file.body.categories['A seat at a company, and what was decided from it'].seats[0].company)
      .toBe('CloudEPA')
  })

  it('a company owner cannot export another employee’s data through that person’s own door, and the refusal is written down', async () => {
    const hers = await prisma.dataRequest.findFirstOrThrow({
      where: { subjectPersonId: who.ap, kind: 'EXPORT' },
    })
    as(`world-nike${D}`)
    const { status, body } = await json(await myData(req('GET', `/api/me/data?download=${hers.id}`)))
    expect(status).toBe(404)
    expect(body.error).toContain('not yours')

    const owner = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: `world-nike${D}` } })
    const refused = await eventually(
      () => prisma.accessLog.findFirst({
        where: { subjectId: owner.id, action: 'DATA_EXPORT', allowed: false },
      }),
      (r) => r != null
    )
    expect(refused).not.toBeNull()
  })

  it('a hiring manager’s erasure tombstones her and the client program keeps the requisition she raised, with nobody’s name on it', async () => {
    const raisedBefore = await prisma.requirement.findMany({
      where: { raisedById: who.hiring }, select: { id: true, title: true },
    })
    expect(raisedBefore.length, 'she has to have raised something for this to say anything').toBeGreaterThan(0)
    const signedBefore = await prisma.timesheet.count({ where: { clientApprovedById: who.hiring } })

    as(NORTHBEND_HIRING)
    const asked = await json(await askForMyData(req('POST', '/api/me/data', { kind: 'ERASURE' })))
    expect(asked.status).toBe(200)
    const row = await prisma.dataRequest.findFirstOrThrow({
      where: { subjectPersonId: who.hiring, kind: 'ERASURE' },
    })
    await runRetentionSweep(new Date(row.receivedAt.getTime() + 15 * 86_400_000))

    const erased = await prisma.person.findUniqueOrThrow({ where: { id: who.hiring } })
    expect(erased.name).toBe('Erased person')
    expect(isTombstone(erased.primaryEmail)).toBe(true)

    const raisedAfter = await prisma.requirement.findMany({
      where: { raisedById: who.hiring },
      select: { title: true, raisedBy: { select: { name: true } } },
    })
    expect(raisedAfter.length).toBe(raisedBefore.length)
    expect(raisedAfter.map((r) => r.title).sort()).toEqual(raisedBefore.map((r) => r.title).sort())
    for (const r of raisedAfter) expect(r.raisedBy?.name).toBe('Erased person')
    expect(await prisma.timesheet.count({ where: { clientApprovedById: who.hiring } })).toBe(signedBefore)
  })

  it('the firm whose record it is hears about it, even though the only thing tying them together was a seat', async () => {
    // Nothing did, for a week: `holdersOf` read contracts and listings
    // only, so a person whose whole relationship with Etyme is a seat
    // was erased in silence and the employer whose approvals had just
    // stopped naming anybody read nothing about it.
    const told = await prisma.automationLog.findMany({
      where: { action: 'ERASURE_COMPLETE', companyId: co.northbend },
      select: { reversible: true, summary: true },
    })
    expect(told.length).toBeGreaterThan(0)
    for (const t of told) expect(t.reversible).toBe(false)
    expect(told.map((t) => t.summary).join(' ')).toContain('unchanged and now name nobody')
  })

  it('a signature on an executed agreement keeps its title, its date and its wording, and stops carrying a name', async () => {
    const before = await prisma.agreementSignature.findMany({
      where: { attestedById: who.cloudepaOwner },
      select: { id: true, signerTitle: true, signedAt: true, attestation: true, signerName: true },
    })
    expect(before.length, 'the owner has to have signed something for this to say anything').toBeGreaterThan(0)

    as(CLOUDEPA_OWNER)
    const asked = await json(await askForMyData(req('POST', '/api/me/data', { kind: 'ERASURE' })))
    expect(asked.status).toBe(200)
    const row = await prisma.dataRequest.findFirstOrThrow({
      where: { subjectPersonId: who.cloudepaOwner, kind: 'ERASURE' },
    })
    await runRetentionSweep(new Date(row.receivedAt.getTime() + 15 * 86_400_000))

    const after = await prisma.agreementSignature.findMany({
      where: { id: { in: before.map((s) => s.id) } },
      select: { signerName: true, signerEmail: true, signerTitle: true, signedAt: true, attestation: true },
    })
    expect(after.length).toBe(before.length)
    for (const [i, s] of after.entries()) {
      expect(s.signerName).toBe('Erased person')
      expect(s.signerEmail).toBeNull()
      expect(s.signerTitle).toBe(before[i].signerTitle)
      expect(s.attestation).toBe(before[i].attestation)
      expect(s.signedAt.getTime()).toBe(before[i].signedAt.getTime())
    }
  })
})

// ── A breach, read by every audience ────────────────────────────────

describe('a breach touching a supplier’s people', () => {
  let breachId = ''
  let cloudepaLine = ''

  it('gives that supplier its own line and its own notice period', async () => {
    as(STAFF)
    const opened = await json(
      await breachAct(req('POST', '/api/breaches', {
        summary: 'A bench export ran against the wrong company and listed nine consultants to a firm that does not buy them.',
        personalData: true,
        populations: ['candidate'],
        categories: ['Resumes', 'A consultant own profile'],
        companyIds: [co.cloudepa, co.northbend],
      }))
    )
    expect(opened.status).toBe(200)
    breachId = opened.body.id

    const line = await prisma.breachCompany.findFirstOrThrow({
      where: { breachId, companyId: co.cloudepa }, select: { id: true },
    })
    cloudepaLine = line.id

    as(STAFF)
    const set = await json(
      await breachAct(req('POST', '/api/breaches', {
        breachId,
        company: { id: cloudepaLine, notifyBy: new Date(Date.now() + 36 * 3_600_000).toISOString() },
      }))
    )
    expect(set.status).toBe(200)
    expect(set.body.says).toContain('deadline is set')
  })

  it('the supplier reads its own line and nobody else’s', async () => {
    as(CLOUDEPA_COMPLIANCE)
    const { status, body } = await json(await breachList(req('GET', '/api/breaches')))
    expect(status).toBe(200)
    const row = body.data.breaches.find((b: { id: string }) => b.id === breachId)
    expect(row).toBeTruthy()
    expect(row.companies.length).toBe(1)
    expect(row.companies[0].name).toBe('CloudEPA')
    expect(row.companies[0].notifyBy).not.toBeNull()
    expect(body.data.youAre).toContain('customer')
  })

  it('a compliance officer with the privacy permission records that the supplier was told, and the clock stops chasing', async () => {
    as(CLOUDEPA_COMPLIANCE)
    const { status, body } = await json(
      await breachAct(req('POST', '/api/breaches', {
        breachId, told: cloudepaLine,
        how: 'Told by email to the bench desk and the two account managers, with the list of names attached.',
      }))
    )
    expect(status).toBe(200)
    expect(body.says).toContain('Recorded')

    const line = await prisma.breachCompany.findUniqueOrThrow({ where: { id: cloudepaLine } })
    expect(line.notifiedAt).not.toBeNull()
    expect(line.notifiedTo).toContain('bench desk')
  })

  it('a seat at the same firm without the privacy permission is refused, and told which desk holds it', async () => {
    as(CLOUDEPA_ACCOUNTS)
    const { status, body } = await json(
      await breachAct(req('POST', '/api/breaches', {
        breachId, told: cloudepaLine, how: 'I heard about it in the stand-up this morning.',
      }))
    )
    expect(status).toBe(403)
    expect(body.error).toContain('compliance officer at your company holds it')
    expect(body.error).not.toMatch(/[A-Z]{3,}_[A-Z]/)
  })

  it('a firm none of whose records were in it is told there is nothing here, not that it is forbidden', async () => {
    as(APTIVA_COMPLIANCE)
    const { status, body } = await json(await breachList(req('GET', '/api/breaches')))
    expect(status).toBe(403)
    expect(body.error).toContain('nothing here for your company')
  })
})

// ── The page reads what the routes actually send ────────────────────

describe('the compliance desk reads its own page', () => {
  /** Exactly what the page does: the envelope, and the sentence on a refusal. */
  async function asThePageReads(call: () => Promise<Response>) {
    const { status, body } = await json(await call())
    return status === 200
      ? { data: body?.data ?? null, error: null as string | null }
      : { data: null, error: (typeof body?.error === 'string' ? body.error : body?.error?.message) ?? null }
  }

  it('a compliance officer who holds the governance read is shown the desk, and is never told they do not hold it', async () => {
    as(`world-nike-compliance${D}`)
    const requests = await asThePageReads(() => deskQueue(req('GET', '/api/data-requests')))
    const holds = await asThePageReads(() => holdList(req('GET', '/api/legal-holds')))

    expect(requests.data, 'the queue came back in an envelope the page cannot open').not.toBeNull()
    expect(Array.isArray(requests.data.requests)).toBe(true)
    expect(requests.data.desk.says.length).toBeGreaterThan(20)
    expect(Array.isArray(holds.data.holds)).toBe(true)
    expect(deskRefusal({ requests: requests.error, holds: holds.error })).toBeNull()
  })

  it('a client that was in no incident still reads its requests and its holds, because a refusal there is not a refusal of the page', async () => {
    // Talvern Medical rather than Northbend: Northbend's records were in
    // the incident above, and a client in no incident is the case this
    // sentence is about.
    as(`world-terumo-bct-compliance${D}`)
    const breaches = await asThePageReads(() => breachList(req('GET', '/api/breaches')))
    expect(breaches.data, 'this client is in no incident, which is the ordinary case').toBeNull()
    expect(breaches.error).toContain('nothing here for your company')

    const requests = await asThePageReads(() => deskQueue(req('GET', '/api/data-requests')))
    const holds = await asThePageReads(() => holdList(req('GET', '/api/legal-holds')))
    expect(deskRefusal({ requests: requests.error, holds: holds.error })).toBeNull()
    expect(requests.data.requests).toBeTruthy()
    expect(holds.data.holds).toBeTruthy()
  })

  it('a seat that genuinely cannot read the desk is told in the route’s own words, not in words the page made up', async () => {
    as(CLOUDEPA_ACCOUNTS)
    const requests = await asThePageReads(() => deskQueue(req('GET', '/api/data-requests')))
    const holds = await asThePageReads(() => holdList(req('GET', '/api/legal-holds')))
    const said = deskRefusal({ requests: requests.error, holds: holds.error })
    expect(said).not.toBeNull()
    expect(said!).toBe(requests.error)
    expect(said!).toContain('compliance desk')
    expect(said!).toContain('Users and permissions')
  })
})

// ── Both pages open for every kind of seat ──────────────────────────

describe('the two pages open for every party, and a refusal is a sentence', () => {
  const desks: [string, string][] = [
    ['a supplier’s compliance officer', CLOUDEPA_COMPLIANCE],
    ['a supplier’s account manager', CLOUDEPA_ACCOUNTS],
    ['a program office’s compliance officer', APTIVA_COMPLIANCE],
    ['a client’s AP clerk', NORTHBEND_AP],
    ['an integrator’s delivery manager', `world-teleworld${D}`],
  ]

  for (const [label, email] of desks) {
    it(`the compliance desk answers ${label} with a page or a sentence, never a server error`, async () => {
      as(email)
      for (const call of [
        () => deskQueue(req('GET', '/api/data-requests')),
        () => holdList(req('GET', '/api/legal-holds')),
        () => breachList(req('GET', '/api/breaches')),
      ]) {
        const { status, body } = await json(await call())
        expect([200, 403], `${label} got ${status}`).toContain(status)
        if (status === 403) {
          expect(String(body.error).length, `${label} was refused without a sentence`).toBeGreaterThan(40)
          expect(String(body.error)).not.toMatch(/[A-Z]{3,}_[A-Z]/)
        }
      }
    })

    it(`Your data opens for ${label} and lists what is held about them`, async () => {
      as(email)
      const { status, body } = await json(await myData(req('GET', '/api/me/data')))
      expect(status).toBe(200)
      expect(body.data.held.length).toBeGreaterThanOrEqual(10)
      expect(body.data.aboutYou.length).toBeGreaterThan(0)
      expect(body.data.youAre.length).toBeGreaterThan(0)
    })
  }
})
