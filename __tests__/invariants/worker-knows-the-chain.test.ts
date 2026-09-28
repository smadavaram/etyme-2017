import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { placementLines, tieOf, type ChainRung, type Tie } from '@/lib/consultant-portfolio'

/**
 * The worker knows the complete chain.
 *
 * Founder, 2026-09-28. Helena's own page listed every rung of her chain
 * as a placement of its own, so she read Northbend Athletic twice. One
 * placement is one line naming every firm between her and the client, in
 * order, and no rate of a rung she is not party to.
 */

const rung = (o: Partial<ChainRung> & Pick<ChainRung, 'id' | 'companyId' | 'clientCompanyId' | 'companyName' | 'clientName'>): ChainRung => ({
  personId: 'helena', state: 'IN_PROGRESS', startDate: '2026-03-12', endDate: '2027-03-07', endClientName: null, ...o,
})

const cloudepa = rung({ id: 'b', companyId: 'cloudepa', clientCompanyId: 'cs', companyName: 'CloudEPA', clientName: 'Computer Systems', endClientName: 'Northbend Athletic' })
const cs = rung({ id: 't', companyId: 'cs', clientCompanyId: 'nike', companyName: 'Computer Systems', clientName: 'Northbend Athletic', endClientName: 'Northbend Athletic' })
const employed = (): Tie => 'EMPLOYED'

describe('where you work, as the worker reads it', () => {
  it('a chain of two rungs is one placement, not two', () => {
    expect(placementLines([cs, cloudepa], employed)).toHaveLength(1)
  })

  it('the placement names the client, every firm between, and the employer, in order', () => {
    const [l] = placementLines([cs, cloudepa], employed)
    expect(l.says).toBe('Northbend Athletic · through Computer Systems · employed by CloudEPA')
    expect(l.own.id).toBe('b')
  })

  it('a chain of three names both firms between, nearest the client first', () => {
    const sub = rung({ id: 's', companyId: 'nimbus', clientCompanyId: 'cloudepa', companyName: 'Nimbus Talent', clientName: 'CloudEPA', endClientName: 'Northbend Athletic' })
    const [l] = placementLines([cs, cloudepa, sub], employed)
    expect(l.says).toBe('Northbend Athletic · through Computer Systems · through CloudEPA · employed by Nimbus Talent')
  })

  it('a placement with no chain names the client and whoever pays them', () => {
    const direct = rung({ id: 'd', companyId: 'cloudepa', clientCompanyId: 'nike', companyName: 'CloudEPA', clientName: 'Northbend Athletic' })
    expect(placementLines([direct], employed)[0].says).toBe('Northbend Athletic · employed by CloudEPA')
  })

  it('somebody paid through their own company reads "paid by", not "employed by"', () => {
    const direct = rung({ id: 'd', companyId: 'agency', clientCompanyId: 'hospital', companyName: 'Bluecrest Staffing', clientName: 'Harlow Health' })
    expect(placementLines([direct], () => 'PAID')[0].says).toBe('Harlow Health · paid by Bluecrest Staffing')
    expect(tieOf('C2C')).toBe('PAID')
    expect(tieOf('IND_1099')).toBe('PAID')
    expect(tieOf('W2')).toBe('EMPLOYED')
  })

  it('where nothing on the record says how the bottom firm pays them, the line says "through" rather than guessing', () => {
    const direct = rung({ id: 'd', companyId: 'cloudepa', clientCompanyId: 'nike', companyName: 'CloudEPA', clientName: 'Northbend Athletic' })
    expect(placementLines([direct], () => null)[0].says).toBe('Northbend Athletic · through CloudEPA')
    expect(tieOf(null)).toBeNull()
  })

  it('a firm paying for the work at the top that is not the site is a firm between them too', () => {
    const msp = rung({ id: 'm', companyId: 'cs', clientCompanyId: 'aptiva', companyName: 'Computer Systems', clientName: 'Aptiva Workforce', endClientName: 'Harlow Health' })
    const [l] = placementLines([msp], employed)
    expect(l.says).toBe('Harlow Health · through Aptiva Workforce · employed by Computer Systems')
  })

  it('two placements at the same client through different firms are two lines', () => {
    const later = rung({ id: 'x', companyId: 'vertex', clientCompanyId: 'nike', companyName: 'Vertex Global', clientName: 'Northbend Athletic', startDate: '2027-04-01', endDate: null })
    expect(placementLines([cs, cloudepa, later], employed).map((l) => l.says)).toEqual([
      'Northbend Athletic · through Computer Systems · employed by CloudEPA',
      'Northbend Athletic · employed by Vertex Global',
    ])
  })

  it('a rung the walk cannot place is still shown on its own, never dropped', () => {
    const twin = rung({ id: 't2', companyId: 'cs', clientCompanyId: 'nike', companyName: 'Computer Systems', clientName: 'Northbend Athletic' })
    const lines = placementLines([cs, twin, cloudepa], employed)
    const shown = lines.flatMap((l) => l.rungs.map((r) => r.id)).sort()
    expect(shown).toEqual(['b', 't', 't2'])
  })
})

describe('the page carries the chain and only the worker’s own pay', () => {
  const route = readFileSync(join(__dirname, '../../src/app/api/me/work/route.ts'), 'utf8')
  const page = readFileSync(join(__dirname, '../../src/app/dashboard/my-work/page.tsx'), 'utf8')

  it('one row per placement, carrying the chain sentence', () => {
    expect(route).toContain('placements: lines.map(')
    expect(page).toContain('{p.chain}')
  })

  it('no rung above the worker’s own is priced on their page', () => {
    const placements = route.slice(route.indexOf('placements: lines.map('), route.indexOf('// One entry per contract they file on'))
    expect(placements).not.toContain('billRate')
    // Pay only from a buy line with no supplier below it: their own.
    expect(route).toContain('supplierSellContractId === null')
  })
})
