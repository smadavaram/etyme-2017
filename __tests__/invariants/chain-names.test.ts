import { describe, it, expect } from 'vitest'
import { mayNameSubVendors, nameForClient, namesForClient } from '@/lib/chain-names'

/**
 * Whose name a client may read, in a chain.
 *
 * `chain-top.test.ts` holds the same rule for rates. This is the names
 * half: the NDA between a prime and its sub is what stops the sub going
 * round the prime to reach the client, so the client sees the rung it
 * pays and nothing below it — unless its own agreement with the prime
 * says otherwise. What it always sees is the standing of whoever employs
 * the person on its site, and nothing here touches that.
 */

const rung = (id: string, personId: string, companyId: string, companyName: string, clientCompanyId: string) =>
  ({ id, personId, companyId, companyName, clientCompanyId })

// Nike buys Helena from Computer Systems, who buys her from CloudEPA.
const CHAIN = [
  rung('sub', 'helena', 'cloudepa', 'CloudEPA', 'computer-systems'),
  rung('top', 'helena', 'computer-systems', 'Computer Systems Inc', 'nike'),
]

const never = () => false
const always = () => true

const term = (clientId: string, vendorId: string, disclosesSubVendors: boolean, status = 'ACTIVE') =>
  ({ clientId, vendorId, disclosesSubVendors, status })

describe('whose name a client may read in a chain', () => {
  it('a client sees the name of the firm it pays', () => {
    const seen = nameForClient(CHAIN[1], CHAIN, 'nike', never)
    expect(seen.name).toBe('Computer Systems Inc')
    expect(seen.masked).toBe(false)
  })

  it('a client does not see the name of the firm below the one it pays', () => {
    const seen = nameForClient(CHAIN[0], CHAIN, 'nike', never)
    expect(seen.name).not.toContain('CloudEPA')
    expect(seen.masked).toBe(true)
  })

  it('where a name is withheld the row says which firm it comes through, and is never a blank or a dash', () => {
    const seen = nameForClient(CHAIN[0], CHAIN, 'nike', never)
    expect(seen.name).toBe('Supplied through Computer Systems Inc.')
    expect(seen.through).toBe('Computer Systems Inc')
    expect(seen.name.trim()).not.toBe('')
    expect(seen.name.trim()).not.toBe('—')
  })

  it('a client whose agreement with its supplier requires disclosure sees the sub-vendor by name', () => {
    const terms = [term('nike', 'computer-systems', true)]
    const mayName = (prime: string) => mayNameSubVendors(terms, 'nike', prime)
    const seen = nameForClient(CHAIN[0], CHAIN, 'nike', mayName)
    expect(seen.name).toBe('CloudEPA')
    expect(seen.masked).toBe(false)
    expect(seen.says).toBe('CloudEPA — supplied through Computer Systems Inc.')
  })

  it('disclosure written into one supplier’s agreement does not uncover another supplier’s sub-vendor', () => {
    const terms = [term('nike', 'pinnacle', true)]
    const mayName = (prime: string) => mayNameSubVendors(terms, 'nike', prime)
    expect(nameForClient(CHAIN[0], CHAIN, 'nike', mayName).masked).toBe(true)
  })

  it('a disclosure term another client demanded does not open this client’s chain', () => {
    const terms = [term('adobe', 'computer-systems', true)]
    expect(mayNameSubVendors(terms, 'nike', 'computer-systems')).toBe(false)
  })

  it('an agreement that was terminated or has run out no longer names anybody', () => {
    expect(mayNameSubVendors([term('nike', 'computer-systems', true, 'TERMINATED')], 'nike', 'computer-systems')).toBe(false)
    expect(mayNameSubVendors([term('nike', 'computer-systems', true, 'EXPIRED')], 'nike', 'computer-systems')).toBe(false)
  })

  it('a placement recorded before the paper was signed still honors the term the client demanded', () => {
    expect(mayNameSubVendors([term('nike', 'computer-systems', true, 'DRAFT')], 'nike', 'computer-systems')).toBe(true)
  })

  it('nothing is disclosed where no agreement between the client and the supplier says so', () => {
    expect(mayNameSubVendors([], 'nike', 'computer-systems')).toBe(false)
    expect(mayNameSubVendors([term('nike', 'computer-systems', false)], 'nike', 'computer-systems')).toBe(false)
  })

  it('a firm three rungs down is said to come through the firm the client pays, not the firm above it', () => {
    const deep = [
      rung('bottom', 'helena', 'bench-co', 'Bench Co', 'cloudepa'),
      ...CHAIN,
    ]
    const seen = nameForClient(deep[0], deep, 'nike', never)
    expect(seen.name).toBe('Supplied through Computer Systems Inc.')
  })

  it('a rung whose chain above it is not on file says so rather than guessing at a supplier', () => {
    const orphan = [rung('lost', 'helena', 'cloudepa', 'CloudEPA', 'some-firm-nobody-listed')]
    const seen = nameForClient(orphan[0], orphan, 'nike', never)
    expect(seen.masked).toBe(true)
    expect(seen.name).not.toContain('CloudEPA')
    expect(seen.name).toContain('not on file')
    expect(seen.through).toBeNull()
  })

  it('a firm the client buys from directly keeps its name on every row, even where it also sits below another firm', () => {
    const both = [
      ...CHAIN,
      // Computer Systems also sits under Pinnacle for somebody else.
      rung('under', 'omar', 'computer-systems', 'Computer Systems Inc', 'pinnacle'),
      rung('over', 'omar', 'pinnacle', 'Pinnacle Resourcing', 'nike'),
    ]
    const names = namesForClient(both, 'nike', never)
    expect(names.get('computer-systems')?.name).toBe('Computer Systems Inc')
    expect(names.get('cloudepa')?.masked).toBe(true)
  })

  it('a hidden firm reached through two different suppliers names both, so the client knows who to call', () => {
    const two = [
      ...CHAIN,
      rung('sub2', 'omar', 'cloudepa', 'CloudEPA', 'pinnacle'),
      rung('top2', 'omar', 'pinnacle', 'Pinnacle Resourcing', 'nike'),
    ]
    const names = namesForClient(two, 'nike', never)
    const hidden = names.get('cloudepa')!
    expect(hidden.masked).toBe(true)
    expect(hidden.name).toContain('Computer Systems Inc')
    expect(hidden.name).toContain('Pinnacle Resourcing')
  })

  it('a direct supplier with nobody underneath is named exactly as it always was', () => {
    const direct = [rung('a', 'omar', 'brightmoor', 'Brightmoor Staffing', 'nike')]
    expect(namesForClient(direct, 'nike', never).get('brightmoor')?.name).toBe('Brightmoor Staffing')
  })

  it('a withheld name still reads as English inside a sentence somebody else writes', () => {
    const seen = nameForClient(CHAIN[0], CHAIN, 'nike', never)
    expect(`${seen.phrase} has no current general liability certificate.`).toBe(
      'the firm supplied through Computer Systems Inc has no current general liability certificate.'
    )
  })

  it('withholding a name never withholds the firm it belongs to, so its standing still has a row to sit on', () => {
    const seen = nameForClient(CHAIN[0], CHAIN, 'nike', always)
    const hidden = nameForClient(CHAIN[0], CHAIN, 'nike', never)
    expect(seen.companyId).toBe('cloudepa')
    expect(hidden.companyId).toBe('cloudepa')
  })
})
