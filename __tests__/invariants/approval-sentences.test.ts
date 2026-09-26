/**
 * What an approver is told the moment they sign.
 *
 * The route answered "Approved. 1 further approval(s) required." — a
 * printf with the plural left to the reader. The person who just signed
 * a $1.3m requisition wants one fact from that line: is anything still
 * holding it up. A bracketed plural says the system did not bother to
 * work out which of the two cases they are in.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { approvalsToGo, countInWords, upperFirst } from '@/app/api/requisitions/words'

const APPROVE_ROUTE = readFileSync(
  join(process.cwd(), 'src/app/api/requisitions/[id]/approve/route.ts'), 'utf8'
)
const code = APPROVE_ROUTE.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')

describe('An approver is told what is left of the chain, in English', () => {

  it('one approval still to go reads "One more approval to go."', () => {
    expect(approvalsToGo(1)).toBe('One more approval to go.')
  })

  it('two approvals still to go are counted in words, not in digits', () => {
    expect(approvalsToGo(2)).toBe('Two more approvals to go.')
  })

  it('a chain with nothing left says the role is open to the suppliers', () => {
    expect(approvalsToGo(0)).toBe('Nothing further is needed — it is open to your suppliers.')
  })

  it('a count past twelve is printed as a figure, the way a newspaper would', () => {
    expect(approvalsToGo(17)).toBe('17 more approvals to go.')
    expect(countInWords(12)).toBe('twelve')
    expect(countInWords(13)).toBe('13')
  })

  it('a sentence starts with a capital letter, wherever the count came from', () => {
    expect(upperFirst(countInWords(3))).toBe('Three')
    expect(approvalsToGo(3).startsWith('Three')).toBe(true)
  })

  it('a negative or missing count is treated as nothing left rather than printed', () => {
    expect(approvalsToGo(-1)).toBe('Nothing further is needed — it is open to your suppliers.')
    expect(approvalsToGo(NaN)).toBe('Nothing further is needed — it is open to your suppliers.')
  })

  it('no screen or letter says "approval(s)" any more', () => {
    expect(code).not.toContain('approval(s)')
  })

  it('both the answer to the approver and the letter to whoever raised it use the one sentence', () => {
    expect(code.match(/approvalsToGo\(result\.remaining\)/g) ?? []).toHaveLength(2)
  })
})
