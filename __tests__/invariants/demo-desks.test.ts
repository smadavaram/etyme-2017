import { describe, it, expect } from 'vitest'
import { deskRefusal, deskFrom, deskAsked, deskName, desksOpen, whoAsked, whoRefusal } from '@/lib/demo-desks'
import { readFileSync } from 'fs'
import { join } from 'path'

// Teleworld Solutions as the seeded world has it: an owner, and four
// delivery staff whose seats carry their discipline as the role name.
const teleworld = { name: 'Teleworld Solutions', kind: 'GSI' }
const teleworldSeats = ['Owner', 'Validation Engineer', 'Data Engineer', 'ERP Finance Consultant', 'Integration Architect']

describe('the demo door says which desks a firm actually has', () => {
  it('asking for the AP desk at Teleworld names the AP & Payroll desk as the one nobody holds, and lists the seats that are held', () => {
    const r = deskRefusal({ asWorld: 'world-teleworld', company: teleworld, desk: 'ap', heldRoles: teleworldSeats })
    expect(r.message).toContain(
      'Nobody holds the AP & Payroll desk at Teleworld Solutions in the demo; these desks are seated: Owner, Validation Engineer'
    )
  })

  it('never tells a firm with an owner seated that nobody is seated there', () => {
    const r = deskRefusal({ asWorld: 'world-teleworld', company: teleworld, desk: 'ap', heldRoles: teleworldSeats })
    expect(r.message).not.toMatch(/nobody is seated/i)
  })

  it('says how to open the seat that is there: asking with no desk sits you as the first seat granted', () => {
    const r = deskRefusal({ asWorld: 'world-teleworld', company: teleworld, desk: 'ap', heldRoles: teleworldSeats })
    expect(r.message).toContain('Ask with no desk to sit as the Owner.')
  })

  it('names the desk keys that would open, so a visitor can ask again by name', () => {
    const r = deskRefusal({
      asWorld: 'world-techpeple', company: { name: 'Techpeple', kind: 'VENDOR' }, desk: 'programme',
      heldRoles: ['Owner', 'Recruiter', 'AP & Payroll', 'Recruiter'],
    })
    expect(r.desks).toEqual(['ap', 'recruiter', 'payroll'])
    expect(r.message).toContain('seated: Owner, Recruiter, AP & Payroll.')
    expect(r.message).toContain('Ask for "ap", "recruiter" or "payroll" by name.')
  })

  it('at a client the AP desk is the AP Clerk, in the client\'s own word', () => {
    expect(deskName('ap', 'CLIENT')).toBe('AP Clerk')
    expect(deskName('ap', 'VENDOR')).toBe('AP & Payroll')
    expect(deskName('hr', 'CLIENT')).toBe('HR Partner')
  })

  it('at a firm that sells, the AP desk opens the AP & Payroll seat', () => {
    expect(desksOpen(['AP & Payroll'])).toContain('ap')
  })

  it('a firm not in the world is told so, not told its desks are empty', () => {
    const r = deskRefusal({ asWorld: 'world-nowhere', company: null, desk: 'ap', heldRoles: [] })
    expect(r.message).toBe("There is no world-nowhere in this deployment's world. POST /api/seed-world to build it first.")
  })

  it('a firm in the world with no seat at all is told to seed it', () => {
    const r = deskRefusal({ asWorld: 'world-empty', company: { name: 'Empty Co', kind: 'VENDOR' }, desk: 'ap', heldRoles: [] })
    expect(r.message).toBe('Nobody is seated at Empty Co yet. POST /api/seed-world to build it first.')
  })

  it('a desk key nobody has defined is read as no desk, not as a desk', () => {
    expect(deskFrom('owner')).toBeNull()
    expect(deskFrom(7)).toBeNull()
    expect(deskFrom('ap')).toBe('ap')
  })
})

describe('the demo door never hands the Owner seat to a desk nobody asked for', () => {
  const brightmoor = { name: 'Brightmoor Staffing', kind: 'VENDOR' }
  const seats = ['Owner', 'Recruiter', 'AP & Payroll', 'Account Manager']

  it('a desk word that is not a desk is read as unknown, not as asking for the first seat', () => {
    expect(deskAsked('owner')).toEqual({ desk: null, unknown: 'owner' })
    expect(deskAsked('recruter')).toEqual({ desk: null, unknown: 'recruter' })
    expect(deskAsked(7)).toEqual({ desk: null, unknown: '7' })
  })

  it('asking with no desk at all is still a request for the first seat', () => {
    expect(deskAsked(undefined)).toEqual({ desk: null, unknown: null })
    expect(deskAsked(null)).toEqual({ desk: null, unknown: null })
    expect(deskAsked('')).toEqual({ desk: null, unknown: null })
    expect(deskAsked('ap')).toEqual({ desk: 'ap', unknown: null })
  })

  it('an unknown desk is refused in a sentence that says no seat was taken and names the desks this firm has', () => {
    const r = deskRefusal({ asWorld: 'world-brightmoor', company: brightmoor, desk: null, heldRoles: seats, unknown: 'owner' })
    expect(r.message).toContain('There is no "owner" desk in the demo, so no seat was taken.')
    expect(r.message).toContain('At Brightmoor Staffing you can ask for "ap", "account", "recruiter" or "payroll" by name.')
    expect(r.desks).toEqual(['ap', 'account', 'recruiter', 'payroll'])
  })

  it('the refusal of an unknown desk says the Owner seat is opened only by asking with no desk', () => {
    const r = deskRefusal({ asWorld: 'world-brightmoor', company: brightmoor, desk: null, heldRoles: seats, unknown: 'admin' })
    expect(r.message).toContain('Ask with no desk to sit as the Owner.')
  })

  it('the demo route refuses an unknown desk before it reads anybody\'s seat as the caller\'s', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/demo/route.ts'), 'utf8')
    expect(route).toContain('deskAsked(')
    expect(route).not.toMatch(/deskFrom\(\(body/)
    expect(route).toMatch(/const email = unknownDesk \? undefined :/)
  })
})

describe('the demo door seats a delivery manager, and the right one where two hold the desk', () => {
  it('the demo door seats a delivery manager: "delivery" is a desk and opens the Delivery Manager role', () => {
    expect(deskFrom('delivery')).toBe('delivery')
    expect(desksOpen(['Owner', 'Delivery Manager'])).toEqual(['delivery'])
  })

  it('every desk chip on the demo page that names a person is a delivery desk at Teleworld, one for each manager in the move', async () => {
    const { INTEGRATOR_SEATS } = await import('@/app/demo/seats')
    const named = INTEGRATOR_SEATS.flatMap((s) => (s.desks ?? []).filter((d) => d.who).map((d) => `${s.slug}:${d.desk}:${d.who}`))
    expect(named).toEqual(['world-teleworld:delivery:Ingrid Solberg', 'world-teleworld:delivery:Rahul Deshpande'])
  })

  it('a name asked for is trimmed, and anything that is not a name is read as no name', () => {
    expect(whoAsked('  Rahul Deshpande ')).toBe('Rahul Deshpande')
    expect(whoAsked('')).toBeNull()
    expect(whoAsked(42)).toBeNull()
    expect(whoAsked(undefined)).toBeNull()
  })

  it('asking for somebody who does not hold the desk is refused in a sentence that names who does', () => {
    const m = whoRefusal({ company: teleworld, desk: 'delivery', who: 'Sunil Raghavan', holders: ['Ingrid Solberg', 'Rahul Deshpande'] })
    expect(m).toBe(
      'Sunil Raghavan does not hold the Delivery Manager desk at Teleworld Solutions in the demo, so no seat was taken. ' +
      'The Delivery Manager desk there is held by Ingrid Solberg or Rahul Deshpande.'
    )
  })

  it('the demo route reads a name only alongside a desk, so a name alone can never open the Owner seat', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/api/demo/route.ts'), 'utf8')
    expect(src).toMatch(/const who = desk \? whoAsked\(/)
  })
})

describe('a door’s numbers come from the record, never from a phrase', () => {
  it('the Teleworld door says how many days ago Karthik left, from his last day on the record', async () => {
    const { INTEGRATOR_SEATS, fillDoors } = await import('@/app/demo/seats')
    const teleworld = INTEGRATOR_SEATS.find((s) => s.slug === 'world-teleworld')!
    expect(teleworld.about).not.toMatch(/three weeks/)
    const [filled] = fillDoors([teleworld], { karthikLastDay: new Date('2026-08-31T00:00:00Z') }, new Date('2026-10-01T15:00:00Z'))
    expect(filled.about).toContain('Karthik left an avionics project 31 days ago.')
  })

  it('with no last day on the record the door says nothing about when, rather than a guess', async () => {
    const { INTEGRATOR_SEATS, fillDoors } = await import('@/app/demo/seats')
    const [filled] = fillDoors(INTEGRATOR_SEATS.filter((s) => s.slug === 'world-teleworld'), { karthikLastDay: null }, new Date())
    expect(filled.about).not.toMatch(/\{|\d+ days ago/)
  })

  it('days ago are whole calendar days, and today and yesterday are said as words', async () => {
    const { daysAgoWords } = await import('@/app/demo/seats')
    const today = new Date('2026-10-06T23:30:00Z')
    expect(daysAgoWords(new Date('2026-10-06T00:00:00Z'), today)).toBe('today')
    expect(daysAgoWords(new Date('2026-10-05T00:00:00Z'), today)).toBe('yesterday')
    expect(daysAgoWords(new Date('2026-09-05T00:00:00Z'), today)).toBe('31 days ago')
  })
})
