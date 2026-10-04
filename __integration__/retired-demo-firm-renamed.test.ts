import { describe, it, expect, beforeAll } from 'vitest'
import { freshWorld, prisma } from './harness'
import { seedWorld, WORLD_SLUGS } from '@/lib/seed-world'
import { RENAMED_FIRMS, renameRetiredFirms, type RenamedFirm } from '@/lib/seed-renames'
import { decideEntry, type ClaimedDomain } from '@/lib/company-domains'

/**
 * A demo firm renamed in place, on a world that was seeded under its old name.
 *
 * ── Why this exists ──────────────────────────────────────────────────
 *
 * The demo's bench vendor carried the name of a real company, which asked
 * for its own tenancy on 2026-10-04. The live demo already holds that firm
 * and its people, and the demo world may not be deleted to fix it. So the
 * next seeding has to rename the firm where it stands: one firm, the same
 * history, the new name, and no second copy beside it.
 *
 * The old world is rebuilt here by running the rename backwards over a
 * freshly seeded one — the firm, its people's addresses and the words in
 * every row of the world put back the way the old seed wrote them — and
 * then the ordinary seeding is run over it.
 */

const PREFIX = 'world-'
const DOMAIN = 'demo.etyme.local'
const firm = RENAMED_FIRMS[0]
const backwards: RenamedFirm = {
  fromSlug: firm.toSlug, toSlug: firm.fromSlug, fromName: firm.toName, toName: firm.fromName,
  on: firm.on, why: firm.why,
}

/** Every row in the database whose words still carry `needle`, by table and column. */
async function stillSays(needle: string): Promise<string[]> {
  const cols = await prisma.$queryRawUnsafe<{ table_name: string; column_name: string }[]>(`
    select table_name, column_name from information_schema.columns
    where table_schema = 'public' and data_type in ('text', 'character varying', 'jsonb', 'json', 'ARRAY')`)
  const left: string[] = []
  for (const c of cols) {
    const [{ n }] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `select count(*) as n from "${c.table_name}" where "${c.column_name}"::text ilike $1`,
      `%${needle}%`
    )
    if (Number(n)) left.push(`${c.table_name}.${c.column_name}: ${n}`)
  }
  return left
}

const census = async () => ({
  companies: await prisma.company.count(),
  people: await prisma.person.count(),
  sellContracts: await prisma.sellContract.count(),
  timesheets: await prisma.timesheet.count(),
  invoices: await prisma.invoice.count(),
})

let before: Awaited<ReturnType<typeof census>>
let oldWorldSaid: string[]

beforeAll(async () => {
  await freshWorld()
  // The world as the old seed left it.
  await renameRetiredFirms(prisma, { prefix: PREFIX, domain: DOMAIN, worldSlugs: [...WORLD_SLUGS, PREFIX + firm.fromSlug] }, [backwards])
  oldWorldSaid = await stillSays(firm.fromSlug)
  before = await census()
  await seedWorld()
}, 900_000)

describe('A demo firm whose name was retired is renamed in place on the next seeding', () => {
  it('starts from a world that really does carry the old name, rather than passing on one that never did', async () => {
    expect(oldWorldSaid.length).toBeGreaterThan(0)
    expect(oldWorldSaid.some((w) => w.startsWith('Company.'))).toBe(true)
    expect(oldWorldSaid.some((w) => w.startsWith('Person.'))).toBe(true)
  })

  it('a world seeded with the old name is renamed in place on the next seeding, and nothing named CloudEPA is left', async () => {
    expect(await prisma.company.findUnique({ where: { slug: PREFIX + firm.fromSlug } })).toBeNull()
    const renamed = await prisma.company.findMany({ where: { slug: PREFIX + firm.toSlug } })
    expect(renamed.map((c) => c.name)).toEqual(['Techpeple'])
    expect(await stillSays(firm.fromSlug)).toEqual([])
  })

  it('makes no second firm and no second person: the seeding after the rename finds every row it wrote before', async () => {
    expect(await census()).toEqual(before)
    expect(await prisma.company.count({ where: { name: 'Techpeple' } })).toBe(1)
  })

  it('moves the firm’s seated people to the new addresses, owner and desks alike', async () => {
    const people = await prisma.person.findMany({
      where: { primaryEmail: { startsWith: `${PREFIX}${firm.toSlug}`, endsWith: `@${DOMAIN}` } },
      select: { primaryEmail: true },
    })
    expect(people.map((p) => p.primaryEmail)).toContain(`${PREFIX}${firm.toSlug}@${DOMAIN}`)
    expect(people.length).toBeGreaterThan(1)
    expect(await prisma.person.count({ where: { primaryEmail: { contains: firm.fromSlug } } })).toBe(0)
  })

  it('seeding a third time changes nothing at all', async () => {
    const twice = await census()
    await seedWorld()
    expect(await census()).toEqual(twice)
    expect(await stillSays(firm.fromSlug)).toEqual([])
  }, 900_000)

  it('refuses to merge two firms when both the old and the new name are present', async () => {
    const real = await prisma.company.create({ data: { slug: PREFIX + firm.fromSlug, name: firm.fromName, kind: 'VENDOR', isDemo: true } })
    await expect(
      renameRetiredFirms(prisma, { prefix: PREFIX, domain: DOMAIN, worldSlugs: WORLD_SLUGS })
    ).rejects.toThrow(/cannot be merged by a rename/)
    await prisma.company.delete({ where: { id: real.id } })
  })
})

describe('A real sign-in from the retired firm’s domain makes its own tenant', () => {
  it('no seeded company holds cloudepa.com or any alias of it', async () => {
    expect(await prisma.company.count({ where: { domain: { contains: firm.fromSlug, mode: 'insensitive' } } })).toBe(0)
    expect(await prisma.companyDomain.count({ where: { domain: { contains: firm.fromSlug, mode: 'insensitive' } } })).toBe(0)
  })

  it('somebody signing in from cloudepa.com is offered a company of their own and never a seat at a demo firm', async () => {
    const rows = await prisma.companyDomain.findMany({
      select: { domain: true, companyId: true, verifiedAt: true, joinPolicy: true, company: { select: { name: true } } },
    })
    const claims: ClaimedDomain[] = rows.map((r) => ({
      domain: r.domain, companyId: r.companyId, companyName: r.company.name,
      verified: r.verifiedAt !== null, joinPolicy: r.joinPolicy as ClaimedDomain['joinPolicy'],
    }))
    for (const email of [`owner@${firm.fromSlug}.com`, `ravi@talent.${firm.fromSlug}.com`]) {
      const entry = decideEntry(email, claims)
      expect(entry.action, email).toBe('CREATE')
    }
  })
})
