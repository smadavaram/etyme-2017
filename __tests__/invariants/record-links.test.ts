import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { isRecordType, readNeeds, ownPageOf, cannotReadSays, PROOF_TYPES } from '@/lib/decision-queue'
import { TENURE_RECORD } from '@/lib/agents/compliance-watch'
import { MATCH_RECORD } from '@/lib/agents/match-ranker'

/**
 * Record 112, chains 1 to 3: a card or a ledger row links only to a kind
 * the record view opens, or the line is not drawn. The kinds each agent
 * names are read off its own `*_RECORD` constant.
 */

const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f)
  return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : []
})

/** Kinds still named by a card or ledger row that the record view does not open. It may only shrink. */
const NOT_YET_OPENABLE = ['Submission', 'Cycle']

describe('records a card or ledger row names', () => {
  const named = new Map<string, string>()
  for (const file of walk(join(process.cwd(), 'src/lib'))) {
    const text = readFileSync(file, 'utf8')
    for (const m of text.matchAll(/export const ([A-Z_]+_RECORD) = '([A-Za-z]+)'/g)) named.set(`${file.split('src/lib/')[1]}:${m[1]}`, m[2])
  }

  it('every record a card or ledger row names is one the record view opens, or the line is not drawn', () => {
    const unopenable = [...named.values()].filter((t) => !isRecordType(t))
    expect([...new Set(unopenable)].sort()).toEqual([...NOT_YET_OPENABLE].sort())
  })

  it('a job is a record the record view opens, read by a seat that reads jobs', () => {
    expect(isRecordType('Requirement')).toBe(true)
    expect(MATCH_RECORD).toBe('Requirement')
    expect(readNeeds('Requirement')).toBe('requirements.read')
    expect(cannotReadSays('Requirement')).toBe('Your seat cannot read jobs.')
    expect(ownPageOf('Requirement', 'r1').href).toBe('/dashboard/requirements/r1')
    expect(PROOF_TYPES.some((p) => p.type === 'Requirement')).toBe(true)
  })

  it('the tenure card is tied to the placement, a contract the record view opens, and not to a kind that does not exist', () => {
    expect(TENURE_RECORD).toBe('SellContract')
    expect(isRecordType(TENURE_RECORD)).toBe(true)
  })

  it('a card draws a line as a link only where the seat reads what it names, and leaves it out elsewhere', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/decision-items/[id]/route.ts'), 'utf8')
    expect(route).toContain('readNeeds(l.recordType)')
    expect(route).toContain('hasPermission(seat.caller.permissions, needs)')
    const page = readFileSync(join(process.cwd(), 'src/app/dashboard/decisions/[id]/page.tsx'), 'utf8')
    expect(page).toContain('filter((l) => l.name)')
  })
})
