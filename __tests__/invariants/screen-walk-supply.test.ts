import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  paperRows, outstanding, paperworkHeadline, sectionOf, rowsInSection, SECTIONS,
  isLicenseRow, licenseFieldsFor,
} from '@/app/dashboard/my-work/paperwork-rows'
import { readBench, onTheBench, askedSays, ASKED_HEADING } from '@/lib/bench-filter'
import {
  clientEndingChoices, suggestedExtensionEnd, firstExtensionDay,
  extendFormSays, extendBody, readExtendRefusal,
} from '@/lib/releasing-soon'

/**
 * The supply side of the screen walk of 2026-10-22 ("Papers at every
 * stage, walked on screens"): the routes held the rules and the screens
 * did not reach them. A worker could not type an answer to the two
 * questions asked before any offer; a client's Extend gave three months
 * and no box for a reason; a person only invited read as on the bench.
 *
 * Nothing here assumes the work is software: the people are a travel
 * nurse and a validation engineer as readily as a developer.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const PAPERS = read('src/app/dashboard/my-work/papers.tsx')
const ROLLOFF = read('src/app/dashboard/rolloff/page.tsx')
const BENCH_PAGE = read('src/app/dashboard/bench/page.tsx')
const BENCH_ROUTE = read('src/app/api/bench/route.ts')

const question = (over: Record<string, unknown> = {}) => ({
  id: 'doc-q1', kind: 'DOCUMENT', name: 'Work authorization — the question',
  askedBy: 'Brightmoor Staffing', status: 'SENT', word: 'Asked for', needsSignature: true, todo: 'sign',
  ...over,
})

describe('A worker answers the questions asked before any offer', () => {
  it('a question asked before any offer is shown as the question itself, with a box to type the answer, never as a paper to sign', () => {
    const [row] = paperRows({ papers: [question()] })
    expect(row.todo).toBe('answer')
    expect(row.question).toBe('Are you authorized to work in the US, and will you need sponsorship now or in the future?')
    expect(row.word).toBe('Not answered yet')
    expect(sectionOf(row)).toBe('QUESTION')
    expect(PAPERS).toContain("{r.todo === 'answer' && (")
    expect(PAPERS).toContain('Your answer')
    expect(PAPERS).toContain('<textarea')
    expect(PAPERS).toContain("'Send my answer'")
  })

  it('a question is answered with her own words, sent as her signed answer to the question’s own request', () => {
    expect(PAPERS).toContain("post(`/api/documents/${id}/sign`, { attests: true, note: words })")
    // Nothing typed, nothing sent: an empty answer answers nothing.
    expect(PAPERS).toContain("if (!words) throw new Error('Type your answer first.')")
    expect(PAPERS).toContain("disabled={busy === r.id || !(typed[r.id] ?? '').trim()}")
  })

  it('the background question is a question too, and a paper that needs a signature is still signed', () => {
    const rows = paperRows({
      papers: [
        question({ id: 'doc-q2', name: 'Background check — the question' }),
        { id: 'doc-nda', kind: 'DOCUMENT', name: 'Non-disclosure agreement', askedBy: 'Brightmoor Staffing', status: 'SENT', todo: 'sign', needsSignature: true, word: 'Asked for' },
      ],
    })
    const bg = rows.find((r) => r.id === 'doc-q2')!
    expect(bg.todo).toBe('answer')
    expect(bg.question).toMatch(/background check/)
    const nda = rows.find((r) => r.id === 'doc-nda')!
    expect(nda.todo).toBe('sign')
    expect(nda.question).toBeNull()
    expect(sectionOf(nda)).toBe('DOCUMENT')
  })

  it('an answered question reads as answered, under its own heading, and asks nothing more of her', () => {
    const [row] = paperRows({ papers: [question({ status: 'SIGNED', todo: null, word: 'Signed' })] })
    expect(row.todo).toBeNull()
    expect(row.word).toBe('Answered')
    expect(sectionOf(row)).toBe('DONE')
    expect(outstanding([row])).toHaveLength(0)
  })

  it('the paperwork headline counts questions as questions, never as documents she owes', () => {
    const two = paperRows({ papers: [question(), question({ id: 'doc-q2', name: 'Background check — the question' })] })
    expect(paperworkHeadline(two)).toBe('2 questions are waiting for your answer.')
    const one = paperRows({ papers: [question()] })
    expect(paperworkHeadline(one)).toBe('One question is waiting for your answer.')
    const mixed = paperRows({
      papers: [
        question(),
        { id: 'doc-cv', kind: 'DOCUMENT', name: 'Résumé', status: 'SENT', todo: 'upload', word: 'Asked for' },
      ],
    })
    expect(paperworkHeadline(mixed)).toBe('1 document and 1 question are still needed from you.')
  })
})

describe('Every heading on the worker’s paperwork says what it asks of her', () => {
  it('a paper she is asked to send sits under a heading that asks her to send it, not to sign it', () => {
    const [cv] = paperRows({ papers: [{ id: 'doc-cv', kind: 'DOCUMENT', name: 'State nursing license', status: 'SENT', todo: 'upload', word: 'Asked for' }] })
    expect(sectionOf(cv)).toBe('ASKED')
    const heading = SECTIONS.find((s) => s.key === 'ASKED')!
    expect(heading.title).toBe('Asked of you')
    expect(heading.title + heading.blurb).not.toMatch(/sign/i)
  })

  it('a paper she has already signed or sent no longer sits under a heading asking her to act', () => {
    const rows = paperRows({
      papers: [
        { id: 'doc-1', kind: 'DOCUMENT', name: 'Clean-room induction record', status: 'UPLOADED', todo: null, word: 'On file' },
        { id: 'doc-2', kind: 'DOCUMENT', name: 'Non-disclosure agreement', status: 'SIGNED', todo: null, word: 'Signed', needsSignature: true },
      ],
    })
    expect(rowsInSection(rows, 'DONE').map((r) => r.id)).toEqual(['doc-1', 'doc-2'])
    expect(rowsInSection(rows, 'DOCUMENT')).toHaveLength(0)
    expect(rowsInSection(rows, 'ASKED')).toHaveLength(0)
  })

  it('the headings read in the order she acts: what she owes, what she answers, sends and signs, then what is with them, then her file', () => {
    expect(SECTIONS.map((s) => s.title)).toEqual([
      'Still needed from you', 'Questions to answer', 'Asked of you', 'Sent to you to sign',
      'Asked for, with a link', 'Sent, waiting to be checked', 'Answered', 'On your file',
    ])
    expect(SECTIONS.find((s) => s.key === 'QUESTION')!.blurb).toContain('No document is asked for yet.')
  })
})

describe('Only a live yes puts somebody on the bench', () => {
  it('somebody invited and not answered is not on the bench', () => {
    expect(onTheBench({ state: 'INVITED', revokedAt: null, lapsedAt: null })).toBe(false)
    expect(onTheBench({ state: 'DECLINED', revokedAt: null, lapsedAt: null })).toBe(false)
    expect(onTheBench({ state: 'GRANTED', revokedAt: null, lapsedAt: null })).toBe(true)
  })

  it('a yes taken back, or a stay that ran out, takes a person off the bench', () => {
    expect(onTheBench({ state: 'GRANTED', revokedAt: new Date('2026-10-01T00:00:00Z'), lapsedAt: null })).toBe(false)
    expect(onTheBench({ state: 'GRANTED', revokedAt: null, lapsedAt: new Date('2026-10-01T00:00:00Z') })).toBe(false)
  })

  const listing = (id: string, name: string, consent: string, tier = 'MARKETING') => ({
    id, tier, consent, consultant: { id: `c-${id}`, person: { id: `p-${id}`, name }, skills: ['Process validation'] },
    company: { id: 'nimbus', name: 'Nimbus Validation' },
  })

  it('the bench reading keeps whom the firm asked apart from whom it may market, and counts neither as the other', () => {
    const r = readBench({
      data: {
        tiers: { MARKETING: [listing('l1', 'Ayesha Okafor', 'GRANTED')], RETAINED: [] },
        asked: [listing('l2', 'Linnea Qadri', 'INVITED'), listing('l3', 'Tomás Reyes', 'DECLINED')],
      },
    })
    expect(r.ok).toBe(true)
    expect(r.rows.map((x) => x.name)).toEqual(['Ayesha Okafor'])
    expect(r.marketing).toBe(1)
    expect(r.asked.map((x) => `${x.name} · ${x.consent}`)).toEqual(['Linnea Qadri · INVITED', 'Tomás Reyes · DECLINED'])
  })

  it('an invitation filed under a tier by an older answer is still read as asking, never as somebody on the bench', () => {
    const r = readBench({ data: { tiers: { MARKETING: [listing('l1', 'Ayesha Okafor', 'GRANTED'), listing('l2', 'Linnea Qadri', 'INVITED')] } } })
    expect(r.rows.map((x) => x.name)).toEqual(['Ayesha Okafor'])
    expect(r.marketing).toBe(1)
    expect(r.asked.map((x) => x.name)).toEqual(['Linnea Qadri'])
  })

  it('a list of people asked that is not a list is not read as nobody asked', () => {
    const r = readBench({ data: { tiers: { MARKETING: [] }, asked: 'two' } })
    expect(r.ok).toBe(false)
  })

  it('the bench route files only live yeses under a tier, lists the rest as asked, and counts the bench from the bench', () => {
    expect(BENCH_ROUTE).toContain("if (scope !== 'mine' && !onTheBench(l)) {")
    expect(BENCH_ROUTE).toContain("if (l.state === 'INVITED' || l.state === 'DECLINED') asked.push(item)")
    expect(BENCH_ROUTE).toContain('total: (grouped.RETAINED?.length ?? 0) + (grouped.MARKETING?.length ?? 0),')
    expect(BENCH_ROUTE).toMatch(/asked,\n\s+ended,/)
  })

  it('the bench page lists whom it asked under its own heading, apart from the bench, with a way to ask again', () => {
    expect(ASKED_HEADING).toBe('Asked, not on your bench')
    expect(askedSays('INVITED')).toBe('Not answered yet. Not on your bench until they say yes.')
    expect(askedSays('DECLINED')).toBe('Said no. Not on your bench, and not asked for anything.')
    expect(BENCH_PAGE).toContain('{ASKED_HEADING}')
    expect(BENCH_PAGE).toContain("const waiting = askedPeople.filter((a) => a.consent === 'INVITED').length")
    expect(BENCH_PAGE).toContain('onClick={() => nudge(a.listingId, false)}')
  })
})

describe('A client extends a placement to a day they choose, and says why', () => {
  it('a client is offered Extend with a day of their choosing, not a fixed three months', () => {
    const labels = clientEndingChoices({ sellContractId: 'sc1', endsOn: 'Oct 21, 2026' }).map((c) => c.label)
    expect(labels).toContain('Extend')
    expect(labels.join(' ')).not.toMatch(/3 months/)
    expect(ROLLOFF).toContain('type="date"')
    expect(ROLLOFF).toContain('Why extend')
    expect(ROLLOFF).not.toContain('months: 3')
  })

  it('the date box opens on three months after the last day, held to the end of a shorter month, and allows any day after the last one', () => {
    expect(suggestedExtensionEnd('2026-10-21T00:00:00.000Z')).toBe('2027-01-21')
    expect(suggestedExtensionEnd('2026-11-30T00:00:00.000Z')).toBe('2027-02-28')
    expect(suggestedExtensionEnd('2027-11-30T00:00:00.000Z')).toBe('2028-02-29')
    expect(firstExtensionDay('2026-12-31T00:00:00.000Z')).toBe('2027-01-01')
    expect(suggestedExtensionEnd('not a day')).toBeNull()
  })

  it('an extension is not sent without a new last day and a reason', () => {
    expect(extendFormSays({ newEndDate: '', why: 'The study runs to March.' })).toBe('Pick the new last day.')
    expect(extendFormSays({ newEndDate: '2027-03-31', why: '  ' })).toBe('Say why it is extended.')
    expect(extendFormSays({ newEndDate: '2027-03-31', why: 'The study runs to March.' })).toBeNull()
    expect(extendBody({ newEndDate: '2027-03-31', why: ' The study runs to March. ' }))
      .toEqual({ newEndDate: '2027-03-31', note: 'The study runs to March.' })
  })

  it('a reason to go ahead is sent only once the route has asked for it, so a reason for one thing is never recorded as the answer to another', () => {
    const form = { newEndDate: '2027-03-31', why: 'The study runs to March.' }
    expect(extendBody(form)).not.toHaveProperty('reason')
    expect(extendBody(form)).not.toHaveProperty('limitReason')
    expect(extendFormSays(form, ['reason'])).toBe('Give a reason to go ahead.')
    const answered = { ...form, answers: { reason: 'The renewed certificate is on its way.' } }
    expect(extendFormSays(answered, ['reason'])).toBeNull()
    expect(extendBody(answered)).toEqual({
      newEndDate: '2027-03-31', note: 'The study runs to March.', reason: 'The renewed certificate is on its way.',
    })
  })

  it('when papers ending first stop the extension, the route’s own sentence is shown, and a box opens only where a reason can let it go ahead', () => {
    const asks = readExtendRefusal({ error: { code: 'PAPERS_NEED_A_REASON', message: 'Techpeple’s insurance runs out on Jan 15, before the new last day. Give a reason to go ahead.', field: 'reason' } })
    expect(asks).toEqual({ says: 'Techpeple’s insurance runs out on Jan 15, before the new last day. Give a reason to go ahead.', asks: 'reason' })
    const limit = readExtendRefusal({ error: { code: 'TIME_LIMIT_REASON', message: 'This goes past the time limit. Give a reason to go ahead.', field: 'limitReason' } })
    expect(limit.asks).toBe('limitReason')
    const blocked = readExtendRefusal({ error: { code: 'PAPERS_BLOCK', message: 'Helena Marsh’s work authorization ends on Dec 1, before the new last day.' } })
    expect(blocked).toEqual({ says: 'Helena Marsh’s work authorization ends on Dec 1, before the new last day.', asks: null })
    expect(readExtendRefusal({}).says).toBe('The contract was not extended.')
    // The page draws each asked reason under its own sentence, and a
    // refusal no reason opens as a sentence alone.
    expect(ROLLOFF).toContain('{askedFor.map((a) => (')
    expect(ROLLOFF).toContain('{refused && <p role="alert"')
    expect(ROLLOFF).toContain('body: JSON.stringify(extendBody(form)),')
  })
})

describe('A worker who renews a license says what makes it checkable', () => {
  it('a license of any trade is asked for as a license: a nursing registration, an electrician’s, a driver’s', () => {
    expect(isLicenseRow({ documentTypeKey: 'RN_LICENSE', name: 'State registered nurse license (WI)' })).toBe(true)
    expect(isLicenseRow({ documentTypeKey: 'PROFESSIONAL_LICENSE', name: 'Professional license' })).toBe(true)
    expect(isLicenseRow({ documentTypeKey: null, name: 'Journeyman electrician licence' })).toBe(true)
    expect(isLicenseRow({ documentTypeKey: 'COI', name: 'Certificate of insurance' })).toBe(false)
  })

  it('a renewed license is sent with its number, the state or board that issued it, and the new expiry date, as fields the upload route reads', () => {
    expect(licenseFieldsFor({ number: ' RN-482113 ', issuedBy: 'Wisconsin Board of Nursing ', expiresOn: '2028-10-31' }))
      .toEqual({ licenseNumber: 'RN-482113', issuer: 'Wisconsin Board of Nursing', expiresAt: '2028-10-31' })
    expect(PAPERS).toContain("const facts = r.todo === 'upload' && isLicenseRow(r) ? licenseFieldsFor(licenseOf(r.id)) : null")
    // As a file, each fact is a form field beside it; as a link, in the body.
    expect(PAPERS).toContain('if (facts) for (const [k, v] of Object.entries(facts)) form.append(k, v)')
    expect(PAPERS).toContain('...(facts ?? {})')
    expect(PAPERS).toContain('License number')
    expect(PAPERS).toContain('Issued by (state or board)')
    expect(PAPERS).toContain('New expiry date')
  })

  it('a renewal the route refuses is said in the route’s own sentence, beside the license it is about', () => {
    // One rule, the route's: the screen keeps no second copy that could
    // disagree with it about what a license needs.
    expect(PAPERS).not.toContain('licenseFieldsSay')
    expect(PAPERS).toContain("setRefused({ id: r.id, says: e?.message || 'That did not go through.' })")
    expect(PAPERS).toContain('{refused?.id === r.id && (')
  })
})
