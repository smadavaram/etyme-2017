import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  topDown, signersOf, turnOf, tellNext, signedBy, weekSays, workerToldSays, acceptsOnlyForItself, standsAsAcceptanceSays,
  type LadderRung, type Signer,
} from '@/app/api/timesheets/chain-turn'

/**
 * The signed week travels down the chain, and each rung accepts it in
 * turn. Founder, 2026-09-28.
 *
 * Northbend Athletic ← Computer Systems ← Techpeple, Helena Marsh. Before
 * this, the week carried two signatures: Computer Systems — which pays
 * Techpeple for every hour — had no step and was refused, and Techpeple
 * could accept before Northbend had signed.
 */

// Bottom first, the way the ladder walk returns it.
const TECHPEPLE_RUNG: LadderRung = {
  sellContractId: 'techpeple-rung', companyId: 'techpeple', clientCompanyId: 'cs',
  endClientCompanyId: 'northbend', supplierSellContractId: null,
}
const CS_RUNG: LadderRung = {
  sellContractId: 'cs-rung', companyId: 'cs', clientCompanyId: 'northbend',
  endClientCompanyId: null, supplierSellContractId: 'techpeple-rung',
}
const NAMES: Record<string, string> = {
  northbend: 'Northbend Athletic', cs: 'Computer Systems Inc', techpeple: 'Techpeple',
}
const nameOf = (id: string) => NAMES[id] ?? id

const signers = signersOf(topDown([CS_RUNG, TECHPEPLE_RUNG]))
const upTo = (n: number) => (s: Signer) => signers.indexOf(s) < n

describe('the order a week is signed in', () => {
  it('the client signs first, then each firm down the chain accepts what it pays, the employer last', () => {
    expect(signers.map((s) => `${s.companyId}:${s.role}`)).toEqual([
      'northbend:CLIENT_APPROVAL',
      'cs:PASS_THROUGH',
      'techpeple:EMPLOYER_ACCEPTANCE',
    ])
  })

  it('the firm in the middle accepts on the contract it pays — the one with the firm below it', () => {
    expect(signers[1].rungId).toBe('techpeple-rung')
    expect(signers[2].rungId).toBe('techpeple-rung')
    expect(signers[0].rungId).toBe('cs-rung')
  })

  it('a chain of four firms is read from the top, whichever order its rungs arrive in', () => {
    const sub: LadderRung = { sellContractId: 'sub', companyId: 'sub', clientCompanyId: 'mid', supplierSellContractId: null }
    const mid: LadderRung = { sellContractId: 'mid', companyId: 'mid', clientCompanyId: 'prime', supplierSellContractId: 'sub' }
    const prime: LadderRung = { sellContractId: 'prime', companyId: 'prime', clientCompanyId: 'client', supplierSellContractId: 'mid' }
    expect(signersOf(topDown([mid, sub, prime])).map((s) => `${s.companyId}:${s.role}`)).toEqual([
      'client:CLIENT_APPROVAL', 'prime:PASS_THROUGH', 'mid:PASS_THROUGH', 'sub:EMPLOYER_ACCEPTANCE',
    ])
  })

  it('a direct placement is the client and the employer and nobody between them', () => {
    const direct = signersOf(topDown([{ ...TECHPEPLE_RUNG, clientCompanyId: 'northbend', endClientCompanyId: null }]))
    expect(direct.map((s) => s.role)).toEqual(['CLIENT_APPROVAL', 'EMPLOYER_ACCEPTANCE'])
  })
})

describe('no rung accepts before the rung above it has signed', () => {
  it('the firm in the middle cannot accept before the client has signed, and is told who it is waiting on', () => {
    const t = turnOf(signers, 'cs', upTo(0), nameOf)
    expect(t).toEqual({ ok: false, code: 'NOT_YOUR_TURN', says: 'Northbend Athletic has not signed this week yet. It comes to you once they have.' })
  })

  it('the employer cannot accept before the firm above it has accepted, even once the client has signed', () => {
    const t = turnOf(signers, 'techpeple', upTo(1), nameOf)
    expect(t).toEqual({ ok: false, code: 'NOT_YOUR_TURN', says: 'Computer Systems Inc has not accepted this week yet. It comes to you once they have.' })
  })

  it('once the client has signed, it is the firm in the middle’s turn, and the employer is next', () => {
    const t = turnOf(signers, 'cs', upTo(1), nameOf)
    expect(t.ok).toBe(true)
    if (t.ok) {
      expect(t.signer.role).toBe('PASS_THROUGH')
      expect(t.next?.companyId).toBe('techpeple')
    }
  })

  it('the employer accepts last, and nobody is next', () => {
    const t = turnOf(signers, 'techpeple', upTo(2), nameOf)
    expect(t.ok && t.next).toBeNull()
  })

  it('a firm that has already signed is told so, and a firm off the chain signs nothing', () => {
    expect(turnOf(signers, 'cs', upTo(2), nameOf)).toMatchObject({ ok: false, code: 'ALREADY_SIGNED', says: 'Already accepted.' })
    expect(turnOf(signers, 'northbend', upTo(1), nameOf)).toMatchObject({ ok: false, says: 'Already approved.' })
    expect(turnOf(signers, 'rival', upTo(0), nameOf)).toMatchObject({ ok: false, code: 'NOT_ON_CHAIN' })
  })
})

describe('every rung accepts the same week', () => {
  it('a client’s or employer’s signature written before the ledger existed still counts, and the middle firm’s is the ledger’s alone', () => {
    const week = { clientApprovedAt: new Date(), employerAcceptedAt: null }
    expect(signedBy(signers[0], week, [])).toBe(true)
    expect(signedBy(signers[1], week, [])).toBe(false)
    expect(signedBy(signers[1], week, [{ companyId: 'cs', role: 'PASS_THROUGH' }])).toBe(true)
    // Another firm's pass-through is not this one's.
    expect(signedBy(signers[1], week, [{ companyId: 'techpeple', role: 'PASS_THROUGH' }])).toBe(false)
  })

  it('the approve route signs the one week in its turn and writes the middle firm’s acceptance as a pass-through on the ledger', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/timesheets/[id]/approve/route.ts'), 'utf8')
    expect(route).toMatch(/turnOf\(signers, onBehalfOf/)
    expect(route).toMatch(/asParty === 'PASS' \? 'PASS_THROUGH'/)
    expect(route).not.toMatch(/timesheet\.create/)
  })
})

describe('each rung is told when the week reaches it', () => {
  it('the firm in the middle is told the client signed, and to accept what it pays the firm below — with no rate', () => {
    const said = tellNext({
      personName: 'Helena Marsh', period: '2026-09-17 – 2026-09-23', hours: 40,
      signedBy: 'Northbend Athletic', signedRole: 'CLIENT_APPROVAL', paysName: 'Techpeple',
    })
    expect(said.title).toBe('Helena Marsh’s week of Sep 17–23 is yours to accept')
    expect(said.body).toBe(
      'Northbend Athletic signed 40 hours for the week of Sep 17–23. Accept what you pay Techpeple for it; ' +
      'nobody below you pays on this week until you do.'
    )
    expect(said.body).not.toMatch(/\$/)
  })

  it('the employer is told the firm above it accepted, and to accept what it pays the worker', () => {
    const said = tellNext({
      personName: 'Helena Marsh', period: '2026-09-17 – 2026-09-23', hours: 40,
      signedBy: 'Computer Systems Inc', signedRole: 'PASS_THROUGH', paysName: 'Helena Marsh',
    })
    expect(said.body).toMatch(/^Computer Systems Inc accepted 40 hours/)
    expect(said.body).toContain('Accept what you pay Helena Marsh for it')
  })

  it('the approve route tells the next rung’s desk by email, and the decisions queue puts the week on it only in its turn', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/timesheets/[id]/approve/route.ts'), 'utf8')
    expect(route).toMatch(/if \(nextSigner\) \{[\s\S]*?channel: 'EMAIL'/)
    const queue = readFileSync(join(process.cwd(), 'src/app/api/decisions/route.ts'), 'utf8')
    expect(queue).toMatch(/weekTurns\(employerSide, companyId\)/)
    expect(queue).toMatch(/t\.turn\.signer\.role === 'PASS_THROUGH'/)
  })
})

describe('each notice about a week names the week and the person (simulation, 2026-10-20)', () => {
  it('a week is named the way a person names it: “Oct 11–17” inside a month, “Sep 27 – Oct 3” across two, and both years across one', () => {
    expect(weekSays('2026-10-11', '2026-10-17')).toBe('Oct 11–17')
    expect(weekSays(new Date('2026-09-27T00:00:00Z'), new Date('2026-10-03T00:00:00Z'))).toBe('Sep 27 – Oct 3')
    expect(weekSays('2026-12-27', '2027-01-02')).toBe('Dec 27, 2026 – Jan 2, 2027')
  })

  it('the next rung is told whose week and which week waits for it, never only “X’s week is yours to accept”', () => {
    const said = tellNext({
      personName: 'Tomasz Nowak', period: weekSays('2026-07-26', '2026-08-01'), hours: 40,
      signedBy: 'Cavanaugh Glassworks', signedRole: 'CLIENT_APPROVAL', paysName: 'Tomasz Nowak',
    })
    expect(said.title).toBe('Tomasz Nowak’s week of Jul 26 – Aug 1 is yours to accept')
    expect(said.body).toContain('for the week of Jul 26 – Aug 1')
  })

  it('the worker is told once, when the top of the chain signs, with the week named — never “Timesheet approved” once per rung', () => {
    const told = workerToldSays({ week: 'Sep 20–26', hours: 40, signedBy: 'Northbend Athletic' })
    expect(told.title).toBe('Your week of Sep 20–26 is approved')
    expect(told.body).toBe('Northbend Athletic approved your 40 hours for the week of Sep 20–26.')
    const route = readFileSync(join(process.cwd(), 'src/app/api/timesheets/[id]/approve/route.ts'), 'utf8')
    expect(route).not.toContain("title: 'Timesheet approved'")
    expect(route).toMatch(/if \(!belowTop\) \{\s*const told = workerToldSays/)
  })
})

describe('a one-person firm is never asked to accept its own worker’s week', () => {
  it('where every seat at the firm that may accept hours is the worker’s own, the firm accepts only for itself', () => {
    expect(acceptsOnlyForItself([{ personId: 'colleen' }], 'colleen')).toBe(true)
    expect(acceptsOnlyForItself([{ personId: 'colleen' }, { personId: 'colleen' }], 'colleen')).toBe(true)
  })

  it('where anybody else at the firm may accept hours, they are asked as at any firm, and a firm nobody can sign for is not treated as hers', () => {
    expect(acceptsOnlyForItself([{ personId: 'colleen' }, { personId: 'bookkeeper' }], 'colleen')).toBe(false)
    expect(acceptsOnlyForItself([{ personId: 'bookkeeper' }], 'colleen')).toBe(false)
    expect(acceptsOnlyForItself([], 'colleen')).toBe(false)
  })

  it('the signature of the firm above stands as her firm’s acceptance, and the ledger says why in a sentence', () => {
    expect(standsAsAcceptanceSays({ signedBy: 'Harlow Health', firmName: 'Byrne Critical Care LLC', personName: 'Colleen Byrne' })).toBe(
      'Byrne Critical Care LLC is Colleen Byrne’s own firm, and nobody accepts their own week, ' +
        'so Harlow Health’s signature stands as Byrne Critical Care LLC’s acceptance.'
    )
  })

  it('the approve route writes that acceptance automatically, logs it as done unprompted and reversible, and tells nobody to accept', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/timesheets/[id]/approve/route.ts'), 'utf8')
    expect(route).toMatch(/acceptsOnlyForItself\(acceptors, timesheet\.personId\)/)
    expect(route).toMatch(/auto: true,\s*note: standsAs/)
    expect(route).toMatch(/action: 'TIMESHEET_ACCEPTED_ON_SIGNATURE_ABOVE'[\s\S]*?reversible: true/)
    expect(route).toMatch(/nextSigner = null/)
  })

  it('the queue never offers a person their own week, so a one-person firm’s owner is never shown one to accept', () => {
    const queue = readFileSync(join(process.cwd(), 'src/app/api/decisions/route.ts'), 'utf8')
    expect(queue.match(/personId: \{ not: caller\.person\.id \}/g)?.length).toBe(2)
  })
})
