import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { mayAct, askNotice, statusWord, type DocFacts } from '@/lib/document-request'

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
    for (const nav of ['src/components/shell/sidebar.tsx']) {
      expect((read(nav).match(/href: '\/dashboard\/documents'/g) ?? []).length).toBe(2)
    }
  })
  it('the person answers from their own page: a link to upload, their word to sign', () => {
    const work = read('src/app/dashboard/my-work/page.tsx')
    expect(work).toContain("fetch('/api/me/papers')")
    expect(work).toContain("p.todo === 'sign' ? { attests: true } : { fileUrl: fileUrl[p.id] ?? '' }")
    expect(work).toContain('Sign as myself')
  })
  it('a candidate is asked by email; somebody with a seat, in the app', () => {
    const act = read('src/app/api/documents/[id]/act.ts')
    expect(act).toContain("channel: seat ? 'IN_APP' : 'EMAIL'")
  })
})
