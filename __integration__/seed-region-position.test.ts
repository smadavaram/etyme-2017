import { describe, it, expect, beforeAll } from 'vitest'
import { prisma, freshWorld } from './harness'
import { CORVANE_REGIONS } from '@/lib/seed-corvane'

/** A region's place on the record (OrgUnit.position, 2026-11-08), written by the seed in Corvane's own order. */

beforeAll(async () => {
  await freshWorld()
}, 600_000)

describe('Corvane Packaging’s regions in its own order', () => {
  it('every seeded REGION unit carries its place, one to the number of regions, in the order the seed lists them', async () => {
    const co = await prisma.company.findFirstOrThrow({ where: { name: 'Corvane Packaging' }, select: { id: true } })
    const units = await prisma.orgUnit.findMany({
      where: { companyId: co.id, kind: 'REGION' }, orderBy: { position: 'asc' }, select: { name: true, position: true },
    })
    expect(units.map((u) => u.name)).toEqual(CORVANE_REGIONS.map((r) => r.label))
    expect(units.map((u) => u.position)).toEqual(CORVANE_REGIONS.map((_, i) => i + 1))
  })
})
