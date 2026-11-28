import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { bankCheckOnMark, heldUntilLinked } from '@/lib/supplier-onboarding'
import { notYourSupplierSays, NO_COMPANY_BY_THAT_ID } from '@/lib/supplier-list'
import { approvedAskSays } from '@/app/api/supplier-requests/[id]/link-ask'

/**
 * A firm on Etyme is never tied to you from your side alone (review,
 * 2026-11-13), read on the demand side: a job sent down, a person sent
 * up, a supplier approval and Finance's bank check each write on another
 * firm's books, so each needs a dealing the other firm took part in.
 */

const ROOT = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

describe('a firm on Etyme is never tied to you from your side alone, on the demand side', () => {
  it('a job refused to a firm the sender does not deal with is said in the same words as an id that is not there, naming nobody', () => {
    expect(notYourSupplierSays(1, 'Northbend Athletic')).toBe(
      'One of the firms you picked is not a supplier of Northbend Athletic, so this job request cannot be sent to it. ' +
        'Send it to the suppliers you buy from, or add the firm as a supplier of your own first.',
    )
    expect(notYourSupplierSays(2, 'Northbend Athletic')).toMatch(/^2 of the firms you picked are not a supplier/)
    const route = read('src/app/api/requisitions/[id]/distribute/route.ts')
    // Read before anything is written, and the unknown id gets the same answer.
    expect(route).toMatch(/dealsWith\(\s*requisition\.companyId/)
    expect(route).not.toContain('Unknown companies')
    expect(route.indexOf('dealsWith(')).toBeLessThan(route.indexOf('sendJobTo('))
  })

  it('a job ticked on the raise is left off on the day it is sent where the client does not deal with that firm', () => {
    const send = read('src/app/api/requisitions/send.ts')
    expect(send).toMatch(/dealsWith\(job\.companyId/)
  })

  it('a person sent on to a firm this firm does not deal with is answered exactly as an id that is not there', () => {
    expect(NO_COMPANY_BY_THAT_ID).toBe('No company by that id. Send this person on to a company you already work with.')
    const route = read('src/app/api/submissions/[id]/forward/route.ts')
    const check = route.indexOf('dealsWith(desk!.companyId')
    expect(check).toBeGreaterThan(0)
    // Before the role is copied onto the other firm's books.
    expect(check).toBeLessThan(route.indexOf('prisma.requirement.create('))
    expect(check).toBeLessThan(route.indexOf('prisma.submission.create('))
  })

  it('Finance’s bank check on a firm that has not linked with the client reads and marks nothing on its own payment details', () => {
    const remits = [{ id: 'r1', bankName: 'First Ohio', accountLast4: '4471' }]
    const b = bankCheckOnMark({ state: 'HELD', firm: 'Quarrybrook Staffing', client: 'Northbend Athletic', remits, sent: 'Bank ····4471', notLinked: true })
    expect(b.remitToId).toBeNull()
    expect(b.says).toBe(
      'Checked against what Quarrybrook Staffing sent through its link. ' +
        'Its own payment details on Etyme are not read or marked until Quarrybrook Staffing links with you.',
    )
    expect(b.says).not.toContain('First Ohio')
    expect(b.says).not.toContain('4471')
    // Linked, the check marks the row as before.
    expect(bankCheckOnMark({ state: 'HELD', firm: 'Quarrybrook Staffing', client: 'Northbend Athletic', remits, sent: 'Bank ····4471' }).remitToId).toBe('r1')
    // And the route reads the firm's rows only where it took part.
    expect(read('src/app/api/supplier-requests/[id]/route.ts')).toMatch(/firmId && state !== 'WAIVED' && !notLinked/)
  })

  it('a verified item for a firm not yet linked says it is held with the request, never that it is on the firm’s record', () => {
    const n = heldUntilLinked({ onRecord: true, renders: null, says: 'Certificate of insurance goes on the compliance record.' }, { state: 'HELD', label: 'Certificate of insurance' }, 'Quarrybrook Staffing')
    expect(n).toEqual({
      onRecord: false,
      renders: null,
      says: "Certificate of insurance is verified and held with this request. It goes on Quarrybrook Staffing's compliance record once Quarrybrook Staffing says yes to linking with you.",
    })
    expect(heldUntilLinked(null, { state: 'MISSING', label: 'W-9' }, 'Quarrybrook Staffing')).toBeNull()
  })

  it('the last yes on a firm on Etyme that has not linked sends it nothing and offers the press to ask it', () => {
    expect(approvedAskSays('Quarrybrook Staffing', { state: 'OFFERED' })).toBe(
      'Quarrybrook Staffing is approved. It is on Etyme already, so it becomes your supplier once it says yes to linking with you. ' +
        'Nothing has been sent to it: press Ask them to link to ask.',
    )
    const route = read('src/app/api/supplier-requests/[id]/route.ts')
    const approve = route.slice(route.indexOf("if (action === 'approve')"))
    expect(approve).not.toContain('askFirmToLink(')
    // The press is its own act, and the only one that asks.
    expect(route.slice(0, route.indexOf("if (action === 'approve')"))).toContain("action === 'ask_to_link'")
  })

  it('a job a company sent on its own is never read as a dealing with the firm it went to; only a job the other firm sent counts', () => {
    const direct = read('src/app/api/suppliers/direct.ts')
    const body = direct.slice(direct.indexOf('export async function dealsWith'))
    expect(body).not.toContain('workTogether(')
    expect(body).toMatch(/requirementInvitation\.findMany\(\{\s*where: \{ toCompanyId: me, requirement: \{ companyId: \{ in: ids \} \} \}/)
  })

  it('only a seat that may answer an ask to link counts as the firm answering its link', () => {
    const apply = read('src/app/api/supplier-apply/[token]/route.ts')
    expect(apply).toMatch(/answersForFirm\(who\.firm\.id/)
    expect(read('src/app/api/supplier-apply/[token]/firm.ts')).toMatch(/'vendors\.manage'/)
  })
})
