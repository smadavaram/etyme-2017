import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { mayAct, askNotice, statusWord, standingOn, holdsPaperworkDesk, type DocFacts, type PaperworkSeat } from '@/lib/document-request'
import { MEMBER_ROLE, rolesFor } from '@/lib/company-defaults'
import { getNavForKind } from '@/components/shell/sidebar'

/**
 * A document asked for, sent, uploaded or signed.
 *
 * DocInstance had four statuses and one writer, which made PENDING. A
 * W-9 could be asked for and never sent, never answered, never signed.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

const w9: DocFacts = { status: 'SENT', templateName: 'W-9', needsSignature: false, subjectPersonId: 'p-tariq', issuerName: 'Pinnacle' }
const nda: DocFacts = { ...w9, templateName: 'Mutual NDA', needsSignature: true }
const tariq = { personId: 'p-tariq', staffOfIssuer: false }
const ruth = { personId: 'p-ruth', staffOfIssuer: true }
const stranger = { personId: 'p-x', staffOfIssuer: false }

describe('asking', () => {
  it('the company that owns the template asks, and the person is told', () => {
    expect(mayAct('send', { ...w9, status: 'PENDING' }, ruth)).toEqual({ ok: true, next: 'SENT', says: 'W-9 asked for. They have been told.' })
  })
  it('asking again is allowed and says so', () => {
    expect(mayAct('send', w9, ruth)).toMatchObject({ ok: true, says: 'W-9 asked for again.' })
  })
  it('nobody else can ask on the company’s behalf', () => {
    expect(mayAct('send', w9, tariq)).toMatchObject({ ok: false, code: 'NOT_YOURS', message: 'Only Pinnacle can ask for W-9.' })
  })
})

describe('uploading', () => {
  it('the person it is about puts the file on record, and is thanked', () => {
    expect(mayAct('upload', w9, tariq, { fileUrl: 'https://files/w9.pdf' })).toEqual({ ok: true, next: 'UPLOADED', says: 'W-9 is on file. Thank you.' })
  })
  it('the company can record a file it received', () => {
    expect(mayAct('upload', w9, ruth, { fileUrl: 'https://files/w9.pdf' })).toMatchObject({ ok: true, says: 'W-9 recorded as received.' })
  })
  it('no file, no upload', () => {
    expect(mayAct('upload', w9, tariq, {})).toMatchObject({ ok: false, code: 'FILE_REQUIRED' })
  })
  it('a document that needs a signature cannot merely be uploaded', () => {
    expect(mayAct('upload', nda, tariq, { fileUrl: 'x' })).toMatchObject({ ok: false, code: 'NEEDS_SIGNATURE', message: 'Mutual NDA needs a signature. Sign it, or record the signed copy you received.' })
  })
  it('a stranger is refused in words', () => {
    expect(mayAct('upload', w9, stranger, { fileUrl: 'x' })).toMatchObject({ ok: false, code: 'NOT_YOURS' })
  })
})

describe('signing', () => {
  it('the person signs by attesting it is them', () => {
    expect(mayAct('sign', nda, tariq, { attests: true })).toEqual({ ok: true, next: 'SIGNED', says: 'Mutual NDA signed. Thank you.' })
  })
  it('without the attestation there is no signature', () => {
    expect(mayAct('sign', nda, tariq, {})).toMatchObject({ ok: false, code: 'FILE_REQUIRED', message: 'Confirm that you are signing Mutual NDA as yourself.' })
  })
  it('the company records a signed copy it received, with the file', () => {
    expect(mayAct('sign', nda, ruth, { fileUrl: 'https://files/nda-signed.pdf' })).toMatchObject({ ok: true, next: 'SIGNED' })
    expect(mayAct('sign', nda, ruth, {})).toMatchObject({ ok: false, code: 'FILE_REQUIRED' })
  })
  it('a document that needs no signature is uploaded, not signed', () => {
    expect(mayAct('sign', w9, tariq, { attests: true })).toMatchObject({ ok: false, code: 'NO_SIGNATURE_NEEDED' })
  })
  it('once on file, nothing more is asked', () => {
    expect(mayAct('sign', { ...nda, status: 'SIGNED' }, tariq, { attests: true })).toMatchObject({ ok: false, code: 'ALREADY_ON_FILE' })
    expect(mayAct('send', { ...w9, status: 'UPLOADED' }, ruth)).toMatchObject({ ok: false, code: 'ALREADY_ON_FILE' })
  })
})

describe('who stands for the firm on a document', () => {
  // Sign-up walk, round four: the one door lets a desk-less seat through to
  // sign and upload for "Your paperwork", and the route read every seat at
  // the firm as its staff. A Member could sign the firm's NDA for somebody else.
  const mo: PaperworkSeat = { personId: 'p-mo', atIssuer: true, atSubjectCompany: false, permissions: [], companyName: 'Northbend Athletic' }
  const hr: PaperworkSeat = { ...mo, personId: 'p-ruth', permissions: ['consultants.read', 'governance.read'] }
  const ar: PaperworkSeat = { ...mo, personId: 'p-ar', permissions: ['timesheets.read', 'invoices.read', 'invoices.issue'] }
  const outsider: PaperworkSeat = { ...mo, personId: 'p-x', atIssuer: false }
  const tariqsNda = { templateName: 'Mutual NDA', subjectPersonId: 'p-tariq' }

  it('a Member with no desk cannot sign the firm’s document for somebody else, and is told so in a sentence', () => {
    expect(standingOn('sign', tariqsNda, mo)).toEqual({
      ok: false, status: 403, code: 'NO_DESK',
      message: 'Signing Mutual NDA for somebody else is not part of your seat at Northbend Athletic. Ask your company’s owner if you need it.',
    })
  })
  it('a Member with no desk cannot put the firm’s document on file for somebody else either', () => {
    expect(standingOn('upload', { templateName: 'W-9', subjectPersonId: 'p-tariq' }, mo)).toMatchObject({
      ok: false, code: 'NO_DESK',
      message: 'Putting W-9 on file for somebody else is not part of your seat at Northbend Athletic. Ask your company’s owner if you need it.',
    })
  })
  it('a Member with no desk cannot answer a document about a company, which is nobody’s own person', () => {
    expect(standingOn('upload', { templateName: 'Certificate of insurance', subjectPersonId: null }, mo)).toMatchObject({ ok: false, code: 'NO_DESK' })
  })
  it('a Member with no desk can sign a document addressed to them, as themselves', () => {
    expect(standingOn('sign', { templateName: 'Mutual NDA', subjectPersonId: 'p-mo' }, mo)).toEqual({ ok: true, staffOfIssuer: false })
  })
  it('the refusal names no permission key', () => {
    const r = standingOn('sign', tariqsNda, mo)
    expect(r.ok ? '' : r.message).not.toMatch(/consultants\.read|[a-z]+\.[a-z]+/)
  })
  it('HR, who holds the paperwork desk, still signs for the firm', () => {
    expect(standingOn('sign', tariqsNda, hr)).toEqual({ ok: true, staffOfIssuer: true })
    expect(standingOn('send', tariqsNda, hr)).toEqual({ ok: true, staffOfIssuer: true })
  })
  it('a desk that bills but does not work the firm’s paperwork is refused like a Member', () => {
    expect(standingOn('sign', tariqsNda, ar)).toMatchObject({ ok: false, code: 'NO_DESK' })
    expect(standingOn('send', tariqsNda, ar)).toMatchObject({ ok: false, code: 'NO_DESK', message: expect.stringMatching(/^Asking somebody for Mutual NDA is not part of your seat/) })
  })
  it('somebody at another firm is told nothing is here, so the refusal confirms nothing', () => {
    expect(standingOn('sign', tariqsNda, outsider)).toEqual({ ok: false, status: 404, code: 'NOT_FOUND', message: 'That document request is not here.' })
  })
  it('the shipped HR and Compliance Officer at a supplier, and the compliance desk at a client, hold the paperwork desk; a Member holds none', () => {
    const held = (kind: 'VENDOR' | 'CLIENT', name: string) => holdsPaperworkDesk(rolesFor(kind).find((r) => r.name === name)!.permissions)
    expect(held('VENDOR', 'HR')).toBe(true)
    expect(held('VENDOR', 'Compliance Officer')).toBe(true)
    expect(held('CLIENT', 'Compliance Officer')).toBe(true)
    expect(held('VENDOR', MEMBER_ROLE)).toBe(false)
    expect(held('CLIENT', MEMBER_ROLE)).toBe(false)
    expect(holdsPaperworkDesk(['*'])).toBe(true)
  })
})

describe('who may open a document’s file', () => {
  // Until 2026-10-08 any seat at the firm that asked could open the bytes,
  // so an Accounts Receivable clerk could read a contractor's passport.
  const ar: PaperworkSeat = { personId: 'p-ar', atIssuer: true, atSubjectCompany: false, permissions: ['timesheets.read', 'invoices.read', 'invoices.issue'], companyName: 'Brightmoor Staffing' }
  const hr: PaperworkSeat = { ...ar, personId: 'p-ruth', permissions: ['consultants.read'] }
  const member: PaperworkSeat = { ...ar, personId: 'p-mo', permissions: [] }
  const contractor: PaperworkSeat = { personId: 'p-tariq', atIssuer: false, atSubjectCompany: false, permissions: [], companyName: null }
  const outsider: PaperworkSeat = { ...ar, personId: 'p-x', atIssuer: false }
  const passport = { templateName: 'Passport', subjectPersonId: 'p-tariq' }

  it('an Accounts Receivable clerk at the firm that asked cannot open a contractor’s passport, and is told so in a sentence', () => {
    expect(standingOn('open', passport, ar)).toEqual({
      ok: false, status: 403, code: 'NO_DESK',
      message: 'Opening Passport for somebody else is not part of your seat at Brightmoor Staffing. Ask your company’s owner if you need it.',
    })
  })
  it('a Member with no desk at the firm cannot open somebody else’s document either', () => {
    expect(standingOn('open', passport, member)).toMatchObject({ ok: false, code: 'NO_DESK' })
  })
  it('the refusal to open a file names no permission key', () => {
    const r = standingOn('open', passport, ar)
    expect(r.ok ? '' : r.message).not.toMatch(/consultants\.read|[a-z]+\.[a-z]+/)
  })
  it('HR, who holds the paperwork desk, opens the file for the firm', () => {
    expect(standingOn('open', passport, hr)).toEqual({ ok: true, staffOfIssuer: true })
  })
  it('the contractor opens their own passport, whatever seat they hold', () => {
    expect(standingOn('open', passport, contractor)).toEqual({ ok: true, staffOfIssuer: false })
    expect(standingOn('open', { templateName: 'Passport', subjectPersonId: 'p-ar' }, ar)).toEqual({ ok: true, staffOfIssuer: false })
  })
  it('somebody at another firm is told nothing is here, so the refusal confirms no passport exists', () => {
    expect(standingOn('open', passport, outsider)).toMatchObject({ ok: false, status: 404, code: 'NOT_FOUND' })
  })
  it('a company opens its own certificate that a client asked for', () => {
    const supplier: PaperworkSeat = { ...outsider, atSubjectCompany: true }
    expect(standingOn('open', { templateName: 'Certificate of insurance', subjectPersonId: null }, supplier)).toEqual({ ok: true, staffOfIssuer: false })
  })
  it('the file route decides who opens a file with the same rule, and logs every read before acting on it', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/documents/[id]/file/route.ts'), 'utf8')
    expect(route).toMatch(/standingOn\('open'/)
    expect(route).not.toMatch(/askedForIt/)
    expect(route.indexOf('accessLog')).toBeGreaterThan(-1)
    expect(route.indexOf('accessLog')).toBeLessThan(route.indexOf("if (!standing.ok)"))
  })
})

describe('what people read', () => {
  it('the note says who asks and what to do, in a sentence', () => {
    expect(askNotice(nda)).toEqual({ title: 'Pinnacle asks for Mutual NDA', body: 'Sign Mutual NDA from your page. It takes a minute.' })
    expect(askNotice(w9).body).toBe('Upload W-9 from your page. A photo is fine.')
  })
  it('a row says what is true, never the enum', () => {
    expect(['PENDING', 'SENT', 'SIGNED', 'UPLOADED'].map(statusWord)).toEqual(['Not asked yet', 'Asked for', 'Signed', 'On file'])
  })
})

describe('the screens', () => {
  it('the company has a Paperwork page with the library, the requests and the one thing to do on each', () => {
    const page = read('src/app/dashboard/documents/page.tsx')
    expect(page).toContain('Ask somebody for a document')
    expect(page).toContain("post(`/api/documents/${id}/send`, {})")
    expect(page).toContain('Record the signed copy')
    // Counted twice in the source because the vendor and the integrator
    // each held their own copy of the link. They share one list now, so
    // the question is the one that mattered: can every firm that chases
    // a document reach the page it chases from.
    for (const kind of ['VENDOR', 'GSI', 'MSP'] as const) {
      const hrefs = getNavForKind(kind, false).flatMap((s) => s.items.map((i) => i.href))
      expect(hrefs, kind).toContain('/dashboard/documents')
    }
  })
  it('the person answers from their own page: a link to upload, their word to sign', () => {
    // The section lives in its own component since 2026-09-21, so that
    // the page a chase letter names can be opened on its own.
    const work = read('src/app/dashboard/my-work/papers.tsx')
    expect(work).toContain("fetch('/api/me/papers')")
    // A file she picked goes as the file; a link goes as a link; a
    // signature is her word. The body says which.
    expect(work).toContain("form.append('file', file)")
    expect(work).toContain("{ attests: true }")
    expect(work).toContain("{ fileUrl: fileUrl[r.id] ?? '', fileName: file?.name ?? undefined }")
    expect(work).toContain('Sign as myself')
  })
  it('a candidate is asked by email; somebody with a seat, in the app', () => {
    const act = read('src/app/api/documents/[id]/act.ts')
    expect(act).toContain("channel: seat ? 'IN_APP' : 'EMAIL'")
  })
})
