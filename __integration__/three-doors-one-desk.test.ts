import { describe, it, expect, beforeAll } from 'vitest'
import { NextRequest } from 'next/server'
import { req, freshWorld, prisma } from './harness'
import { POST as demo } from '@/app/api/demo/route'
import { seatsHeldBy } from '@/lib/program-seat'
import { deskOf } from '@/components/shell/sidebar-props'
import { plusMenuFor } from '@/components/shell/header'
import { hasAnyPermission } from '@/lib/permissions'
import { DEMO_COOKIE, read as readCookie } from '@/lib/demo-session'

/**
 * The two findings of the outside review of the live demo, 2026-10-05,
 * walked against the seeded world rather than against a fixture.
 */

async function sit(slug: string, desk?: string) {
  const res = await demo(req('POST', '/api/demo', { as: slug, ...(desk ? { desk } : {}) }) as NextRequest)
  const body = (await res.json()).data
  const m = new RegExp(`${DEMO_COOKIE}=([^;]+)`).exec(res.headers.get('set-cookie') ?? '')
  const email = m ? readCookie(m[1]) : null
  const person = email ? await prisma.person.findUnique({ where: { primaryEmail: email }, select: { name: true } }) : null
  return { body, name: person?.name ?? null }
}

describe('the + button at a client’s desk, on the seeded world', () => {
  beforeAll(async () => {
    await freshWorld()
  }, 600_000)

  it('Kestrel MSP at Talvern Medical’s compliance desk is offered the client’s + menu and nothing Talvern’s compliance role cannot send', async () => {
    const kestrel = await prisma.company.findUniqueOrThrow({ where: { slug: 'world-kestrel' } })
    const [held] = await seatsHeldBy(kestrel.id)
    expect(held, 'Kestrel holds no live seat in the seeded world').toBeTruthy()
    expect(held.clientCompany.name).toBe('Talvern Medical')

    // The session the dashboard layout builds for that desk.
    const desk = deskOf({
      company: { id: kestrel.id, name: kestrel.name, slug: kestrel.slug, kind: kestrel.kind as 'MSP' },
      contextType: 'EMPLOYEE',
      isWorker: false,
      permissions: ['*'],
      seat: {
        clientId: held.clientCompany.id, clientName: held.clientCompany.name,
        roleName: held.role.name, permissions: held.role.permissions,
      },
    })
    expect(desk.menuKind).toBe('CLIENT')
    const offered = plusMenuFor(desk.menuKind, desk.isConsultant, desk.permissions, desk.worker).flatMap((s) => s.items)
    const labels = offered.map((i) => i.label)
    expect(labels).not.toContain('Add consultant')
    expect(labels).not.toContain('New contract')
    expect(labels).not.toContain('New job request')
    for (const i of offered) {
      if (i.writes) expect(hasAnyPermission(held.role.permissions, i.writes as any), i.label).toBe(true)
    }
  })
})

describe('the demo offers a bench vendor’s door, on the seeded world', () => {
  beforeAll(async () => {
    await freshWorld()
  }, 600_000)

  it('the bench vendor’s owner door seats Imogen Hartley at Pellwright Validation Partners', async () => {
    const { body, name } = await sit('world-pellwright')
    expect(body.companyName).toBe('Pellwright Validation Partners')
    expect(body.kind).toBe('VENDOR')
    expect(name).toBe('Imogen Hartley')
  }, 60_000)

  it('the bench vendor’s finance door seats Desmond Achterberg at the Finance desk', async () => {
    const { body, name } = await sit('world-pellwright', 'finance')
    expect(body.companyName).toBe('Pellwright Validation Partners')
    expect(body.role).toBe('Finance')
    expect(name).toBe('Desmond Achterberg')
  }, 60_000)
})
