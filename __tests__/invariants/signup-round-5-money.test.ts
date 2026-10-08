/**
 * Sign-up walk, round five — money's two problems, as sentences.
 *
 *   6.  Missing paperwork listed Karthik Menon's colleagues by name with
 *       money beside them ("Felix Brenner … Northbend Athletic $21,120").
 *       His seat holds only reads of his own work.
 *   9.  A Member at Northbend read "Everyone working at your sites …
 *       ACTIVE 0 contracts … No contracts yet" while Northbend had six
 *       live lines; Reports drew "No data yet". The route had narrowed
 *       him to the lines naming him and the pages drew that as the
 *       firm's empty book.
 *
 * docs/results/2026-10-08-signup-round-5.md.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ownLinesOnly } from '@/lib/money/own-lines'
import {
  listScope, scopeOf, ownContractsSay, ownLinesRefusal, narrowedReport, OWN_CONTRACTS_SAY,
} from '@/lib/money/own-scope'
import { contractsEmpty } from '@/lib/money/contracts-empty'
import { namesAPermission } from '@/lib/refusal-words'

const ROOT = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

/** Comments quote old strings on purpose; only what ships is checked. */
function whatShips(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

describe('problem 6: Missing paperwork is not read by a seat that reads only its own lines', () => {
  const route = whatShips(read('src/app/api/loose-ends/route.ts'))

  it('a delivery engineer holding only reads of his own work reads only his own lines, so Missing paperwork is not his', () => {
    expect(ownLinesOnly(['assignments.read', 'timesheets.read'])).toBe(true)
  })

  it('a Member with no desk at all reads only their own lines too', () => {
    expect(ownLinesOnly([])).toBe(true)
  })

  it('the Missing paperwork route refuses such a seat before it reads a single placement', () => {
    const refusal = route.indexOf('ownLinesOnly(caller.permissions)')
    const firstRead = route.indexOf('prisma.')
    expect(refusal).toBeGreaterThan(-1)
    expect(refusal).toBeLessThan(firstRead)
  })

  it('the refusal is a sentence that says what the seat does read, and names a desk rather than a permission key', () => {
    const says = ownLinesRefusal({ kind: 'GSI', company: 'Teleworld Solutions' })
    expect(says.startsWith('You read the contract lines that name you, under Your work.')).toBe(true)
    expect(says).toContain('Teleworld Solutions')
    expect(namesAPermission(says), says).toBe(false)
  })

  it('a desk that raises or pays contracts still reads the whole queue', () => {
    expect(ownLinesOnly(['assignments.write'])).toBe(false)
    expect(ownLinesOnly(['invoices.read'])).toBe(false)
    expect(ownLinesOnly(['payroll.read'])).toBe(false)
  })
})

describe('problem 9: a list narrowed to the reader is said to be narrowed, never drawn as the firm’s empty book', () => {
  it('the contracts route says whose lines it answered with: own where it narrowed the reader, the firm’s otherwise', () => {
    expect(listScope(true)).toBe('own')
    expect(listScope(false)).toBe('firm')
    const route = whatShips(read('src/app/api/contracts/route.ts'))
    // Both sides answer it, sell and buy.
    expect(route.match(/scope: listScope\(ownOnly\)/g)?.length).toBe(2)
  })

  it('a page reads a missing or unknown scope as the firm’s list, and only an explicit own as narrowed', () => {
    expect(scopeOf({ data: { scope: 'own' } })).toBe('own')
    expect(scopeOf({ data: { scope: 'firm' } })).toBe('firm')
    expect(scopeOf({ data: {} })).toBe('firm')
    expect(scopeOf(null)).toBe('firm')
  })

  it('a narrowed reader with no lines of their own reads “You see only contracts that name you. None do.”', () => {
    expect(ownContractsSay(0)).toBe('You see only contracts that name you. None do.')
    expect(ownContractsSay(1)).toBe('You see only contracts that name you. One does.')
    expect(ownContractsSay(3)).toBe('You see only contracts that name you. 3 do.')
  })

  it('the Contracts page’s empty state for a narrowed client reader is the narrowed sentence, never “No contracts yet”', () => {
    const empty = contractsEmpty({ kind: 'CLIENT', tab: 'sell', stateFilter: 'all', mayRecord: false, scope: 'own' })
    expect(empty.message).toBe(OWN_CONTRACTS_SAY)
    expect(empty.detail).toBe('None do.')
    expect(`${empty.message} ${empty.detail}`).not.toContain('No contracts yet')
  })

  it('a narrowed supplier reader is never told the firm has nothing on its sell side', () => {
    const empty = contractsEmpty({ kind: 'VENDOR', tab: 'sell', stateFilter: 'all', mayRecord: false, scope: 'own' })
    expect(empty.message).not.toContain('Nothing on the sell side')
    expect(empty.message).toBe(OWN_CONTRACTS_SAY)
  })

  it('an unnarrowed client with an empty book still reads “No contracts yet”', () => {
    const empty = contractsEmpty({ kind: 'CLIENT', tab: 'sell', stateFilter: 'all', mayRecord: false, scope: 'firm' })
    expect(empty.message).toBe('No contracts yet.')
  })

  it('the Contracts page keeps the route’s scope and, when narrowed, draws no tile and not the firm’s heading', () => {
    const page = whatShips(read('src/app/dashboard/contracts/page.tsx'))
    expect(page).toContain('setScope(scopeOf(body))')
    expect(page).toContain("scope === 'own' ? 'Contract lines that name you.' : framing.subtitle")
    expect(page).toContain('{ownEmpty ? null : (<>')
    expect(page).toContain('ownContractsSay(contracts.length)')
  })

  it('Reports for a narrowed reader with no firm figure readable is the sentence alone, never “No data yet”', () => {
    const r = narrowedReport({ scope: 'own', ownLines: 0, readsFirmFigures: false })
    expect(r?.alone).toBe(true)
    expect(r?.says).toBe('Reports add up your firm’s book. You see only contracts that name you. None do.')
    const page = whatShips(read('src/app/dashboard/reports/page.tsx'))
    expect(page.indexOf('data.narrowed?.alone')).toBeGreaterThan(-1)
    expect(page.indexOf('data.narrowed?.alone')).toBeLessThan(page.indexOf('No data yet'))
  })

  it('Reports for a narrowed reader who may read some firm figure draws them and says the contract counts are their own', () => {
    const r = narrowedReport({ scope: 'own', ownLines: 1, readsFirmFigures: true })
    expect(r?.alone).toBe(false)
    expect(r?.says).toContain('only contracts that name you')
  })

  it('Reports for a reader the route did not narrow says nothing extra', () => {
    expect(narrowedReport({ scope: 'firm', ownLines: 0, readsFirmFigures: false })).toBeNull()
  })
})
