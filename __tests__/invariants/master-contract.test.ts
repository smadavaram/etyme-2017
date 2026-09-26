import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  mayTag,
  masterContractOn,
  nextMasterContractCode,
} from '@/lib/money/master-contract'
import { MASTER_CONTRACT_WORD } from '@/lib/order-naming'

/**
 * The master contract is the company's tag, not the system's grouping.
 *
 * The founder: *"now we are splitting them and letting companies tag
 * them to master contract if they want to see contract profitability."*
 *
 * `orderFor` groups lines by engagement so that every posting settles
 * somewhere without anybody configuring anything. What the company may
 * do is override that — and the override beats the default, because a
 * default is what nobody said.
 */

const US = 'co-veritan'
const THEM = 'co-pinnacle'

const LINE = { id: 'sc-1', companyId: US, currency: 'USD', projectOrderId: null }

const MASTER = {
  id: 'prj-7',
  code: 'PRJ-0042',
  name: 'Northbend platform rebuild',
  status: 'OPEN',
  currency: 'USD',
  companyId: US,
}

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('a line shows the master contract it is on, or the invitation to tag it', () => {
  it('a tagged line names the master contract it rolls up to', () => {
    const on = masterContractOn({ tag: { code: 'PRJ-0042', name: 'Northbend platform rebuild' } })
    expect(on.tagged).toBe(true)
    expect(on.says).toBe('Master contract PRJ-0042 — Northbend platform rebuild.')
    expect(on.byDefault).toBeNull()
  })

  it('an untagged line is offered one rather than warned about it, and nothing is tagged for it', () => {
    const on = masterContractOn({ tag: null, engagementTitle: 'Northbend platform rebuild' })
    expect(on.tagged).toBe(false)
    expect(on.says).toContain('Not on a master contract')
    expect(on.says).not.toMatch(/must|required|missing|error/i)
  })

  it('an untagged line says where its money goes meanwhile, because “not tagged” is not “not counted”', () => {
    const on = masterContractOn({ tag: null, engagementTitle: 'Northbend platform rebuild' })
    expect(on.byDefault).toBe('Until then it rolls up with the rest of Northbend platform rebuild.')
    const alone = masterContractOn({ tag: null })
    expect(alone.byDefault).toBe('Until then it rolls up on its own.')
  })

  it('the word on the screen is the trade’s own, and never the row’s name', () => {
    expect(MASTER_CONTRACT_WORD.noun).toBe('master contract')
    const on = masterContractOn({ tag: null })
    expect(`${on.says} ${on.byDefault}`.toLowerCase()).not.toContain('project order')
  })
})

describe('the company’s tag beats the default grouping', () => {
  it('a company may move its own line onto its own open master contract', () => {
    const v = mayTag({ by: { companyId: US }, line: LINE, master: MASTER })
    expect(v.ok).toBe(true)
    expect(v.says).toContain('PRJ-0042')
    expect(v.says).toContain('roll up there from now on')
  })

  it('the grouping the system chose is used only until a company says otherwise', () => {
    // `orderFor` returns the tag first and derives a bucket second. The
    // tag is therefore the answer whenever there is one, which is what
    // "the company's tag beats the default" means in the ledger.
    const src = read('src/lib/order-postings.ts')
    expect(src).toContain('if (sell.projectOrderId) return sell.projectOrderId')
  })

  it('taking a line off its master contract is allowed, and it falls back rather than breaking', () => {
    const v = mayTag({ by: { companyId: US }, line: { ...LINE, projectOrderId: 'prj-7' }, master: null })
    expect(v.ok).toBe(true)
    expect(v.says).toContain('groups with its engagement again')
  })

  it('moving a line never restates what it has already posted, and says so', () => {
    const on = mayTag({ by: { companyId: US }, line: LINE, master: MASTER })
    expect(on.note).toContain('stays where it posted')
    const off = mayTag({ by: { companyId: US }, line: LINE, master: null })
    expect(off.note).toContain('Nothing is restated')
  })

  it('a line in one currency on a master contract totalling in another says what will be converted', () => {
    const v = mayTag({
      by: { companyId: US },
      line: { ...LINE, currency: 'GBP' },
      master: MASTER,
    })
    expect(v.ok).toBe(true)
    expect(v.note).toContain('GBP')
    expect(v.note).toContain('USD')
    expect(v.note).toContain('converted on the day')
  })
})

describe('a master contract is one company’s, and a closed one takes nothing more', () => {
  it('a firm cannot tag another firm’s line', () => {
    const v = mayTag({ by: { companyId: THEM }, line: LINE, master: { ...MASTER, companyId: THEM } })
    expect(v.ok).toBe(false)
    expect(v.code).toBe('LINE_NOT_YOURS')
    expect(v.says).toContain("another firm's to code")
  })

  it('a firm cannot put its line on another firm’s master contract', () => {
    const v = mayTag({ by: { companyId: US }, line: LINE, master: { ...MASTER, companyId: THEM } })
    expect(v.ok).toBe(false)
    expect(v.code).toBe('MASTER_NOT_YOURS')
  })

  it('a settled master contract refuses the line in a sentence, because its balance has been reported', () => {
    const v = mayTag({ by: { companyId: US }, line: LINE, master: { ...MASTER, status: 'SETTLED' } })
    expect(v.ok).toBe(false)
    expect(v.code).toBe('MASTER_CLOSED')
    expect(v.says).toContain('has been reported')
    expect(v.says).toContain('tag this line to an open master contract instead')
  })

  it('a master contract that does not exist is said out loud rather than quietly untagging the line', () => {
    const v = mayTag({ by: { companyId: US }, line: LINE, master: null, masterMissing: true })
    expect(v.ok).toBe(false)
    expect(v.code).toBe('NO_SUCH_MASTER')
  })
})

describe('naming one', () => {
  it('a company opening its first master contract does not have to invent a numbering scheme', () => {
    expect(nextMasterContractCode([])).toBe('PRJ-0001')
    expect(nextMasterContractCode(['PRJ-0001'])).toBe('PRJ-0002')
  })

  it('a code already taken is stepped past rather than reused, because a code is on an export', () => {
    expect(nextMasterContractCode(['PRJ-0001', 'PRJ-0002', 'IO-PRJ-ABCD1234'])).toBe('PRJ-0003')
    // A gap left by something renamed is stepped past rather than
    // filled: a code a finance team has already reconciled against must
    // not come back on a different deal.
    expect(nextMasterContractCode(['PRJ-0002'])).toBe('PRJ-0003')
  })
})
