import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

/**
 * The fix list of 2026-11-14, E6, through the export route on the seeded
 * world: Integrations says Etyme is connected to no accounting system,
 * says why waiting entries cannot go while no account codes are set, and
 * draws Export only where codes exist and the seat's route takes it. The
 * file is one generic file whatever product a caller names.
 */

const exportRoute = await import('@/app/api/integrations/export/route')

const OWNER = 'world-techpeple@demo.etyme.local'
let firm = ''

beforeAll(async () => {
  await freshWorld()
  firm = (await prisma.company.findUniqueOrThrow({ where: { slug: 'world-techpeple' }, select: { id: true } })).id
  as(OWNER)
}, 600_000)

const read = async () => (await json(await exportRoute.GET(req('GET', '/api/integrations/export')))).body.data

describe('Integrations on the seeded world', () => {
  it('a firm with entries waiting and no account codes of its own reads how many wait and why they cannot go, and is offered no Export', async () => {
    const pending = await prisma.journalEntry.count({ where: { companyId: firm, exportedAt: null } })
    const d = await read()
    expect(d.pending).toBe(pending)
    expect(d.says[0]).toBe('Etyme is not connected to any accounting system. It makes a file you load into your own system yourself.')
    expect(d.showExport).toBe(false)
    expect(pending).toBeGreaterThan(0)
    expect(d.says[1]).toContain('cannot go until each Etyme account has your own account code. Account codes cannot be set here yet.')
    expect(JSON.stringify(d)).not.toMatch(/QUICKBOOKS|NETSUITE|nothing mapped yet/)
  })

  it('once every account in the waiting entries has the firm’s own code, the Owner is offered Export, and the file is the one generic file whatever product is named', async () => {
    // A firm's own codes, written here as a firm would once a place to set them exists.
    const used = await prisma.journalLine.findMany({ where: { entry: { companyId: firm, exportedAt: null } }, select: { accountId: true }, distinct: ['accountId'] })
    // The seeded world posts this firm's signed weeks, so entries wait.
    expect(used.length).toBeGreaterThan(0)
    await prisma.erpAccountMap.createMany({ data: used.map((u, i) => ({ companyId: firm, system: 'CSV' as const, accountId: u.accountId, theirAccount: `NW-${4000 + i}` })) })
    const d = await read()
    expect(d.showExport).toBe(true)
    expect(d.says[1]).toMatch(/^\d+ (entry is|entries are) waiting\.$/)
    const out = await json(await exportRoute.POST(req('POST', '/api/integrations/export', { system: 'QUICKBOOKS' })))
    expect(out.status).toBe(200)
    expect(out.body.data.says).toMatch(/in the file and stamped as sent\. They will not go again\.$/)
    expect(await prisma.journalEntry.count({ where: { companyId: firm, exportedTo: { not: 'CSV' }, exportedAt: { not: null } } })).toBe(0)
    expect((await read()).says[1]).toMatch(/^Nothing is waiting to go to your own system\. \d+ (entry|entries) already went\.$/)
  })
})
