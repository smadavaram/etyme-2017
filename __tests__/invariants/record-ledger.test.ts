/**
 * The record ledger (2026-11-21 → 107): every act on a record carries
 * three stamps written at the time, and nothing changes a row after.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import * as ledger from '@/lib/record-ledger'
import { stampRefusal } from '@/lib/record-ledger'

const act = { action: 'OPENED', summary: 'Opened a decision.', personId: 'p1', heldAs: 'Accounts' }

describe('the record ledger', () => {
  it('every record action carries the entity, the person and the role she held', () => {
    expect(stampRefusal({ ...act, actingEntityId: 'e1' }, ['e1'])).toBeNull()
    expect(stampRefusal({ ...act, personId: '', actingEntityId: 'e1' }, ['e1'])).toMatch(/person/)
    expect(stampRefusal({ ...act, heldAs: ' ', actingEntityId: 'e1' }, ['e1'])).toMatch(/role or queue/)
  })

  it('a record action cannot name another company’s legal entity', () => {
    expect(stampRefusal({ ...act, actingEntityId: 'someone-elses' }, ['e1'])).toMatch(/not one of this company’s own/)
  })

  it('a company with legal entities must say which one an act is done for', () => {
    expect(stampRefusal({ ...act, actingEntityId: null }, ['e1'])).toMatch(/Choose which one/)
  })

  it('a company with no legal entity writes an act with no entity', () => {
    expect(stampRefusal({ ...act, actingEntityId: null }, [])).toBeNull()
  })

  it('the ledger offers no way to change or remove a row', () => {
    const names = Object.keys(ledger)
    expect(names.filter((n) => /update|delete|remove|edit|change|upsert/i.test(n))).toEqual([])
    const src = readFileSync(join(process.cwd(), 'src/lib/record-ledger.ts'), 'utf8')
    expect(src).not.toMatch(/recordAction\.(update|updateMany|delete|deleteMany|upsert)/)
  })

  it('nothing in the app changes or removes a ledger row', () => {
    const { execSync } = require('child_process')
    const hits = execSync("grep -rlE 'recordAction\\.(update|updateMany|delete|deleteMany|upsert)' src || true", { encoding: 'utf8' }).trim()
    expect(hits).toBe('')
  })
})
