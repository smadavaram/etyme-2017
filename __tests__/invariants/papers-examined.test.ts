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
import { mayAct, mayExamine, type ExamineFacts } from '@/lib/document-request'
import { adverseStep, adverseWaitFor, addBusinessDays, adverseRecordFrom, adverseActionFor, type AdverseInput } from '@/lib/attestation'
import { adverseSays } from '@/lib/contract-clearance'
import { compile } from '@/lib/document-stages'
import { SCREENING_WISHES } from '../../scripts/simulate/stages/regulatory/documents'
import { pdf, photo, sendFile } from '../../scripts/simulate/stages/regulatory/paper-files'
import { readFileSync } from 'node:fs'

const ON = new Date('2026-10-21T12:00:00Z')
const d = (s: string) => new Date(`${s}T00:00:00Z`)

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
