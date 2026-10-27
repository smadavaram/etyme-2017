import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, as, req, json, freshWorld } from './harness'
import { createCompany, findFirm, claimOrJoin } from '@/lib/company-create'

import { POST as addCompany, GET as listCompanies } from '@/app/api/companies/route'
import { GET as linkAsks, POST as askToLink } from '@/app/api/trade-links/route'
import { POST as answerLink } from '@/app/api/trade-links/[id]/route'
import { workTogether } from '@/lib/company-create'
import { GET as findFirmRoute } from '@/app/api/firms/route'
import { GET as seatAsks, POST as askForSeat } from '@/app/api/seat-requests/route'
import { POST as answerAsk } from '@/app/api/seat-requests/[id]/route'
import { POST as grantSeat } from '@/app/api/program/seats/route'
import { GET as program } from '@/app/api/program/route'
import { GET as importRows } from '@/app/api/imports/[id]/rows/route'
import { POST as commitImport } from '@/app/api/imports/[id]/commit/route'
import { GET as bench } from '@/app/api/bench/route'

/**
 * The onboarding walk of 2026-10-27, as sentences.
 *
 * It ended with three companies called Quarrybrook Staffing: the supplier
 * signed up with a password (so its tenant was its Etyme address, with no
 * verified domain), a client's approval of its application founded a
 * second, the claim link seated its owner on both, and a sub-vendor's Add
 * company made a third. An MSP that signed up could neither be granted a
 * seat from a screen nor ask for one. An integrator's two W2 rows were
 * imported as bench listings nobody agreed to.
 */

const D = '@demo.etyme.local'
const NORTHBEND_OWNER = `world-nike${D}`
const TELEWORLD_OWNER = `world-teleworld${D}`
const QUARRY_OWNER = 'maeve.oduya@quarrybrook.example'
const PALLISER_OWNER = 'tomas.reyes@palliser.example'
const co: Record<string, string> = {}
const who: Record<string, string> = {}

const call = async (fn: (r: any, ctx: any) => Promise<Response>, method: string, url: string, id?: string, body?: unknown) =>
  json(await fn(req(method, url, body), { params: Promise.resolve({ id: id ?? '' }) }))

/** A firm that signed up through the password door: an Etyme address, no verified domain, its owner seated. */
async function signedUp(name: string, slug: string, kind: 'VENDOR' | 'MSP', email: string) {
  const person = await prisma.person.upsert({ where: { primaryEmail: email }, update: {}, create: { name: email.split('@')[0], primaryEmail: email } })
  const made = await createCompany({
    name, kind, slug, domain: null, byPersonId: person.id, seatAsOwner: true, claimDomain: false, startsSetup: true,
  })
  return { companyId: made.company.id, personId: person.id }
}

/** What a client's approval made before findFirm: a second record of the firm, on the client's register, and a claim link. */
async function approvalShell(clientSlug: string, email = QUARRY_OWNER) {
  const clientId = co[clientSlug]
  const byPersonId = (await prisma.context.findFirstOrThrow({ where: { companyId: clientId, revokedAt: null }, select: { personId: true } })).personId
  const shell = await prisma.company.create({
    data: { name: 'Quarrybrook Staffing', slug: `quarrybrook-staffing-${clientSlug}-${email.split('@')[0].replace(/[^a-z0-9]+/g, '-')}`, kind: 'VENDOR', currency: 'USD', listedById: clientId },
  })
  await prisma.masterAgreement.create({ data: { vendorId: shell.id, clientId, paymentTerms: 30 } })
  await prisma.counterparty.create({
    data: { companyId: clientId, otherCompanyId: shell.id, relationship: 'SUPPLIER', status: 'ACTIVE', tier: 'APPROVED', createdById: byPersonId },
  })
  await prisma.companyContact.create({
    data: { companyId: clientId, atCompanyId: shell.id, name: 'Maeve Oduya', email, kind: 'RECRUITING', createdById: byPersonId },
  })
  const invite = await prisma.supplierInvite.create({
    data: { companyId: shell.id, byId: clientId, email, contactName: 'Maeve Oduya', token: `tok-${shell.id}` },
  })
  return { shellId: shell.id, token: invite.token }
}

/** A notice is written without waiting (`notify`), so a test waits for it a moment. */
async function eventually(read: () => Promise<number>, want: number): Promise<number> {
  for (let i = 0; i < 40; i++) {
    const n = await read()
    if (n === want) return n
    await new Promise((r) => setTimeout(r, 50))
  }
  return read()
}

beforeAll(async () => {
  await freshWorld()
  for (const slug of ['world-nike', 'world-teleworld', 'world-corning', 'world-terumo-bct']) {
    co[slug] = (await prisma.company.findUniqueOrThrow({ where: { slug }, select: { id: true } })).id
  }
  who.northbendOwner = (await prisma.person.findUniqueOrThrow({ where: { primaryEmail: NORTHBEND_OWNER } })).id
  const q = await signedUp('Quarrybrook Staffing', 'quarrybrook', 'VENDOR', QUARRY_OWNER)
  co.quarrybrook = q.companyId
  who.quarryOwner = q.personId
  const p = await signedUp('Palliser MSP', 'palliser', 'MSP', PALLISER_OWNER)
  co.palliser = p.companyId
}, 600_000)

describe('one firm, one tenant', () => {
  it('the firm a client approves is found by the facts on its application, so a supplier that signed up and is then approved is one company, not two', async () => {
    // The approval knows the name the firm applied under and the contact's
    // email. The firm signed up with a password, so it has no verified
    // domain; it is found by its exact name on a firm run from that domain.
    const found = await findFirm({ emailDomain: 'quarrybrook.example', name: 'Quarrybrook Staffing' })
    expect(found?.id).toBe(co.quarrybrook)
    expect(found?.how).toBe('NAME')
    expect(found?.says).toContain('Quarrybrook Staffing is on Etyme')
    // And by its Etyme address, however it is typed.
    expect((await findFirm({ etymeAddress: 'https://quarrybrook.etyme.com/' }))?.id).toBe(co.quarrybrook)
  })

  it('a firm is never found by its name alone, from another domain, or across the demo and the real world', async () => {
    expect(await findFirm({ name: 'Quarrybrook Staffing' })).toBeNull()
    expect(await findFirm({ emailDomain: 'gmail.com', name: 'Quarrybrook Staffing' })).toBeNull()
    expect(await findFirm({ emailDomain: 'stranger.example', name: 'Quarrybrook Staffing' })).toBeNull()
    expect(await findFirm({ etymeAddress: 'quarrybrook', isDemo: true })).toBeNull()
  })

  it('a record another firm wrote down is never returned as a firm on Etyme', async () => {
    await approvalShell('world-corning')
    expect(await findFirm({ etymeAddress: 'quarrybrook-staffing-world-corning-maeve-oduya' })).toBeNull()
  })

  it('a claim link taken by somebody already seated at a firm on the same domain joins that firm', async () => {
    const { shellId, token } = await approvalShell('world-nike')
    await prisma.verification.create({
      data: { companyId: shellId, type: 'INSURANCE_GL', status: 'CLEAR', provider: 'Hartford', uploadedById: who.northbendOwner, issuedAt: new Date(), validFrom: new Date(), expiresAt: new Date(Date.now() + 200 * 86_400_000) },
    })

    const r = await claimOrJoin(token, { personId: who.quarryOwner, email: QUARRY_OWNER })
    expect(r.kind, JSON.stringify(r)).toBe('JOINED')
    if (r.kind !== 'JOINED') return
    expect(r.companyId).toBe(co.quarrybrook)
    expect(r.says).toContain('No second company was made')

    // One Quarrybrook at Northbend, holding everything the client's record held.
    expect(await prisma.counterparty.count({ where: { companyId: co['world-nike'], otherCompany: { name: 'Quarrybrook Staffing' } } })).toBe(1)
    expect(await prisma.company.findUnique({ where: { id: shellId } })).toBeNull()
    const row = await prisma.counterparty.findFirstOrThrow({ where: { companyId: co['world-nike'], otherCompanyId: co.quarrybrook, relationship: 'SUPPLIER' } })
    expect(row.tier).toBe('APPROVED')
    expect(await prisma.masterAgreement.count({ where: { vendorId: co.quarrybrook, clientId: co['world-nike'] } })).toBe(1)
    expect(await prisma.verification.count({ where: { companyId: co.quarrybrook, type: 'INSURANCE_GL' } })).toBe(1)
    const invite = await prisma.supplierInvite.findUniqueOrThrow({ where: { token } })
    expect(invite.companyId).toBe(co.quarrybrook)
    expect(invite.state).toBe('ACCEPTED')
    // The owner holds one seat, at the firm she runs.
    expect(await prisma.context.count({ where: { personId: who.quarryOwner, revokedAt: null } })).toBe(1)
    // And the join is on the record, honestly irreversible.
    const log = await prisma.automationLog.findFirstOrThrow({ where: { companyId: co.quarrybrook, action: 'FIRM_JOINED' } })
    expect(log.reversible).toBe(false)
  })

  it('a claim link is never folded into a firm when the record holds history a join would move; nothing changes and it says so', async () => {
    const { shellId, token } = await approvalShell('world-terumo-bct')
    // Both hold a cost center coded alike: one would overwrite the other.
    await prisma.costCenter.create({ data: { companyId: shellId, code: 'QB-100', name: 'Quarrybrook delivery' } })
    await prisma.costCenter.create({ data: { companyId: co.quarrybrook, code: 'QB-100', name: 'Delivery' } })

    const r = await claimOrJoin(token, { personId: who.quarryOwner, email: QUARRY_OWNER })
    expect(r.kind).toBe('REFUSED')
    if (r.kind === 'REFUSED') expect(r.says).toContain('Nothing was changed')
    expect(await prisma.company.findUnique({ where: { id: shellId } })).not.toBeNull()
    expect(await prisma.masterAgreement.count({ where: { vendorId: shellId } })).toBe(1)
    expect((await prisma.supplierInvite.findUniqueOrThrow({ where: { token } })).state).toBe('PENDING')
  })

  it('a claim link taken by somebody who runs no firm on that domain is an ordinary claim', async () => {
    const stranger = await prisma.person.create({ data: { name: 'New Hire', primaryEmail: 'new.hire@quarrybrook.example' } })
    const { token } = await approvalShell('world-corning', stranger.primaryEmail)
    expect((await claimOrJoin(token, { personId: stranger.id, email: stranger.primaryEmail })).kind).toBe('CLAIM')
  })

  it('adding a counterparty that is already on Etyme never makes a private copy, says who they are, and links only where the two already work together', async () => {
    // Teleworld adds Quarrybrook as its prime, by its Etyme address. They have
    // never traded, so no copy and no link: Quarrybrook adds Teleworld instead.
    as(TELEWORLD_OWNER)
    const before = await prisma.company.count({ where: { name: { contains: 'Quarrybrook' } } })
    // (The records the claim sentences left at other clients are counted in `before`; nothing here adds one.)
    const refused = await call(addCompany, 'POST', '/api/companies', undefined, { name: 'Quarrybrook Staffing', kind: 'VENDOR', relationship: 'PRIME', address: 'quarrybrook' })
    expect(refused.status).toBe(409)
    expect(refused.body.error.code).toBe('ALREADY_ON_ETYME')
    expect(refused.body.error.message).toContain('Quarrybrook Staffing is already on Etyme, at quarrybrook.etyme.com')
    expect(refused.body.error.message).toContain('Ask them to link, as your prime')
    expect(await prisma.company.count({ where: { name: { contains: 'Quarrybrook' } } })).toBe(before)

    // A name and nothing else, and a firm on Etyme holds it: asked, never guessed.
    const sameName = await call(addCompany, 'POST', '/api/companies', undefined, { name: 'Quarrybrook Staffing', kind: 'VENDOR', relationship: 'PRIME' })
    expect(sameName.status).toBe(409)
    expect(sameName.body.error.code).toBe('SAME_NAME')
    expect(await prisma.company.count({ where: { name: { contains: 'Quarrybrook' } } })).toBe(before)

    // Once Quarrybrook has put Teleworld on its own register, adding it links.
    await prisma.counterparty.create({
      data: { companyId: co.quarrybrook, otherCompanyId: co['world-teleworld'], relationship: 'SUPPLIER', status: 'ACTIVE', createdById: who.quarryOwner },
    })
    const linked = await call(addCompany, 'POST', '/api/companies', undefined, { name: 'Quarrybrook Staffing', kind: 'VENDOR', relationship: 'PRIME', address: 'quarrybrook' })
    expect(linked.status, JSON.stringify(linked.body)).toBe(200)
    expect(linked.body.data.linked).toBe(true)
    expect(linked.body.data.says).toContain('No copy was made')
    expect(await prisma.counterparty.count({ where: { companyId: co['world-teleworld'], otherCompanyId: co.quarrybrook, relationship: 'PRIME' } })).toBe(1)
    expect(await prisma.company.count({ where: { name: { contains: 'Quarrybrook' } } })).toBe(before)
  })
})

describe('an MSP and a client find each other for a seat', () => {
  it('an MSP with no seat can ask a client for one from its own first screen, and the client’s owner is told', async () => {
    as(PALLISER_OWNER)
    const r = await call(askForSeat, 'POST', '/api/seat-requests', undefined, { client: 'Northbend Athletic', note: 'Their contractor program, from January' })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body.data.says).toContain('Nothing opens until one of them grants it')
    expect(await eventually(() => prisma.notification.count({ where: { personId: who.northbendOwner, title: { contains: 'Palliser MSP asks for a seat' } } }), 1)).toBe(1)

    const mine = await call(seatAsks, 'GET', '/api/seat-requests')
    expect(mine.body.data.asks[0].state).toBe('WAITING')
  })

  it('asking twice is one ask, and a client cannot ask for a seat in a program at all', async () => {
    as(PALLISER_OWNER)
    const again = await call(askForSeat, 'POST', '/api/seat-requests', undefined, { client: 'Northbend Athletic' })
    expect(again.status).toBe(200)
    expect(again.body.data.again).toBe(true)
    expect(await prisma.programSeatRequest.count({ where: { officeCompanyId: co.palliser } })).toBe(1)

    as(NORTHBEND_OWNER)
    const client = await call(askForSeat, 'POST', '/api/seat-requests', undefined, { client: 'Cavanaugh Glassworks' })
    expect(client.status).toBe(403)
    expect(client.body.error.message).toContain('runs its own program')
  })

  it('a client grants an MSP a seat from Settings, naming the role, and the MSP reads that program at once', async () => {
    as(NORTHBEND_OWNER)
    // The MSPs page lists the ask, and finds the MSP by its address.
    const asks = await call(seatAsks, 'GET', '/api/seat-requests')
    expect(asks.body.data.asks.map((a: any) => a.office.name)).toContain('Palliser MSP')
    const found = await call(findFirmRoute, 'GET', '/api/firms?as=MSP&q=palliser')
    expect(found.status).toBe(200)
    expect(found.body.data.firm.id).toBe(co.palliser)

    // Before the grant the MSP has no program of its own to read.
    as(PALLISER_OWNER)
    const before = await call(program, 'GET', '/api/program')
    expect(before.body?.data?.company?.id ?? null).not.toBe(co['world-nike'])

    as(NORTHBEND_OWNER)
    const role = await prisma.role.findFirstOrThrow({ where: { companyId: co['world-nike'], name: 'Program Manager' }, select: { id: true } })
    const granted = await call(grantSeat, 'POST', '/api/program/seats', undefined, {
      officeCompanyId: found.body.data.firm.id, roleId: role.id, reason: 'Palliser runs our contractor program from January',
    })
    expect(granted.status, JSON.stringify(granted.body)).toBe(201)

    // The ask is answered by the seat itself, and the MSP reads Northbend's program.
    expect((await call(seatAsks, 'GET', '/api/seat-requests')).body.data.asks).toHaveLength(0)
    as(PALLISER_OWNER)
    const after = await call(program, 'GET', '/api/program')
    expect(after.status, JSON.stringify(after.body).slice(0, 300)).toBe(200)
    expect(JSON.stringify(after.body)).toContain('Northbend Athletic')
    expect((await call(seatAsks, 'GET', '/api/seat-requests')).body.data.asks[0].state).toBe('GRANTED')
  })

  it('a client answers an ask with Not now, and the MSP is told', async () => {
    const other = await signedUp('Corran MSP', 'corran', 'MSP', 'ines.vale@corran.example')
    as('ines.vale@corran.example')
    const asked = await call(askForSeat, 'POST', '/api/seat-requests', undefined, { client: 'Northbend Athletic' })
    expect(asked.status).toBe(201)
    as(NORTHBEND_OWNER)
    const r = await call(answerAsk, 'POST', `/api/seat-requests/${asked.body.data.id}`, asked.body.data.id, { action: 'not-now' })
    expect(r.status).toBe(200)
    expect(await eventually(() => prisma.notification.count({ where: { personId: other.personId, title: { contains: 'answered Not now' } } }), 1)).toBe(1)
  })
})

describe('an integrator imports its people', () => {
  let importId = ''

  beforeAll(async () => {
    const imp = await prisma.import.create({
      data: {
        companyId: co['world-teleworld'], kind: 'PEOPLE', fileName: 'teleworld-staff.csv',
        mapping: { mappings: [], unmapped: [], warnings: [], refused: [] }, rowCount: 3, issueCount: 0,
      },
    })
    importId = imp.id
    const rows = [
      { name: 'Oluwaseun Adeyemi', email: 'oluwaseun.adeyemi@teleworld-import.example', contractType: 'W2', skills: ['SAP FICO'], startDate: '2026-11-02T00:00:00.000Z' },
      { name: 'Marta Lindgren', email: 'marta.lindgren@teleworld-import.example', contractType: 'W2', skills: ['Kafka'] },
      { name: 'Dev Kapoor', email: 'dev.kapoor@kapoor-consulting.example', contractType: 'C2C', skills: ['Snowflake'] },
    ]
    for (const parsed of rows) {
      await prisma.importRow.create({ data: { importId, raw: parsed as object, parsed: parsed as object, issues: [] } })
    }
  })

  it('the review says what the import will write before anything is written', async () => {
    as(TELEWORLD_OWNER)
    const r = await call(importRows, 'GET', `/api/imports/${importId}/rows`, importId)
    expect(r.status).toBe(200)
    expect(r.body.data.plan.employees).toBe(2)
    expect(r.body.data.plan.contractors).toBe(1)
    expect(r.body.data.plan.says).toContain('on your payroll as your own employees (W2)')
    expect(r.body.data.plan.button).toBe('Import 3 people')
    expect(await prisma.person.count({ where: { primaryEmail: { endsWith: '@teleworld-import.example' } } })).toBe(0)
  })

  it('an integrator’s W2 rows import as its own employees, never as a bench listing', async () => {
    as(TELEWORLD_OWNER)
    const r = await call(commitImport, 'POST', `/api/imports/${importId}/commit`, importId)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.employees).toBe(2)
    expect(r.body.data.message).toContain('2 people are on your payroll as your own employees')

    for (const email of ['oluwaseun.adeyemi@teleworld-import.example', 'marta.lindgren@teleworld-import.example']) {
      const person = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: email }, include: { consultant: { include: { listings: true } } } })
      const seats = await prisma.context.findMany({ where: { personId: person.id, companyId: co['world-teleworld'] }, include: { role: true } })
      expect(seats).toHaveLength(1)
      expect(seats[0].type).toBe('EMPLOYEE')
      expect(seats[0].role?.name).toBe('Employee')
      expect(seats[0].role?.permissions).toEqual(['assignments.read', 'timesheets.read'])
      expect(person.consultant?.listings ?? []).toHaveLength(0)
      expect(person.consultant?.visibility).toBe('INTERNAL')
    }

    // They are on the firm's roster, where its delivery managers look.
    const roster = await call(bench, 'GET', '/api/bench?scope=payroll')
    expect(roster.body.data.roster.map((p: any) => p.name)).toEqual(expect.arrayContaining(['Oluwaseun Adeyemi', 'Marta Lindgren']))
  })

  it('a contractor row an import brings in is asked to join the bench, never put on it by the import', async () => {
    const dev = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: 'dev.kapoor@kapoor-consulting.example' }, include: { consultant: { include: { listings: true } } } })
    const listing = dev.consultant!.listings.find((l) => l.companyId === co['world-teleworld'])!
    expect(listing.state).toBe('INVITED')
    expect(listing.invitedAt).not.toBeNull()
    expect(dev.consultant!.visibility).toBe('INTERNAL')
  })
})

describe('the claim route joins a firm already on Etyme', () => {
  it('a claim link taken by somebody already seated at a firm on the same domain joins that firm through the claim route', async () => {
    const { POST: claim } = await import('@/app/api/claim/[token]/route')
    const { shellId, token } = await approvalShell('world-teleworld')
    as(QUARRY_OWNER)
    const r = await json(await claim(req('POST', `/api/claim/${token}`), { params: Promise.resolve({ token }) }))
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data).toMatchObject({ companyId: co.quarrybrook, joined: true, landing: '/dashboard' })
    expect(r.body.data.says).toContain('No second company was made')
    expect(await prisma.company.findUnique({ where: { id: shellId } })).toBeNull()
    // Nobody was seated on the record: the owner holds one seat, at the firm she runs.
    expect(await prisma.context.count({ where: { personId: who.quarryOwner, revokedAt: null } })).toBe(1)
  })

  it('a join the claim route cannot make safely is refused as a conflict in a sentence, and nobody is seated', async () => {
    const { POST: claim } = await import('@/app/api/claim/[token]/route')
    // A second invitation from the same client goes to a colleague's address on the same domain.
    const { shellId, token } = await approvalShell('world-teleworld', 'billing@quarrybrook.example')
    await prisma.costCenter.create({ data: { companyId: shellId, code: 'QB-200', name: 'Quarrybrook delivery' } })
    await prisma.costCenter.create({ data: { companyId: co.quarrybrook, code: 'QB-200', name: 'Delivery two' } })
    as(QUARRY_OWNER)
    const r = await json(await claim(req('POST', `/api/claim/${token}`), { params: Promise.resolve({ token }) }))
    expect(r.status).toBe(409)
    expect(r.body.error.message).toContain('Nothing was changed')
    expect(await prisma.context.count({ where: { personId: who.quarryOwner, companyId: shellId } })).toBe(0)
  })
})

describe('two firms already on Etyme link by one ask and one yes', () => {
  const OSTRANDER_OWNER = 'lena.ostrander@ostrander-talent.example'

  it('a prime and its sub-vendor already on Etyme link by one ask and one yes, and nothing is recorded until the yes', async () => {
    const sub = await signedUp('Ostrander Talent', 'ostrander', 'VENDOR', OSTRANDER_OWNER)
    co.ostrander = sub.companyId

    // The sub adds its prime; Quarrybrook is on Etyme, so it is offered the link.
    as(OSTRANDER_OWNER)
    const add = await call(addCompany, 'POST', '/api/companies', undefined, { name: 'Quarrybrook Staffing', kind: 'VENDOR', relationship: 'PRIME', address: 'quarrybrook' })
    expect(add.status).toBe(409)
    expect(add.body.error.message).toContain('Ask them to link, as your prime')
    const asked = await call(askToLink, 'POST', '/api/trade-links', undefined, { companyId: add.body.error.companyId, relationship: add.body.error.relationship })
    expect(asked.status, JSON.stringify(asked.body)).toBe(201)
    expect(asked.body.data.says).toContain('Nothing is on either register until they say yes')

    // Nothing recorded yet, either way, and asking again is one ask.
    expect(await prisma.counterparty.count({ where: { OR: [{ companyId: co.ostrander, otherCompanyId: co.quarrybrook }, { companyId: co.quarrybrook, otherCompanyId: co.ostrander }] } })).toBe(0)
    expect(await workTogether(co.ostrander, co.quarrybrook)).toBe(false)
    expect((await call(askToLink, 'POST', '/api/trade-links', undefined, { companyId: co.quarrybrook, relationship: 'PRIME' })).body.error.code).toBe('ALREADY_ASKED')
    expect(await eventually(() => prisma.notification.count({ where: { personId: who.quarryOwner, title: 'Ostrander Talent asks to link as your sub-vendor' } }), 1)).toBe(1)

    // Quarrybrook says yes in one click.
    as(QUARRY_OWNER)
    const open = await call(linkAsks, 'GET', '/api/trade-links')
    const mine = open.body.data.received.find((r: any) => r.company.id === co.ostrander)
    const yes = await call(answerLink, 'POST', `/api/trade-links/${mine.id}`, mine.id, { action: 'accept' })
    expect(yes.status).toBe(200)
    expect(yes.body.data.says).toBe('Ostrander Talent is on your companies as your sub-vendor, and you are on theirs.')

    // Each side has its own row, in its own words, and they work together.
    expect(await prisma.counterparty.count({ where: { companyId: co.ostrander, otherCompanyId: co.quarrybrook, relationship: 'PRIME' } })).toBe(1)
    expect(await prisma.counterparty.count({ where: { companyId: co.quarrybrook, otherCompanyId: co.ostrander, relationship: 'SUPPLIER' } })).toBe(1)
    expect(await workTogether(co.ostrander, co.quarrybrook)).toBe(true)
    as(OSTRANDER_OWNER)
    const list = await call(listCompanies, 'GET', '/api/companies')
    expect(list.body.data.companies.map((c: any) => c.id)).toContain(co.quarrybrook)
  })

  it('a link request names the relationship from the asker\u2019s side and the other side reads it from theirs', async () => {
    as(QUARRY_OWNER)
    const r = await call(askToLink, 'POST', '/api/trade-links', undefined, { companyId: co.palliser, relationship: 'MSP' })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body.data.says).toContain('to link as your MSP')
    as(PALLISER_OWNER)
    const seen = await call(linkAsks, 'GET', '/api/trade-links')
    const ask = seen.body.data.received.find((x: any) => x.company.id === co.quarrybrook)
    expect(ask.relationship).toBe('SUPPLIER')
    expect(ask.says).toContain('asks to link as your sub-vendor')
    const no = await call(answerLink, 'POST', `/api/trade-links/${ask.id}`, ask.id, { action: 'not-now' })
    expect(no.body.data.says).toContain('Nothing was recorded')
    expect(await workTogether(co.quarrybrook, co.palliser)).toBe(false)
  })

  it('a firm never appears among its own companies', async () => {
    as(QUARRY_OWNER)
    const list = await call(listCompanies, 'GET', '/api/companies')
    expect(list.status).toBe(200)
    expect(list.body.data.companies.map((c: any) => c.id)).not.toContain(co.quarrybrook)
  })

  it('an outside firm is never granted a client\u2019s Owner role on a seat', async () => {
    as(NORTHBEND_OWNER)
    const owner = await prisma.role.findFirstOrThrow({ where: { companyId: co['world-nike'], name: 'Owner' }, select: { id: true } })
    const r = await call(grantSeat, 'POST', '/api/program/seats', undefined, { officeCompanyId: co.ostrander, roleId: owner.id, reason: 'Testing that the owner role is never handed over' })
    expect(r.status).toBe(422)
    expect(r.body.error.code).toBe('NEVER_FOR_AN_OUTSIDE_FIRM')
    // And the grant form is never offered it, nor any role that signs hours or grants seats.
    const asks = await call(seatAsks, 'GET', '/api/seat-requests')
    const offered: string[] = asks.body.data.roles.map((x: any) => x.name)
    expect(offered).not.toContain('Owner')
    expect(offered).toContain('Program Manager')
    expect(await prisma.programSeat.count({ where: { officeCompanyId: co.ostrander } })).toBe(0)
  })
})
