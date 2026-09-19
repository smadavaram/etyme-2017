import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, resetDatabase, prisma } from './harness'
import { seedWorld } from '@/lib/seed-world'
import { GET as roles } from '@/app/api/roles/route'
import { POST as invite } from '@/app/api/access/invite/route'
import { GET as contacts } from '@/app/api/contacts/route'

/**
 * Brightmoor's owner brings the team in — account manager, HR, contract
 * manager, finance — and Northbend Athletic's Contacts page fills with them.
 */
const D = '@demo.etyme.local'
const BRIGHTMOOR = `world-brightmoor${D}`
const NIKE_PM = `world-nike-programme${D}`
const it_: Record<string, any> = {}

describe('a supplier brings its team in', () => {
  beforeAll(async () => {
    await resetDatabase()
    await seedWorld()
  }, 240_000)

  it('the owner sees the roles in the trade’s words, including the four added after the firm was formed', async () => {
    as(BRIGHTMOOR)
    const r = await json(await roles(req('GET', '/api/roles')))
    const names = r.body.data.roles.map((x: any) => x.name)
    for (const n of ['Account Manager', 'HR', 'Contract Manager', 'Finance']) expect(names).toContain(n)
    expect(names).not.toContain('Accountant')
    it_.roles = Object.fromEntries(r.body.data.roles.map((x: any) => [x.name, x.id]))
  })

  it('invites four teammates by work email, each seated with their role and emailed', async () => {
    as(BRIGHTMOOR)
    const team = [
      ['Account Manager', 'Priya Sethi', 'priya@brightmoor.demo.etyme.local'],
      ['HR', 'Tom Adeyemi', 'tom@brightmoor.demo.etyme.local'],
      ['Contract Manager', 'Ines Farah', 'ines@brightmoor.demo.etyme.local'],
      ['Finance', 'Karl Bennett', 'karl@brightmoor.demo.etyme.local'],
    ]
    for (const [roleName, name, email] of team) {
      const r = await json(await invite(req('POST', '/api/access/invite', { name, email, roleId: it_.roles[roleName] })))
      expect(r.status, JSON.stringify(r.body)).toBe(201)
      expect(r.body.data.says).toContain(`invited as ${roleName}`)
    }
    const firm = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true } })
    const seats = await prisma.context.findMany({ where: { companyId: firm.id, person: { primaryEmail: { in: team.map((t) => t[2]) } } }, select: { role: { select: { name: true } }, invitedAt: true } })
    expect(seats.map((s) => s.role?.name).sort()).toEqual(['Account Manager', 'Contract Manager', 'Finance', 'HR'])
    expect(seats.every((s) => s.invitedAt != null)).toBe(true)
    const karl = await prisma.person.findUniqueOrThrow({ where: { primaryEmail: 'karl@brightmoor.demo.etyme.local' }, select: { id: true } })
    let told = null
    for (let i = 0; i < 20 && !told; i++) {
      told = await prisma.notification.findFirst({ where: { personId: karl.id, channel: 'EMAIL' } })
      if (!told) await new Promise((res) => setTimeout(res, 100))
    }
    expect(told?.title).toContain('invited you to Brightmoor Staffing')
  })

  it('Northbend Athletic’s Contacts page now lists Brightmoor’s account manager, HR, contract manager and finance, sorted into the right chips', async () => {
    as(NIKE_PM)
    const r = await json(await contacts(req('GET', '/api/contacts')))
    const at = r.body.data.contacts.filter((c: any) => c.at.name === 'Brightmoor Staffing')
    const byName = Object.fromEntries(at.map((c: any) => [c.name, c]))
    expect(byName['Priya Sethi']?.kind).toBe('EXECUTIVE')
    expect(byName['Tom Adeyemi']?.kind).toBe('DELIVERY')
    expect(byName['Karl Bennett']?.kind).toBe('AP')
    expect(byName['Ines Farah']?.kind).toBe('PROCUREMENT')
    expect(byName['Ines Farah']?.title).toBe('Contract Manager')
    expect(byName['Karl Bennett']?.email).toBe('karl@brightmoor.demo.etyme.local')
  })
})
