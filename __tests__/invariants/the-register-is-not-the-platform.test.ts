/**
 * Two findings from the browser walk of 2026-09-21, and they are the
 * same mistake in two directions: the company register was treated as a
 * platform directory.
 *
 * **Reading.** `/dashboard/companies` — headed "Manage vendor, client,
 * MSP, and GSI companies on the platform" — listed all twenty-seven
 * companies, with slug and domain, to Northbend Athletic's program
 * manager, to CloudEPA's owner two rungs down somebody else's chain,
 * and to Colleen Byrne's one-person nursing corporation.
 *
 * **Writing.** Karthik Menon, an integrator's own W2 with two read
 * permissions, clicked "Add company" and got a real company with
 * himself as Owner holding `*`. Contexts are read most-recently-granted
 * first, so that seat outranked his employer's and every page he opened
 * afterwards read "Walk test — functional review" instead of Teleworld
 * Solutions.
 */

import { describe, it, expect } from 'vitest'
import { directoryScope, directoryCopy } from '@/lib/directory-scope'
import { mayAddCompany } from '@/lib/counterparty'

describe('a company sees the firms it trades with, and no stranger', () => {
  it('a client cannot read every other client on the platform by name', () => {
    const v = directoryScope({ as: 'COMPANY', kind: 'CLIENT', isDemo: false })
    expect(v.reach).toBe('NAMED')
    expect(v.says).toContain('the firms you trade with')
  })

  it('a bench vendor two rungs down cannot enumerate every enterprise', () => {
    expect(directoryScope({ as: 'COMPANY', kind: 'VENDOR', isDemo: false }).reach).toBe('NAMED')
  })

  it('a one-person corporation sees the firms it contracts with, not a market', () => {
    expect(directoryScope({ as: 'COMPANY', kind: 'CONSULTANT_CORP', isDemo: false }).reach).toBe('NAMED')
    expect(directoryCopy('CONSULTANT_CORP').subtitle).toContain('your own company')
  })

  it('a company always sees itself', () => {
    expect(directoryScope({ as: 'COMPANY', kind: 'VENDOR', isDemo: false }).includesOwn).toBe(true)
  })

  it('a consultant sees the benches that list them, and is not shown the market', () => {
    const v = directoryScope({ as: 'CONSULTANT' })
    expect(v.reach).toBe('NAMED')
    expect(v.includesOwn).toBe(false)
    expect(v.says).toContain('rather than shopping it')
  })

  it('a sandbox sees its own sandbox and no customer’s name', () => {
    expect(directoryScope({ as: 'COMPANY', kind: 'VENDOR', isDemo: true }).says).toContain('sandbox')
  })

  it('Etyme’s own staff see every company on the deployment', () => {
    expect(directoryScope({ as: 'STAFF' }).reach).toBe('ALL')
  })

  it('the page says what the list is for the reader in front of it', () => {
    expect(directoryCopy('CLIENT').subtitle).toContain('suppliers')
    expect(directoryCopy('MSP').subtitle).toContain('programs you run')
    for (const kind of ['VENDOR', 'CLIENT', 'MSP', 'GSI', 'CONSULTANT_CORP'] as const) {
      expect(directoryCopy(kind).subtitle).not.toContain('on the platform')
    }
  })
})

describe('adding a firm you trade with does not make you its owner', () => {
  const employee = {
    seatedAt: { id: 't', name: 'Teleworld Solutions' },
    permissions: ['assignments.read', 'timesheets.read'],
    relationship: 'SUPPLIER',
  }

  it('an engineer with two read permissions cannot add a company from inside his employer’s app', () => {
    const v = mayAddCompany(employee)
    expect(v.ok).toBe(false)
    expect(v.says).toContain('Ask whoever runs your suppliers and clients')
  })

  it('the refusal names the desk, not the permission', () => {
    expect(mayAddCompany(employee).says).not.toContain('vendors.manage')
  })

  it('the desk that manages who we trade with may add one, and is seated nowhere new', () => {
    const v = mayAddCompany({ ...employee, permissions: ['vendors.manage'] })
    expect(v.ok).toBe(true)
    expect(v.ownsIt).toBe(false)
    expect(v.says).toContain('not a firm you own')
  })

  it('a firm added from inside a seat must say what it is to us', () => {
    const v = mayAddCompany({ ...employee, permissions: ['*'], relationship: null })
    expect(v.ok).toBe(false)
    expect(v.says).toContain('a client, a supplier, a prime or a program office')
  })

  it('somebody with no seat anywhere registering their own firm becomes its owner', () => {
    const v = mayAddCompany({ seatedAt: null, permissions: [] })
    expect(v.ok).toBe(true)
    expect(v.ownsIt).toBe(true)
  })

  it('an owner holding the whole company may still add one, and still owns nothing new', () => {
    expect(mayAddCompany({ ...employee, permissions: ['*'] }).ownsIt).toBe(false)
  })
})

describe('the route does what the rule says', () => {
  const src = require('node:fs').readFileSync(
    require('node:path').join(process.cwd(), 'src/app/api/companies/route.ts'), 'utf8'
  )

  it('refuses before it creates anything', () => {
    expect(src.indexOf('mayAddCompany')).toBeLessThan(src.indexOf('tx.company.create'))
  })

  it('creates the owner seat only where the rule says the creator owns it', () => {
    expect(src).toContain('adding.ownsIt\n        ? await tx.context.create(')
  })

  it('does not put somebody on a bench because a recruiter wrote down their limited company', () => {
    expect(src).toContain("kind === 'CONSULTANT_CORP' && adding.ownsIt")
  })
})
