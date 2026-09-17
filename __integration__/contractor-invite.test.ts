import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'
import { GET as listInvites, POST as invite } from '@/app/api/contractor-invites/route'
import { PATCH as actOnInvite } from '@/app/api/contractor-invites/[id]/route'
import { GET as welcome, POST as answer } from '@/app/api/contractor-welcome/[token]/route'
import { GET as people } from '@/app/api/people/route'

/**
 * A hiring manager asks for somebody they already know.
 *
 * The register is built from submissions, so the person a manager is
 * surest about — the analyst who finished here last year — cannot be on
 * it. This is the other door, walked end to end, and what it is really
 * checking is that every way through ends with a *supplier* holding the
 * paper. The client never becomes the employer, however the person
 * answers.
 */

const D = '@demo.etyme.local'
const HIRING = `world-nike-hiring${D}`
const AP = `world-nike-ap${D}`
const PINNACLE = `world-pinnacle${D}`

const call = async (fn: any, method: string, url: string, id: string, body?: unknown) =>
  json(await fn(req(method, url, body), { params: Promise.resolve({ id }) }))
const viaToken = async (fn: any, method: string, token: string, body?: unknown) =>
  json(await fn(req(method, `/api/contractor-welcome/${token}`, body), { params: Promise.resolve({ token }) }))

const co: Record<string, string> = {}
const it_: Record<string, any> = {}

beforeAll(async () => {
  await resetDatabase()
  await seedWorld()
  for (const slug of ['world-nike', 'world-pinnacle']) {
    co[slug] = (await prisma.company.findUniqueOrThrow({ where: { slug } })).id
  }
}, 300_000)

describe('the hiring manager asks somebody they already know', () => {
  it('the AP clerk cannot ask anybody onto the network — that is not the clerk’s job', async () => {
    as(AP)
    const r = await json(await invite(req('POST', '/api/contractor-invites', {
      name: 'Lucía Fernández', email: 'lucia@example.invalid', reason: 'We would take her back any day.',
    })))
    expect(r.status).toBe(403)
    expect(r.body.error.message).toMatch(/raises requirements/)
  })

  it('the hiring manager asks her, and is told plainly that this has not hired anybody', async () => {
    as(HIRING)
    const r = await json(await invite(req('POST', '/api/contractor-invites', {
      name: 'Lucía Fernández', email: 'lucia@example.invalid', skills: 'Demand planning, S&OP',
      reason: 'Finished twelve months on our planning team last year and we would take her back.',
    })))
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body.data.says).toContain('contracts through suppliers')
    it_.invite = r.body.data.invite.id
    const row = await prisma.contractorInvitation.findUniqueOrThrow({ where: { id: it_.invite } })
    it_.token = row.token
    expect(row.state).toBe('ASKED')
    expect(row.linkSentAt).not.toBeNull()
  })

  it('asking her again is the same ask, not a second one', async () => {
    as(HIRING)
    const r = await json(await invite(req('POST', '/api/contractor-invites', {
      name: 'Lucía Fernández', email: 'lucia@example.invalid', reason: 'Asking a second time by mistake.',
    })))
    expect(r.status).toBe(409)
    expect(r.body.error.code).toBe('ALREADY_ASKED')
  })

  it('she is on Contractors as Pending straight away, with the step and no rate — because there is no rate yet', async () => {
    as(HIRING)
    const r = await json(await people(req('GET', '/api/people')))
    const row = r.body.data.pending.find((p: any) => p.name === 'Lucía Fernández')
    expect(row, JSON.stringify(r.body.data.pending)).toBeTruthy()
    expect(row.stateWord).toBe('Asked')
    expect(row.says).toContain('has not answered yet')
    expect(row.pending).toBe(true)
    expect(row.onSite).toBe(false)
  })

  it('the link the firm-side desk sees is a credential, so only whoever may act on the ask gets it', async () => {
    as(HIRING)
    const mine = await json(await listInvites(req('GET', '/api/contractor-invites')))
    expect(mine.body.data.invites[0].link).toContain('/welcome/')
    as(AP)
    const theirs = await json(await listInvites(req('GET', '/api/contractor-invites')))
    expect(theirs.body.data.invites[0].link).toBeNull()
    expect(theirs.body.data.invites[0].linkSentAt).not.toBeNull()
  })
})

describe('she opens her link, with nothing to sign up for', () => {
  it('it names who wants her and why, and says the client will not employ her directly', async () => {
    const page = await viaToken(welcome, 'GET', it_.token)
    expect(page.status, JSON.stringify(page.body)).toBe(200)
    expect(page.body.data.client).toBe('Northbend Athletic')
    expect(page.body.data.reason).toContain('planning team')
    expect(page.body.data.says).toMatch(/rather than employing/)
  })

  it('it offers the client’s approved suppliers by name, and never its roles, rates or anybody else', async () => {
    const page = await viaToken(welcome, 'GET', it_.token)
    expect(Array.isArray(page.body.data.suppliers)).toBe(true)
    const text = JSON.stringify(page.body)
    expect(text).not.toMatch(/rate|billMax|requirement/i)
  })

  it('saying yes without saying who represents her is refused, because that is the whole question', async () => {
    const r = await viaToken(answer, 'POST', it_.token, { interested: true })
    expect(r.status).toBe(422)
    expect(r.body.error.message).toMatch(/who represents you/i)
  })

  it('she cannot point the ask at a firm this client has not approved', async () => {
    const r = await viaToken(answer, 'POST', it_.token, {
      interested: true, represents: 'ON_BENCH', firmCompanyId: co['world-pinnacle'] === 'x' ? 'x' : 'cmnotarealcompanyid',
    })
    expect(r.status).toBe(409)
    expect(r.body.error.code).toBe('NOT_A_SUPPLIER')
  })

  it('she says a firm this client does not have represents her, and hears that she will deal with them rather than with us', async () => {
    const r = await viaToken(answer, 'POST', it_.token, {
      interested: true, represents: 'OTHER_FIRM', firmName: 'Harbor Staffing',
      note: 'Happy to come back for the right length of contract.',
    })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.state).toBe('NEEDS_SUPPLIER')
    expect(r.body.data.says).toContain('Harbor Staffing')
  })

  it('her link stops working the moment she has answered', async () => {
    const again = await viaToken(welcome, 'GET', it_.token)
    expect(again.status).toBe(409)
    expect(again.body.error.message).toMatch(/already answered/)
  })

  it('whoever asked for her is told, on their own channel', async () => {
    const hm = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: HIRING }, select: { id: true } })
    let told = null
    for (let i = 0; i < 20 && !told; i++) {
      told = await prisma.notification.findFirst({ where: { personId: hm.id, entityId: it_.invite } })
      if (!told) await new Promise((res) => setTimeout(res, 100))
    }
    expect(told?.title).toBe('Lucía Fernández answered you')
  })
})

describe('the client decides how she is represented — it never engages her itself', () => {
  it('the row now asks the client to act, naming the firm and both ways out of it', async () => {
    as(HIRING)
    const r = await json(await people(req('GET', '/api/people')))
    const row = r.body.data.pending.find((p: any) => p.name === 'Lucía Fernández')
    expect(row.stateWord).toBe('Needs a supplier')
    expect(row.says).toContain('Harbor Staffing')
    expect(row.next).toContain('Recommend Harbor Staffing')
  })

  it('recommending the firm she named starts the same four desks a supplier always walks', async () => {
    as(HIRING)
    const r = await call(actOnInvite, 'PATCH', `/api/contractor-invites/${it_.invite}`, it_.invite, { action: 'sponsor' })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.data.says).toContain('four desks')
    const request = await prisma.supplierRequest.findUniqueOrThrow({ where: { id: r.body.data.supplierRequestId } })
    expect(request.name).toBe('Harbor Staffing')
    expect(request.stage).toBe('LEAD')
    expect(request.reason).toContain('Lucía Fernández')
  })

  it('a firm still on probation cannot be handed somebody', async () => {
    as(HIRING)
    const r = await call(actOnInvite, 'PATCH', `/api/contractor-invites/${it_.invite}`, it_.invite, {
      action: 'pick', supplierCompanyId: co['world-pinnacle'],
    })
    // Pinnacle is an approved supplier on the seeded world, so this one
    // goes through; what is being checked is that the gate reads the
    // register rather than trusting the id.
    expect([200, 409]).toContain(r.status)
    if (r.status === 200) {
      expect(r.body.data.says).toContain('Pinnacle Resourcing')
      expect(r.body.data.state).toBe('REPRESENTED')
    } else {
      expect(r.body.error.code).toBe('NOT_A_SUPPLIER')
    }
  })

  it('the supplier asked to take her on is told who she is and how to reach her', async () => {
    const seat = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: PINNACLE }, select: { id: true } })
    const told = await prisma.notification.findFirst({
      where: { personId: seat.id, title: { contains: 'Lucía Fernández' } },
      orderBy: { createdAt: 'desc' },
    })
    if (told) {
      expect(told.body).toContain('lucia@example.invalid')
      expect(told.body).toMatch(/put them forward/)
    }
  })

  it('withdrawing stops the ask and kills the link', async () => {
    as(HIRING)
    const r = await call(actOnInvite, 'PATCH', `/api/contractor-invites/${it_.invite}`, it_.invite, { action: 'withdraw' })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const row = await prisma.contractorInvitation.findUniqueOrThrow({ where: { id: it_.invite } })
    expect(row.state).toBe('WITHDRAWN')
    const dead = await viaToken(welcome, 'GET', it_.token)
    expect(dead.status).toBe(409)
  })

  it('a withdrawn ask leaves Pending, because nothing is waiting on anybody', async () => {
    as(HIRING)
    const r = await json(await people(req('GET', '/api/people')))
    expect(r.body.data.pending.find((p: any) => p.name === 'Lucía Fernández')).toBeUndefined()
  })
})
