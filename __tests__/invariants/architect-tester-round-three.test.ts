import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { getNavForKind, activeHref } from '@/components/shell/sidebar'
import { rolesFor } from '@/lib/company-defaults'
import { approvalEmail } from '@/lib/seed-week-approval'
import { templatePackRefusal } from '@/app/api/companies/[id]/template-pack/refusal'

/**
 * The architect's share of the testers' walk on e80773ab9 (client s4-4,
 * worker s5-3, bench s1-4b, s7-2 and s7-10), as sentences.
 */

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const schema = src('prisma/schema.prisma')
const model = (name: string) => schema.match(new RegExp(`^model ${name} \\{([\\s\\S]*?)^\\}`, 'm'))?.[1] ?? ''

const permsOf = (kind: 'VENDOR' | 'GSI' | 'MSP', role: string) =>
  rolesFor(kind).find((r) => r.name === role)!.permissions as readonly string[]
const hrefs = (kind: 'VENDOR' | 'GSI' | 'MSP', permissions: readonly string[]) =>
  getNavForKind(kind, false, { permissions }).flatMap((s) => s.items.map((i) => i.href))
const noQuery = { get: () => null }

describe('the client reads an approval email addressed to the firm it pays', () => {
  it('the seeded approval email is addressed to the address it is given, and names the client and the approver', () => {
    const text = approvalEmail({
      approverName: 'Marcus Oyelaran', approverEmail: 'world-nike-hiring@demo.etyme.local',
      to: 'world-computer-systems@demo.etyme.local', period: 'Aug 31 – Sep 4', hours: 40,
    })
    expect(text).toContain('To: world-computer-systems@demo.etyme.local')
    expect(text).toContain('From: Marcus Oyelaran <world-nike-hiring@demo.etyme.local>')
    expect(text).not.toMatch(/techpeple/i)
  })

  it('the seed addresses the client’s reply to the supplier the client pays, never to the firm below it', () => {
    const seed = src('src/lib/seed-week-approval.ts')
    expect(seed).toContain("world.seatBySlug.get('computer-systems')")
    expect(seed).toMatch(/approvalEmail\(\{[^}]*to: prime\.email/)
    // The old template line; the repair that finds a file written by it may still name it.
    expect(seed).not.toContain('`To: ${sender.email}\\n`')
  })
})

describe('“What we need” has a table of its own', () => {
  const body = model('BenchWant')

  it('what a firm asks its partners for is kept by that firm, and goes with it when the firm is removed', () => {
    expect(body).toMatch(/companyId\s+String\n/)
    expect(body).toMatch(/@relation\(fields: \[companyId\], references: \[id\], onDelete: Cascade\)/)
  })

  it('it holds the skills, the places, a rate range in minor units with its currency, and the desk that receives', () => {
    for (const field of ['skills', 'places']) expect(body).toMatch(new RegExp(`\\b${field}\\s+String\\[\\]`))
    expect(body).toMatch(/rateMinCents\s+Int\?/)
    expect(body).toMatch(/rateMaxCents\s+Int\?/)
    expect(body).toMatch(/currency\s+String\s+@default\("USD"\)/)
    expect(body).toMatch(/receivingRoleId\s+String\?/)
    expect(body).toMatch(/receivingPersonId\s+String\?/)
  })

  it('it says who wrote it and when it was closed, and a closed request is kept rather than deleted', () => {
    expect(body).toMatch(/createdById\s+String\n/)
    expect(body).toMatch(/updatedAt\s+DateTime\s+@updatedAt/)
    expect(body).toMatch(/closedAt\s+DateTime\?/)
  })

  it('every key it points at is indexed', () => {
    for (const key of ['companyId', 'receivingRoleId', 'receivingPersonId', 'createdById']) {
      expect(body).toContain(`@@index([${key}])`)
    }
  })

  it('a receiving desk that is removed leaves the request standing with nobody named, rather than deleting it', () => {
    expect(body).toMatch(/receivingRole\s+Role\?\s+@relation\(fields: \[receivingRoleId\], references: \[id\], onDelete: SetNull\)/)
    expect(body).toMatch(/receivingPerson\s+Person\?\s+@relation\("benchWantReceiver", fields: \[receivingPersonId\], references: \[id\], onDelete: SetNull\)/)
  })
})

describe('the finance desk is shown Bench, because it reads bench profit', () => {
  it('the finance desk at a staffing supplier is shown Bench', () => {
    expect(permsOf('VENDOR', 'Finance')).not.toContain('consultants.read')
    expect(hrefs('VENDOR', permsOf('VENDOR', 'Finance'))).toContain('/dashboard/bench')
  })

  it('the finance desk at an integrator is shown Bench', () => {
    expect(hrefs('GSI', permsOf('GSI', 'Finance'))).toContain('/dashboard/bench')
  })

  it('a recruiter is still shown Bench, and accounts receivable, which reads neither people nor profit, is not', () => {
    expect(hrefs('VENDOR', permsOf('VENDOR', 'Recruiter'))).toContain('/dashboard/bench')
    expect(hrefs('VENDOR', permsOf('VENDOR', 'Accounts Receivable'))).not.toContain('/dashboard/bench')
  })

  it('a program office’s Bench still asks for the people alone, because it has no finance desk', () => {
    const msp = getNavForKind('MSP', false).flatMap((s) => s.items).find((i) => i.href === '/dashboard/bench')!
    expect(msp.needs).toEqual(['consultants.read'])
  })
})

describe('a worker who is also staff finds their own work without scrolling past the firm', () => {
  const engineer = getNavForKind('GSI', false, { worker: true, permissions: ['assignments.read', 'timesheets.read'] })

  it('“You” still comes after the firm’s sections, appended and never substituted', () => {
    expect(engineer[engineer.length - 1].label).toBe('You')
  })

  it('on their own work page the menu marks “Your work” as the page being read', () => {
    expect(activeHref(engineer, '/dashboard/my-work', noQuery, '/dashboard')).toBe('/dashboard/my-work')
  })

  it('on the paperwork page only “Your paperwork” is lit, not “Your work” as well', () => {
    expect(activeHref(engineer, '/dashboard/my-work/paperwork', noQuery, '/dashboard')).toBe('/dashboard/my-work/paperwork')
  })

  it('a link carrying a query is the page only where the query agrees', () => {
    const vendor = getNavForKind('VENDOR', false)
    const sell = vendor.flatMap((s) => s.items).find((i) => i.href.includes('?'))
    if (!sell) return
    const [path, q] = sell.href.split('?')
    const [k, v] = q.split('=')
    expect(activeHref(vendor, path, { get: (n: string) => (n === k ? v : null) }, '/dashboard')).toBe(sell.href)
    expect(activeHref(vendor, path, { get: () => 'something-else' }, '/dashboard')).not.toBe(sell.href)
  })

  it('the menu brings the page being read into view when it opens', () => {
    const sidebar = src('src/components/shell/sidebar.tsx')
    expect(sidebar).toContain(`data-current={active ? 'true' : undefined}`)
    expect(sidebar).toMatch(/querySelector<HTMLElement>\('\[data-current="true"\]'\)[\s\S]{0,80}scrollIntoView/)
  })
})

describe('setting up a company from a template pack is refused in a sentence', () => {
  it('a seat without the setup desk is told which desks do it at its company, never a permission key', () => {
    const says = templatePackRefusal({
      seated: true, permissions: ['consultants.read'],
      companyName: 'Pellwright Validation Partners', companyKind: 'VENDOR',
    })!
    expect(says).toContain('Pellwright Validation Partners')
    expect(says).toMatch(/Owner|Admin/)
    expect(says).not.toMatch(/settings\.manage|permission/)
  })

  it('somebody with no seat at the company is told so, in a sentence', () => {
    expect(templatePackRefusal({ seated: false, permissions: [], companyName: 'Pellwright', companyKind: 'VENDOR' }))
      .toBe('You do not have a seat at Pellwright, so you cannot set up its documents and calendar.')
  })

  it('a seat that holds the setup desk is let through', () => {
    expect(templatePackRefusal({ seated: true, permissions: ['*'], companyName: 'P', companyKind: 'VENDOR' })).toBeNull()
  })

  it('somebody signed in with no person on the record no longer skips the check', () => {
    const route = src('src/app/api/companies/[id]/template-pack/route.ts')
    expect(route).not.toContain('if (person) {')
    expect(route).toContain('templatePackRefusal(')
    expect(route).not.toContain('You need settings.manage permission')
  })
})
