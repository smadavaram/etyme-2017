/**
 * The accept-down-the-chain station never presses a one-person firm's own
 * acceptance as her.
 *
 * The founder-scale run (2026-11-01): the station chose the one-person
 * firm's owner, who is the worker, to accept her own week, and was refused
 * "Nobody approves their own hours" 696 times. The rule since 2026-10-20:
 * her week waits on the firm above her, and that firm's signature stands in
 * for her firm's acceptance, written by the approve route itself.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const src = readFileSync(join(process.cwd(), 'scripts/simulate/stages/money/accept-down-the-chain.ts'), 'utf8')
const solo = src.slice(src.indexOf('if (!seat) {'), src.indexOf('const body: Record<string, unknown> = {}'))

describe('a one-person firm is never asked to accept her own week, in the simulation as on the screens', () => {
  it('at a firm where the only seat that accepts is the worker’s own, the station presses nothing as her', () => {
    expect(solo).not.toMatch(/own\.post\(/)
  })

  it('it reads the acceptance the signature above wrote for her firm off the record, through the read-only connection', () => {
    expect(solo).toMatch(/ctx\.read\.workAssertion\.findFirst\(\{\s*where: \{ timesheetId: w\.id, companyId: rung\.sellerId, state: 'LIVE' \}/)
  })

  it('a week where the signature above wrote nothing for her is reported as a money fault, never pressed', () => {
    expect(src).toMatch(/A money fault: at a one-person firm the signature above wrote no acceptance for her/)
  })
})
