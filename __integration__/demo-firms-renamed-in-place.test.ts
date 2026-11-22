import { describe, it, expect, beforeAll } from 'vitest'
import { freshWorld, prisma } from './harness'
import { seedWorld, WORLD_SLUGS } from '@/lib/seed-world'
import { RENAMED_FIRMS, renameRetiredFirms, type RenamedFirm } from '@/lib/seed-renames'

/**
 * Four demo firms renamed in place on 2026-11-22, on a world seeded before.
 *
 * ── Why this exists ──────────────────────────────────────────────────
 *
 * The owner asked for a demo that is safe to show outside (record 110).
 * The bench vendor's name was a misspelling, and the integrator, a second
 * bench vendor and the bank client each carried a name a real company
 * holds. The live demo already holds all four under their old slugs. The
 * next seeding has to rename each one where it stands: the same firm,
 * the same people, the same history, and no second copy beside it.
 *
 * The old world is put back here by running today's four renames
 * backwards over a freshly seeded one, and then the ordinary seeding is
 * run over it. `retired-demo-firm-renamed.test.ts` proves the first
 * rename the same way; this proves the four, a two-word name among them.
 */

const PREFIX = 'world-'
const DOMAIN = 'demo.etyme.local'
const today = RENAMED_FIRMS.filter((f) => f.on === '2026-11-22')
const backwards: RenamedFirm[] = today.map((f) => ({
  fromSlug: f.toSlug, toSlug: f.fromSlug, fromName: f.toName, toName: f.fromName,
  companyName: f.companyName ? f.companyName.replace(f.toName, f.fromName) : undefined,
  on: f.on, why: f.why,
}))

/** Every column in the database whose words still carry `needle`. */
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
  costCenters: await prisma.costCenter.count(),
})

let before: Awaited<ReturnType<typeof census>>
const oldWorldSaid = new Map<string, string[]>()

beforeAll(async () => {
  await freshWorld()
  await renameRetiredFirms(
    prisma,
    { prefix: PREFIX, domain: DOMAIN, worldSlugs: [...WORLD_SLUGS, ...today.map((f) => PREFIX + f.fromSlug)] },
    backwards
  )
  for (const f of today) oldWorldSaid.set(f.toSlug, await stillSays(f.fromName))
  before = await census()
  await seedWorld()
}, 900_000)

describe('Four demo firms whose names were retired on 2026-11-22 are renamed in place on the next seeding', () => {
  it('four firms are renamed today, and the test reads all four', () => {
    expect(today.map((f) => f.toSlug)).toEqual(['tecwyn', 'tellisford', 'conisby', 'merrowfield-bank'])
  })

  it('starts from a world that really does carry each old name, on a company and in other rows', () => {
    for (const f of today) {
      const said = oldWorldSaid.get(f.toSlug) ?? []
      expect(said.some((w) => w.startsWith('Company.')), f.toSlug).toBe(true)
      expect(said.length, f.toSlug).toBeGreaterThan(1)
    }
  })

  it('no company is left under an old slug, and each firm reads its new name once', async () => {
    for (const f of today) {
      expect(await prisma.company.findUnique({ where: { slug: PREFIX + f.fromSlug } }), f.toSlug).toBeNull()
      const renamed = await prisma.company.findMany({ where: { slug: PREFIX + f.toSlug }, select: { name: true } })
      expect(renamed.map((c) => c.name), f.toSlug).toEqual([f.companyName ?? f.toName])
    }
  })

  it('no row anywhere in the database still says an old name or an old slug', async () => {
    for (const f of today) {
      expect(await stillSays(f.fromName), f.toSlug).toEqual([])
      expect(await stillSays(f.fromSlug), f.toSlug).toEqual([])
    }
  })

  it('makes no second firm, person, contract, week, invoice or cost center', async () => {
    expect(await census()).toEqual(before)
  })

  it('the bank client keeps one set of cost centers, under codes that carry its new name', async () => {
    const bank = today.find((f) => f.toSlug === 'merrowfield-bank')!
    const client = await prisma.company.findUniqueOrThrow({ where: { slug: PREFIX + bank.toSlug }, select: { id: true } })
    const codes = (await prisma.costCenter.findMany({ where: { companyId: client.id }, select: { code: true } })).map((c) => c.code)
    expect(codes.length).toBeGreaterThan(0)
    expect(codes.filter((c) => c.includes(bank.fromName.split(' ')[0].toUpperCase()))).toEqual([])
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('every seated person at a renamed firm signs in at the new address', async () => {
    for (const f of today) {
      expect(await prisma.person.count({ where: { primaryEmail: { contains: f.fromSlug } } }), f.toSlug).toBe(0)
      expect(
        await prisma.person.count({ where: { primaryEmail: { startsWith: PREFIX + f.toSlug, endsWith: `@${DOMAIN}` } } }),
        f.toSlug
      ).toBeGreaterThan(0)
    }
  })

  it('each rename is on the activity log with its reason, and the row does not spell the old name', async () => {
    const rows = await prisma.automationLog.findMany({
      where: { action: 'DEMO_FIRM_RENAMED' }, select: { summary: true, reason: true, reversible: true },
    })
    for (const f of today) {
      const row = rows.find((r) => r.summary === `Renamed a demo firm to ${f.toName}, in place.` && r.reason.includes(f.why))
      expect(row, f.toSlug).toBeDefined()
      expect(row?.reversible).toBe(false)
      expect(row?.reason.toLowerCase()).not.toContain(f.fromName.toLowerCase())
    }
  })

  it('seeding a third time changes nothing at all', async () => {
    const twice = await census()
    await seedWorld()
    expect(await census()).toEqual(twice)
  }, 900_000)
})
