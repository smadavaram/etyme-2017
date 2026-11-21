import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { ownEmployeeOffered, ownEmployeeAddedSays, ownEmployeeSavingSays } from '@/lib/consultant-portfolio/own-employee'
import { addConsultantBody, ADD_CONSULTANT_FIELDS, readAddConsultant } from '@/lib/consultant-portfolio/forms'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('Add consultant offers our own W-2 employee', () => {
  it('a client company is not offered the own-employee choice, and every other kind is', () => {
    expect(ownEmployeeOffered('CLIENT')).toBe(false)
    expect(ownEmployeeOffered(null)).toBe(false)
    for (const k of ['VENDOR', 'INTEGRATOR', 'MSP']) expect(ownEmployeeOffered(k)).toBe(true)
  })

  it('the form posts the own-employee choice, and the route reads exactly that field', () => {
    const typed = { name: 'Maya Ortiz', email: 'm@x.test', headline: '', skills: [], skillDraft: '', location: '', workAuth: '', tier: 'MARKETING', termsEngagementType: '', termsPay: '', notes: '', ownEmployee: true }
    const body = addConsultantBody(typed, { rateMin: null, rateMax: null })
    expect(body.ownEmployee).toBe(true)
    expect(Object.keys(body).sort()).toEqual([...ADD_CONSULTANT_FIELDS].sort())
    expect(readAddConsultant(body).ok).toBe(true)
    expect(read('src/app/api/consultants/route.ts')).toContain("field: 'ownEmployee'")
    expect(read('src/app/dashboard/consultants/page.tsx')).toContain('OWN_EMPLOYEE_LABEL')
  })

  it('the route seats her through the shared employee role and sends the existing invitation letter', () => {
    const route = read('src/app/api/consultants/route.ts')
    expect(route).toContain("from '@/lib/employee-role'")
    expect(route).toContain('tryInvitationMail')
    expect(route).toContain("type: 'EMPLOYEE'")
  })

  it('the screen says an email went only where the letter left, and otherwise points to Copy invitation', () => {
    const sent = ownEmployeeAddedSays({ name: 'Maya', email: 'm@x.test', mail: 'SENT' })
    expect(sent).toContain('no bench listing')
    const notSent = ownEmployeeAddedSays({ name: 'Maya', email: 'm@x.test', mail: 'NOT_CONFIGURED' })
    expect(notSent).toContain('Copy invitation')
    expect(notSent).toContain('No email can be sent')
    expect(ownEmployeeSavingSays('Maya', false)).toContain('Copy invitation')
    expect(ownEmployeeSavingSays('Maya', true)).toContain('emails them')
  })
})

describe('the bench dialog', () => {
  it('the bench dialog links to Add consultant where the seat may add', () => {
    expect(read('src/app/dashboard/bench/page.tsx')).toContain("Not in your list? <Link href={'/dashboard/consultants?new=1' as Route}")
  })
})
