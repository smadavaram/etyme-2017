import { describe, it, expect } from 'vitest'
import { aboutThePerson, owedRowKey } from '@/app/api/compliance/owed-rows'
import { owedSentence } from '@/app/dashboard/compliance/says'

/**
 * The fifth screen walk, 2026-11-04. Six running Brightmoor → Northbend
 * placements each read "background check · needed", and Compliance said
 * "One document is still owed" with one row naming nobody. The row key
 * kept the person only where the worker owed the paper; a background
 * check is the firm's to order, so all six collapsed into one.
 */

const NORTHBEND = 'co-northbend'
const SIX = ['Camille Dubois', 'Hana Hollis', 'Delphine Delacroix', 'Anders Achterberg', 'Anders Bianchi', 'Wendell Whitlock']
const lines = SIX.map((name, i) => ({ id: `line-${i}`, personId: `p-${i}`, name, clientCompanyId: NORTHBEND }))

function rowsFor(item: { key: string; owedBy: string }) {
  const seen = new Map<string, string | null>()
  for (const line of lines) {
    const id = owedRowKey(item, line)
    if (seen.has(id)) continue
    seen.set(id, aboutThePerson(item, line.personId) ? line.name : null)
  }
  return [...seen.values()]
}

describe('what this firm owes is one row per person for a paper about a person', () => {
  it('six people’s missing background checks are six named rows on Compliance, never one row naming nobody', () => {
    const rows = rowsFor({ key: 'BACKGROUND_CHECK', owedBy: 'US' })
    expect(rows).toHaveLength(6)
    expect(rows).toEqual(SIX)
  })

  it('a drug screening the firm orders is also one row per person, named', () => {
    expect(rowsFor({ key: 'DRUG_SCREENING', owedBy: 'US' })).toEqual(SIX)
  })

  it('an I-9 the worker owes stays one row per person, as before', () => {
    expect(rowsFor({ key: 'I9_EVERIFY', owedBy: 'WORKER' })).toEqual(SIX)
  })

  it('one master agreement six consultants at one client need is still one row, about nobody', () => {
    expect(rowsFor({ key: 'MSA', owedBy: 'SUPPLIER' })).toEqual([null])
  })

  it('the firm’s own insurance certificate is one row per customer, not one per person', () => {
    expect(rowsFor({ key: 'INSURANCE_GL', owedBy: 'SUPPLIER' })).toEqual([null])
  })

  it('a paper on a line that is for nobody is about nobody', () => {
    expect(aboutThePerson({ key: 'BACKGROUND_CHECK', owedBy: 'US' }, null)).toBe(false)
  })

  it('a check the firm owes about a person says it is the firm’s to produce for that person, never the person’s', () => {
    const said = owedSentence({
      aboutName: 'Anders Achterberg',
      owedByName: 'Brightmoor Staffing',
      toName: 'Northbend Athletic',
      asked: 'required on every line',
      owedBy: 'US',
    })
    expect(said).toBe('Brightmoor Staffing’s to produce for Anders Achterberg — required on every line, on the line billing Northbend Athletic.')
    expect(said).not.toContain('Anders Achterberg’s to produce')
  })
})
