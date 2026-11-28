import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'
import { GET as roles } from '@/app/api/roles/route'
import { rolesFor } from '@/lib/company-defaults'

/**
 * The invite picker reads each role's one line from `GET /api/roles`
 * (fix list 2026-11-14, A3). On the seeded world, every role a firm
 * started with carries the line its kind of firm ships, so no option in
 * the picker is a bare name.
 */

const firms: { slug: string; kind: string; owner: string }[] = []

beforeAll(async () => {
  await freshWorld()
  for (const slug of ['world-tellisford', 'world-northbend']) {
    const company = await prisma.company.findFirstOrThrow({ where: { slug }, select: { id: true, kind: true } })
    const owner = await prisma.context.findFirstOrThrow({
      where: { companyId: company.id, revokedAt: null, suspendedAt: null, role: { name: 'Owner' } },
      select: { person: { select: { primaryEmail: true } } },
    })
    firms.push({ slug, kind: company.kind, owner: owner.person.primaryEmail! })
  }
})

describe('the roles the invite picker offers', () => {
  it('on a seeded integrator and a seeded client, every shipped role arrives with its own one line, and a role the firm wrote says how much it can do', async () => {
    for (const f of firms) {
      as(f.owner)
      const { status, body } = await json(await roles(req('GET', '/api/roles')))
      expect(status, f.slug).toBe(200)
      const shipped = new Map(rolesFor(f.kind as never).map((r) => [r.name, r.blurb]))
      const got = body.data.roles as { name: string; blurb: string | null; canDo: string }[]
      expect(got.length, f.slug).toBeGreaterThan(0)
      for (const r of got) {
        // A role still as shipped says the shipped line; any other says how much it can do.
        if (r.blurb) expect(r.blurb, `${f.slug} ${r.name}`).toBe(shipped.get(r.name) ?? r.blurb)
        else expect(r.canDo, `${f.slug} ${r.name}`).toBeTruthy()
      }
      const withLine = got.filter((r) => r.blurb).map((r) => r.name)
      expect(withLine, f.slug).toContain('Owner')
      // Every role the firm started with, as it is on the seeded world, carries its line.
      for (const r of got.filter((x) => shipped.has(x.name))) expect(r.blurb, `${f.slug} ${r.name}`).toBe(shipped.get(r.name))
    }
  })
})
