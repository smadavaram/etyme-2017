import { describe, it, expect } from 'vitest'
import { diff, classify, mayChange, said, noticeForSuppliers } from '@/lib/requisition-change'

/**
 * Changing a requirement after it is out.
 *
 * The founder's rule: words change freely, with every supplier who
 * received it told what changed; the money goes back through approval.
 */

const published = { status: 'OPEN', approvalState: 'APPROVED', archivedAt: null }
const draft = { status: 'DRAFT', approvalState: 'DRAFT', archivedAt: null }
const before = {
  title: 'Workday integrator', description: 'Studio and Prism', skills: ['Workday'], location: 'Beaverton',
  billMin: 9000, billMax: 11000, months: 6, headcount: 1, budgetCents: null, hoursPerWeek: 40, interviewers: [],
}

describe('what counts as words and what counts as money', () => {
  it('the description, skills, location, date, justification and panel are words', () => {
    const changes = diff(before, { description: 'Studio, Prism and EIB', skills: ['Workday', 'Studio'], location: 'Portland' })
    const { words, money } = classify(changes)
    expect(words.map((c) => c.field)).toEqual(['description', 'skills', 'location'])
    expect(money).toEqual([])
  })

  it('the rate band, duration, headcount, budget and hours are money', () => {
    const changes = diff(before, { billMax: 12000, months: 9, headcount: 2 })
    expect(classify(changes).money.map((c) => c.field)).toEqual(['billMax', 'months', 'headcount'])
  })

  it('a field sent back unchanged is not a change', () => {
    expect(diff(before, { title: 'Workday integrator', billMax: 11000 })).toEqual([])
  })
})

describe('changing a requirement that is out', () => {
  it('words change freely on a published requirement, and the suppliers are told', () => {
    const v = mayChange(published, diff(before, { description: 'Studio, Prism and EIB' }))
    expect(v).toMatchObject({ allowed: true, reapprove: false, tellSuppliers: true })
    expect(v.reason).toBe('Changed the description — suppliers are told.')
  })

  it('money moved on a published requirement goes back through approval, and the suppliers are told it is paused', () => {
    const v = mayChange(published, diff(before, { billMax: 13000 }))
    expect(v).toMatchObject({ allowed: true, reapprove: true, tellSuppliers: true })
    expect(v.reason).toContain('the money moved, so it goes back through approval')
  })

  it('words and money together are money', () => {
    const v = mayChange(published, diff(before, { description: 'x', headcount: 3 }))
    expect(v.reapprove).toBe(true)
  })

  it('a draft changes anything and tells nobody — it was never out', () => {
    const v = mayChange(draft, diff(before, { billMax: 13000, description: 'x' }))
    expect(v).toMatchObject({ allowed: true, reapprove: false, tellSuppliers: false })
  })

  it('one an approver handed back is the same', () => {
    const v = mayChange({ status: 'OPEN', approvalState: 'CHANGES_REQUESTED', archivedAt: null }, diff(before, { billMax: 13000 }))
    expect(v).toMatchObject({ allowed: true, reapprove: false, tellSuppliers: false })
  })

  it('a filled requirement cannot be changed — raise a new one', () => {
    const v = mayChange({ status: 'FILLED', approvalState: 'APPROVED', archivedAt: new Date() }, diff(before, { title: 'x' }))
    expect(v.allowed).toBe(false)
    expect(v.reason).toBe('This one is filled and put away. Raise a new requirement.')
  })

  it('a cancelled requirement cannot be changed back to life', () => {
    expect(mayChange({ status: 'CANCELLED', approvalState: 'APPROVED' }, diff(before, { title: 'x' })).allowed).toBe(false)
  })

  it('nothing changed is not a change', () => {
    expect(mayChange(published, []).reason).toBe('Nothing changed.')
  })
})

describe('how a change is said', () => {
  it('names the things, not the fields, and once each', () => {
    expect(said(diff(before, { billMin: 9500, billMax: 12000, description: 'x' }))).toBe('Changed the description and the rate band')
  })

  it('tells a supplier what changed and whether to keep working it', () => {
    const n = noticeForSuppliers({ who: 'Marcus Oyelaran', title: 'Workday integrator', changes: diff(before, { skills: ['Workday', 'Studio'] }), paused: false })
    expect(n.title).toBe('Workday integrator has changed')
    expect(n.body).toBe('Marcus Oyelaran changed the skills. Submissions already in stand; check new ones against it.')
  })

  it('tells a supplier to hold when the money is being re-approved', () => {
    const n = noticeForSuppliers({ who: 'Marcus Oyelaran', title: 'Workday integrator', changes: diff(before, { billMax: 13000 }), paused: true })
    expect(n.title).toBe('Workday integrator is paused while the money is re-approved')
    expect(n.body).toContain('Hold submissions until it is approved again')
  })
})
