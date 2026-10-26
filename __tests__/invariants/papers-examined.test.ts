/**
 * A paper is asked for, answered, and looked at — and after an
 * unfavorable background report the firm that ordered it walks the steps
 * the law leaves with it.
 *
 * The founder, 2026-10-20: "Exchange 10000 documents like insurance, W-9,
 * NCA during submissions and screening and background checks." Walking
 * that through the simulation found two moves that did not exist: the
 * firm that asked for a paper had no way to say it had looked at it, and
 * nothing in the app knew what comes after a flagged report.
 */
import { describe, it, expect } from 'vitest'
import { heldWord, mayAct, mayExamine, mayAskOnTies, providersVerdict, licenseRenewal, licenseFactsFrom, isProfessionalLicense, type ExamineFacts } from '@/lib/document-request'
import { adverseStep, adverseWaitFor, addBusinessDays, adverseRecordFrom, adverseActionFor, type AdverseInput } from '@/lib/attestation'
import { adverseSays, canonicalEdition, publishedFor, credentialChaseNow } from '@/lib/contract-clearance'
import { compile, jurisdictionOf, mayAskOfACandidate, STANDS_ON_RULE, NON_COMPETE_VOID, nonCompeteVoidAt, withoutVoidNonCompete, renewalDueOn, RENEWAL_LEAD_DAYS } from '@/lib/document-stages'
import { checkToRecord } from '@/lib/attestation'
import { StageTally, stageTable, notHeldLines } from '../../scripts/simulate/stages/regulatory/stage-tally'
import { permitEnds, statusOf } from '../../scripts/simulate/stages/regulatory/hiring-papers'
import { newEndOf } from '../../scripts/simulate/stages/regulatory/extend'
import { SCREENING_WISHES } from '../../scripts/simulate/stages/regulatory/documents'
import { pdf, photo, sendFile } from '../../scripts/simulate/stages/regulatory/paper-files'
import { readFileSync } from 'node:fs'

const ON = new Date('2026-10-21T12:00:00Z')
const d = (s: string) => new Date(`${s}T00:00:00Z`)
const iso = (x: Date) => x.toISOString().slice(0, 10)

const gl: ExamineFacts = {
  status: 'UPLOADED', templateName: 'Certificate of general liability insurance', needsSignature: false,
  issuerName: 'Northbend Athletic', senderName: 'Brightmoor Staffing',
  type: { key: 'INSURANCE_GL', label: 'Certificate of general liability insurance', validityShape: 'START_AND_END', signedBy: 'NOBODY', reissued: false },
}
const w9: ExamineFacts = { ...gl, templateName: 'W-9', type: { key: 'W9', label: 'W-9', validityShape: 'NONE', signedBy: 'ONE_PARTY', reissued: true } }
const nda: ExamineFacts = {
  ...gl, status: 'SIGNED', templateName: 'Non-disclosure agreement', needsSignature: true,
  type: { key: 'NDA', label: 'Non-disclosure agreement', validityShape: 'START_AND_END', signedBy: 'BOTH_PARTIES', reissued: false },
}
const sophie = { staffOfIssuer: true, isSender: false, examinerName: 'Sophie Lindgren' }

describe('the firm that asked looks at what arrived', () => {
  it('a certificate of insurance is accepted with the two dates printed on it, and the answer says them', () => {
    const v = mayExamine(gl, sophie, { verdict: 'ACCEPT', validFrom: d('2026-09-01'), expiresAt: d('2027-08-31') }, ON)
    expect(v).toMatchObject({ ok: true, verdict: 'ACCEPT', countersign: false })
    if (v.ok) expect(v.says).toBe('Certificate of general liability insurance from Brightmoor Staffing examined by Sophie Lindgren, good Sep 1, 2026 to Aug 31, 2027.')
  })
  it('a certificate is not accepted without the day it runs out', () => {
    expect(mayExamine(gl, sophie, { verdict: 'ACCEPT', validFrom: d('2026-09-01') }, ON)).toMatchObject({ ok: false, code: 'NO_EXPIRY' })
  })
  it('a certificate is not accepted without the day its cover starts', () => {
    expect(mayExamine(gl, sophie, { verdict: 'ACCEPT', expiresAt: d('2027-08-31') }, ON)).toMatchObject({ ok: false, code: 'NO_START' })
  })
  it('a certificate that has already run out is not accepted, and the answer says to ask for the current one', () => {
    const v = mayExamine(gl, sophie, { verdict: 'ACCEPT', validFrom: d('2025-09-01'), expiresAt: d('2026-08-31') }, ON)
    expect(v).toMatchObject({ ok: false, code: 'LAPSED' })
    if (!v.ok) expect(v.message).toContain('ask Brightmoor Staffing for the current one')
  })
  it('cover that starts next month is accepted and says it covers nobody before then', () => {
    const v = mayExamine(gl, sophie, { verdict: 'ACCEPT', validFrom: d('2026-11-15'), expiresAt: d('2027-11-14') }, ON)
    expect(v.ok && v.says).toContain('It covers nobody before Nov 15, 2026.')
  })
  it('a W-9 is not accepted without the edition printed on it', () => {
    expect(mayExamine(w9, sophie, { verdict: 'ACCEPT' }, ON)).toMatchObject({ ok: false, code: 'NO_EDITION' })
    expect(mayExamine(w9, sophie, { verdict: 'ACCEPT', edition: 'Rev. March 2024' }, ON)).toMatchObject({ ok: true, edition: 'Rev. March 2024' })
  })
  it('an agreement both firms sign is countersigned for the firm that asked when it is accepted', () => {
    const v = mayExamine(nda, sophie, { verdict: 'ACCEPT', validFrom: d('2026-10-21'), expiresAt: d('2029-10-20') }, ON)
    expect(v).toMatchObject({ ok: true, countersign: true })
  })
  it('a paper sent back carries the reason, and goes back to being asked for', () => {
    const v = mayExamine(gl, sophie, { verdict: 'SEND_BACK', reason: 'It names another company as certificate holder.' }, ON)
    expect(v).toMatchObject({ ok: true, verdict: 'SEND_BACK', next: 'SENT' })
    if (v.ok) expect(v.note).toBe('Sent back by Sophie Lindgren on Oct 21, 2026: It names another company as certificate holder.')
  })
  it('a paper is never sent back without a reason', () => {
    expect(mayExamine(gl, sophie, { verdict: 'SEND_BACK' }, ON)).toMatchObject({ ok: false, code: 'NO_REASON' })
  })
  it('nobody examines their own paper', () => {
    const v = mayExamine(gl, { ...sophie, staffOfIssuer: false, isSender: true }, { verdict: 'ACCEPT' }, ON)
    expect(v).toMatchObject({ ok: false, code: 'NOT_YOURS' })
    if (!v.ok) expect(v.message).toContain('Nobody examines their own paper.')
  })
  it('a paper that has not arrived has nothing to examine', () => {
    expect(mayExamine({ ...gl, status: 'SENT' }, sophie, { verdict: 'ACCEPT' }, ON)).toMatchObject({ ok: false, code: 'NOTHING_ARRIVED' })
  })
})

describe('a paper nobody asked for is not put on file', () => {
  const draft = { status: 'PENDING', templateName: 'Resume', needsSignature: false, subjectPersonId: 'p-tariq', issuerName: 'Pinnacle Resourcing' }
  it('the person cannot answer a request the firm drafted and never sent', () => {
    expect(mayAct('upload', draft, { personId: 'p-tariq', staffOfIssuer: false }, { fileUrl: 'x' })).toMatchObject({
      ok: false, code: 'NOT_SENT',
      message: 'Pinnacle Resourcing has not asked you for Resume yet. Nothing goes on file until they ask; then send it here.',
    })
  })
  it('the firm may still record a copy it received some other way', () => {
    expect(mayAct('upload', draft, { personId: 'p-ruth', staffOfIssuer: true }, { fileUrl: 'x' })).toMatchObject({ ok: true })
  })
})

describe('after an unfavorable background report, the firm that ordered it walks the steps', () => {
  const base: AdverseInput = {
    step: 'PRE_NOTICE',
    check: { type: 'BACKGROUND_CHECK', status: 'FLAGGED', provider: 'Sterling', reference: 'STE-4471', orderedByFirm: 'Brightmoor Staffing' },
    callerFirm: 'Brightmoor Staffing', callerOrdered: true, subjectName: 'Helena Marsh', record: {},
    notice: { aboutThisPerson: true, fromThisFirm: true, hasFile: true, sent: true },
    wait: adverseWaitFor({ country: 'US', state: 'OR', city: 'Portland' }), by: 'Dana Whitfield',
  }
  it('the pre-adverse action notice, with the copy of the report, starts a wait of five business days', () => {
    const v = adverseStep(base, ON)
    expect(v.ok).toBe(true)
    if (v.ok) {
      expect(v.record.waitUntil?.slice(0, 10)).toBe('2026-10-28')
      expect(v.says).toContain('Nothing is decided on it before Oct 28, 2026')
    }
  })
  it('the final notice before the wait is over is refused, naming the day it may be given', () => {
    const pre = adverseStep(base, ON)
    const v = adverseStep({ ...base, step: 'FINAL', reason: 'Relevant to the job.', record: pre.ok ? pre.record : {} }, d('2026-10-23'))
    expect(v).toMatchObject({ ok: false, status: 409, code: 'WAITING' })
    if (!v.ok) expect(v.message).toBe('Helena Marsh has until Oct 28, 2026 to answer the background check or dispute it with Sterling. A final decision before then is the step the law puts after the wait.')
  })
  it('the final notice after the wait is given, with the reason kept', () => {
    const pre = adverseStep(base, ON)
    const v = adverseStep({ ...base, step: 'FINAL', reason: 'Relevant to the job.', record: pre.ok ? pre.record : {} }, d('2026-10-28'))
    expect(v).toMatchObject({ ok: true, record: { decision: 'ADVERSE', decisionReason: 'Relevant to the job.' } })
  })
  it('a notice with no copy of the report attached is not a notice', () => {
    expect(adverseStep({ ...base, notice: { ...base.notice!, hasFile: false } }, ON)).toMatchObject({ ok: false, code: 'NO_COPY' })
  })
  it('deciding not to act on the report needs no wait, only the reason', () => {
    expect(adverseStep({ ...base, step: 'NOT_TAKEN' }, ON)).toMatchObject({ ok: false, code: 'NO_REASON' })
    expect(adverseStep({ ...base, step: 'NOT_TAKEN', reason: 'The charge was dismissed.' }, ON)).toMatchObject({ ok: true, record: { decision: 'NOT_TAKEN' } })
  })
  it('only the firm that ordered the check gives the notices', () => {
    expect(adverseStep({ ...base, callerOrdered: false, callerFirm: 'Northbend Athletic' }, ON)).toMatchObject({ ok: false, status: 403, code: 'NOT_YOURS_TO_ACT' })
  })
  it('a clear report has nothing to act on', () => {
    expect(adverseStep({ ...base, check: { ...base.check, status: 'CLEAR' } }, ON)).toMatchObject({ ok: false, code: 'NOTHING_ADVERSE' })
  })
  it('the wait is the city’s where the city has its own, then the state’s, then the federal one', () => {
    expect(adverseWaitFor({ country: 'US', state: 'PA', city: 'Philadelphia' })?.businessDays).toBe(10)
    expect(adverseWaitFor({ country: 'US', state: 'CA', city: 'Fresno' })?.key).toBe('US-CA')
    expect(adverseWaitFor({ country: 'US', state: 'OR' })?.key).toBe('US')
  })
  it('outside the United States the table says it carries no rule, rather than guessing one', () => {
    expect(adverseWaitFor({ country: 'IN', state: 'KA' })).toBeNull()
    expect(adverseStep({ ...base, wait: null }, ON)).toMatchObject({ ok: false, code: 'NOT_CARRIED' })
  })
  it('each step is one row of its own beside the report, and the steps on file are read back as the record the next step is judged against', () => {
    const pre = adverseStep(base, ON)
    if (!pre.ok) throw new Error(pre.message)
    const row = adverseActionFor('PRE_NOTICE', pre.record, { verificationId: 'v1', companyId: 'c1', sellContractId: 's1', byId: 'p-dana', noticeDocumentId: 'n1', on: ON })
    expect(row).toMatchObject({ step: 'PRE_NOTICE', reportCopySent: true, noticeDocumentId: 'n1', reason: null, sellContractId: 's1' })
    expect(row.waitEndsAt?.toISOString().slice(0, 10)).toBe('2026-10-28')
    const record = adverseRecordFrom([{ ...row, by: { name: 'Dana Whitfield' } }])
    // A second pre-adverse notice is refused off the row, and the final notice waits for the day on it.
    expect(adverseStep({ ...base, record }, ON)).toMatchObject({ ok: false, code: 'ALREADY_GIVEN' })
    expect(adverseStep({ ...base, step: 'FINAL', reason: 'Relevant to the job.', record }, d('2026-10-23'))).toMatchObject({ ok: false, code: 'WAITING' })
  })
  it('a decision not to act, read from its row, stops the start from warning about the report, and a report decided before the table existed still reads decided', () => {
    const flagged = { type: 'BACKGROUND_CHECK', status: 'FLAGGED', provider: 'Sterling', referenceId: 'STE-4471', verifiedAt: d('2026-10-01'), result: { outcome: 'FLAGGED' } }
    expect(adverseSays([flagged], 'Helena Marsh')).toHaveLength(1)
    const decided = { ...flagged, adverseActions: [{ step: 'NOT_TAKEN', sentAt: d('2026-10-03'), reason: 'The charge was dismissed.', by: { name: 'Dana Whitfield' } }] }
    expect(adverseSays([decided], 'Helena Marsh')).toHaveLength(0)
    expect(adverseRecordFrom(decided.adverseActions)).toMatchObject({ decision: 'NOT_TAKEN', decisionReason: 'The charge was dismissed.', decidedBy: 'Dana Whitfield' })
    const older = { ...flagged, result: { outcome: 'FLAGGED', adverse: { decision: 'NOT_TAKEN', decisionReason: 'Dismissed.' } } }
    expect(adverseSays([older], 'Helena Marsh')).toHaveLength(0)
  })
  it('business days skip the weekend', () => {
    expect(addBusinessDays(d('2026-10-23'), 1).toISOString().slice(0, 10)).toBe('2026-10-26')
  })
})

describe('the documents station', () => {
  it('the founder’s screening list moves the ID, the I-9, the background check and its identifiers to the award, and drops nothing', () => {
    const c = compile(SCREENING_WISHES, 'US')
    expect(c.application.map((a) => a.key)).toEqual(['RESUME', 'DEGREE', 'RIGHT_TO_WORK_Q', 'BACKGROUND_CHECK_Q'])
    expect(c.engagement.map((a) => a.key).sort()).toEqual(['BACKGROUND_CHECK', 'DOB_SSN', 'I9_EVERIFY', 'RIGHT_TO_WORK'])
    expect(c.application.length + c.engagement.length).toBe(SCREENING_WISHES.length + 2)
  })
  it('every file sent is a real PDF or photograph of a few kilobytes, and no two are the same bytes', () => {
    const a = pdf('a.pdf', 'W-9', ['Holder: Brightmoor Staffing'])
    const b = pdf('a.pdf', 'W-9', ['Holder: Brightmoor Staffing'])
    const p = photo('passport.png')
    expect(a.bytes.subarray(0, 5).toString()).toBe('%PDF-')
    expect(a.bytes.subarray(-6).toString()).toBe('%%EOF\n')
    expect(p.bytes.subarray(1, 4).toString()).toBe('PNG')
    expect(a.bytes.equals(b.bytes)).toBe(false)
    for (const f of [a, p]) expect(f.bytes.length).toBeGreaterThan(1500)
    for (const f of [a, p]) expect(f.bytes.length).toBeLessThan(20_000)
  })
})

describe('a simulated seat sends a file in its own session', () => {
  it('a file goes through the seat’s own upload, with its fields, and the station never reads the session cookie', async () => {
    const sent: { path: string; form: FormData }[] = []
    const actor = { upload: async (path: string, form: FormData) => { sent.push({ path, form }); return { status: 201, json: {}, ms: 1, ok: true, sentence: null } } }
    const file = pdf('passport.pdf', 'Passport', ['A line'])
    const res = await sendFile({} as never, actor as never, '/api/me/papers', file, { documentId: 'd1' })
    expect(res.ok).toBe(true)
    expect(sent).toHaveLength(1)
    expect(sent[0].path).toBe('/api/me/papers')
    expect(sent[0].form.get('documentId')).toBe('d1')
    expect((sent[0].form.get('file') as File).name).toBe('passport.pdf')
    const source = readFileSync('scripts/simulate/stages/regulatory/paper-files.ts', 'utf8')
    expect(source).not.toMatch(/cookie/i)
  })
})

/**
 * Documents at every stage (the founder, 2026-10-22: "Can you simulate
 * request of documents at every stage and give me a test script").
 * Questions at application, documents at award, at the one door a
 * request about a person is made through; and the table the run writes.
 */
describe('a firm asks a person for a paper only at the stage the law allows', () => {
  const ask = (typeKey: string | null, label: string, offered = false, jurisdiction: 'US' | 'UK' | 'DEFAULT' = 'US') =>
    mayAskOfACandidate({ typeKey, label, personName: 'Linnea Qadri', offered, jurisdiction })

  it('a passport asked of somebody nobody has offered work is refused, says why in the firm’s own country’s terms, and offers the question instead', () => {
    const v = ask('PASSPORT', 'Passport')
    expect(v).toMatchObject({ ok: false, code: 'TOO_EARLY' })
    if (!v.ok) {
      expect(v.message).toContain('Passport is asked for after an offer, and Linnea Qadri has not been offered work here.')
      expect(v.message).toContain('document abuse')
      expect(v.message).toContain('Ask this instead: “Are you authorized to work in this country')
      expect(v.message).toContain('Once Linnea Qadri is offered the work, ask for it then.')
    }
  })
  it('the same refusal in the UK says the UK’s reason, not the US one', () => {
    const v = ask('PASSPORT', 'Passport', false, 'UK')
    expect(!v.ok && v.message).toContain('discrimination itself')
    expect(!v.ok && v.message).not.toContain('document abuse')
  })
  it('a background check asked before an offer is refused, and the background question is offered in its place', () => {
    const v = ask('BACKGROUND_CHECK', 'Background check')
    expect(v.ok).toBe(false)
    if (!v.ok) {
      expect(v.message).toContain('before a conditional offer')
      expect(v.insteadAsk).toContain('Is there anything that would prevent you passing a background check')
    }
  })
  it('a visa, an I-94 record and a work permit stand on the right-to-work row and are refused before an offer', () => {
    for (const k of ['VISA', 'I94', 'WORK_PERMIT', 'GREEN_CARD', 'DRIVERS_LICENSE']) expect(ask(k, k).ok, k).toBe(false)
    expect(STANDS_ON_RULE.I94).toBe('RIGHT_TO_WORK')
  })
  it('an I-9 and a drug screen are refused before an offer too', () => {
    expect(ask('I9_EVERIFY', 'I-9 and E-Verify').ok).toBe(false)
    expect(ask('DRUG_SCREENING', 'Drug screening').ok).toBe(false)
  })
  it('the same papers asked once the work is offered go through', () => {
    for (const k of ['PASSPORT', 'BACKGROUND_CHECK', 'I94', 'I9_EVERIFY']) expect(ask(k, k, true).ok, k).toBe(true)
  })
  it('a résumé, a license and a non-disclosure agreement may be asked at application', () => {
    for (const k of ['RESUME', 'PROFESSIONAL_LICENSE', 'NDA']) expect(ask(k, k).ok, k).toBe(true)
  })
  it('a paper whose type is not known is not refused, because the table carries no rule for it', () => {
    expect(ask(null, 'Hot floor induction').ok).toBe(true)
  })
  it('a company’s country picks the table’s jurisdiction, and a country with no row of its own reads the default', () => {
    expect(jurisdictionOf('US')).toBe('US')
    expect(jurisdictionOf('GB')).toBe('UK')
    expect(jurisdictionOf('de')).toBe('EU')
    expect(jurisdictionOf('AE')).toBe('DEFAULT')
    expect(jurisdictionOf(null)).toBe('DEFAULT')
  })
})

describe('an I-94 record goes on a person’s file', () => {
  const i94 = { about: 'PERSON' as const, type: 'I94', subjectName: 'Sunil Raghavan', recordedBy: 'Tom Adeyemi', issuer: 'U.S. Customs and Border Protection' }
  it('an I-94 is recorded with the admit-until date printed on it', () => {
    expect(checkToRecord({ ...i94, expiresAt: d('2028-03-01') }, ON).ok).toBe(true)
  })
  it('an I-94 with no admit-until date is refused, because a paper that runs out needs its date', () => {
    expect(checkToRecord(i94, ON)).toMatchObject({ ok: false, code: 'NO_EXPIRY' })
  })
})

describe('the run’s table of documents at every stage', () => {
  it('has one row per stage, in the founder’s order, with the counts and the sentence that shows the rule', () => {
    const t = new StageTally()
    t.names('company registration', 'W-9', 'a supplier joining a client')
    t.asked('company registration', 3)
    t.answered('company registration', 3)
    t.examined('company registration', 2)
    t.sentBack('company registration')
    t.refusal('company registration', { status: 422, sentence: 'A certificate runs out, so it cannot go on file without the date printed on it.' }, 'runs out', { best: true })
    const table = stageTable(t)
    const rows = table.split('\n').slice(2)
    expect(rows.map((r) => r.split(' | ')[0].replace('| ', ''))).toEqual([
      'Onboarding', 'Company registration', 'Worker registration', 'Shortlisting', 'Interview', 'Hiring', 'Contract and extension',
    ])
    expect(rows[1]).toBe('| Company registration | W-9 | a supplier joining a client | 3 | 3 | 2 | 1 | 1 | “A certificate runs out, so it cannot go on file without the date printed on it.” |')
  })
  it('a refusal that did not come is listed as a rule that did not hold, and never counted as refused', () => {
    const t = new StageTally()
    expect(t.refusal('hiring', { status: 201, sentence: null }, 'I-9', { rule: 'nobody starts without an I-9' })).toBe(false)
    expect(t.rows.get('hiring')!.refused).toBe(0)
    expect(notHeldLines(t)).toEqual(['- hiring: nobody starts without an I-9 (answered 201)'])
  })
  it('a refusal with the wrong words is not counted as the rule holding', () => {
    const t = new StageTally()
    expect(t.refusal('interview', { status: 403, sentence: 'Something else entirely.' }, 'is not part of your seat')).toBe(false)
  })
})

describe('the dates the hiring and extension steps work from', () => {
  it('a work permit runs out six weeks after the placement’s last day, never sooner than ten weeks from today', () => {
    expect(iso(permitEnds(d('2027-03-01'), ON))).toBe('2027-04-12')
    expect(iso(permitEnds(d('2026-11-01'), ON))).toBe('2026-12-30')
  })
  it('the same person shows the same papers every run', () => {
    expect(statusOf('person-123')).toBe(statusOf('person-123'))
    expect(['PASSPORT', 'WORK_PERMIT', 'VISA']).toContain(statusOf('anyone'))
  })
  it('the extension’s new end date is the old end plus whole months, the way the route counts it', () => {
    expect(iso(newEndOf(d('2027-01-15'), 3, ON))).toBe('2027-04-15')
    expect(iso(newEndOf(null, 1, ON))).toBe('2026-11-21')
  })
})

describe('the screens reach the rules (the walk on screens, 2026-10-22)', () => {
  it('a firm cannot ask somebody it has only invited for a paper, and is told she has not said yes yet', () => {
    const v = mayAskOnTies({ personName: 'Tobias Wren', firmName: 'Veritan Talent', listing: 'INVITED', otherTie: false })
    expect(v).toMatchObject({ ok: false, code: 'NOT_YET_HERS' })
    if (!v.ok) expect(v.message).toBe('Tobias Wren has not said yes to Veritan Talent yet. Papers are asked once they agree to be on your bench.')
  })
  it('somebody who said no is not asked either, and the sentence says so', () => {
    const v = mayAskOnTies({ personName: 'Chidi Okafor', firmName: 'Veritan Talent', listing: 'DECLINED', otherTie: false })
    expect(!v.ok && v.message).toBe('Chidi Okafor said no to Veritan Talent, so Veritan Talent cannot ask them for papers.')
  })
  it('a yes, an employment, a submission or a line is a tie, and the paper may be asked', () => {
    expect(mayAskOnTies({ personName: 'A', firmName: 'B', listing: 'GRANTED', otherTie: false }).ok).toBe(true)
    expect(mayAskOnTies({ personName: 'A', firmName: 'B', listing: 'INVITED', otherTie: true }).ok).toBe(true)
    expect(mayAskOnTies({ personName: 'A', firmName: 'B', listing: null, otherTie: false }).ok).toBe(true)
  })
  it('a drug screen or a background check asked as a paper is a provider’s verdict, so the worker is offered nothing to attach', () => {
    expect(providersVerdict('Drug screening')).toBe(true)
    expect(providersVerdict('Background check')).toBe(true)
    expect(providersVerdict('Drug screening authorization')).toBe(false)
    expect(providersVerdict('Resume')).toBe(false)
  })
})

describe('a non-compete is not asked where the state voids it for workers', () => {
  const nca = { key: 'NCA', label: 'Non-compete agreement', required: true, blocks: false, waived: false, waivedSays: null as string | null }
  const nda = { key: 'NDA', label: 'Non-disclosure agreement', required: true, blocks: false, waived: false, waivedSays: null as string | null }
  it('a worker on a California site is not asked for a non-compete, the row says why with the statute, and nothing is asked in its place', () => {
    const set = withoutVoidNonCompete([nca, nda], { country: 'US', state: 'CA' })
    expect(set).toHaveLength(2)
    expect(set[0]).toMatchObject({ key: 'NCA', required: false, blocks: false, waived: true })
    expect(set[0].waivedSays).toBe('Not asked: a non-compete is void for workers in California (Cal. Bus. & Prof. Code §16600 and §16600.5), so it is not a paper anybody may ask for there.')
    expect(set[1]).toEqual(nda)
  })
  it('Minnesota, North Dakota and Oklahoma are named with their own statutes, and a full state name reads the same as its code', () => {
    for (const s of ['MN', 'ND', 'OK', 'Minnesota']) expect(nonCompeteVoidAt({ country: 'US', state: s }), s).not.toBeNull()
    expect(NON_COMPETE_VOID.MN.source).toContain('181.988')
  })
  it('a site in a state the table does not name, or outside the US, still asks for the non-compete', () => {
    expect(withoutVoidNonCompete([nca], { country: 'US', state: 'TX' })[0]).toEqual(nca)
    expect(withoutVoidNonCompete([nca], { country: 'IN', state: 'CA' })[0]).toEqual(nca)
    expect(withoutVoidNonCompete([nca], null)[0]).toEqual(nca)
  })
})

describe('the routes refuse what only the screen used to (found by supply, 2026-10-22)', () => {
  const question = { status: 'SENT', templateName: 'Work authorization — the question', needsSignature: true, subjectPersonId: 'p1', issuerName: 'Brightmoor Staffing' }
  const her = { personId: 'p1', staffOfIssuer: false }
  it('a stand-in screening question signed with no answer is refused, and the sentence repeats the question', () => {
    const v = mayAct('sign', question, her, { attests: true, note: '   ' })
    expect(v).toMatchObject({ ok: false, code: 'NO_ANSWER' })
    if (!v.ok) expect(v.message).toBe('Answer the question before you send it: “Are you authorized to work in the US, and will you need sponsorship now or in the future?”')
  })
  it('the same question with an answer goes on file', () => {
    expect(mayAct('sign', question, her, { attests: true, note: 'Authorized; no sponsorship needed.' }).ok).toBe(true)
  })
  it('a license renewal is sent with its number, who issued it and the new expiry, and the three come back for the examine step', () => {
    const v = licenseRenewal({ licenseNumber: 'RN-482113', issuer: 'Oregon State Board of Nursing', expiresAt: '2028-03-31' }, ON)
    expect(v.ok).toBe(true)
    if (v.ok) {
      expect(v.note).toBe('License RN-482113, issued by Oregon State Board of Nursing, runs out 2028-03-31.')
      expect(licenseFactsFrom(v.note)).toEqual({ licenseNumber: 'RN-482113', issuer: 'Oregon State Board of Nursing', expiresAt: '2028-03-31' })
    }
  })
  it('a license with no number, no issuer or no expiry is refused, naming the missing field', () => {
    expect(licenseRenewal({ issuer: 'Board', expiresAt: '2028-01-01' }, ON)).toMatchObject({ ok: false, field: 'licenseNumber' })
    expect(licenseRenewal({ licenseNumber: 'RN-1', expiresAt: '2028-01-01' }, ON)).toMatchObject({ ok: false, field: 'issuer' })
    expect(licenseRenewal({ licenseNumber: 'RN-1', issuer: 'Board' }, ON)).toMatchObject({ ok: false, field: 'expiresAt' })
  })
  it('a license whose expiry has already passed is refused, and told to send the renewed one', () => {
    const v = licenseRenewal({ licenseNumber: 'RN-1', issuer: 'Board', expiresAt: '2026-09-30' }, ON)
    expect(v).toMatchObject({ ok: false, field: 'expiresAt' })
    if (!v.ok) expect(v.message).toContain('Send the renewed one, with its new expiry date.')
  })
  it('a professional license is a license; a driver’s license is not', () => {
    expect(isProfessionalLicense('Professional license', 'PROFESSIONAL_LICENSE')).toBe(true)
    expect(isProfessionalLicense('RN license renewal', null)).toBe(true)
    expect(isProfessionalLicense('Driver’s license', 'DRIVERS_LICENSE')).toBe(false)
  })
})

describe('a renewal request falls due before the paper lapses', () => {
  const OCT22 = new Date('2026-10-22T15:00:00Z')
  it('Colleen Byrne’s license lapses Nov 15, so the request for its renewal is due Nov 1, fourteen days before, not Dec 6', () => {
    expect(iso(renewalDueOn(24, OCT22))).toBe('2026-11-01')
    expect(RENEWAL_LEAD_DAYS).toBe(14)
  })
  it('a paper lapsing within fourteen days, already lapsed, or with no end recorded is due today, and can still be answered today', () => {
    for (const left of [10, 0, -5, null]) {
      const due = renewalDueOn(left, OCT22)
      expect(iso(due), String(left)).toBe('2026-10-22')
      expect(due.getTime()).toBeGreaterThan(OCT22.getTime())
    }
  })
})

describe('an I-9 edition is read the way the issuer prints it', () => {
  it('an I-9 recorded as edition 08/01/2023 is the 08/01/23 edition, not an out-of-date one', () => {
    expect(canonicalEdition('08/01/2023')).toBe('08/01/23')
    expect(canonicalEdition('8/1/23')).toBe('08/01/23')
    expect(canonicalEdition('01/20/25')).toBe('01/20/25')
    expect(publishedFor('I9_EVERIFY', canonicalEdition('08/01/2023'), new Date('2025-03-01T00:00:00Z')).map((e) => e.edition)).toEqual(['08/01/23'])
  })
  it('an edition that is not a date is left as it was typed', () => {
    expect(canonicalEdition('Rev. March 2024')).toBe('Rev. March 2024')
  })
})

describe('one count of days on one page', () => {
  it('a paper’s days left are the same number everywhere on one page', () => {
    // Colleen Byrne's license, read on the 26th: the request for its
    // renewal was raised days earlier and stored "runs out in 24 days".
    const license = {
      type: 'PROFESSIONAL_LICENSE', status: 'CLEAR', issuedAt: d('2024-11-10'), validFrom: d('2024-11-10'),
      expiresAt: d('2026-11-08'), verifiedAt: d('2026-08-20'), provider: 'Wisconsin Board of Nursing',
      result: { license: 'RN 154-882', state: 'WI' },
    }
    const on = new Date('2026-10-26T15:00:00Z')
    const top = heldWord(license.expiresAt, on)
    const below = credentialChaseNow([license], on)
    const count = (s: string) => Number(/in (\d+) days?/.exec(s)?.[1])
    expect(count(top)).toBe(13)
    expect(below).not.toBeNull()
    expect(count(below!)).toBe(count(top))
    expect(below).not.toContain('24 days')
  })
})
