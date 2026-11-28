import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { turnOf, type Signer } from '@/app/api/timesheets/chain-turn'
import { waitingSub, tileShowing } from '@/app/dashboard/timesheets/tiles'
import { acceptedSays } from '@/app/api/timesheets/accepted-says'
import { offPlatformApprovalWords, approvedByWords } from '@/app/api/timesheets/approval-by-email'
import { mayReadBillRate } from '@/lib/money/pay-visibility'
import { rolesFor } from '@/lib/company-defaults'
import { copySays } from '@/app/dashboard/requirements/words'
import { budgetField } from '@/app/dashboard/requisitions/facts'

/**
 * The press walk of a small supplier's money chain, layer 2 (2026-11-15):
 * a supplier with W-2 people at clients that are not on Etyme. The figures
 * were right; these are the sentences that were not true and the presses
 * that did nothing, on demand's screens.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

const CLIENT = 'client-larkspur'
const FIRM = 'firm-brightmoor'
const signers: Signer[] = [
  { companyId: CLIENT, role: 'CLIENT_APPROVAL', rungId: 'rung-1' },
  { companyId: FIRM, role: 'EMPLOYER_ACCEPTANCE', rungId: 'rung-1' },
]
const names = (id: string) => (id === CLIENT ? 'Larkspur Freight' : 'Brightmoor Staffing')

describe('a week waiting on a client that is not on Etyme', () => {
  it('the row says the client is not on Etyme and to attach the approval they gave, never that the week comes once they have signed', () => {
    const t = turnOf(signers, FIRM, () => false, names, (id) => id !== CLIENT)
    expect(t).toEqual({
      ok: false,
      code: 'NOT_YOUR_TURN',
      says: 'Larkspur Freight is not on Etyme, so it does not sign here. Open the week to attach the approval they gave.',
    })
    if (t.ok) throw new Error('expected a refusal')
    expect(t.says).not.toContain('comes to you once they have')
  })

  it('a week waiting on a client that is on Etyme still says it comes to you once they have signed', () => {
    const t = turnOf(signers, FIRM, () => false, names, () => true)
    expect(t.ok ? null : t.says).toBe('Larkspur Freight has not signed this week yet. It comes to you once they have.')
  })

  it('the list reads whether each signer is on Etyme from whether anybody has claimed it, as the panel above the list does', () => {
    const ladder = read('src/app/api/timesheets/ladder.ts')
    expect(ladder).toContain('select: { id: true, name: true, claimedAt: true }')
    expect(ladder).toContain('(id) => onEtyme.get(id) ?? true)')
  })
})

describe('the Timesheets tile names the act', () => {
  it('a supplier’s tile says how many weeks are for it to accept, and a client’s how many are for it to approve', () => {
    expect(waitingSub(1, 'accept')).toBe('1 week for you to accept')
    expect(waitingSub(3, 'accept')).toBe('3 weeks for you to accept')
    expect(waitingSub(2, 'approve')).toBe('2 weeks for you to approve')
    expect(waitingSub(3)).not.toContain('sign')
    expect(read('src/app/dashboard/timesheets/page.tsx'))
      .toContain("sub={waitingSub(pendingApproval, company?.kind === 'CLIENT' || atDesk ? 'approve' : 'accept')}")
  })

  it('the waiting tile pressed with nothing in it says no weeks are waiting on you, never "Showing the 0 weeks"', () => {
    expect(tileShowing('WAITING_ON_YOU', 0)).toBe('No weeks are waiting on you.')
    expect(tileShowing('WAITING_ON_YOU', 1)).toBe('Showing the 1 week waiting on you.')
  })
})

describe('AP & Payroll accepts a week and reads no figure that gives the bill rate away', () => {
  const ap = rolesFor('VENDOR').find((r) => r.name === 'AP & Payroll')!
  const line = { sellerId: FIRM, clientId: CLIENT }

  it('AP & Payroll may not read what its own firm’s line bills at, and the Owner may', () => {
    expect(mayReadBillRate({ permissions: ap.permissions, companyId: FIRM, companyKind: 'VENDOR' }, line)).toBe(false)
    expect(mayReadBillRate({ permissions: ['*'], companyId: FIRM, companyKind: 'VENDOR' }, line)).toBe(true)
  })

  it('a seat that may not read the bill rate is told the week is accepted and can now be billed, with no amount', () => {
    const says = acceptedSays({ hours: 40, billMinor: null, currency: 'USD', billsName: 'Larkspur Freight', paidBelow: { kind: 'PAYROLL', personName: 'Rosa Quill' } })
    expect(says).toBe('Accepted 40h. It can now be billed to Larkspur Freight. Rosa Quill is paid through payroll on their own pay line.')
    expect(says).not.toMatch(/\$|\d+\.\d\d/)
  })

  it('a seat that may read the bill rate is still told the amount to bill', () => {
    expect(acceptedSays({ hours: 40, billMinor: 290_000, currency: 'USD', billsName: 'Larkspur Freight', paidBelow: null }))
      .toBe('Accepted 40h. $2,900.00 to bill Larkspur Freight.')
  })

  it('the accept answer carries the amount, in the sentence and in its figure, only to a seat that may read what the line bills at', () => {
    const route = read('src/app/api/timesheets/[id]/approve/route.ts')
    expect(route).toContain('const readsBill = mayReadBillRate(')
    expect(route).toContain('billMinor = readsBill ? value.totalCents : null')
    expect(route).toContain('billAmount: readsBill ? worth : null')
    expect(route).toContain("const worthSays = worth == null || !readsBill ? '' :")
  })

  it('the Timesheets list withholds the rate, and the value made from it, from a seat that may not read what a line bills at', () => {
    const list = read('src/app/api/timesheets/route.ts')
    expect(list).toContain('if (!mayReadBillRate(viewer, lineOf(r))) {')
    expect(list).toContain('seen.rate = { ...seen.rate, cents: null, currency: null, says: BILL_WITHHELD_SAYS, withheld: true }')
  })
})

describe('a week approved by an attached file says the record’s words', () => {
  it('an attached approval from a client not on Etyme reads "Approved by email: <name>, <day> — evidence attached", then that the client was not on Etyme', () => {
    const on = new Date('2026-03-12T15:00:00Z')
    const now = new Date('2026-04-01T00:00:00Z')
    const words = offPlatformApprovalWords({ approverName: ' Noor Castell ', approverEmail: 'Noor@Larkspur.example', clientName: 'Larkspur Freight', evidence: { on, now } })
    expect(words).toBe(`${approvedByWords({ approverName: 'Noor Castell', on, how: 'EVIDENCE', now })} — Larkspur Freight was not on Etyme`)
    expect(words).toContain('— evidence attached —')
  })

  it('a link a client not on Etyme answered still reads with the address it came from', () => {
    expect(offPlatformApprovalWords({ approverName: 'Noor Castell', approverEmail: 'noor@larkspur.example', clientName: 'Larkspur Freight' }))
      .toBe('Approved by email: Noor Castell, noor@larkspur.example — Larkspur Freight was not on Etyme')
  })
})

describe('words a person reads on demand’s screens', () => {
  it('the paste box on Suppliers names no mail product: it says the To: line of an email', () => {
    const page = read('src/app/dashboard/suppliers/page.tsx')
    expect(page).not.toContain('Outlook')
    expect(page).toContain('A spreadsheet column, a signature block, or the To: line of an email.')
  })

  it('the firm’s own copy of a client’s job says whose job it copies and who sees it', () => {
    expect(copySays('Larkspur Freight')).toBe('This is your own copy of Larkspur Freight’s job. Only your firm sees it, until you send it to your suppliers.')
    const page = read('src/app/dashboard/requirements/[id]/page.tsx')
    expect(page).toContain('window.location.href = `/dashboard/requirements/${id}?copied=1`')
    expect(page).toContain('{copySays(requirement.endClientCompany.name)}')
  })

  it('"Add a rule on the money" is drawn where the money rules are listed, so a rule on the money can be added', () => {
    const page = read('src/app/dashboard/program/team/page.tsx')
    const money = page.indexOf('Rules on the money</h2>')
    const drawn = page.indexOf("{(!adding || draft.kind === 'VALUE') && ruleForm}")
    expect(money).toBeGreaterThan(0)
    expect(drawn).toBeGreaterThan(money)
    expect(page).toContain("{adding && draft.kind !== 'VALUE' && ruleForm}")
    expect(page).not.toContain("{draft.kind !== 'VALUE' && ruleForm}")
  })

  it('the job request form says cost center, as Settings and the approval reason do, never budget for the code that pays', () => {
    expect(budgetField(false).says).toBe('No cost center is set up here yet, so this job needs none. Once one is set up, you pick it here.')
    const form = read('src/app/dashboard/requisitions/page.tsx')
    expect(form).toContain('<Lbl>Which cost center pays for it</Lbl>')
    expect(form).not.toContain('No budget is set up')
    expect(read('src/app/dashboard/requisitions/chain.tsx')).toContain("'Pick the cost center and this says who would be asked.'")
    expect(read('src/app/dashboard/program/team/page.tsx')).toContain('>Whose cost center</h2>')
  })
})
