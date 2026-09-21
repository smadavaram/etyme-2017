import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import {
  paperRows, outstanding, countedAgainst, paperworkHeadline,
  owedWord, owedConsequence, owedTodo, owedFrom, awaitingReview, isAwaiting,
  FILE_NOT_TAKEN_YET,
} from '@/app/dashboard/my-work/paperwork-rows'
import { myPapers, outstandingItems } from '@/lib/document-request'

/**
 * A worker's paperwork page — the page every chase letter names.
 *
 * The release walk found the worst crack in the document loop at the
 * worker's end: every letter ends "Upload it from your Paperwork page"
 * and there was no such page, and the section that existed listed three
 * documents already on file under a subtitle promising what was still
 * being asked of her.
 *
 * Nothing here assumes IT staffing. The rows below are a travel nurse's
 * state registration and a validation engineer's clean-room induction
 * as readily as a developer's I-9.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const SECTION = read('src/app/dashboard/my-work/papers.tsx')
const PAGE = read('src/app/dashboard/my-work/page.tsx')

const owedItem = (over: Record<string, unknown> = {}) => ({
  key: 'RN_LICENSE',
  label: 'state registered nurse license (WI)',
  says: "Required by Talvern Medical's order PO-2026-4.",
  owedByName: 'Helena Marsh',
  blocks: true,
  // What the route sends on anything still wanted from her: somewhere
  // to ask for a request, and the type to name when asking.
  openAskAt: '/api/me/papers',
  documentTypeKey: 'RN_LICENSE',
  ...over,
})

describe('A worker sees what is being asked of her', () => {

  it('a worker sees every document she owes, with the day it runs out and who asked for it', () => {
    const rows = paperRows({
      owed: [owedItem()],
      papers: [{
        id: 'v1', kind: 'HELD', name: 'Background check', askedBy: 'Sterling',
        word: 'Runs out in 24 days', runsOutOn: '2026-10-15T00:00:00.000Z',
      }],
    })
    expect(rows).toHaveLength(2)
    // What she owes comes first, before what is already done.
    expect(rows[0].kind).toBe('OWED')
    expect(rows[0].name).toBe('State registered nurse license (WI)')
    expect(rows[0].from).toBe("Required by Talvern Medical's order PO-2026-4.")
    // And what is on file still says the day it stops counting.
    expect(rows[1].kind).toBe('HELD')
    expect(rows[1].word).toBe('Runs out in 24 days')
    expect(rows[1].runsOutOn).toBe('2026-10-15T00:00:00.000Z')
  })

  it('a document she owes says what happens if it does not arrive, in words', () => {
    expect(owedConsequence(owedItem({ blocks: true })))
      .toBe('Without this you cannot start work, and a placement already running is stopped.')
    expect(owedConsequence(owedItem({ blocks: false })))
      .toBe('This will not stop you working. You will be asked for it until it is on file.')
    // Never a code on a row a person reads.
    expect(owedConsequence(owedItem({ blocks: true }))).not.toMatch(/DOCUMENTS_BLOCK|[A-Z_]{6,}/)
  })

  it('an item somebody waived is marked and not counted against her', () => {
    const rows = paperRows({
      owed: [
        owedItem({ key: 'BACKGROUND_CHECK', label: 'background check', waived: true, waivedSays: 'Waived by Dana Whitfield — the client ran its own.' }),
        owedItem(),
      ],
    })
    const waived = rows.find((r) => r.name === 'Background check')!
    expect(waived.waived).toBe(true)
    // It stays on the list, marked, with the reason and the name.
    expect(waived.word).toBe('Waived — not needed from you')
    expect(waived.consequence).toBe('Waived by Dana Whitfield — the client ran its own.')
    // And it is not one of the things she has to go and find.
    expect(outstanding(rows).map((r) => r.name)).toEqual(['State registered nurse license (WI)'])
    expect(countedAgainst(rows)).toBe(1)
    expect(owedTodo(owedItem({ waived: true, askId: 'd1' }))).toBeNull()
    expect(owedWord(owedItem())).toBe('Still needed')
  })

  it('a worker with nothing outstanding is told so, rather than shown an empty list', () => {
    expect(paperworkHeadline(paperRows({ papers: [], owed: [] })))
      .toBe('Nothing is on your file yet, and nobody is asking you for anything.')
    const onlyHeld = paperRows({ papers: [{ id: 'v1', kind: 'HELD', name: 'I-9', word: 'On file' }] })
    expect(paperworkHeadline(onlyHeld)).toBe('Nothing is being asked of you. Everything below is on file.')
    // The screen says it rather than drawing a blank list under a promise.
    expect(SECTION).toContain('Nothing has been asked of you and nothing is on your file yet.')
    expect(SECTION).toContain('paperworkHeadline')
  })

  it('the headline counts what she owes and says how much of it stops her working', () => {
    expect(paperworkHeadline(paperRows({ owed: [owedItem()] })))
      .toBe('1 document is still needed from you, and it stops you working until it arrives.')
    expect(paperworkHeadline(paperRows({ owed: [owedItem(), owedItem({ key: 'NDA', label: 'NDA', blocks: false })] })))
      .toBe('2 documents are still needed from you. 1 of them stops you working until it arrives.')
  })

  it('the page a chase letter names is a page she can open', () => {
    // The letter says "Upload it from your Paperwork page". This is it.
    expect(existsSync(join(process.cwd(), 'src/app/dashboard/my-work/paperwork/page.tsx'))).toBe(true)
    const STANDALONE = read('src/app/dashboard/my-work/paperwork/page.tsx')
    expect(STANDALONE).toContain('Your paperwork')
    expect(STANDALONE).toContain('<YourPapers standalone />')
    // And her work page carries the same section, anchored, with a link
    // through — so a letter naming either lands her on the same thing.
    expect(SECTION).toContain('id="paperwork"')
    expect(SECTION).toContain('/dashboard/my-work/paperwork')
    expect(PAGE).toContain('<YourPapers />')
  })

  it('a worker can send the document she is being chased for from the page the letter sends her to', () => {
    // Nobody has opened a request for it, and for one day that meant
    // there was nowhere to post it and the page said so. The row now
    // carries the route that opens one.
    const row = paperRows({ owed: [owedItem({ openAskAt: '/api/me/papers', documentTypeKey: 'RN_LICENSE' })] })[0]
    expect(row.todo).toBe('upload')
    expect(row.openAskAt).toBe('/api/me/papers')
    expect(row.documentTypeKey).toBe('RN_LICENSE')

    // One press, two calls: ask for somewhere to send it, then send it
    // there. Nothing is posted until an id comes back.
    expect(SECTION).toContain("post(r.openAskAt, { documentTypeKey: r.documentTypeKey })")
    expect(SECTION).toContain("id = opened?.data?.askId ?? null")
    expect(SECTION).toContain("/api/documents/${id}/${r.todo === 'sign' ? 'sign' : 'upload'}")
    expect(SECTION).toContain("{busy === r.id ? 'Sending…' : 'Send it in'}")

    // And where a request already exists the row's own id is the one to
    // post against, with nothing asked for twice.
    expect(owedTodo(owedItem({ askId: 'doc-1' }))).toBe('upload')
    expect(owedTodo(owedItem({ askId: 'doc-1', needsSignature: true }))).toBe('sign')
    expect(owedTodo(owedItem({ link: '/packet/abc' }))).toBe('open')
  })

  it('a document she has sent says somebody is checking it, and never asks her for it again', () => {
    // The route says so, on the row: `received: true`. It stays visible,
    // because it is still not on file, and it asks her for nothing.
    const sent = owedItem({ key: 'BACKGROUND_CHECK', label: 'background check', received: true, openAskAt: null, askId: null })
    const rows = paperRows({ owed: [sent] })
    expect(rows[0].awaiting).toBe(true)
    expect(rows[0].todo).toBeNull()
    expect(owedWord(sent)).toBe('Sent — waiting for somebody to check it')
    expect(owedConsequence(sent))
      .toBe('It is with them now. Nothing more is needed from you until they have looked at it.')
    // Not counted against her, and said in the headline so she knows it
    // landed rather than wondering whether to send it again.
    expect(outstanding(rows)).toHaveLength(0)
    expect(awaitingReview(rows)).toHaveLength(1)
    expect(paperworkHeadline(rows))
      .toBe('Nothing is being asked of you. One document is with them, waiting to be checked.')
  })

  it('the page says a document was sent only where the route says one was, and never because it could not find a way to send it', () => {
    // For one day this screen read the ABSENCE of somewhere to send a
    // document as proof that it had been sent, so an NDA nobody had
    // ever touched read "Sent — waiting for somebody to check it".
    // Two states that mean opposite things must not share a signal.
    const nobodyCanSend = owedItem({ key: 'NDA', label: 'NDA', openAskAt: null, askId: null, link: null })
    expect(isAwaiting(nobodyCanSend)).toBe(false)
    expect(owedWord(nobodyCanSend)).toBe('Still needed')
    expect(paperRows({ owed: [nobodyCanSend] })[0].awaiting).toBe(false)

    // Only the route's own word, either spelling of it.
    expect(isAwaiting(owedItem({ received: true }))).toBe(true)
    expect(isAwaiting(owedItem({ status: 'AWAITING_REVIEW' }))).toBe(true)

    // And a row the route says is with them offers nothing to press,
    // whatever else is on it.
    expect(owedTodo(owedItem({ received: true, openAskAt: '/api/me/papers' }))).toBeNull()
  })

  it('one document sent leaves every other row on her page exactly as it was', () => {
    // The re-walk found one upload showing as two: the row she sent
    // still offered "Send it in", and a different row she had never
    // touched read as sent. Every row is answered from its own fields
    // and from no other row's.
    const before = paperRows({
      owed: [
        owedItem({ key: 'PRODUCT_CONFIDENTIALITY', label: 'product confidentiality undertaking', blocks: false }),
        owedItem({ key: 'NDA', label: 'NDA', blocks: false }),
      ],
    })
    const after = paperRows({
      owed: [
        owedItem({ key: 'PRODUCT_CONFIDENTIALITY', label: 'product confidentiality undertaking', blocks: false, received: true, openAskAt: null }),
        owedItem({ key: 'NDA', label: 'NDA', blocks: false }),
      ],
    })
    const nda = (rows: typeof before) => rows.find((r) => r.name === 'NDA')!
    expect(nda(after)).toEqual(nda(before))
    expect(nda(after).awaiting).toBe(false)
    expect(nda(after).todo).toBe('upload')
    expect(nda(after).word).toBe('Still needed')

    // And the one she sent moved, on its own.
    const sent = after.find((r) => r.name === 'Product confidentiality undertaking')!
    expect(sent.awaiting).toBe(true)
    expect(sent.todo).toBeNull()
    expect(outstanding(after).map((r) => r.name)).toEqual(['NDA'])
  })

  it('a worker with a photograph of her certificate can send the photograph, not a link to one', () => {
    // A contractor in a hospital corridor has a photo on her phone. A
    // text box demanding a URL is not an answer to a chase.
    expect(SECTION).toContain('Take a photo or choose a file')
    expect(SECTION).toContain('type="file"')
    expect(SECTION).toContain('accept="image/*,application/pdf,.doc,.docx"')
    expect(SECTION).toContain("form.append('file', file)")
    // The link stays as the second way, named as the second way.
    expect(SECTION).toContain('Or paste a link to it')
    // Either one is enough to press the button; neither is required.
    expect(SECTION).toContain("disabled={busy === r.id || (!picked[r.id] && !(fileUrl[r.id] ?? '').trim())}")
    // And where the door will not take bytes yet, she reads the true
    // thing rather than a control that fails in silence.
    expect(FILE_NOT_TAKEN_YET).toContain('not switched on yet')
    expect(SECTION).toContain('setRefused({ id: r.id, says: FILE_NOT_TAKEN_YET })')
  })

  it('asking for a document nobody wants is refused in words, on her own page', () => {
    // The route answers 404 NOT_ASKED with a sentence. It lands beside
    // the row it is about, never as a green line at the top pretending
    // something worked, and no file is sent after it.
    expect(SECTION).toContain('setRefused({ id: r.id, says:')
    expect(SECTION).toContain('{refused.says}')
    expect(SECTION).toMatch(/refused\?\.id === r\.id/)
    expect(SECTION).toContain('text-etyme-attention')
  })

  it('an ask that came in a packet is answered at its own link and never posted to the documents route', () => {
    const rows = paperRows({
      papers: [{ id: 'item-1', kind: 'REQUEST', name: 'Passport', askedBy: 'Veritan Talent', word: 'Asked for', todo: 'open', link: '/packet/tok' }],
    })
    expect(rows[0].todo).toBe('open')
    expect(rows[0].link).toBe('/packet/tok')
    expect(SECTION).toMatch(/r\.todo === 'open' && r\.link/)
  })

  it('a row never shows her a document type key where nobody wrote a label', () => {
    const rows = paperRows({ owed: [{ key: 'FURNACE_SAFETY_INDUCTION', blocks: true }] })
    expect(rows[0].name).toBe('Furnace safety induction')
    expect(rows[0].name).not.toContain('_')
  })

  it('where nobody said which order asked for it, the row says nothing rather than inventing a firm', () => {
    expect(owedFrom(owedItem({ says: null }))).toBeNull()
    expect(owedFrom(owedItem({ says: '   ' }))).toBeNull()
  })

  it('a page that cannot read her file says so, and never shows an empty list instead', () => {
    // The one wrong answer that costs her a start is "you owe nothing"
    // printed because a fetch failed.
    expect(SECTION).toContain('Your paperwork could not be loaded just now.')
    expect(SECTION).toContain('Try again')
    expect(SECTION).toContain('Reading your file…')
    expect(SECTION).not.toMatch(/catch[\s\S]{0,60}setRows\(\[\]\)/)
  })

  it('the same requirement sent twice is one row', () => {
    const rows = paperRows({
      owed: [owedItem()],
      papers: [{ id: 'owed:RN_LICENSE', kind: 'OWED', key: 'RN_LICENSE', label: 'state registered nurse license (WI)', blocks: true }],
    })
    expect(rows).toHaveLength(1)
  })

  it('the order the route sent is the order she reads, with what is owed above what is on file', () => {
    // `myPapers` already sorts what stops the work to the top. The
    // screen groups; it never sorts again, because two domains deciding
    // one order means the second wins silently and nobody sees it.
    const rows = paperRows({
      papers: [
        { id: 'v1', kind: 'HELD', name: 'Passport', word: 'On file until 2029-03-08' },
        { id: 'owed:I9_EVERIFY', kind: 'OUTSTANDING', name: 'Form I-9', word: 'Not on file', stopsWork: true },
        { id: 'owed:NDA', kind: 'OUTSTANDING', name: 'NDA', word: 'Not on file' },
      ],
    })
    expect(rows.map((r) => r.name)).toEqual(['Form I-9', 'NDA', 'Passport'])
  })

  it('the row the route actually sends is the row the screen actually draws', () => {
    // The one test that would have caught this crack: the real
    // `myPapers`, with a real outstanding item, read by the real screen
    // logic. Two domains agreeing by coincidence is how a page promises
    // something its route never sends.
    const papers = myPapers({
      myEmail: 'helena@example.invalid',
      documents: [],
      packets: [],
      held: [],
      owed: outstandingItems({
        items: [{
          key: 'RN_LICENSE', label: 'state registered nurse license (WI)', required: true,
          owedBy: 'WORKER', owedByName: 'Helena Marsh', blocks: true, waived: false,
          waivedSays: null, says: "Required by Talvern Medical's order PO-2026-4.",
        }],
        held: [],
        owedBy: ['WORKER'],
      }),
    })
    const rows = paperRows({ papers })
    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe('OWED')
    expect(rows[0].name).toBe('State registered nurse license (WI)')
    expect(rows[0].stopsWork).toBe(true)
    expect(rows[0].from).toContain('Talvern Medical')
    // And the button the route asks for is the button she gets, because
    // the row carries somewhere to open a request and something to name
    // when opening it.
    expect(papers[0].todo).toBe('upload')
    expect(papers[0].openAskAt).toBe('/api/me/papers')
    expect(rows[0].todo).toBe('upload')
    expect(rows[0].openAskAt).toBe('/api/me/papers')
    expect(rows[0].documentTypeKey).toBe('RN_LICENSE')
    // And it still counts against her.
    expect(countedAgainst(rows)).toBe(1)
  })

  it('nothing on this page assumes the work is software', () => {
    // A nurse's registration, a welder's ticket and a developer's I-9
    // are the same row. No skill, no rate band, no industry word.
    expect(SECTION + read('src/app/dashboard/my-work/paperwork-rows.ts'))
      .not.toMatch(/\b(java|python|developer|engineer's cv|tech stack)\b/i)
  })
})
