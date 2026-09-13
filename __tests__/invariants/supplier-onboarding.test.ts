import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { newChecklist, readiness, mayActAt, mayRecommend, markItem, provideItems, nextStage, stepsOf, type Decision } from '@/lib/supplier-onboarding'
import { linkLetter, applyUrl } from '@/lib/supplier-link'

/**
 * "It's ok for the hiring manager to recommend a supplier, but it has
 * to go through workflow: his team audits, HR assesses the skill set,
 * indirect Procurement screens the vendor — W-9, bank data, past
 * experience and references, revenue and delivery proofs, proposals —
 * and the vendor gets a link to apply and upload against."
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const now = new Date('2026-09-13T12:00:00Z')
const desks = { hrId: 'hr', procurementId: 'proc' }
const base = { permissions: [] as string[], callerId: 'x', recommendedById: 'hm', decisions: [] as Decision[], desks, firmName: 'Vertex' }
const dec = (stage: 'TEAM' | 'HR' | 'PROCUREMENT', byId: string): Decision => ({ stage, outcome: 'APPROVED', byId, byName: byId, at: now.toISOString(), note: null })

describe('three desks, in order', () => {
  it('anybody who raises requirements may recommend; Procurement may too', () => {
    expect(mayRecommend(['requirements.write'])).toBe(true)
    expect(mayRecommend(['vendors.manage'])).toBe(true)
    expect(mayRecommend(['timesheets.approve'])).toBe(false)
  })
  it('the program office decides first — whoever owns the governance rules; Procurement cannot jump the queue', () => {
    expect(mayActAt({ ...base, stage: 'TEAM', permissions: ['governance.write'], callerId: 'pm' })).toEqual({ ok: true })
    expect(mayActAt({ ...base, stage: 'TEAM', permissions: ['vendors.manage', 'requirements.distribute'], callerId: 'proc' })).toMatchObject({ ok: false, code: 'NOT_THIS_DESK' })
  })
  it('then the HR standing desk reads the skill set; where none is named, the program office stands in', () => {
    expect(mayActAt({ ...base, stage: 'HR', callerId: 'hr' })).toEqual({ ok: true })
    expect(mayActAt({ ...base, stage: 'HR', permissions: ['governance.write'], callerId: 'pm' })).toMatchObject({ ok: false, code: 'NOT_THIS_DESK' })
    expect(mayActAt({ ...base, stage: 'HR', permissions: ['governance.write'], callerId: 'pm', desks: { hrId: null, procurementId: null } })).toEqual({ ok: true })
  })
  it('then Procurement — the standing desk, or anybody who manages suppliers', () => {
    expect(mayActAt({ ...base, stage: 'PROCUREMENT', callerId: 'proc' })).toEqual({ ok: true })
    expect(mayActAt({ ...base, stage: 'PROCUREMENT', permissions: ['vendors.manage'], callerId: 'other' })).toEqual({ ok: true })
    expect(mayActAt({ ...base, stage: 'PROCUREMENT', permissions: ['governance.write'], callerId: 'pm' })).toMatchObject({ ok: false, code: 'NOT_THIS_DESK' })
  })
  it('never the recommender, and never somebody who decided an earlier desk', () => {
    expect(mayActAt({ ...base, stage: 'TEAM', permissions: ['governance.write', 'vendors.manage'], callerId: 'hm' })).toMatchObject({ ok: false, code: 'OWN_RECOMMENDATION' })
    expect(mayActAt({ ...base, stage: 'PROCUREMENT', permissions: ['vendors.manage'], callerId: 'pm', decisions: [dec('TEAM', 'pm')] })).toMatchObject({ ok: false, code: 'DECIDED_BEFORE' })
  })
  it('the desks run program office → HR → Procurement → supplier', () => {
    expect(nextStage('TEAM')).toBe('HR'); expect(nextStage('HR')).toBe('PROCUREMENT'); expect(nextStage('PROCUREMENT')).toBe('DONE')
    const steps = stepsOf('PROCUREMENT', 'IN_REVIEW', [dec('TEAM', 'pm'), dec('HR', 'hr')])
    expect(steps.map((s) => `${s.word}:${s.status}`)).toEqual(['Program office:done', 'HR:done', 'Procurement:now', 'Supplier:next'])
  })
})

describe('the paperwork before a yes', () => {
  it('the vendor is asked for a W-9, insurance, bank details, experience, references, and if it has them revenue proof and a proposal; Procurement pulls the D&B report and screens', () => {
    const c = newChecklist()
    expect(c.filter((i) => i.by === 'VENDOR').map((i) => i.key)).toEqual(['TAX_FORM', 'INSURANCE', 'BANK', 'EXPERIENCE', 'REFERENCES', 'REVENUE', 'PROPOSAL'])
    expect(c.filter((i) => i.by === 'PROCUREMENT').map((i) => i.key)).toEqual(['DNB_REPORT', 'VENDOR_SCREENING', 'REFERENCE_CHECK', 'AGREEMENT'])
    expect(c.filter((i) => i.required).map((i) => i.key)).toEqual(['TAX_FORM', 'INSURANCE', 'BANK', 'EXPERIENCE', 'REFERENCES', 'DNB_REPORT', 'VENDOR_SCREENING'])
  })
  it('what the vendor supplies through its link is received, not verified — only Procurement makes it count', () => {
    const c = provideItems(newChecklist(), [{ key: 'TAX_FORM', fileName: 'W9.pdf' }, { key: 'DNB_REPORT', fileName: 'x' }], now)
    expect(c.find((i) => i.key === 'TAX_FORM')).toMatchObject({ state: 'PROVIDED', fileName: 'W9.pdf' })
    expect(c.find((i) => i.key === 'DNB_REPORT')?.state).toBe('MISSING')
    const r = readiness('Vertex', c)
    expect(r.ok).toBe(false)
    expect(r.says).toContain('the tax form was supplied and needs verifying')
  })
  it('a firm cannot be approved while anything required is missing, and the sentence names what', () => {
    const r = readiness('Vertex Talent', newChecklist())
    expect(r.ok).toBe(false)
    expect(r.says).toBe('Vertex Talent cannot be approved yet: the tax form, the certificate of insurance, bank details, past experience, references, the D&B report and vendor screening are still missing. Get it on file, verify it, or waive with a reason, then approve.')
  })
  it('waiving needs a reason written down — never silently permit', () => {
    expect(markItem(newChecklist(), 'DNB_REPORT', 'WAIVED', '', now)).toMatchObject({ ok: false })
    const w = markItem(newChecklist(), 'DNB_REPORT', 'WAIVED', 'Sole trader; no D&B file exists.', now)
    expect(w.ok).toBe(true)
  })
  it('with everything required verified or waived, it can be approved', () => {
    let c = newChecklist()
    for (const k of ['TAX_FORM', 'INSURANCE', 'BANK', 'EXPERIENCE', 'REFERENCES', 'VENDOR_SCREENING']) c = (markItem(c, k, 'HELD', null, now) as any).checklist
    c = (markItem(c, 'DNB_REPORT', 'WAIVED', 'Sole trader', now) as any).checklist
    expect(readiness('Vertex Talent', c)).toMatchObject({ ok: true, held: 7, of: 7 })
  })
})

describe('the vendor’s link', () => {
  it('names the client, says what is needed in the trade’s words, and needs no sign-up', () => {
    const l = linkLetter({ contactName: 'Priya Natarajan', firmName: 'Vertex Talent', clientName: 'Nike', token: 'abc' })
    expect(l.subject).toBe('Nike: what Procurement needs from Vertex Talent')
    expect(l.body).toContain('Priya,')
    expect(l.body).toContain('a W-9, a certificate of insurance, bank details for payment')
    expect(l.body).toContain(applyUrl('abc'))
    expect(l.body).toContain('Nothing to sign up for.')
  })
})

describe('the routes and the pages', () => {
  const list = read('src/app/api/supplier-requests/route.ts')
  const one = read('src/app/api/supplier-requests/[id]/route.ts')
  const apply = read('src/app/api/supplier-apply/[token]/route.ts')
  const page = read('src/app/dashboard/suppliers/page.tsx')
  const applyPage = read('src/app/apply/[token]/page.tsx')
  const decisions = read('src/app/api/decisions/route.ts')

  it('a recommendation sends the firm its link at once and lands on the program office’s desk', () => {
    expect(list).toContain("delivery = await sendLink({ to: contactEmail")
    expect(list).toContain("deskPeople(companyId, 'TEAM', desks)")
    expect(read('src/lib/supplier-desks.ts')).toContain("stage === 'PROCUREMENT' ? 'vendors.manage' : 'governance.write'")
  })
  it('each yes moves it to the next desk and tells that desk and the recommender; the last yes writes the supplier', () => {
    expect(one).toContain('const next = nextStage(stage)')
    expect(one).toContain("title: `Supplier to review — ${row.name}`")
    expect(one).toContain("update: { tier: 'APPROVED', status: 'ACTIVE' }")
    expect(one).toContain("code: 'PAPERWORK_MISSING', message: ready.says")
  })
  it('the paperwork is Procurement’s desk and nobody else’s', () => {
    expect(one).toContain("if (stage !== 'PROCUREMENT') {")
  })
  it('the firm’s page needs no sign-in, records files by name, stops working once decided, and tells Procurement its side is in', () => {
    expect(apply).not.toContain('getCallerContext')
    expect(apply).toContain("where: { token }")
    expect(apply).toContain("code: 'DECIDED'")
    expect(apply).toContain("title: `${row.name} sent its paperwork`")
    expect(applyPage).toContain('Only the bank, the account name and the last four digits are kept here.')
  })
  it('the decision lands on the desk the firm is on, and only there', () => {
    expect(decisions).toContain("const verdict = mayActAt({ stage, permissions: caller.permissions")
    expect(decisions).toContain("if (!verdict.ok) continue")
  })
  it('a pending firm shows on the suppliers list as Pending, with the desk it is on', () => {
    expect(page).toContain("pending:")
    expect(page).toContain("Pending · ")
  })
})
