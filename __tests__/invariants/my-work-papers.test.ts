/**
 * Answering, from the seat of the person who was asked.
 *
 * `/api/me/papers` lists two kinds of ask and they are answered in two
 * places. A document sent for signature is answered on this page, by
 * posting to `/api/documents/:id/:todo`. An ask raised as a packet is
 * answered at the packet's own link — its id is a packet item, and that
 * route has nothing behind it.
 *
 * The page rendered `todo` as a button either way, so Colleen Byrne, the
 * seeded ICU nurse asked to renew her state license, opened her own page,
 * read the ask, and had nothing to press. The row said "open" as text.
 *
 * Checked at source, in the style of my-work-interviews.test.ts, because
 * the behavior lives in a client component with no route handler to call
 * — and against `myPapers`, which decides the shape the page is fed.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { myPapers, type AskedPacket, type HeldRecord, type SentDocument } from '@/lib/document-request'

/**
 * The section moved out of `page.tsx` into `papers.tsx` on 2026-09-21,
 * so that it could also be a page of its own at
 * `/dashboard/my-work/paperwork` — the page every chase letter names
 * and nobody could open. One component, two doors. The row variable
 * went from `p` to `r` in the move; nothing else about these behaviors
 * changed.
 */
const PAGE = readFileSync(join(process.cwd(), 'src/app/dashboard/my-work/papers.tsx'), 'utf8')

const HERS = 'colleen.byrne@example.invalid'

const licenseAsk = (over: Partial<AskedPacket> = {}): AskedPacket => ({
  id: 'pack-1',
  label: 'Renewing a license',
  askedBy: 'Halcyon Staffing',
  recipientEmail: HERS,
  token: 'tok-abc',
  expiresAt: new Date('2026-10-17T00:00:00Z'),
  cancelledAt: null,
  createdAt: new Date('2026-09-15T00:00:00Z'),
  reason: 'Your professional license runs out in 24 days.',
  items: [{ id: 'item-1', label: 'professional license (RN 154-882, WI)', state: 'PENDING', required: true, receivedAt: null, position: 0 }],
  ...over,
})

const ndaToSign = (over: Partial<SentDocument> = {}): SentDocument => ({
  id: 'doc-1',
  status: 'SENT',
  templateName: 'Non-disclosure agreement',
  needsSignature: true,
  issuerName: 'Northbend Athletic',
  sentAt: new Date('2026-09-10T00:00:00Z'),
  signedAt: null,
  ...over,
})

const papers = (over: Partial<Parameters<typeof myPapers>[0]> = {}) =>
  myPapers({ myEmail: HERS, documents: [], packets: [], ...over })

const licenseOnFile = (over: Partial<HeldRecord> = {}): HeldRecord => ({
  id: 'ver-1',
  key: 'PROFESSIONAL_LICENSE',
  label: 'professional license (RN 154-882, WI)',
  status: 'CLEAR',
  provider: 'Wisconsin DSPS',
  validFrom: new Date('2024-10-01T00:00:00Z'),
  expiresAt: new Date('2026-10-09T00:00:00Z'),
  stopsWork: true,
  ...over,
})

describe('Answering an ask from the consultant’s own page', () => {

  it('an ask that came through a packet offers a link to answer it, not a button that would post to nothing', () => {
    // What the page is handed: something to do, and somewhere else to do it.
    const [ask] = papers({ packets: [licenseAsk()] })
    expect(ask.todo).toBe('open')
    expect(ask.link).toBe('/packet/tok-abc')

    // And what the page does with it: the row's own link, rendered as an
    // anchor in the words a person would use.
    expect(PAGE).toMatch(/\{r\.todo === 'open' && r\.link && \(/)
    expect(PAGE).toMatch(/<a\s+href=\{r\.link\}/)
    expect(PAGE).toContain('Answer it')
  })

  it('a document sent for signature still offers its sign and upload buttons', () => {
    const [sign] = papers({ documents: [ndaToSign()] })
    expect(sign.todo).toBe('sign')
    expect(sign.link).toBeNull()

    const [upload] = papers({ documents: [ndaToSign({ needsSignature: false })] })
    expect(upload.todo).toBe('upload')

    expect(PAGE).toContain('Sign as myself')
    expect(PAGE).toMatch(/>\s*Upload\s*<\/button>/)
    expect(PAGE).toContain('/api/documents/${id}/${r.todo}')
  })

  it('a packet ask is never posted to the documents route, because there is no document behind it', () => {
    // Both button branches are held shut by the presence of a link, so the
    // only row that can reach `answer()` is one answered on this page.
    expect(PAGE).toMatch(/\{r\.todo === 'upload' && \(/)
    expect(PAGE).toMatch(/\{r\.todo === 'sign' && \(/)
    // A packet row is the only one that carries a link, and its branch
    // is a plain anchor with no call to answer().
    expect(PAGE).toMatch(/\{r\.todo === 'open' && r\.link && \(/)
  })

  it('an ask with nothing left to do on it offers nothing to press', () => {
    const [done] = papers({ packets: [licenseAsk({ items: [{ id: 'item-1', label: 'professional license', state: 'RECEIVED', required: true, receivedAt: new Date('2026-09-16T00:00:00Z'), position: 0 }] })] })
    expect(done.todo).toBeNull()
    // The link branch asks for `p.todo` first, so a row on file is a row
    // with a word on it and nothing to tap.
    expect(PAGE).toMatch(/\{r\.todo === 'open' && r\.link && \(/)
  })

  it('an ask sent to somebody else’s address gives the reader no way in, even where it is about them', () => {
    const [notHers] = papers({ myEmail: 'someone.else@example.invalid', packets: [licenseAsk()] })
    expect(notHers.todo).toBeNull()
    expect(notHers.link).toBeNull()
  })

  it('the answer link is the one the row carries, never a path the page builds for itself', () => {
    // A page that assembles `/packet/${p.id}` would send her to a token
    // that does not exist. The link is computed where the token lives.
    expect(PAGE).not.toMatch(/\/packet\/\$\{/)
  })

  it('the link a person is given wears the same blue as the buttons beside it', () => {
    const link = PAGE.slice(PAGE.indexOf("{r.todo === 'open' && r.link && ("), PAGE.indexOf('Answer it'))
    expect(link).toContain('bg-etyme-action text-white')
    expect(link).toContain('px-4 py-2')
  })
})

/**
 * What the section is called, now that it holds two different things.
 *
 * `/api/me/papers` returns a third kind, `HELD` — her own license, I-9,
 * background check and visa, with the day each runs out. Nobody asked her
 * for any of them, so a section headed "Papers asked of you" was naming
 * half its own contents wrongly: it invites her to go looking for who
 * wants a license she has held for four years, and buries the one fact
 * she is the only person who can act on.
 */
describe('The heading over a worker’s own paperwork', () => {

  it('a worker’s own page is headed as her paperwork, because it now holds what is on file as well as what is asked', () => {
    expect(PAGE).toContain('>Your paperwork</h2>')
    expect(PAGE).not.toContain('Papers asked of you</h2>')
  })

  it('the sentence under the heading says the list is her whole file, the day each runs out, and what is still being asked of her', () => {
    // The heading appears three times — loading, error and the list
    // itself — and it is the last one that carries the sentence.
    const sub = PAGE.slice(PAGE.lastIndexOf('>Your paperwork</h2>'), PAGE.lastIndexOf('>Your paperwork</h2>') + 600)
    expect(sub).toContain('Everything on your file')
    expect(sub).toContain('the day each one runs out')
    expect(sub).toContain('what is still being asked of you')
  })

  it('a license on file is shown with the day it runs out and nothing to press, because it is not an ask', () => {
    const [held] = papers({ held: [licenseOnFile()] })
    expect(held.kind).toBe('HELD')
    expect(held.todo).toBeNull()
    expect(held.link).toBeNull()
    expect(held.runsOutOn).toBe('2026-10-09T00:00:00.000Z')
    // And the row the page draws reads the same three fields for every
    // kind, so a held row needs no second renderer.
    expect(PAGE).toContain('{r.name}')
    expect(PAGE).toContain('{r.word}')
  })

  it('a document on file with no expiry recorded says so rather than reading as permanent', () => {
    const [held] = papers({ held: [licenseOnFile({ expiresAt: null })] })
    expect(held.word).toBe('On file — no expiry recorded')
    expect(held.runsOutOn).toBeNull()
  })

  it('a license that lapsed says how long ago, on the same row as one still in date', () => {
    const [gone] = papers({ held: [licenseOnFile({ expiresAt: new Date(Date.now() - 3 * 86_400_000) })] })
    expect(gone.word).toBe('Ran out 3 days ago')
  })
})
