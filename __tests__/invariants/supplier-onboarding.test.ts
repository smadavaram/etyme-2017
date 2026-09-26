import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { newChecklist, readiness, mayActAt, mayRecommend, markItem, provideItems, nextStage, stepsOf, itemsFor, withOrderedItems, deskForPurpose, wantsDates, evidenceNoteFor, whoRendersItem, STAGE_VERB, type Decision, type OrderedItem, type ChecklistItem, CHECKLIST } from '@/lib/supplier-onboarding'
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

/**
 * A checklist is JSON written the day a firm was recommended, and the
 * code that decides what it asks for is newer than the row every time.
 * The release walk of 2026-09-21 found what that costs: HR marked a
 * certificate of insurance verified with no dates and no compliance row,
 * on a stored item written before `answers` existed, and read the same
 * certificate asked for three times on one list.
 */
describe('a checklist written before the code changed', () => {
  const now = new Date('2026-09-21T09:00:00Z')

  /** The row as it was stored: no `answers`, an old label, marked received. */
  function storedBeforeAnswers(): ChecklistItem[] {
    return newChecklist().map((i) =>
      i.key === 'INSURANCE'
        ? { ...i, label: 'Certificate of insurance', answers: undefined, state: 'PROVIDED' as const, fileName: 'Veritan-COI-2026.pdf' }
        : i
    )
  }

  it('a certificate of insurance stored before the checklist knew what it answers still asks the desk for its two dates', () => {
    const stale = storedBeforeAnswers().find((i) => i.key === 'INSURANCE')!
    expect(wantsDates(stale)).toBe(false)

    const read = withOrderedItems(storedBeforeAnswers(), [], 'Northbend Athletic').find((i) => i.key === 'INSURANCE')!
    expect(wantsDates(read)).toBe(true)
  })

  it('a desk cannot mark that certificate verified with no start and no expiry', () => {
    const read = withOrderedItems(storedBeforeAnswers(), [], 'Northbend Athletic')
    const marked = (markItem(read, 'INSURANCE', 'HELD', null, now) as { checklist: ChecklistItem[] }).checklist
    const verdict = verificationFromChecklistItem(marked.find((i) => i.key === 'INSURANCE')!, 'veritan', { at: now })
    expect(verdict.ok).toBe(false)
    expect(verdict.needsDates).toBe(true)
  })

  it('what a desk already recorded survives the row being read back against the code', () => {
    const read = withOrderedItems(storedBeforeAnswers(), [], 'Northbend Athletic').find((i) => i.key === 'INSURANCE')!
    expect(read.state).toBe('PROVIDED')
    expect(read.fileName).toBe('Veritan-COI-2026.pdf')
    expect(read.label).toBe(CHECKLIST.find((c) => c.key === 'INSURANCE')!.label)
  })

  it('an order asking for general liability cover annotates the certificate of insurance the walk already asks for rather than adding a second row', () => {
    const out = withOrderedItems(
      storedBeforeAnswers(),
      [
        { key: 'INSURANCE_GL', label: 'Certificate of general liability insurance', purpose: 'COMPLIANCE', required: true },
        { key: 'INSURANCE_WC', label: "Certificate of workers' compensation", purpose: 'COMPLIANCE', required: true },
      ],
      'Northbend Athletic'
    )
    expect(out.filter((i) => i.key.startsWith('INSURANCE')).length).toBe(1)
    expect(out.find((i) => i.key === 'INSURANCE')!.says).toBe('Required by Northbend Athletic’s orders.')
  })

  it('an order row already written down as a second certificate of insurance is taken off the list once the walk answers it', () => {
    const withDuplicates: ChecklistItem[] = [
      ...storedBeforeAnswers(),
      { key: 'INSURANCE_GL', label: 'Certificate of general liability insurance', required: true, by: 'VENDOR', desk: 'HR', state: 'MISSING', note: null, at: null, answers: ['INSURANCE_GL'], says: 'Required by Northbend Athletic’s orders.' },
    ]
    const out = withOrderedItems(withDuplicates, [], 'Northbend Athletic')
    expect(out.some((i) => i.key === 'INSURANCE_GL')).toBe(false)
    expect(out.some((i) => i.key === 'INSURANCE')).toBe(true)
  })

  it('a duplicate a desk already waived stays on the list, because nothing anybody decided is quietly removed', () => {
    const withDuplicates: ChecklistItem[] = [
      ...storedBeforeAnswers(),
      { key: 'INSURANCE_GL', label: 'Certificate of general liability insurance', required: true, by: 'VENDOR', desk: 'HR', state: 'WAIVED', note: 'Self-insured, confirmed by the broker.', at: now.toISOString(), answers: ['INSURANCE_GL'] },
    ]
    const out = withOrderedItems(withDuplicates, [], 'Northbend Athletic')
    expect(out.find((i) => i.key === 'INSURANCE_GL')?.state).toBe('WAIVED')
  })

  it('a document a client invented and stored with no answers still answers for itself', () => {
    const invented: ChecklistItem[] = [
      ...newChecklist(),
      { key: 'FURNACE_SAFETY_INDUCTION', label: 'Furnace safety induction', required: true, by: 'VENDOR', desk: 'HR', state: 'MISSING', note: null, at: null },
    ]
    const out = withOrderedItems(invented, [{ key: 'FURNACE_SAFETY_INDUCTION', label: 'Furnace safety induction', purpose: 'COMPLIANCE', required: true }], 'Cavanaugh Glassworks')
    expect(out.filter((i) => i.key === 'FURNACE_SAFETY_INDUCTION').length).toBe(1)
  })
})

// ── A refusal nobody is shown is worse than the gap it closes ─────────
//
// `lib/onboarding-evidence` refuses to put a background check on a
// compliance record, because a screening company renders that verdict
// and no desk in Etyme does. The gate held and said so, and the route
// surfaced its sentence only when the answer was `ok` or `needsDates` —
// so a desk marked a screening report verified, the tick went green,
// nothing was written anywhere, and the desk was told nothing at all.

describe('a desk is never told nothing when its click recorded nothing', () => {
  const iso = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)
  const ordered = (key: string, label: string): OrderedItem => ({ key, label, purpose: 'COMPLIANCE', required: true })

  /** The checklist a client whose orders ask its suppliers for a screening report hands HR. */
  const withCheck = (key: string, label: string) =>
    withOrderedItems(newChecklist(), [ordered(key, label)], 'Northbend Athletic')

  const heldItem = (key: string, label: string, note: string | null = null, fileName: string | null = null) => {
    const c = withCheck(key, label).map((i) => (i.key === key ? { ...i, fileName } : i))
    const marked = markItem(c, key, 'HELD', note, now) as { ok: true; checklist: ChecklistItem[] }
    return marked.checklist.find((i) => i.key === key)!
  }

  it('a desk that marks a screening report verified is told nothing was recorded, and why', () => {
    const item = heldItem('BACKGROUND_CHECK', 'Background check')
    // The gate itself: neither a yes nor a request for two dates, which
    // is exactly the shape the route used to drop on the floor.
    const verdict = verificationFromChecklistItem(item, 'veritan', { at: now })
    expect(verdict.ok).toBe(false)
    expect(verdict.needsDates).toBe(false)

    const note = evidenceNoteFor(item, 'veritan', now)
    expect(note).not.toBeNull()
    expect(note!.onRecord).toBe(false)
    expect(note!.says).toBe(verdict.says)
    expect(note!.says).toContain('nothing goes on the compliance record from here')
  })

  it('the sentence names the screening company whose verdict it is, so the desk leaves with somebody to ask', () => {
    const note = evidenceNoteFor(heldItem('BACKGROUND_CHECK', 'Background check'), 'veritan', now)!
    expect(note.renders).toBe('PROVIDER')
    expect(note.says).toContain('A screening company runs this one')
    // And what a record of it would have to carry, which is the door
    // nobody has built yet.
    expect(note.says).toContain('their reference number and the day they ran it')
  })

  it('an employer of record’s own check names the employer rather than a screening company', () => {
    const note = evidenceNoteFor(heldItem('I9_EVERIFY', 'Form I-9 and E-Verify'), 'veritan', now)!
    expect(note.onRecord).toBe(false)
    expect(note.renders).toBe('EMPLOYER')
    expect(note.says).toContain('employer of record')
    expect(note.says).not.toContain('screening company')
  })

  it('the note and the file the desk was shown stay on the checklist, because that is the honest record of what the firm sent', () => {
    const item = heldItem('BACKGROUND_CHECK', 'Background check', 'Sterling report, 12 March.', 'sterling-report.pdf')
    // Verified as this desk's own note. Nothing is refused, nothing is
    // dropped, and the evidence of what the firm sent is still here.
    expect(item.state).toBe('HELD')
    expect(item.note).toBe('Sterling report, 12 March.')
    expect(item.fileName).toBe('sterling-report.pdf')
    expect(evidenceNoteFor(item, 'veritan', now)!.says).toContain('stay on the checklist')
  })

  it('a certificate of insurance with its two dates says nothing extra, because it went on the record', () => {
    const c = (markItem(newChecklist(), 'INSURANCE', 'HELD', null, now, { validFrom: iso(-30), validUntil: iso(335) }) as any).checklist
    expect(evidenceNoteFor(c.find((i: ChecklistItem) => i.key === 'INSURANCE'), 'veritan', now)).toBeNull()
  })

  it('a desk’s own check says nothing either, because nobody expected a compliance record from it', () => {
    const c = (markItem(newChecklist(), 'VENDOR_SCREENING', 'HELD', null, now) as any).checklist
    expect(evidenceNoteFor(c.find((i: ChecklistItem) => i.key === 'VENDOR_SCREENING'), 'veritan', now)).toBeNull()
    const bank = (markItem(newChecklist(), 'BANK', 'HELD', null, now) as any).checklist
    expect(evidenceNoteFor(bank.find((i: ChecklistItem) => i.key === 'BANK'), 'veritan', now)).toBeNull()
  })

  it('a verified item still short of its two dates says which dates are wanted', () => {
    const c = (markItem(newChecklist(), 'GOOD_STANDING', 'HELD', null, now) as any).checklist
    const note = evidenceNoteFor(c.find((i: ChecklistItem) => i.key === 'GOOD_STANDING'), 'veritan', now)!
    expect(note.onRecord).toBe(false)
    expect(note.renders).toBeNull()
    expect(note.says).toContain('the day it starts and the day it runs out')
  })

  it('nothing is said about an item no desk has touched, or one a desk waived', () => {
    const c = newChecklist()
    expect(evidenceNoteFor(c.find((i) => i.key === 'INSURANCE')!, 'veritan', now)).toBeNull()
    const waived = (markItem(c, 'INSURANCE', 'WAIVED', 'Covered by the parent policy.', now) as any).checklist
    expect(evidenceNoteFor(waived.find((i: ChecklistItem) => i.key === 'INSURANCE'), 'veritan', now)).toBeNull()
  })

  it('an item that is part certificate and part screening report says which half is not on the record', () => {
    // One line answering two things at once — a pack holding a
    // certificate and a report. What may be recorded is recorded, and
    // what may not is named rather than dropped.
    const item: ChecklistItem = {
      key: 'SUPPLIER_PACK', label: 'Compliance pack', required: true, by: 'VENDOR', desk: 'HR',
      state: 'HELD', note: null, at: now.toISOString(), fileName: 'pack.pdf',
      answers: ['GOOD_STANDING', 'BACKGROUND_CHECK'], validFrom: iso(-30), validUntil: iso(335),
    }
    const note = evidenceNoteFor(item, 'veritan', now)!
    expect(note.onRecord).toBe(true)
    expect(note.says).toContain('goes on the compliance record')
    expect(note.says).toContain('not this desk’s to render')
  })

  it('who renders a verdict is asked of regulation’s own table, never of a list kept here', () => {
    expect(whoRendersItem({ answers: ['BACKGROUND_CHECK'] })).toBe('PROVIDER')
    expect(whoRendersItem({ answers: ['DRUG_SCREENING'] })).toBe('PROVIDER')
    expect(whoRendersItem({ answers: ['I9_EVERIFY'] })).toBe('EMPLOYER')
    // An insurer asserted the cover and printed the dates; a desk
    // repeating that is doing its job.
    expect(whoRendersItem({ answers: ['INSURANCE_GL', 'INSURANCE_WC'] })).toBeNull()
    expect(whoRendersItem({ answers: ['GOOD_STANDING'] })).toBeNull()
    expect(whoRendersItem({})).toBeNull()
  })

  it('the screen shows the sentence beside the item and the route says it out loud', () => {
    const page = read('src/app/dashboard/suppliers/page.tsx')
    // Beside the item, where the desk is looking.
    expect(page).toContain('item.evidence.says')
    // And not reading as verified.
    expect(page).toContain('const nothingRecorded = !!item.evidence && !item.evidence.onRecord')
    const list = read('src/app/api/supplier-requests/route.ts')
    expect(list).toContain('evidenceNoteFor(i, r.supplierCompanyId ?? r.id)')
    const one = read('src/app/api/supplier-requests/[id]/route.ts')
    // The approve replay carries the same sentence for every item it skipped.
    expect(one).toContain('notRecorded: notOurs')
    expect(one).toContain('notOurs.map((n) => n.says).join')
  })
})
