import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { newChecklist, readiness, mayDecide, mayRecommend, markItem } from '@/lib/supplier-onboarding'

/**
 * "Add supplier is a huge waste of real estate — for an activity that
 * has to happen through workflow and compliance with indirect
 * procurement. It's ok for the hiring manager to recommend a supplier
 * but it has to go through compliance — insurance, tax report, D&B
 * report, vendor screening — before final approval."
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const now = new Date('2026-09-13T12:00:00Z')

describe('who may recommend, who may decide', () => {
  it('anybody who raises requirements may recommend a supplier; Procurement may too', () => {
    expect(mayRecommend(['requirements.write'])).toBe(true)
    expect(mayRecommend(['vendors.manage'])).toBe(true)
    expect(mayRecommend(['timesheets.approve'])).toBe(false)
  })
  it('only Procurement decides, and never the person who recommended the firm', () => {
    expect(mayDecide({ permissions: ['requirements.write'], callerId: 'hm', recommendedById: 'hm', firmName: 'Vertex' })).toMatchObject({ ok: false, code: 'NOT_PROCUREMENT' })
    expect(mayDecide({ permissions: ['vendors.manage'], callerId: 'proc', recommendedById: 'proc', firmName: 'Vertex' })).toMatchObject({ ok: false, code: 'OWN_RECOMMENDATION' })
    expect(mayDecide({ permissions: ['vendors.manage'], callerId: 'proc', recommendedById: 'hm', firmName: 'Vertex' })).toEqual({ ok: true })
  })
})

describe('the paperwork before a yes', () => {
  it('a new recommendation asks for insurance, a tax form, a D&B report and vendor screening; the agreement can follow', () => {
    const c = newChecklist()
    expect(c.filter((i) => i.required).map((i) => i.key)).toEqual(['INSURANCE', 'TAX_FORM', 'DNB_REPORT', 'VENDOR_SCREENING'])
    expect(c.find((i) => i.key === 'AGREEMENT')?.required).toBe(false)
    expect(c.every((i) => i.state === 'MISSING')).toBe(true)
  })
  it('a firm cannot be approved while anything required is missing, and the sentence names what', () => {
    let c = newChecklist()
    c = (markItem(c, 'INSURANCE', 'HELD', null, now) as any).checklist
    c = (markItem(c, 'TAX_FORM', 'HELD', null, now) as any).checklist
    const r = readiness('Vertex Talent', c)
    expect(r.ok).toBe(false)
    expect(r.held).toBe(2)
    expect(r.says).toBe('Vertex Talent cannot be approved without a D&B report and vendor screening. Get them on file, or waive with a reason, then approve.')
  })
  it('waiving needs a reason written down — never silently permit', () => {
    expect(markItem(newChecklist(), 'DNB_REPORT', 'WAIVED', '', now)).toMatchObject({ ok: false })
    const w = markItem(newChecklist(), 'DNB_REPORT', 'WAIVED', 'Sole trader; no D&B file exists.', now)
    expect(w.ok).toBe(true)
    if (w.ok) expect(w.checklist.find((i) => i.key === 'DNB_REPORT')).toMatchObject({ state: 'WAIVED', note: 'Sole trader; no D&B file exists.' })
  })
  it('with everything required held or waived, it can be approved', () => {
    let c = newChecklist()
    for (const k of ['INSURANCE', 'TAX_FORM', 'VENDOR_SCREENING']) c = (markItem(c, k, 'HELD', null, now) as any).checklist
    c = (markItem(c, 'DNB_REPORT', 'WAIVED', 'Sole trader', now) as any).checklist
    expect(readiness('Vertex Talent', c)).toMatchObject({ ok: true, held: 4, of: 4 })
  })
})

describe('the routes and the page', () => {
  const list = read('src/app/api/supplier-requests/route.ts')
  const one = read('src/app/api/supplier-requests/[id]/route.ts')
  const page = read('src/app/dashboard/suppliers/page.tsx')
  const decisions = read('src/app/api/decisions/route.ts')

  it('a recommendation lands on the Procurement desk as a decision and a notification', () => {
    expect(list).toContain("role: { permissions: { has: 'vendors.manage' } }")
    expect(decisions).toContain("type: 'SUPPLIER_REVIEW'")
    expect(decisions).toContain('documents on file')
  })
  it('approval is refused in a sentence while paperwork is missing', () => {
    expect(one).toContain("code: 'PAPERWORK_MISSING', message: ready.says")
  })
  it('approval writes the same three rows the paste flow wrote — company, agreement, register at approved standing — and tells the recommender', () => {
    expect(one).toContain("update: { tier: 'APPROVED', status: 'ACTIVE' }")
    expect(one).toContain('await prisma.masterAgreement.create(')
    expect(one).toContain("title: `${row.name} is approved`")
    expect(one).toContain("action: 'SUPPLIER_APPROVED'")
  })
  it('the paste box is gone from the top of the page; the import is folded away for Procurement', () => {
    expect(page).not.toContain('<p className="stat-label">Add suppliers</p>')
    expect(page).toContain('Recommend a supplier')
    expect(page).toContain('{mayDecide && (\n        <details className="panel">')
  })
  it('the recommender sees the checklist but no buttons on their own recommendation', () => {
    expect(page).toContain('const canAct = mayDecide && !r.mine')
    expect(page).toContain('You recommended this one, so somebody else in Procurement approves it.')
  })
})
