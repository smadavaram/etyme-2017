import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BUILT_IN } from '@/lib/document-type'
import { mayExamine } from '@/lib/document-request'
import { RECORDABLE_ABOUT_A_FIRM, adverseRecordFrom, adverseStep, adverseWaitFor, checkInputFrom, checkToRecord, examinedFromAPacket } from '@/lib/attestation'
import { licenseRenewal } from '@/lib/document-request'
import { OWN_PAPER_POSTED, mayFileOwnPaper, ownPaperFields, ownPaperInput, ownPaperMenu, ownPaperPost, type OwnPaperTyped } from '@/lib/document-stages/own-papers'
import { licenseFieldsFor } from '@/app/dashboard/my-work/paperwork-rows'
import { examineBody, examineFields, examineNeedsOf, type ExamineValues } from '@/lib/document-stages/examine-form'
import { examinationBody } from '@/app/api/packets/examination'
import { NOTICE_THE_FORM_RAISES, adverseFields, recordAdverseBody, recordI9Body, recordVerdictBody, type AdverseStepTyped } from '@/app/dashboard/compliance/record-bodies'

/**
 * Every question a route asks, its screen has a field for.
 *
 * The founder's walker, 2026-11-01: the I-9 on Document requests offered
 * the day it runs out and the edition, Accept was refused with "Say which
 * document Rajesh Iyer showed, and when it runs out", and no field on any
 * screen could answer it, so the start stayed held and no week or bill
 * followed. A test of the rule alone passed, and a test of the screen
 * alone passed; what broke was the join. So this fills in every field
 * each screen draws, posts exactly what that screen posts, and runs the
 * route's own rules on it: a refusal that names a missing field the
 * screen never offered fails here.
 */

const ON = new Date('2026-11-02T12:00:00Z')

/** A plausible answer for every field a dialog can draw. */
const TYPED = (key: string): ExamineValues => ({
  validFrom: '2026-10-15',
  expiresAt: '2027-10-15',
  edition: key === 'I9_EVERIFY' ? '01/20/25' : 'Rev. March 2024',
  issuer: 'Oregon State Board of Nursing',
  licenseNumber: 'RN-448812',
  shownType: 'PASSPORT',
  shownNumber: 'X1234567',
  shownIssuer: 'U.S. Department of State',
  shownExpiresAt: '2030-04-30',
})

/** Only what the dialog draws is typed; everything else stays empty, as on the screen. */
function typedOnScreen(key: string, aboutAFirm: boolean) {
  const needs = examineNeedsOf(key, aboutAFirm)
  const all = TYPED(key)
  const v: ExamineValues = {}
  for (const f of examineFields(needs)) v[f] = all[f]
  return { needs, body: examineBody(needs, v) }
}

const date = (x: unknown) => (typeof x === 'string' && x ? new Date(x) : null)

describe('every question a route asks, its screen has a field for', () => {
  for (const t of BUILT_IN) {
    for (const aboutAFirm of [false, true]) {
      const who = aboutAFirm ? 'a firm' : 'a person'
      it(`accepting the ${t.label} about ${who} with every field the dialog draws filled in is not refused for a field the dialog did not draw`, () => {
        const { body } = typedOnScreen(t.key, aboutAFirm)

        // The paper's own examination (lib/document-request).
        const seen = mayExamine(
          {
            status: 'UPLOADED', templateName: t.label, needsSignature: t.signedBy !== 'NOBODY', issuerName: 'Brightmoor Staffing',
            senderName: aboutAFirm ? 'Tapin' : 'Ravi Kumar',
            type: { key: t.key, label: t.label, validityShape: t.validityShape, signedBy: t.signedBy, reissued: t.reissued },
          },
          { staffOfIssuer: true, isSender: false, examinerName: 'Petra Kalnins' },
          { verdict: 'ACCEPT', validFrom: date(body.validFrom), expiresAt: date(body.expiresAt), edition: (body.edition as string) ?? null },
          ON
        )
        expect(seen.ok, `${t.key}: ${!seen.ok ? `${seen.field}: ${seen.message}` : ''}`).toBe(true)

        // What the review records from it: a person's paper the record reads,
        // or a supplier's certificate onto its standing.
        const records = aboutAFirm ? (RECORDABLE_ABOUT_A_FIRM as readonly string[]).includes(t.key) : examinedFromAPacket(t.key)
        if (!records) return
        const read = checkInputFrom(examinationBody(body), {
          about: aboutAFirm ? 'FIRM' : 'PERSON', type: t.key, subjectName: aboutAFirm ? 'Tapin' : 'Ravi Kumar', recordedBy: 'Petra Kalnins',
        })
        expect(read.ok, `${t.key}: ${!read.ok ? read.message : ''}`).toBe(true)
        if (!read.ok) return
        const recorded = checkToRecord(read.input, ON)
        expect(recorded.ok, `${t.key}: ${!recorded.ok ? `${recorded.field}: ${recorded.message}` : ''}`).toBe(true)
      })
    }
  }

  it('the I-9 dialog asks for the document shown, its number, who issued it and the day it runs out, and no end of the form’s own', () => {
    const needs = examineNeedsOf('I9_EVERIFY', false)
    expect(examineFields(needs)).toEqual(['edition', 'shownType', 'shownNumber', 'shownIssuer', 'shownExpiresAt'])
  })

  it('a license accepted from a request carries its number and its board, filled from what the worker sent', () => {
    const needs = examineNeedsOf('PROFESSIONAL_LICENSE', false)
    expect(examineFields(needs)).toEqual(['expiresAt', 'licenseNumber', 'issuer'])
  })

  it('the I-9 recorded on the Compliance page, with every field filled in, is recorded', () => {
    const body = recordI9Body('line-1', { edition: '01/20/25', doc: 'PASSPORT', docNumber: 'X1234567', docIssuer: 'U.S. Department of State', docExpires: '2030-04-30' })
    const read = checkInputFrom(body, { about: 'PERSON', type: 'I9_EVERIFY', subjectName: 'Ravi Kumar', recordedBy: 'Petra Kalnins' })
    expect(read.ok).toBe(true)
    if (read.ok) expect(checkToRecord(read.input, ON).ok).toBe(true)
  })

  it('a screening company’s report recorded on the Compliance page, answered or only ordered, is recorded', () => {
    for (const outcome of ['CLEAR', 'ORDERED']) {
      const body = recordVerdictBody('line-1', { type: 'BACKGROUND_CHECK', provider: 'Sterling', reference: '4471', renderedOn: '2026-11-01', outcome, providerSays: 'Clear. No records found.' })
      const read = checkInputFrom(body, { about: 'PERSON', type: 'BACKGROUND_CHECK', subjectName: 'Ravi Kumar', recordedBy: 'Petra Kalnins' })
      expect(read.ok).toBe(true)
      if (read.ok) {
        const v = checkToRecord(read.input, ON)
        expect(v.ok, `${outcome}: ${!v.ok ? v.message : ''}`).toBe(true)
      }
    }
  })
})

describe('a worker, a one-person firm or a firm’s team putting its own papers on file', () => {
  const TYPED: Required<OwnPaperTyped> = {
    number: 'RN-448812', issuer: 'Oregon State Board of Nursing', year: '2019', edition: 'Rev. March 2024',
    validFrom: '2026-01-01', validUntil: '2027-12-31',
  }
  const CONTEXTS = [
    { who: 'a worker', menu: ownPaperMenu({ firm: false }), ctx: { isOnePersonFirm: false, filesForFirm: false } },
    { who: 'a one-person firm', menu: ownPaperMenu({ firm: true }), ctx: { isOnePersonFirm: true, filesForFirm: false } },
    { who: 'a firm’s team', menu: ownPaperMenu({ firm: true }).filter((m) => m.about === 'MY_FIRM'), ctx: { isOnePersonFirm: false, filesForFirm: true } },
  ]
  for (const c of CONTEXTS) {
    for (const needs of c.menu) {
      it(`putting the ${needs.label} on file as ${c.who}, with every field the form draws filled in, is not refused for a field the form did not draw`, () => {
        const drawn = ownPaperFields(needs, true)
        const typed: OwnPaperTyped = {}
        for (const f of drawn) if (f !== 'file') typed[f] = TYPED[f]
        const posted = ownPaperPost(needs, typed)
        // Read the way the route reads the form: each name it knows, trimmed, or nothing.
        const fields: Record<string, string | null> = {}
        for (const k of OWN_PAPER_POSTED) fields[k] = posted[k]?.trim() || null
        const v = mayFileOwnPaper(ownPaperInput(fields, { ...c.ctx, canKeepCopy: true, fileName: drawn.includes('file') ? 'paper.pdf' : null }), ON)
        expect(v.ok, `${needs.key}: ${!v.ok ? `${v.field}: ${v.message}` : ''}`).toBe(true)
      })
    }
  }

  it('a license sent from the worker’s own paperwork page carries the number, the board and the day it runs out that the upload asks for', () => {
    const f = licenseFieldsFor({ number: 'RN-448812', issuedBy: 'Oregon State Board of Nursing', expiresOn: '2027-12-31' })
    const v = licenseRenewal({ licenseNumber: f.licenseNumber, issuer: f.issuer, expiresAt: f.expiresAt }, ON)
    expect(v.ok, !v.ok ? v.message : '').toBe(true)
  })

  it('the worker’s own page sends a question’s answer as her words, which is what the route asks for', () => {
    const page = readFileSync(join(process.cwd(), 'src/app/dashboard/my-work/papers.tsx'), 'utf8')
    expect(page).toContain('{ attests: true, note: words }')
    expect(page).toContain("if (!words) throw new Error('Type your answer first.')")
  })

  it('the form draws and posts what the one description says', () => {
    const form = readFileSync(join(process.cwd(), 'src/app/dashboard/documents/own-papers.tsx'), 'utf8')
    expect(form).toContain('ownPaperFields(needs, canKeepCopy)')
    expect(form).toContain('ownPaperPost(needs, f)')
    expect(readFileSync(join(process.cwd(), 'src/app/api/me/papers/route.ts'), 'utf8')).toContain('mayFileOwnPaper(ownPaperInput(fields, {')
  })
})

describe('after a flagged background report', () => {
  const STEPS: AdverseStepTyped[] = ['PRE_NOTICE', 'FINAL', 'NOT_TAKEN']
  for (const step of STEPS) {
    it(`the ${step === 'PRE_NOTICE' ? 'pre-adverse action notice' : step === 'FINAL' ? 'final adverse action notice' : 'decision not to act'}, with every field the form draws filled in, is not refused for a field the form did not draw`, () => {
      const asks = adverseFields(step)
      const body = recordAdverseBody('report-1', 'line-1', step, {
        ...(asks.includes('notice') ? { noticeDocumentId: 'notice-1' } : {}),
        ...(asks.includes('reason') ? { reason: 'The charge was dismissed, and the record does not bear on this job.' } : {}),
      })
      const fresh = adverseRecordFrom([], null)
      const v = adverseStep({
        step: String(body.step),
        check: { type: 'BACKGROUND_CHECK', status: 'FLAGGED', provider: 'Sterling', reference: '4471', orderedByFirm: 'Tapin' },
        callerFirm: 'Tapin', callerOrdered: true, subjectName: 'Ravi Kumar',
        record: step === 'FINAL' ? { ...fresh, preNoticeAt: '2026-10-01T00:00:00.000Z', waitUntil: '2026-10-08T00:00:00.000Z' } : fresh,
        notice: body.noticeDocumentId ? { ...NOTICE_THE_FORM_RAISES } : null,
        reason: typeof body.reason === 'string' ? body.reason : null,
        wait: adverseWaitFor({ country: 'US', state: 'OR', city: 'Portland' }),
        by: 'Petra Kalnins',
      }, ON)
      expect(v.ok, !v.ok ? `${v.field ?? ''}: ${v.message}` : '').toBe(true)
    })
  }

  it('the notice the form raises is a paper about the person, from the firm’s own template, sent, with the copy attached', () => {
    const form = readFileSync(join(process.cwd(), 'src/app/dashboard/compliance/record-check.tsx'), 'utf8')
    expect(form).toContain("subjectType: 'PERSON', subjectId: who.personId")
    expect(form).toContain('/send`')
    expect(form).toContain('/upload`')
    expect(form).toContain('recordAdverseBody(')
    expect(form).toContain("adverseFields(step).includes('notice')")
  })
})

describe('every field a rule can ask for is answered by a field on a screen, or named here as not', () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
  const attestation = read('src/lib/attestation.ts')
  const record = attestation.slice(attestation.indexOf('export function checkToRecord('), attestation.indexOf('\nfunction possessiveOf'))
  const requestLib = read('src/lib/document-request.ts')
  const examine = requestLib.slice(requestLib.indexOf('export function mayExamine('), requestLib.indexOf('\n}\n', requestLib.indexOf('export function mayExamine(')))
  const own = read('src/lib/document-stages/own-papers.ts')
  const ownRule = own.slice(own.indexOf('export function mayFileOwnPaper('), own.indexOf('\n}\n', own.indexOf('export function mayFileOwnPaper(')))
  const adverse = attestation.slice(attestation.indexOf('export function adverseStep('), attestation.indexOf('\n}\n', attestation.indexOf('export function adverseStep(')))
  const renewal = requestLib.slice(requestLib.indexOf('export function licenseRenewal('), requestLib.indexOf('\n}\n', requestLib.indexOf('export function licenseRenewal(')))
  const asked = new Set([
    ...[...record.matchAll(/,\s*'(\w+)'\s*\)/g)].map((m) => m[1]),
    ...[...examine.matchAll(/field: '(\w+)'/g)].map((m) => m[1]),
    ...[...ownRule.matchAll(/field: '(\w+)'/g)].map((m) => m[1]),
    ...[...adverse.matchAll(/field: '(\w+)'/g)].map((m) => m[1]),
    ...[...renewal.matchAll(/field: '(\w+)'/g)].map((m) => m[1]),
  ])

  /** Which screen field answers each question, by the name the body carries. */
  const ANSWERED_BY: Record<string, string> = {
    expiresAt: 'the day it runs out (examine dialog; Record the I-9 for the document behind it)',
    validFrom: 'the day it starts (examine dialog)',
    edition: 'the edition (examine dialog)',
    formEdition: 'the edition (Record the I-9; the examine dialog’s edition, read as formEdition by the route)',
    evidence: 'the document shown, its number, who issued it and the day it runs out (examine dialog and Record the I-9)',
    issuer: 'who issued it (examine dialog, for a license or a firm’s certificate)',
    licenseNumber: 'the license number (examine dialog)',
    reason: 'why it goes back (examine dialog)',
    provider: 'the screening company (Record a screening company’s report)',
    reference: 'their reference (Record a screening company’s report)',
    renderedOn: 'the day they reported (Record a screening company’s report)',
    outcome: 'their answer (Record a screening company’s report)',
    providerSays: 'their words (Record a screening company’s report)',
    file: 'the file (Put on file)',
    number: 'the number on it (Put on file)',
    year: 'the year awarded (Put on file)',
    validUntil: 'the day it runs out (Put on file)',
    noticeDocumentId: 'the notice the form raises from the firm’s template, with the copy attached (after a flagged report)',
  }
  /** Asked by a rule, set by the screen itself rather than typed: no field is owed. */
  const SET_BY_THE_SCREEN: Record<string, string> = {
    verdict: 'Accept it or Send it back, the two buttons',
    type: 'which check, fixed by the form that was opened or the paper being examined',
    step: 'the step, chosen from the form’s list (after a flagged report)',
  }

  it('every field the record and the examination can refuse for is answered by a field on a screen or set by the screen', () => {
    const unanswered = [...asked].filter((f) => !(f in ANSWERED_BY) && !(f in SET_BY_THE_SCREEN))
    expect(unanswered, `asked by a rule and offered by no screen: ${unanswered.join(', ')}`).toEqual([])
  })

  it('the dialog and the Compliance page post the names those answers stand for', () => {
    const form = read('src/lib/document-stages/examine-form.ts')
    for (const k of ['validFrom', 'expiresAt', 'edition', 'issuer', 'licenseNumber']) expect(form).toContain(`'${k}'`)
    expect(form).toContain('evidence: [{')
    const bodies = read('src/app/dashboard/compliance/record-bodies.ts')
    for (const k of ['formEdition', 'evidence', 'provider', 'reference', 'renderedOn', 'outcome', 'providerSays']) expect(bodies).toContain(k)
    expect(read('src/app/dashboard/documents/examine.tsx')).toContain('examineBody(needs, v)')
    expect(read('src/app/dashboard/compliance/record-check.tsx')).toContain('recordI9Body(')
  })
})

/**
 * Supply's forms, on the same rule (etyme-supply, 2026-11-02): Add
 * consultant (the bench ask), the consultant drawer's editor, the person's
 * own stay and yes, and asking somebody to check in. Each form's body is
 * built by a pure function the screen posts (lib/consultant-portfolio/forms,
 * lib/bench-filter's profileEditBody, firm-view's firmViewEditBody), and the
 * route reads it with the readers in the same file; these fill in every
 * field each form draws and run the route's own rules on what it posts.
 */
describe('every question a bench or consultant route asks, its form has a field for', () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
  const typedAdd = (tier: string, engagementType: string) => ({
    name: 'Asha Rao', email: 'asha.rao@example.test', headline: 'ICU travel nurse', skills: ['ICU nursing'], skillDraft: 'ACLS',
    location: 'Portland, OR', workAuth: 'US_CITIZEN', tier, termsEngagementType: engagementType, termsPay: '45', notes: 'Met at the job fair',
  })

  for (const tier of ['MARKETING', 'RETAINED']) {
    for (const engagementType of ['W2', 'IND_1099', '']) {
      it(`Add consultant, kept ${tier === 'RETAINED' ? 'to the firm' : 'shown to partners'}, terms ${engagementType || 'not decided'}, with every field filled in, is not refused for a field the form does not draw`, async () => {
        const { addConsultantBody, readAddConsultant, ADD_CONSULTANT_FIELDS } = await import('@/lib/consultant-portfolio/forms')
        const { listingRates, listingTermsFrom } = await import('@/lib/bench-filter')
        const rates = listingRates({ min: '70', max: '85' }, null)
        expect(rates.ok).toBe(true)
        if (!rates.ok) return
        const body = addConsultantBody(typedAdd(tier, engagementType), rates)
        expect(Object.keys(body).sort()).toEqual([...ADD_CONSULTANT_FIELDS].sort())
        const fields = readAddConsultant(body)
        expect(fields.ok, !fields.ok ? `${fields.field}: ${fields.message}` : '').toBe(true)
        const terms = listingTermsFrom(
          { engagementType: body.termsEngagementType, payRateCents: engagementType ? body.termsPayRateCents : null },
          { personName: 'Asha Rao', firmName: 'Tapin', ownCompany: null, statedById: 'recruiter-1', now: ON }
        )
        expect(terms.ok, !terms.ok ? `${terms.field}: ${terms.says}` : '').toBe(true)
      })
    }
  }

  it('every field the bench ask can refuse for is one Add consultant draws', async () => {
    const { ADD_CONSULTANT_FIELDS } = await import('@/lib/consultant-portfolio/forms')
    const named = new Set<string>()
    // The Add consultant reader only, not the drawer's in the same file.
    const forms = read('src/lib/consultant-portfolio/forms.ts')
    const addReader = forms.slice(forms.indexOf('export function readAddConsultant('), forms.indexOf('// ── The consultant drawer'))
    for (const src of [addReader, read('src/lib/consultant-portfolio/bench-ask.ts'), read('src/app/api/consultants/route.ts')]) {
      for (const m of src.matchAll(/field: '(\w+)'/g)) named.add(m[1])
    }
    // listingTermsFrom names one of its two terms fields.
    named.add('termsEngagementType').add('termsPayRateCents')
    const offered = new Set<string>(ADD_CONSULTANT_FIELDS)
    expect([...named].filter((f) => !offered.has(f))).toEqual([])
  })

  for (const shape of [
    { keptBy: 'FIRM' as const, listed: true, mayRate: true, says: 'the firm keeps the record, read by a role that sees pay' },
    { keptBy: 'FIRM' as const, listed: true, mayRate: false, says: 'the firm keeps the record, read by a recruiter' },
    { keptBy: 'FIRM' as const, listed: false, mayRate: true, says: 'the firm keeps its own employee’s record' },
    { keptBy: 'THEM' as const, listed: true, mayRate: true, says: 'the record is theirs and the firm lists them' },
  ]) {
    it(`the consultant drawer, where ${shape.says}, with every field it draws filled in, is not refused`, async () => {
      const { profileEditorFields, readProfileEdit } = await import('@/lib/consultant-portfolio/forms')
      const { profileEditBody } = await import('@/lib/bench-filter')
      const { firmViewEditBody, profileEditPlan } = await import('@/lib/consultant-portfolio/firm-view')
      const drawn = profileEditorFields(shape)
      let body: Record<string, unknown>
      if (shape.keptBy === 'FIRM') {
        const out = profileEditBody({ skills: 'ICU nursing, ACLS', availableFrom: '2026-11-20', rateFloor: shape.mayRate ? '60' : '' }, shape.mayRate)
        expect(out.ok).toBe(true)
        if (!out.ok) return
        body = out.body
      } else {
        body = firmViewEditBody({ headline: 'ICU travel nurse', skills: 'ICU nursing, ACLS', location: 'Portland, OR', notes: 'Strong on nights' })
      }
      // The body carries exactly what the drawer draws.
      expect(Object.keys(body).sort()).toEqual([...drawn].sort())
      const edit = readProfileEdit(body)
      expect(edit.ok, !edit.ok ? `${edit.field}: ${edit.message}` : '').toBe(true)
      if (!edit.ok) return
      const plan = profileEditPlan({
        isSubject: false,
        ownAccount: shape.keptBy === 'THEM',
        otherFirms: 0,
        hasListing: shape.listed,
        name: 'Asha Rao',
        firm: 'Tapin',
        fields: edit.fields,
      })
      expect(plan.ok, !plan.ok ? `${plan.field}: ${plan.says}` : '').toBe(true)
      // The lowest rate is drawn only where the firm keeps the record, for a
      // seat the route lets set it; where the record is theirs, never.
      expect(drawn.includes('rateFloor')).toBe(shape.keptBy === 'FIRM' && shape.mayRate)
    })
  }

  it('the drawer shows a firm with no listing nothing to fill in where the record is theirs, because the route has nowhere to keep it', async () => {
    const { profileEditorFields } = await import('@/lib/consultant-portfolio/forms')
    expect(profileEditorFields({ keptBy: 'THEM', listed: false, mayRate: true })).toEqual([])
    expect(read('src/app/dashboard/consultants/page.tsx')).toContain("mayRate={hasPermission(session.permissions, 'consultants.cost')}")
  })

  it('every stay the picker offers is one the route takes, from the person’s own page and beside the yes', async () => {
    const { stayBody, answerBody } = await import('@/lib/consultant-portfolio/forms')
    const { STAY_CHOICES, readStay } = await import('@/lib/bench-stay')
    for (const d of [null, ...STAY_CHOICES]) {
      expect(readStay(stayBody('listing-1', d).stayDays).ok).toBe(true)
      const yes = answerBody('ACCEPT', { stayDays: d, showInMatches: false, terms: null }) as { stayDays: unknown }
      expect(readStay(yes.stayDays).ok).toBe(true)
    }
  })

  it('a yes beside the terms the page printed agrees them, and a no needs nothing typed', async () => {
    const { answerBody } = await import('@/lib/consultant-portfolio/forms')
    const { agreeingTerms, termsShown } = await import('@/lib/bench-filter')
    const listing = { termsEngagementType: 'W2', termsPayRateCents: 4500, termsAgreedAt: null }
    const printed = termsShown(listing, 'Tapin')!
    const yes = answerBody('ACCEPT', { stayDays: 25, showInMatches: true, terms: printed }) as { termsSeen: unknown }
    const agreed = agreeingTerms(listing, yes.termsSeen, 'Tapin', ON)
    expect(agreed.ok, !agreed.ok ? agreed.says : '').toBe(true)
    expect(answerBody('DECLINE')).toEqual({ said: 'DECLINE' })
  })

  it('asking somebody to check in posts nothing typed, and the route asks for nothing typed', async () => {
    const { nudgeBody } = await import('@/lib/consultant-portfolio/forms')
    expect(nudgeBody(true)).toEqual({ copyOnly: true })
    expect(read('src/app/api/bench/listings/[id]/nudge/route.ts')).not.toMatch(/field: '/)
  })

  it('each screen posts the body built for it', () => {
    expect(read('src/app/dashboard/consultants/page.tsx')).toContain('body: JSON.stringify(addConsultantBody(form, rates))')
    const editor = read('src/app/dashboard/consultants/profile-editor.tsx')
    expect(editor).toContain('profileEditBody(form, mayRate)')
    expect(editor).toContain('firmViewEditBody(form)')
    const mine = read('src/app/dashboard/my-benches/page.tsx')
    expect(mine).toContain('send(stayBody(b.listingId, d))')
    expect(mine).toContain("answerBody('ACCEPT', {")
    expect(read('src/app/dashboard/bench/page.tsx')).toContain('body: JSON.stringify(nudgeBody(copyOnly))')
    expect(read('src/app/api/consultants/route.ts')).toContain('const read = readAddConsultant(body)')
    expect(read('src/app/api/consultants/[id]/route.ts')).toContain('const edit = readProfileEdit(body)')
  })
})
