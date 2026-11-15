import { describe, it, expect, beforeAll, vi } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

/**
 * Contacts, after the founder's firm pressed it on 2026-11-14 (record 72,
 * items H1, A2, B4, H2, B6), on the seeded world. A firm adds its own
 * people; Works for offers exactly what the Companies list holds; the role
 * is optional; adding a contact writes one activity-log row; and nothing
 * here sends an email: the one sender is faked and counted.
 */

const sent: string[] = []
vi.mock('@/lib/senders', async (orig) => {
  const real: any = await orig()
  return {
    ...real,
    emailSender: () => ({ channel: 'EMAIL', send: async (to: string) => { sent.push(to) } }),
  }
})

const contacts = await import('@/app/api/contacts/route')
const companies = await import('@/app/api/companies/route')
const extend = await import('@/app/api/companies/[id]/extend/route')
const automation = await import('@/app/api/automation/route')
const readiness = await import('@/app/api/onboarding/readiness/route')

const D = '@demo.etyme.local'
const OWNER = `world-brightmoor${D}`
const OTHER_FIRM = `world-techpeple${D}`
const SEATS = ['brightmoor', 'techpeple', 'nike', 'aptiva', 'computer-systems'].map((s) => `world-${s}${D}`)

let brightmoor = { id: '', name: '' }
const list = async () => {
  const r = await json(await contacts.GET(req('GET', '/api/contacts')))
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body.data
}
const add = async (body: object) => json(await contacts.POST(req('POST', '/api/contacts', body)))
const companiesList = async () => {
  const r = await json(await companies.GET(req('GET', '/api/companies?records=1')))
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body.data.companies as { id: string; name: string }[]
}
const logRows = (companyId: string) => prisma.automationLog.count({ where: { companyId, action: 'CONTACT_RECORDED' } })

beforeAll(async () => {
  await freshWorld()
  brightmoor = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true, name: true } })
}, 600_000)

describe('a firm can add its own people', () => {
  it('Works for offers the firm’s own name first, marked as its own firm', async () => {
    as(OWNER)
    const { worksAt } = await list()
    expect({ id: worksAt.own.id, name: worksAt.own.name }).toEqual({ id: brightmoor.id, name: brightmoor.name })
    const { worksAtChoices } = await import('@/lib/contacts')
    expect(worksAtChoices(worksAt)[0]).toEqual({ id: brightmoor.id, name: `${brightmoor.name} (your own firm)`, own: true })
  })

  it('a firm can add a contact whose Works for is its own firm, and she is listed under Contacts at that firm, with nothing emailed and no invitation written', async () => {
    as(OWNER)
    const invites = async () => (await prisma.context.count()) + (await prisma.supplierInvite.count())
    const invitesBefore = await invites()
    const sentBefore = sent.length
    const r = await add({ name: 'Sam Ortiz', email: 'sam.ortiz@northwind-staffing.example', atCompanyId: brightmoor.id, kind: 'MEMBER' })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body.data.contact.kind).toBe('MEMBER')
    const rows = (await list()).contacts.filter((c: any) => c.name === 'Sam Ortiz')
    expect(rows).toHaveLength(1)
    expect(rows[0].at).toEqual({ id: brightmoor.id, name: brightmoor.name })
    expect(rows[0].kindLabel).toBe('Team member')
    expect(sent.length).toBe(sentBefore)
    // No seat and no invitation of any kind was written.
    expect(await invites()).toBe(invitesBefore)
  })

  it('a contact at the firm’s own firm is never read by another firm', async () => {
    as(OTHER_FIRM)
    const names = (await list()).contacts.map((c: any) => c.name)
    expect(names).not.toContain('Sam Ortiz')
  })

  it('a contact at the firm’s own firm is not counted as somebody to call at a client or a supplier', async () => {
    as(OWNER)
    const sum = async () => {
      const r = await json(await readiness.GET(req('GET', '/api/onboarding/readiness')))
      expect(r.status, JSON.stringify(r.body)).toBe(200)
      return [...r.body.data.clients, ...r.body.data.suppliers].reduce((n: number, c: any) => n + (c.contacts ?? 0), 0)
    }
    const before = await sum()
    expect((await add({ name: 'Lee Park', phone: '(303) 555-0142', atCompanyId: brightmoor.id })).status).toBe(201)
    expect(await sum()).toBe(before)
    const grouped = await prisma.companyContact.count({ where: { companyId: brightmoor.id, atCompanyId: brightmoor.id } })
    expect(grouped).toBeGreaterThanOrEqual(2)
  })

  it('a firm is still never among its own companies', async () => {
    as(OWNER)
    expect((await companiesList()).map((c) => c.id)).not.toContain(brightmoor.id)
  })
})

describe('Works for and the route read one list', () => {
  it('for every seeded seat, Works for offers exactly the companies its Companies list holds, plus its own firm', async () => {
    for (const seat of SEATS) {
      as(seat)
      const onList = (await companiesList()).map((c) => c.id).sort()
      const { worksAt } = await list()
      expect(worksAt.companies.map((c: any) => c.id).sort(), seat).toEqual(onList)
    }
  })

  it('a contact can be saved at a company on the Companies list that is on no register row, such as one the firm recorded', async () => {
    as(OWNER)
    const made = await json(await companies.POST(req('POST', '/api/companies', { name: 'Harborline Tech', kind: 'UNCLASSIFIED', domain: 'harborline-tech.example' })))
    expect(made.status, JSON.stringify(made.body)).toBeLessThan(300)
    const id = made.body.data.company.id
    expect((await list()).worksAt.companies.map((c: any) => c.id)).toContain(id)
    const r = await add({ name: 'Dana Whitfield', email: 'dana@harborline-tech.example', atCompanyId: id })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
  })

  it('a company that is not on your list is refused in a sentence that links to Add a company, the refusal is logged first, and no activity row is written', async () => {
    as(OWNER)
    const onList = new Set((await companiesList()).map((c) => c.id))
    const stranger = await prisma.company.findFirstOrThrow({ where: { id: { notIn: [...onList, brightmoor.id] } }, select: { id: true } })
    const refusals = await prisma.accessLog.count({ where: { allowed: false, actorCompanyId: brightmoor.id } })
    const rows = await logRows(brightmoor.id)
    const r = await add({ name: 'Nobody Known', email: 'nobody@harborline-tech.example', atCompanyId: stranger.id })
    expect(r.status).toBe(403)
    expect(r.body.error.message).toBe('That company is not on your Companies list. Add it there first, then add the people you know at it.')
    expect(r.body.error.href).toBe('/dashboard/companies?new=1')
    expect(r.body.error.hrefLabel).toBe('Add a company')
    expect(await prisma.accessLog.count({ where: { allowed: false, actorCompanyId: brightmoor.id } })).toBe(refusals + 1)
    expect(await logRows(brightmoor.id)).toBe(rows)
  })
})

describe('the role is optional', () => {
  it('a contact posted with no role at all is saved as Other and the reply is 201', async () => {
    as(OWNER)
    const r = await add({ name: 'Ana Lima', email: 'ana@northwind-staffing.example', atCompanyId: brightmoor.id })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body.data.contact.kind).toBe('OTHER')
  })

  it('a contact posted with a blank role is saved as Other and the reply is 201', async () => {
    as(OWNER)
    const r = await add({ name: 'Ravi Shah', email: 'ravi@northwind-staffing.example', atCompanyId: brightmoor.id, kind: '' })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body.data.contact.kind).toBe('OTHER')
  })

  it('Team member at another company is refused in a sentence that says what to pick', async () => {
    as(OWNER)
    const other = (await list()).worksAt.companies[0]
    const r = await add({ name: 'Kim Doe', email: 'kim@harborline-tech.example', atCompanyId: other.id, kind: 'MEMBER' })
    expect(r.status).toBe(422)
    expect(r.body.error.message).toBe(`Team member is for somebody at your own firm. Pick their role at ${other.name}, or leave it on Other.`)
  })

  it('the role filter lists only roles somebody on the list holds', async () => {
    as(OWNER)
    const data = await list()
    const held = new Set(data.contacts.map((c: any) => c.kind))
    expect(data.held.map((k: any) => k.key).sort()).toEqual([...held].sort())
  })
})

describe('adding a contact is on the activity log', () => {
  it('adding a contact writes one row naming who added whom at which company, marked as one that cannot be undone', async () => {
    as(OWNER)
    const before = await logRows(brightmoor.id)
    const at = (await list()).worksAt.companies[0]
    const r = await add({ name: 'Jo Bennett', email: 'jo@harborline-tech.example', atCompanyId: at.id, kind: 'AP' })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(await logRows(brightmoor.id)).toBe(before + 1)
    const row = await prisma.automationLog.findFirstOrThrow({ where: { companyId: brightmoor.id, action: 'CONTACT_RECORDED' }, orderBy: { at: 'desc' } })
    const by = await prisma.context.findFirstOrThrow({ where: { companyId: brightmoor.id, person: { primaryEmail: OWNER } }, select: { person: { select: { name: true } } } })
    expect(row.summary).toBe(`${by.person.name} added Jo Bennett at ${at.name} to Contacts`)
    expect(row.reason).toBe('Added by hand to this company’s own contacts. Nothing was sent to them.')
    expect(row.reversible).toBe(false)
    expect((row.payload as any).contactId).toBe(r.body.data.contact.id)
  })

  it('the row reads on Settings, Activity log as a person’s own act decided by a rule, and in the company’s drawer history', async () => {
    as(OWNER)
    const a = await json(await automation.GET(req('GET', '/api/automation')))
    expect(a.status, JSON.stringify(a.body)).toBe(200)
    const entry = a.body.data.entries.find((e: any) => e.action === 'CONTACT_RECORDED' && e.summary.includes('Jo Bennett'))
    expect(entry).toBeTruthy()
    expect(entry.decidedBy).toBe('RULE')
    const otherId = entry.payload.otherCompanyId
    const d = await json(await extend.GET(req('GET', `/api/companies/${otherId}/extend`) as any, { params: { id: otherId } }))
    expect(d.status, JSON.stringify(d.body)).toBe(200)
    expect(JSON.stringify(d.body.data.history)).toContain('Jo Bennett')
  })

  it('a contact’s activity row is read only by the company that added it', async () => {
    as(OTHER_FIRM)
    const a = await json(await automation.GET(req('GET', '/api/automation')))
    expect(a.status, JSON.stringify(a.body)).toBe(200)
    expect(a.body.data.entries.some((e: any) => e.action === 'CONTACT_RECORDED' && e.summary.includes('Jo Bennett'))).toBe(false)
  })

  it('a contact refused as a duplicate writes no activity row', async () => {
    as(OWNER)
    const before = await logRows(brightmoor.id)
    const r = await add({ name: 'Sam Ortiz', email: 'sam.ortiz@northwind-staffing.example', atCompanyId: brightmoor.id })
    expect(r.status).toBe(409)
    expect(await logRows(brightmoor.id)).toBe(before)
  })
})

describe('the same person is never saved twice without a word, and two people may share a name', () => {
  it('the same email twice is refused in a sentence that says nothing was saved, and never tells her to update a contact', async () => {
    as(OWNER)
    const r = await add({ name: 'Sam Ortiz', email: 'sam.ortiz@northwind-staffing.example', atCompanyId: brightmoor.id })
    expect(r.status).toBe(409)
    expect(r.body.error.message).toBe('Sam Ortiz is already in your Contacts at this company with that email, so nothing was saved. If this is somebody else, give their own email.')
  })

  it('the same name at the same company with a phone where the first had an email is asked about before anything is saved', async () => {
    as(OWNER)
    const before = await prisma.companyContact.count({ where: { companyId: brightmoor.id, atCompanyId: brightmoor.id, name: 'Sam Ortiz' } })
    const r = await add({ name: 'sam  ortiz', phone: '(720) 555-0163', atCompanyId: brightmoor.id })
    expect(r.status).toBe(409)
    expect(r.body.error.code).toBe('SAME_NAME')
    expect(r.body.error.message).toBe('Somebody named Sam Ortiz is already in your Contacts at this company. Is this the same person?')
    expect(await prisma.companyContact.count({ where: { companyId: brightmoor.id, atCompanyId: brightmoor.id, name: 'Sam Ortiz' } })).toBe(before)
  })

  it('one press of Add anyway saves the second person who shares the name', async () => {
    as(OWNER)
    const r = await add({ name: 'Sam Ortiz', phone: '(720) 555-0163', atCompanyId: brightmoor.id, addAnyway: true })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect((await list()).contacts.filter((c: any) => c.name === 'Sam Ortiz' && c.at.id === brightmoor.id)).toHaveLength(2)
  })
})
