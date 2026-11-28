import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  CLEANUP_PHRASE, SEED_CV_TEXT, SEED_CREDIT_NOTE, SEED_MATCH_OVERRIDE, SEED_VISA_FILED_NOTE, SEED_VISA_FILES,
} from '@/lib/seed-cleanup'

/**
 * The markers lib/seed-cleanup deletes by. Each has to be something only
 * a seed wrote, and each has to stay in step with the seed that wrote it.
 */

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : []
  })
}
const SRC = files(join(__dirname, '../../src'))
const read = (rel: string) => readFileSync(join(__dirname, '../../src', rel), 'utf8')

describe('what the cleanup deletes by', () => {
  it("no code outside the seed writes a journal entry, a journal line or a ledger account, which is what makes a seed's entry in a real firm's books recognizable", () => {
    const writes = /\b(journalEntry|journalLine|ledgerAccount)\.(create|createMany|createManyAndReturn|upsert)\b/
    const writers = SRC.filter((f) => writes.test(readFileSync(f, 'utf8'))).map((f) => f.split('/src/')[1])
    // If a product route starts writing the books, a real firm's entry is
    // no longer the seed's by where it sits, and lib/seed-cleanup's
    // journal marker has to be rethought before it is run again.
    expect(writers).toEqual(['lib/seed-order-to-cash.ts'])
  })

  it("the seed's CV is matched whole, and a real CV using the same phrase is not", () => {
    const seeded =
      'Maya Lindqvist\nFreight audit — Toledo, OH\n\nSkills: Freight audit, Rate negotiation\nWork authorization: USC\n\n' +
      'Experience\nContract assignments delivering Freight audit and Rate negotiation work for enterprise clients.\n'
    expect(SEED_CV_TEXT.test(seeded)).toBe(true)
    expect(SEED_CV_TEXT.test('Contract assignments delivering Freight audit work for enterprise clients.\n')).toBe(false)
    expect(SEED_CV_TEXT.test(seeded + 'Led a team of four at Tern Logistics.\n')).toBe(false)
  })

  it('every sentence the cleanup matches on is still the one the seed writes', () => {
    const otc = read('lib/seed-order-to-cash.ts')
    expect(otc).toContain(SEED_CREDIT_NOTE)
    expect(otc).toContain(SEED_MATCH_OVERRIDE.slice(0, 60))
    const standing = read('lib/seed-standing.ts')
    expect(standing).toContain('fileHash: `seed:${v.id}`')
    expect(standing).toContain(SEED_VISA_FILED_NOTE)
    for (const f of SEED_VISA_FILES) expect(standing).toContain(f)
    expect(read('lib/seed-pipeline.ts')).toContain('Contract assignments delivering ${')
  })

  it('the run asks for a typed sentence, not a flag', () => {
    expect(CLEANUP_PHRASE).toBe('delete seed rows outside the demo world')
  })
})
