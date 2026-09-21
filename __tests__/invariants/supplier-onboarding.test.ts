import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { newChecklist, readiness, mayActAt, mayRecommend, markItem, provideItems, nextStage, stepsOf, itemsFor, withOrderedItems, deskForPurpose, wantsDates, STAGE_VERB, type Decision, type OrderedItem } from '@/lib/supplier-onboarding'
import { verificationFromChecklistItem, verificationsFromChecklist } from '@/lib/onboarding-evidence'
import { builtInType } from '@/lib/document-type'
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
  it('Procurement holds experience, references, revenue and delivery proofs, the proposal, the D&B report; HR holds insurance, good standing, screening, the agreement; Finance holds the tax form and bank details', () => {
    const c = newChecklist()
    expect(itemsFor(c, 'PROCUREMENT').map((i) => i.key)).toEqual(['EXPERIENCE', 'REFERENCES', 'REVENUE', 'PROPOSAL', 'DNB_REPORT', 'REFERENCE_CHECK'])
    expect(itemsFor(c, 'HR').map((i) => i.key)).toEqual(['INSURANCE', 'GOOD_STANDING', 'VENDOR_SCREENING', 'AGREEMENT'])
    expect(itemsFor(c, 'FINANCE').map((i) => i.key)).toEqual(['TAX_FORM', 'BANK'])
    expect(c.filter((i) => i.by === 'VENDOR').map((i) => i.key)).toEqual(['EXPERIENCE', 'REFERENCES', 'REVENUE', 'PROPOSAL', 'INSURANCE', 'GOOD_STANDING', 'TAX_FORM', 'BANK'])
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
    const l = linkLetter({ contactName: 'Priya Natarajan', firmName: 'Veritan Talent', clientName: 'Northbend Athletic', token: 'abc' })
    expect(l.subject).toBe('Northbend Athletic: what Procurement needs from Veritan Talent')
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
    expect(list).toContain("deskPeople(companyId, 'LEAD', desks, [caller.person.id])")
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

describe('a desk nobody has named', () => {
  it('falls back to the program office rather than refusing — a client in its first week has no delegation of authority yet', () => {
    expect(mayActAt({ ...base, stage: 'LEAD', permissions: ['governance.write'], callerId: 'pmo', desks: { leadId: null, hrId: null, procurementId: null } })).toEqual({ ok: true })
  })
  it('and when the approver is the one who recommended the firm, their own rule cannot stand in for them', () => {
    expect(read('src/lib/supplier-desks.ts')).toContain("rules.filter((r) => r.kind === 'VALUE' && r.approverId !== recommendedById)")
  })
  it('the stepper says Program office, not Department lead, so whoever decides knows they are standing in', () => {
    expect(stepsOf('LEAD', 'RECOMMENDED', [], false)[0].word).toBe('Program office')
    expect(stepsOf('LEAD', 'RECOMMENDED', [], true)[0].word).toBe('Department lead')
  })
})

// ── What the client's own orders ask of a firm on the way in ──────────

describe('the loop of documents does not crack at the door', () => {
  const ask = (key: string, purpose = 'COMPLIANCE', required = true): OrderedItem => ({
    key, label: builtInType(key)?.label ?? key, purpose, required,
  })

  it('a firm is asked for its certificate of good standing on the way in, and HR verifies it', () => {
    const item = newChecklist().find((i) => i.key === 'GOOD_STANDING')
    expect(item).toMatchObject({ desk: 'HR', by: 'VENDOR', required: true, state: 'MISSING' })
    expect(item?.label).toBe('Certificate of good standing')
    // It ships with a consequence, which is what makes asking for it worth anything.
    expect(builtInType('GOOD_STANDING')?.blocks).toBe(true)
    expect(readiness('Vertex', newChecklist(), 'HR').says).toContain('the certificate of good standing')
  })

  it('a firm recommended to a client whose orders require a document is asked for that document too, and the item says whose order asked', () => {
    const c = withOrderedItems(newChecklist(), [ask('HOT_FLOOR_INDUCTION')], 'Cavanaugh Glassworks')
    const added = c.find((i) => i.key === 'HOT_FLOOR_INDUCTION')
    expect(added).toMatchObject({ desk: 'HR', by: 'VENDOR', required: true, state: 'MISSING' })
    expect(added?.says).toBe('Required by Cavanaugh Glassworks\u2019s orders.')
    expect(readiness('Vertex', c, 'HR').missing).toContain('hot_floor_induction')
  })

  it('a document the walk already asks for is not asked for twice when an order asks for it as well', () => {
    const c = withOrderedItems(newChecklist(), [ask('INSURANCE_GL'), ask('INSURANCE_WC'), ask('GOOD_STANDING'), ask('MSA', 'AGREEMENT')], 'Northbend Athletic')
    expect(c.filter((i) => i.key === 'INSURANCE')).toHaveLength(1)
    expect(c.find((i) => i.key === 'INSURANCE_GL')).toBeUndefined()
    expect(c.find((i) => i.key === 'INSURANCE')?.says).toBe('Required by Northbend Athletic\u2019s orders.')
    expect(c.find((i) => i.key === 'AGREEMENT')?.says).toBe('Required by Northbend Athletic\u2019s orders.')
    expect(c).toHaveLength(newChecklist().length)
  })

  it('an item a desk has already verified stays verified when the order set is folded in again', () => {
    const held = (markItem(newChecklist(), 'INSURANCE', 'HELD', null, now) as any).checklist
    const c = withOrderedItems(held, [ask('INSURANCE_GL')], 'Northbend Athletic')
    expect(c.find((i) => i.key === 'INSURANCE')).toMatchObject({ state: 'HELD', says: 'Required by Northbend Athletic\u2019s orders.' })
  })

  it('an agreement an order requires is asked for and never insisted on, because it is signed when the last desk says yes', () => {
    const c = withOrderedItems(newChecklist(), [ask('NDA', 'AGREEMENT')], 'Talvern Medical')
    expect(c.find((i) => i.key === 'NDA')).toMatchObject({ required: false, desk: 'HR' })
    expect(readiness('Vertex', c, 'HR').missing).not.toContain('non-disclosure agreement')
  })

  it('evidence a firm produces about itself goes to Procurement; compliance and agreements go to HR', () => {
    expect(deskForPurpose('PROOF')).toBe('PROCUREMENT')
    expect(deskForPurpose('COMPLIANCE')).toBe('HR')
    expect(deskForPurpose('AGREEMENT')).toBe('HR')
  })

  it('a client whose orders ask for nothing extra gets the walk it always had', () => {
    expect(withOrderedItems(newChecklist(), [], 'Northbend Athletic')).toEqual(newChecklist())
  })
})

// ── What a desk verified becomes cover the product can read ───────────

describe('a verdict at onboarding reaches the compliance record', () => {
  const iso = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)

  const held = (key: string, dates?: { validFrom?: string; validUntil?: string }) => {
    const c = markItem(newChecklist(), key, 'HELD', null, now, dates) as any
    return c.checklist.find((i: any) => i.key === key)
  }

  it('a certificate HR verifies with its dates becomes cover the compliance record can read', () => {
    const item = held('INSURANCE', { validFrom: iso(-30), validUntil: iso(335) })
    const v = verificationFromChecklistItem(item, 'brightmoor', { personId: 'hr', at: now })
    expect(v.ok).toBe(true)
    // One item, two kinds: the walk asks for general liability and
    // workers' comp on one line and the record holds them apart.
    expect(v.ok && v.rows.map((r) => r.type).sort()).toEqual(['INSURANCE_GL', 'INSURANCE_WC'])
    expect(v.ok && v.rows.every((r) => r.status === 'CLEAR' && r.companyId === 'brightmoor')).toBe(true)
    expect(v.says).toContain('compliance record')
  })

  it('a certificate verified with no dates is refused in a sentence asking for them, and the item stays unverified', () => {
    const v = verificationFromChecklistItem(held('INSURANCE'), 'brightmoor', { at: now })
    expect(v.ok).toBe(false)
    expect(v.needsDates).toBe(true)
    expect(v.says).toContain('the day it starts and the day it runs out')
    expect(v.rows).toEqual([])
  })

  it('the desk is asked for the dates on the documents that expire, and never on its own checks', () => {
    const c = newChecklist()
    const asked = c.filter((i) => wantsDates(i)).map((i) => i.key)
    expect(asked).toEqual(['INSURANCE', 'GOOD_STANDING'])
    // A D&B report, a screening, references contacted, the signed
    // agreement, bank details: a desk's own check or a paper with no
    // validity window, so nothing expires and nothing is chased.
    for (const key of ['DNB_REPORT', 'VENDOR_SCREENING', 'AGREEMENT', 'BANK', 'REFERENCES', 'EXPERIENCE']) {
      expect(wantsDates(c.find((i) => i.key === key)!), key).toBe(false)
    }
  })

  it('a certificate already run out is refused rather than recorded as current', () => {
    const v = verificationFromChecklistItem(
      held('GOOD_STANDING', { validFrom: iso(-400), validUntil: iso(-20) }),
      'brightmoor',
      { at: now }
    )
    expect(v.ok).toBe(false)
    expect(v.says).toMatch(/ran out on/)
  })

  it('a waived item is not evidence, and its reason stays on the checklist rather than on the record', () => {
    const c = (markItem(newChecklist(), 'INSURANCE', 'WAIVED', 'Covered by the parent policy.', now) as any).checklist
    const v = verificationFromChecklistItem(c.find((i: any) => i.key === 'INSURANCE'), 'brightmoor', { at: now })
    expect(v.ok).toBe(false)
    expect(v.needsDates).toBe(false)
    expect(v.says).toContain('waived rather than verified')
  })

  it('unmarking a verified item takes its dates with it, because a date nobody stands behind is worse than a blank', () => {
    let c = (markItem(newChecklist(), 'INSURANCE', 'HELD', null, now, { validFrom: iso(-30), validUntil: iso(335) }) as any).checklist
    expect(c.find((i: any) => i.key === 'INSURANCE').validUntil).toBe(iso(335))
    c = (markItem(c, 'INSURANCE', 'MISSING', null, now) as any).checklist
    expect(c.find((i: any) => i.key === 'INSURANCE').validUntil).toBeNull()
  })

  it('what the firm typed off its own certificate is carried to the desk, and is not a verdict', () => {
    const c = provideItems(newChecklist(), [{ key: 'INSURANCE', fileName: 'COI.pdf', validFrom: iso(-10), validUntil: iso(355) }], now)
    const item = c.find((i) => i.key === 'INSURANCE')!
    expect(item.state).toBe('PROVIDED')
    expect(item.validFrom).toBe(iso(-10))
    // Received, never verified, until a desk says so — so it is not
    // evidence yet either.
    expect(verificationFromChecklistItem(item, 'brightmoor', { at: now }).ok).toBe(false)
  })

  it('a whole checklist replayed at approval writes what it can and names what it cannot', () => {
    let c = newChecklist()
    c = (markItem(c, 'INSURANCE', 'HELD', null, now, { validFrom: iso(-30), validUntil: iso(335) }) as any).checklist
    c = (markItem(c, 'GOOD_STANDING', 'HELD', null, now) as any).checklist
    c = (markItem(c, 'VENDOR_SCREENING', 'HELD', null, now) as any).checklist

    const out = verificationsFromChecklist(c, 'brightmoor', { at: now })
    expect(out.rows.map((r) => r.type).sort()).toEqual(['INSURANCE_GL', 'INSURANCE_WC'])
    // The good standing HR verified with no dates on it is reported, not
    // written, and not silently dropped either.
    const standing = out.skipped.find((sk) => sk.key === 'GOOD_STANDING')
    expect(standing?.needsDates).toBe(true)
    // The screening is a desk's own check and was never going to be a row.
    expect(out.skipped.find((sk) => sk.key === 'VENDOR_SCREENING')?.needsDates).toBe(false)
  })
})
