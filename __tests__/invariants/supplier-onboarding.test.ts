import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { newChecklist, readiness, mayActAt, mayRecommend, markItem, provideItems, nextStage, stepsOf, itemsFor, STAGE_VERB, type Decision } from '@/lib/supplier-onboarding'
import { linkLetter, applyUrl } from '@/lib/supplier-link'

/**
 * "The hiring manager recommends; his department lead — or sometimes
 * the program office — audits; the vendor is emailed a link for its
 * information; indirect Procurement qualifies; HR ensures compliance
 * and screening; AP Finance screens the bank details."
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const now = new Date('2026-09-13T12:00:00Z')
const desks = { leadId: 'lead', hrId: 'hr', procurementId: 'proc' }
const base = { permissions: [] as string[], callerId: 'x', recommendedById: 'hm', decisions: [] as Decision[], desks, firmName: 'Vertex' }
const dec = (stage: 'LEAD' | 'PROCUREMENT' | 'HR' | 'FINANCE', byId: string): Decision => ({ stage, outcome: 'APPROVED', byId, byName: byId, at: now.toISOString(), note: null })

describe('four desks, in order', () => {
  it('anybody who raises requirements may recommend; Procurement may too', () => {
    expect(mayRecommend(['requirements.write'])).toBe(true)
    expect(mayRecommend(['timesheets.approve'])).toBe(false)
  })
  it('the recommender’s department lead decides first; where none is named, the program office does', () => {
    expect(mayActAt({ ...base, stage: 'LEAD', callerId: 'lead' })).toEqual({ ok: true })
    expect(mayActAt({ ...base, stage: 'LEAD', permissions: ['governance.write'], callerId: 'pmo' })).toMatchObject({ ok: false, code: 'NOT_THIS_DESK' })
    expect(mayActAt({ ...base, stage: 'LEAD', permissions: ['governance.write'], callerId: 'pmo', desks: { ...desks, leadId: null } })).toEqual({ ok: true })
    expect(mayActAt({ ...base, stage: 'LEAD', permissions: ['vendors.manage', 'requirements.distribute'], callerId: 'proc' })).toMatchObject({ ok: false, code: 'NOT_THIS_DESK' })
  })
  it('then Procurement qualifies — the standing desk, or anybody who manages suppliers', () => {
    expect(mayActAt({ ...base, stage: 'PROCUREMENT', callerId: 'proc' })).toEqual({ ok: true })
    expect(mayActAt({ ...base, stage: 'PROCUREMENT', permissions: ['vendors.manage'], callerId: 'other' })).toEqual({ ok: true })
    expect(mayActAt({ ...base, stage: 'PROCUREMENT', callerId: 'hr' })).toMatchObject({ ok: false, code: 'NOT_THIS_DESK' })
  })
  it('then HR clears compliance — the HR standing desk, or the program office where none is named', () => {
    expect(mayActAt({ ...base, stage: 'HR', callerId: 'hr' })).toEqual({ ok: true })
    expect(mayActAt({ ...base, stage: 'HR', callerId: 'proc', permissions: ['vendors.manage'] })).toMatchObject({ ok: false, code: 'NOT_THIS_DESK' })
  })
  it('then Finance — whoever may record a payment — says the last yes', () => {
    expect(mayActAt({ ...base, stage: 'FINANCE', permissions: ['payments.record'], callerId: 'ap' })).toEqual({ ok: true })
    expect(mayActAt({ ...base, stage: 'FINANCE', callerId: 'hr' })).toMatchObject({ ok: false, code: 'NOT_THIS_DESK' })
  })
  it('never the recommender, and never somebody who decided an earlier desk', () => {
    expect(mayActAt({ ...base, stage: 'LEAD', callerId: 'hm', desks: { ...desks, leadId: 'hm' } })).toMatchObject({ ok: false, code: 'OWN_RECOMMENDATION' })
    expect(mayActAt({ ...base, stage: 'FINANCE', permissions: ['payments.record'], callerId: 'lead', decisions: [dec('LEAD', 'lead')] })).toMatchObject({ ok: false, code: 'DECIDED_BEFORE' })
  })
  it('the desks run lead → Procurement → HR → Finance → supplier, and each button says what that desk does', () => {
    expect(nextStage('LEAD')).toBe('PROCUREMENT'); expect(nextStage('PROCUREMENT')).toBe('HR'); expect(nextStage('HR')).toBe('FINANCE'); expect(nextStage('FINANCE')).toBe('DONE')
    const steps = stepsOf('HR', 'IN_REVIEW', [dec('LEAD', 'lead'), dec('PROCUREMENT', 'proc')])
    expect(steps.map((s) => `${s.word}:${s.status}`)).toEqual(['Department lead:done', 'Procurement:done', 'HR:now', 'Finance:next', 'Supplier:next'])
    expect(stepsOf('LEAD', 'RECOMMENDED', [], false)[0].word).toBe('Program office')
    expect(STAGE_VERB).toEqual({ LEAD: 'Confirm the need', PROCUREMENT: 'Qualified', HR: 'Cleared compliance', FINANCE: 'Approve as a supplier' })
  })
})

describe('each desk verifies its own paperwork', () => {
  it('Procurement holds experience, references, revenue and delivery proofs, the proposal, the D&B report; HR holds insurance, screening, the agreement; Finance holds the tax form and bank details', () => {
    const c = newChecklist()
    expect(itemsFor(c, 'PROCUREMENT').map((i) => i.key)).toEqual(['EXPERIENCE', 'REFERENCES', 'REVENUE', 'PROPOSAL', 'DNB_REPORT', 'REFERENCE_CHECK'])
    expect(itemsFor(c, 'HR').map((i) => i.key)).toEqual(['INSURANCE', 'VENDOR_SCREENING', 'AGREEMENT'])
    expect(itemsFor(c, 'FINANCE').map((i) => i.key)).toEqual(['TAX_FORM', 'BANK'])
    expect(c.filter((i) => i.by === 'VENDOR').map((i) => i.key)).toEqual(['EXPERIENCE', 'REFERENCES', 'REVENUE', 'PROPOSAL', 'INSURANCE', 'TAX_FORM', 'BANK'])
  })
  it('the lead has no paperwork and can say yes at once; a desk with paperwork cannot until its own is verified', () => {
    expect(readiness('Vertex', newChecklist(), 'LEAD').ok).toBe(true)
    const r = readiness('Vertex', newChecklist(), 'PROCUREMENT')
    expect(r.ok).toBe(false)
    expect(r.says).toBe('Vertex cannot be qualified yet: past experience, references and the D&B report are still missing. Get it on file, verify it, or waive with a reason, then say yes.')
    expect(readiness('Vertex', newChecklist(), 'FINANCE').says).toContain('cannot be approved yet: the tax form and bank details are still missing')
  })
  it('what the vendor supplies through its link is received, not verified — only the desk makes it count', () => {
    const c = provideItems(newChecklist(), [{ key: 'TAX_FORM', fileName: 'W9.pdf' }, { key: 'DNB_REPORT', fileName: 'x' }], now)
    expect(c.find((i) => i.key === 'TAX_FORM')).toMatchObject({ state: 'PROVIDED', fileName: 'W9.pdf' })
    expect(c.find((i) => i.key === 'DNB_REPORT')?.state).toBe('MISSING')
    expect(readiness('Vertex', c, 'FINANCE').says).toContain('the tax form was supplied and needs verifying')
  })
  it('waiving needs a reason written down — never silently permit', () => {
    expect(markItem(newChecklist(), 'DNB_REPORT', 'WAIVED', '', now)).toMatchObject({ ok: false })
    expect(markItem(newChecklist(), 'DNB_REPORT', 'WAIVED', 'Sole trader; no D&B file exists.', now).ok).toBe(true)
  })
  it('with its own items verified or waived, a desk can say yes', () => {
    let c = newChecklist()
    for (const k of ['EXPERIENCE', 'REFERENCES']) c = (markItem(c, k, 'HELD', null, now) as any).checklist
    c = (markItem(c, 'DNB_REPORT', 'WAIVED', 'Sole trader', now) as any).checklist
    expect(readiness('Vertex', c, 'PROCUREMENT')).toMatchObject({ ok: true, held: 3, of: 3 })
    expect(readiness('Vertex', c, 'HR').ok).toBe(false)
  })
})

describe('the vendor’s link', () => {
  it('names the client, says what is needed in the trade’s words, and needs no sign-up', () => {
    const l = linkLetter({ contactName: 'Priya Natarajan', firmName: 'Vertex Talent', clientName: 'Nike', token: 'abc' })
    expect(l.subject).toBe('Nike: what Procurement needs from Vertex Talent')
    expect(l.body).toContain('Priya,')
    expect(l.body).toContain(applyUrl('abc'))
    expect(l.body).toContain('Nothing to sign up for.')
  })
})

describe('the routes and the pages', () => {
  const list = read('src/app/api/supplier-requests/route.ts')
  const one = read('src/app/api/supplier-requests/[id]/route.ts')
  const apply = read('src/app/api/supplier-apply/[token]/route.ts')
  const desksSrc = read('src/lib/supplier-desks.ts')
  const page = read('src/app/dashboard/suppliers/page.tsx')
  const applyPage = read('src/app/apply/[token]/page.tsx')
  const decisions = read('src/app/api/decisions/route.ts')

  it('the lead is the nearest value-rule approver up the recommender’s own unit tree, never the recommender', () => {
    expect(desksSrc).toContain("rules.filter((r) => r.kind === 'VALUE' && r.approverId !== recommendedById)")
    expect(desksSrc).toContain('const hit = values.filter((r) => r.orgUnitId === u)')
  })
  it('a recommendation sends the firm its link at once and emails the recommender’s lead', () => {
    expect(list).toContain("delivery = await sendLink({ to: contactEmail")
    expect(list).toContain("deskPeople(companyId, 'LEAD', desks)")
    expect(list).toContain("channel: 'EMAIL',\n      title: `Supplier recommended — ${name}`")
  })
  it('each yes moves it to the next desk by email, and no desk marks another desk’s items', () => {
    expect(one).toContain('const next = nextStage(stage)')
    expect(one).toContain("channel: 'EMAIL',\n          title: `Supplier to review — ${row.name}`")
    expect(one).toContain("code: 'NOT_YOUR_ITEM'")
    expect(one).toContain("const ready = readiness(row.name, checklist, stage)")
  })
  it('Finance’s yes writes the supplier at approved standing and tells the recommender', () => {
    expect(one).toContain("update: { tier: 'APPROVED', status: 'ACTIVE' }")
    expect(one).toContain('(Finance) approved ${row.name}, after your lead, Procurement and HR')
  })
  it('the firm’s page needs no sign-in, records files by name, stops working once decided, and tells the desk its side is in', () => {
    expect(apply).not.toContain('getCallerContext')
    expect(apply).toContain("where: { token }")
    expect(apply).toContain("code: 'DECIDED'")
    expect(apply).toContain("title: `${row.name} sent its paperwork`")
    expect(applyPage).toContain('Only the bank, the account name and the last four digits are kept here.')
  })
  it('the decision lands on the desk the firm is on, and only there', () => {
    expect(decisions).toContain("const desks = await desksFor(companyId, w.recommendedById)")
    expect(decisions).toContain("if (!verdict.ok) continue")
  })
  it('a pending firm shows on the suppliers list as Pending with the desk it is on, and each desk sees only its own items', () => {
    expect(page).toContain("pending:")
    expect(page).toContain("Pending · ")
    expect(page).toContain("r.checklist.filter((item) => item.desk === r.stage)")
    expect(page).toContain("{r.stage === 'DONE' ? 'Done' : STAGE_VERB[r.stage]}")
  })
})
