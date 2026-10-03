import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { awardDoor, AWARDABLE_FROM, type AwardDoorFacts } from '@/lib/award'
import { placeFromRound } from '@/lib/interviews'
import { noticesFor, type NoticeContext } from '@/lib/interview-notices'

/**
 * From "Make an offer" to a placement, on the interview page.
 *
 * The interview page let a client make an offer and then offered no way
 * to place the candidate: the submission sat at OFFERED and the only
 * road on was a page the client had not opened. The award is the one
 * road to placed (`lib/award`, demand's), so this page offers the same
 * award — only where `awardDoor` would accept the click, through the
 * same route, and to anybody it would refuse, the rule's own sentence.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const PAGE = read('src/app/dashboard/interviews/page.tsx')
const DIALOG = read('src/app/dashboard/interviews/place-dialog.tsx')
const LIST = read('src/app/api/interviews/route.ts')

const base: AwardDoorFacts = {
  callerCompanyId: 'northbend',
  callerCompanyName: 'Northbend Athletic',
  mayHire: true,
  requirementCompanyId: 'northbend',
  fromCompanyId: 'pinnacle',
  fromCompanyName: 'Pinnacle Resourcing',
  toCompanyId: 'northbend',
  toCompanyName: 'Northbend Athletic',
  personName: 'Wren Castellano',
  status: 'OFFERED',
  contractId: null,
}

/** What the interview row offers, asked exactly as the list route asks it. */
const rowFor = (f: AwardDoorFacts, outcome: string | null = 'OFFER') => {
  const door = awardDoor(f)
  return placeFromRound({
    outcome,
    personName: f.personName,
    contractId: f.contractId,
    award: { open: door.open, says: door.says },
  })
}

describe('a round that ends in an offer leads to the award', () => {
  it('the hiring manager reads Place on the offered round, in the award’s own words', () => {
    const move = rowFor(base)
    expect(move.kind).toBe('PLACE')
    expect(move.kind === 'PLACE' && move.says).toBe(
      'Place Wren Castellano: this writes the contract, the order and the billing dates in one step.'
    )
  })

  it('the interview page never offers Place where the award would refuse it', () => {
    // Every reader and every standing the award distinguishes. For each,
    // the row offers Place exactly when the award is open — never a
    // button the click would be refused on, never a refusal where the
    // award would have said yes.
    const callers: Partial<AwardDoorFacts>[] = [
      {},
      { callerCompanyId: 'pinnacle', callerCompanyName: 'Pinnacle Resourcing' },
      { callerCompanyId: 'brightmoor', callerCompanyName: 'Brightmoor Staffing' },
      { callerCompanyId: null, callerCompanyName: null },
    ]
    const statuses = [...AWARDABLE_FROM, 'PLACED', 'REJECTED', 'WITHDRAWN', 'NOT_SELECTED']
    let checked = 0
    for (const caller of callers) {
      for (const mayHire of [true, false]) {
        for (const status of statuses) {
          const f = { ...base, ...caller, mayHire, status, contractId: null }
          const move = rowFor(f)
          expect(move.kind === 'PLACE', `${JSON.stringify(caller)} ${mayHire} ${status}`).toBe(awardDoor(f).open)
          checked++
        }
      }
    }
    expect(checked).toBeGreaterThan(40)
  })

  it('somebody at the client who is not hiring reads the rule’s sentence instead of a button', () => {
    const move = rowFor({ ...base, mayHire: false })
    expect(move.kind).toBe('SAID')
    expect(move.kind === 'SAID' && move.says).toContain('Ask them to award Wren Castellano.')
  })

  it('the supplier reading its own candidate’s offer is told the client decides, and is offered no Place', () => {
    const move = rowFor({ ...base, callerCompanyId: 'pinnacle', callerCompanyName: 'Pinnacle Resourcing' })
    expect(move).toEqual({
      kind: 'SAID',
      says: 'A supplier never awards its own candidate. Northbend Athletic decides whether Wren Castellano is placed.',
    })
  })

  it('a candidate withdrawn after the offer is out of the running, and the row says so without a button', () => {
    const move = rowFor({ ...base, status: 'WITHDRAWN' })
    expect(move).toEqual({ kind: 'SAID', says: 'Wren Castellano was withdrawn, so there is no position to award them.' })
  })

  it('a candidate already placed leads to the placement for every reader, and is never offered Place twice', () => {
    for (const caller of [{}, { callerCompanyId: 'pinnacle' }]) {
      const move = rowFor({ ...base, ...caller, status: 'PLACED', contractId: 'sc-1' })
      expect(move).toEqual({ kind: 'PLACED', says: 'Wren Castellano is placed.', contractId: 'sc-1' })
    }
  })

  it('a round that went through or was turned down offers nothing to place', () => {
    expect(rowFor(base, 'ADVANCE').kind).toBe('NONE')
    expect(rowFor(base, 'REJECT').kind).toBe('NONE')
    expect(rowFor(base, null).kind).toBe('NONE')
  })

  it('an offer the award rule was not asked about offers nothing, rather than a button that may be refused', () => {
    expect(placeFromRound({ outcome: 'OFFER', personName: 'Wren', contractId: null, award: null }).kind).toBe('NONE')
  })
})

describe('the page takes the one road', () => {
  it('the list of rounds asks the award rule, the same function the award route refuses on', () => {
    expect(LIST).toContain("import { awardDoor } from '@/lib/award'")
    expect(LIST).toMatch(/awardDoor\(\{/)
    expect(LIST).toMatch(/place: \(\(\) =>/)
  })

  it('the interview page draws Place only where the route said the award is open', () => {
    // The button sits under exactly one condition, and it is the route's.
    const buttons = PAGE.match(/setPlacingFor\(r\)/g) ?? []
    expect(buttons).toHaveLength(1)
    const guard = PAGE.slice(PAGE.lastIndexOf('{r.place?.kind', PAGE.indexOf('setPlacingFor(r)')), PAGE.indexOf('setPlacingFor(r)'))
    expect(guard.startsWith("{r.place?.kind === 'PLACE'")).toBe(true)
    // It does not decide on its own permission check.
    expect(guard).not.toContain('mayDecide')
  })

  it('placing from the interview page posts to the award and never changes the status by hand', () => {
    expect(DIALOG).toContain('/api/submissions/${submissionId}/award')
    for (const src of [PAGE, DIALOG]) {
      expect(src).not.toMatch(/\/status`/)
      expect(src).not.toMatch(/status: 'PLACED'/)
    }
  })

  it('placing asks for the bill rate and the start date, and sends the rate in cents', () => {
    expect(DIALOG).toContain('Bill rate ($/hr)')
    expect(DIALOG).toContain('Start date')
    expect(DIALOG).toContain('rate: Math.round(rate * 100)')
  })
})

describe('what the supplier and the candidate are told at the offer', () => {
  const ctx: NoticeContext = {
    interviewId: 'iv1',
    submissionId: 'sub1',
    round: 2,
    stage: 'Panel',
    role: 'Supply planning analyst',
    consultant: { id: 'p-wren', name: 'Wren Castellano' },
    client: { id: 'northbend', name: 'Northbend Athletic' },
    vendor: { id: 'pinnacle', name: 'Pinnacle Resourcing' },
    requesterId: 'p-dana',
    vendorStaffIds: ['p-recruiter'],
    slotCount: 1,
    when: null,
    reason: null,
    noShowBy: null,
    timezone: 'UTC',
  }
  const offer = noticesFor('OFFERED', ctx)

  it('the supplier is told the candidate is placed when the client awards the position', () => {
    const n = offer.find((x) => x.personId === 'p-recruiter')!
    expect(n.title).toBe('Northbend Athletic is making Wren Castellano an offer')
    expect(n.body).toBe(
      'After round 2 for Supply planning analyst. Wren is placed when Northbend Athletic awards the position, ' +
        'which writes the contract in the same step. Nothing is needed from you until then.'
    )
  })

  it('the candidate is told by email that they are placed when the client awards the position, with no rate named', () => {
    const n = offer.find((x) => x.personId === 'p-wren')!
    expect(n.channel).toBe('EMAIL')
    expect(n.title).toBe('Northbend Athletic is making you an offer')
    expect(n.body).toBe(
      'For Supply planning analyst, after round 2. You are placed when Northbend Athletic awards the position. ' +
        'Pinnacle Resourcing will be in touch about your start date and terms.'
    )
    expect(n.body).not.toMatch(/\$/)
  })

  it('nobody at the client is told of its own offer, and nobody hears it twice', () => {
    expect(offer.map((n) => n.personId).sort()).toEqual(['p-recruiter', 'p-wren'])
  })
})
