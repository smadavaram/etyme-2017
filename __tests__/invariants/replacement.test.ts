import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { mayReplace } from '@/lib/replacement'

/**
 * Somebody else in the seat. A replacement is a new contract on the
 * same terms; the old one ends the day before, and hours, invoices and
 * tenure stay with whoever earned them.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const d = (s: string) => new Date(`${s}T00:00:00Z`)
const ok = {
  state: 'IN_PROGRESS', startDate: d('2026-06-01'), endDate: d('2026-12-31'), from: d('2026-09-15'), now: d('2026-09-14'),
  outgoingName: 'Tariq Al-Amin', incomingName: 'Mei-Lin Chao', samePerson: false, incomingOnBench: true,
}

describe('who may take over, and when', () => {
  it('a running contract, somebody on the bench, a date inside the term: the old one ends the day before', () => {
    const v = mayReplace(ok)
    expect(v.ok).toBe(true)
    if (v.ok) {
      expect(v.endsOn.toISOString().slice(0, 10)).toBe('2026-09-14')
      expect(v.says).toBe("Mei-Lin Chao takes over from Tariq Al-Amin on 2026-09-15. Tariq Al-Amin's contract ends the day before; the client has been told.")
    }
  })
  it('a contract that is not running has nobody to replace', () => {
    expect(mayReplace({ ...ok, state: 'ENDED' })).toMatchObject({ ok: false, code: 'NOT_RUNNING' })
  })
  it('the same person is already there', () => {
    expect(mayReplace({ ...ok, samePerson: true })).toMatchObject({ ok: false, code: 'SAME_PERSON' })
  })
  it('somebody not on the bench cannot be put in — consent first', () => {
    expect(mayReplace({ ...ok, incomingOnBench: false })).toMatchObject({ ok: false, code: 'NOT_ON_BENCH' })
  })
  it('two weeks back at most; hours already signed belong to whoever worked them', () => {
    expect(mayReplace({ ...ok, from: d('2026-08-01') })).toMatchObject({ ok: false, code: 'TOO_FAR_BACK' })
  })
  it('the date has to fall inside the contract', () => {
    expect(mayReplace({ ...ok, from: d('2027-01-15'), now: d('2027-01-14') })).toMatchObject({ ok: false, code: 'OUTSIDE_TERM' })
  })
})

describe('the route keeps the history where it belongs', () => {
  const route = read('src/app/api/placements/[id]/replace/route.ts')
  it('ends the old sell contract the day before and creates a new one on the same terms', () => {
    expect(route).toContain("await tx.sellContract.update({ where: { id: old.id }, data: { state: 'ENDED', endDate: verdict.endsOn } })")
    expect(route).toContain('billRate: old.billRate,')
    expect(route).toContain('purchaseOrderId: old.purchaseOrderId,')
  })
  it('marks the old candidate REPLACED, the new one ACTIVE, and links the buy contract to the new sell contract', () => {
    expect(route).toContain("data: { state: 'REPLACED', endDate: verdict.endsOn }")
    expect(route).toContain("update: { state: 'ACTIVE'")
    expect(route).toContain('await tx.contractLink.create({ data: { sellContractId: next.id, buyContractId: bc.id')
  })
  it('only the supplier may do it, and the client hears who is in the seat now', () => {
    expect(route).toContain("if (!old || old.companyId !== caller.company!.id)")
    expect(route).toContain('`${incoming.name} takes over from ${old.person.name}`')
  })
})
