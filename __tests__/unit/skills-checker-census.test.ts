import { describe, it, expect } from 'vitest'
import { countDifferences } from '@/lib/skills/checkers/census-classify'
import { weeklyLine, type CensusRow } from '@/lib/agents/census-rules'

const row = (name: string, side: 'CUSTOMER' | 'SUPPLIER', standing: 'ACTIVE' | 'DORMANT'): CensusRow => ({ key: `${side}:${name}`, name, side, standing, lastActivity: null })
const week = new Date('2026-11-22T00:00:00Z')

describe('the census checker’s reading of a line', () => {
  const rows = [row('A', 'CUSTOMER', 'ACTIVE'), row('B', 'CUSTOMER', 'DORMANT'), row('C', 'SUPPLIER', 'ACTIVE')]
  it('a line and a fresh reading with the same counts differ in nothing', () => {
    expect(countDifferences(weeklyLine(rows, [], week), weeklyLine(rows, [], week))).toEqual([])
  })
  it('a line that counts one customer too many is named by the count that is wrong', () => {
    const more = [...rows, row('D', 'CUSTOMER', 'ACTIVE')]
    expect(countDifferences(weeklyLine(more, [], week), weeklyLine(rows, [], week))).toEqual([
      'customers: the line says 3, the record says 2', 'customers active: the line says 2, the record says 1',
    ])
  })
  it('text that is not a census line has no counts to compare', () => {
    expect(countDifferences('Drafted one chase', weeklyLine(rows, [], week))).toBeNull()
  })
})
