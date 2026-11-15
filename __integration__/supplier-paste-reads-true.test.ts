import { describe, it, expect, beforeAll } from 'vitest'
import { as, req, json, prisma, freshWorld } from './harness'

/**
 * What the Suppliers list says of a firm is true (walk, 2026-11-15). A
 * supplier pasted a minute ago has done no work, holds no signed
 * agreement and has a contact nobody gave a role; the list says so, and
 * names the contacts Contacts names. The paste leaves one row on the
 * Activity log. Two suppliers of one name are told apart by domain.
 * Made-up firms on reserved domains only.
 */

const suppliers = await import('@/app/api/suppliers/route')

const OWNER = 'world-brightmoor@demo.etyme.local'
let brightmoor = ''

const paste = async (rows: object[]) => json(await suppliers.POST(req('POST', '/api/suppliers', { rows })))
const list = async () => {
  const r = await json(await suppliers.GET(req('GET', '/api/suppliers')))
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body.data.suppliers as any[]
}
const pasteRows = () =>
  prisma.automationLog.findMany({
    where: { companyId: brightmoor, action: 'IMPORT_COMMITTED', payload: { path: ['from'], equals: 'SUPPLIER_PASTE' } },
    orderBy: { at: 'desc' },
  })

let larkspur = ''

beforeAll(async () => {
  await freshWorld()
  brightmoor = (await prisma.company.findUniqueOrThrow({ where: { slug: 'world-brightmoor' }, select: { id: true } })).id
  as(OWNER)
  const before = (await pasteRows()).length
  const r = await paste([{ company: 'Larkspur Staffing', contactName: 'Noor Haddad', email: 'noor@larkspur-staffing.example', domain: 'larkspur-staffing.example' }])
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  larkspur = r.body.data.added[0].companyId
  expect((await pasteRows()).length).toBe(before + 1)
}, 600_000)

describe('the Suppliers list says only what is true of a pasted supplier', () => {
  it('a supplier pasted a minute ago has no last engagement, so it is not counted as recent', async () => {
    as(OWNER)
    const row = (await list()).find((s) => s.companyId === larkspur)
    expect(row).toBeDefined()
    expect(row.lastEngagement).toBeNull()
  })

  it("a pasted supplier's agreement record is unsigned, so the list does not read it as approved by agreement", async () => {
    as(OWNER)
    const row = (await list()).find((s) => s.companyId === larkspur)
    expect(row.signedAt).toBeNull()
  })

  it('a pasted contact is saved under the neutral role, not as Recruiting', async () => {
    const c = await prisma.companyContact.findFirstOrThrow({ where: { companyId: brightmoor, atCompanyId: larkspur, email: 'noor@larkspur-staffing.example' } })
    expect(c.kind).toBe('OTHER')
  })

  it("every contact the firm keeps at a supplier is on that supplier's row, the same people Contacts lists", async () => {
    as(OWNER)
    const rows = await list()
    const ids = rows.map((r) => r.companyId)
    const kept = await prisma.companyContact.findMany({ where: { companyId: brightmoor, atCompanyId: { in: ids } }, select: { atCompanyId: true, name: true, email: true } })
    expect(kept.length).toBeGreaterThan(1)
    for (const k of kept) {
      const row = rows.find((r) => r.companyId === k.atCompanyId)
      const shown = row.contacts.map((c: any) => (c.email ?? '').toLowerCase())
      const names = row.contacts.map((c: any) => c.name)
      expect(k.email ? shown.includes(k.email.toLowerCase()) : names.includes(k.name), `${k.name} at ${row.name}`).toBe(true)
    }
  })

  it('a paste writes one Activity log row saying who pasted how many suppliers and contacts, and whether the invitations were emailed', async () => {
    const [row] = await pasteRows()
    expect(row.summary).toMatch(/ pasted 1 supplier and 1 new contact onto Suppliers$/)
    expect(row.reversible).toBe(false)
    const emailed = (row.payload as any).emailed as number
    if (emailed === 0) expect(row.reason).not.toMatch(/(was|were) emailed/)
    expect(row.reason).toMatch(/^Pasted by hand on Suppliers\. /)
  })

  it('two suppliers of one name are told apart by their domain on the list', async () => {
    as(OWNER)
    const r = await paste([{ company: 'Larkspur Staffing', contactName: 'Ivo Brandt', email: 'ivo@larkspur-group.example', domain: 'larkspur-group.example' }])
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const twin = r.body.data.added[0].companyId
    expect(twin).not.toBe(larkspur)
    const rows = await list()
    expect(rows.find((s) => s.companyId === larkspur).shownAs).toBe('Larkspur Staffing (larkspur-staffing.example)')
    expect(rows.find((s) => s.companyId === twin).shownAs).toBe('Larkspur Staffing (larkspur-group.example)')
  })
})
