import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The second screen walk, 2026-11-03: Add consultant was drawn for a
 * delivery manager whose route refuses it. A button is drawn only where
 * its route will take it, so the page, the `?new=1` link and the route
 * read one gate (`mayAddConsultant`, lib/consultant-portfolio/who-adds),
 * and a seat without it is told which roles add, in a sentence.
 */

const h = vi.hoisted(() => ({ caller: null as any, asked: 0 }))

vi.mock('@/lib/alerts', () => ({ reportError: vi.fn() }))
vi.mock('@/lib/db', () => ({ prisma: {} }))
vi.mock('@/app/api/today/reads', () => ({ benchAt: vi.fn(async () => []) }))
vi.mock('@/lib/api-context', () => ({
  getCallerContext: vi.fn(async () => ({ caller: h.caller, error: null })),
}))
vi.mock('@/lib/consultant-portfolio/bench-ask', () => ({
  askOntoBench: vi.fn(async () => {
    h.asked++
    return {
      kind: 'ASKED',
      path: 'NEW',
      mail: 'EMAILED',
      typed: false,
      termsSays: null,
      person: { id: 'p-ravi', name: 'Ravi Kumar', primaryEmail: 'ravi@example.invalid' },
      profile: { id: 'cp-ravi', headline: null, skills: [], location: null, workAuth: null, availableFrom: null, visibility: 'FIRM' },
      listing: { id: 'l-ravi', tier: 'MARKETING', rateMin: null, rateMax: null, state: 'INVITED', termsEngagementType: null, termsPayRateCents: null, termsStatedAt: null },
    }
  }),
}))

import { rolesFor } from '@/lib/company-defaults'
import { mayAddConsultant, whoAddsSays, ADDS_CONSULTANTS } from '@/lib/consultant-portfolio/who-adds'
import { POST as addConsultant } from '@/app/api/consultants/route'

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')
const TELEWORLD = { id: 'teleworld', name: 'Teleworld', kind: 'GSI' }
const role = (name: string) => {
  const r = rolesFor('GSI').find((x) => x.name === name)
  if (!r) throw new Error(`no ${name} at an integrator`)
  return [...r.permissions] as string[]
}
const seat = (name: string) => ({ person: { id: `seat-${name}` }, company: TELEWORLD, permissions: role(name) })
const add = () =>
  addConsultant(
    new NextRequest('http://x/api/consultants', {
      method: 'POST',
      body: JSON.stringify({ name: 'Ravi Kumar', email: 'ravi@example.invalid' }),
    })
  )

beforeEach(() => {
  h.asked = 0
})

describe('Add consultant is offered only to the seats its route takes', () => {
  it('the button, the link and the route all read the one permission the route asks for', () => {
    expect(ADDS_CONSULTANTS).toBe('consultants.write')
    const route = read('src/app/api/consultants/route.ts')
    expect(route).toMatch(/if \(!mayAddConsultant\(caller\.permissions\)\)/)
    const page = read('src/app/dashboard/consultants/page.tsx')
    expect(page).toMatch(/const mayAdd = mayAddConsultant\(session\.permissions\)/)
    expect(page).toMatch(/\{mayAdd && \(\s*<button onClick=\{\(\) => setShowAdd\(true\)\}/)
    expect(page).toMatch(/\{showAdd && mayAdd && <AddConsultantModal/)
    expect(page).toMatch(/if \(mayAdd\) setShowAdd\(true\)\s*else setAddRefused\(whoAddsSays\(/)
  })

  it('a delivery manager is not offered Add consultant', () => {
    expect(mayAddConsultant(role('Delivery Manager'))).toBe(false)
  })

  it('a delivery manager who adds a consultant anyway is refused in a sentence naming the recruiter and the resource manager, and nobody is asked', async () => {
    h.caller = seat('Delivery Manager')
    const res = await add()
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error.code).toBe('FORBIDDEN')
    expect(body.error.message).toBe(
      'Adding a consultant is done by Recruiter, Resource Manager or HR at Teleworld, among other roles there. ' +
        'Ask one of them, or ask whoever manages roles there to add it to your role.'
    )
    expect(h.asked).toBe(0)
  })

  it('a recruiter is offered Add consultant and the route takes it', async () => {
    expect(mayAddConsultant(role('Recruiter'))).toBe(true)
    h.caller = seat('Recruiter')
    const res = await add()
    expect(res.status).toBe(201)
    expect(h.asked).toBe(1)
  })

  it('a resource manager is offered Add consultant too', () => {
    expect(mayAddConsultant(role('Resource Manager'))).toBe(true)
  })

  it('at a staffing firm the sentence names exactly the roles that add there', () => {
    expect(whoAddsSays({ kind: 'VENDOR', companyName: 'Brightmoor Staffing' })).toBe(
      'Adding a consultant is done by Recruiter, Resource Manager or HR at Brightmoor Staffing. ' +
        'Ask one of them, or ask whoever manages roles there to add it to your role.'
    )
  })
})
