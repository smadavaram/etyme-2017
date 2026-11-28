import { describe, it, expect } from 'vitest'
import { offerForRow } from '@/app/api/submissions/words'
import { offerLine, mayRecordHerAnswer } from '@/app/dashboard/submissions/offer-words'

const sub = { fromCompanyId: 'supplier', toCompanyId: 'buyer' }
const live = [{ state: 'PROPOSED', rate: '95.00', currency: 'USD', startDate: new Date('2027-01-11T00:00:00Z') }]

describe('what a submission row says about its offer', () => {
  it('the supplier whose person received an offer reads its rate and start day and may record her answer', () => {
    const o = offerForRow(live, { companyId: 'supplier', ownOnly: false, maySubmit: true }, sub)
    expect(o).toMatchObject({ rate: 95, side: 'SUPPLIER', startDate: '2027-01-11', mayAnswer: true })
    expect(offerLine(o)).toBe('Offered: 95.00 USD an hour, starts Jan 11, 2027')
    expect(mayRecordHerAnswer(o)).toBe(true)
  })
  it('a supplier seat that does not put people forward reads the offer but is not offered the answer', () => {
    const o = offerForRow(live, { companyId: 'supplier', ownOnly: false, maySubmit: false }, sub)
    expect(o).not.toBeNull()
    expect(mayRecordHerAnswer(o)).toBe(false)
  })
  it('a firm that is not party to the submission reads no offer at all', () => {
    expect(offerForRow(live, { companyId: 'somebody-else', ownOnly: false, maySubmit: true }, sub)).toBeNull()
  })
  it('a seat that reads only its own work reads no offer rate', () => {
    expect(offerForRow(live, { companyId: 'buyer', ownOnly: true, maySubmit: true }, sub)).toBeNull()
  })
  it('a draft offer is never carried to the row', () => {
    expect(offerForRow([{ ...live[0], state: 'DRAFT' }], { companyId: 'supplier', ownOnly: false, maySubmit: true }, sub)).toBeNull()
  })
  it('an accepted offer reads Accepted and offers no second answer', () => {
    const o = offerForRow([{ ...live[0], state: 'ACCEPTED' }], { companyId: 'supplier', ownOnly: false, maySubmit: true }, sub)
    expect(offerLine(o)).toMatch(/^Accepted: 95.00 USD/)
    expect(mayRecordHerAnswer(o)).toBe(false)
  })
  it('a row with no offer says nothing', () => {
    expect(offerLine(null)).toBeNull()
  })
})
