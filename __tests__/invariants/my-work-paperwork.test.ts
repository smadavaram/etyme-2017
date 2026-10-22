import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import {
  paperRows, outstanding, countedAgainst, paperworkHeadline,
  owedWord, owedConsequence, owedTodo, owedFrom, awaitingReview, isAwaiting,
  sectionOf, rowsInSection, SECTIONS, paperworkIntro, EMPTY_PAPERWORK,
  workStops, papersRunningOut, RUNNING_OUT_DAYS,
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
      .toBe('Nothing is on your file yet, and no document is asked of you.')
    const onlyHeld = paperRows({ papers: [{ id: 'v1', kind: 'HELD', name: 'I-9', word: 'On file' }] })
    expect(paperworkHeadline(onlyHeld)).toBe('Nothing is being asked of you. Everything below is on file.')
    // The screen says it rather than drawing a blank list under a promise.
    expect(SECTION).toContain('paperworkHeadline')
  })

  it('an empty paperwork section says it once', () => {
    // Karthik Menon's work page read "Nothing is on your file yet, and
    // nobody is asking you for anything." and, directly under it,
    // "Nothing has been asked of you and nothing is on your file yet."
    // One fact, two sentences. The headline is now the only one.
    const empty = paperRows({ papers: [], owed: [] })
    expect(paperworkHeadline(empty)).toBe(EMPTY_PAPERWORK)
    // No line promising "everything on your file" over an empty file.
    expect(paperworkIntro(empty)).toBeNull()
    // The second wording is gone from the screen, and so is any other
    // hand-written sentence about an empty file.
    expect(SECTION).not.toContain('Nothing has been asked of you')
    expect(SECTION).not.toMatch(/nothing is on your file/i)
    // The sentence itself says "nothing" about the file once.
    expect(EMPTY_PAPERWORK.match(/on your file/g)).toHaveLength(1)
    // A file with something on it still says what the list below is.
    const onlyHeld = paperRows({ papers: [{ id: 'v1', kind: 'HELD', name: 'I-9', word: 'On file' }] })
    expect(paperworkIntro(onlyHeld)).toMatch(/^Everything on your file/)
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
    expect(PAGE).toContain('<YourPapers onRows={setPaperRows} />')
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

  it('a document she has already sent is not filed under what is still needed from her', () => {
    // A heading is where a person looks before she reads the row, and
    // "Still needed from you" over a blurb saying "Send one in" asks her
    // to act on something she has already acted on.
    const rows = paperRows({
      owed: [
        owedItem({ key: 'PRODUCT_CONFIDENTIALITY', label: 'product confidentiality undertaking', received: true, openAskAt: null }),
        owedItem({ key: 'NDA', label: 'NDA' }),
      ],
      papers: [{ id: 'v1', kind: 'HELD', name: 'Passport', word: 'On file until 2029-03-08' }],
    })
    expect(sectionOf(rows.find((r) => r.name === 'NDA')!)).toBe('OWED')
    expect(sectionOf(rows.find((r) => r.name === 'Product confidentiality undertaking')!)).toBe('SENT')
    expect(rowsInSection(rows, 'OWED').map((r) => r.name)).toEqual(['NDA'])
    expect(rowsInSection(rows, 'SENT').map((r) => r.name)).toEqual(['Product confidentiality undertaking'])

    // Its own heading, saying what the row says, read after what she
    // still has to do and before what is on file.
    const titles = SECTIONS.map((s) => s.title)
    // Since the screen walk of 2026-10-22, every heading says what the
    // rows under it ask of her, and what she must do reads first.
    expect(titles).toEqual([
      'Still needed from you', 'Questions to answer', 'Asked of you', 'Sent to you to sign',
      'Asked for, with a link', 'Sent, waiting to be checked', 'Answered', 'On your file',
    ])
    expect(SECTIONS.find((s) => s.key === 'SENT')!.blurb)
      .toContain('Nothing more is needed from you')
    // And the counts do not move: it is still nothing on file.
    expect(outstanding(rows).map((r) => r.name)).toEqual(['NDA'])
    expect(awaitingReview(rows)).toHaveLength(1)
    // The screen draws the headings from that one list.
    expect(SECTION).toContain('SECTIONS.map((g)')
    expect(SECTION).toContain('rowsInSection(all, g.key)')
  })

  it('an asked-for paper is one row with one Upload button, and the form opens only when she presses it', () => {
    // Helena Marsh's first screen opened on two upload forms, each with a
    // file chooser and a paste box (founder, 2026-10-19). Folded now: the
    // row is its name, who asked and why, its word, and one button.
    expect(SECTION).toContain("{r.todo === 'upload' && (!opened[r.id] ? (")
    expect(SECTION).toContain('onClick={() => setOpened({ ...opened, [r.id]: true })}')
    expect(SECTION).toMatch(/>\s*Upload\s*<\/button>/)
    // Folded by default: nothing is opened until she presses.
    expect(SECTION).toContain('useState<Record<string, boolean>>({})')
    // Once opened, the form is the same form: the picker, the link box
    // and the one send button, in that order.
    const form = SECTION.slice(SECTION.indexOf("{r.todo === 'upload' && (!opened[r.id] ? ("), SECTION.indexOf("{r.todo === 'sign' && ("))
    expect(form.indexOf('Take a photo or choose a file')).toBeLessThan(form.indexOf('Or paste a link to it'))
    expect(form.indexOf('Or paste a link to it')).toBeLessThan(form.indexOf("'Send it in'"))
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
  })

  it('a worker sends the photograph she has and the page tells her it was kept, in the route\u2019s own words', () => {
    // For a day the picker could only be refused: nothing stored the
    // bytes of a document, so the page said so and pointed at the link
    // box. The door takes the file now, and the sentence that stood in
    // for it is gone — a page that still apologised would be telling
    // her something untrue in the other direction.
    const ROWS = read('src/app/dashboard/my-work/paperwork-rows.ts')
    expect(SECTION + ROWS).not.toContain('FILE_NOT_TAKEN_YET')
    expect(SECTION + ROWS).not.toContain('not switched on yet')

    // The file goes as the file, as itself, to the same door.
    expect(SECTION).toContain("form.append('file', file)")
    expect(SECTION).toContain("await fetch(to, { method: 'POST', body: form })")

    // And what she reads is the route's own sentence — "…is on file.
    // Thank you. Kept as image, 1KB." — never a cheerier one this page
    // wrote for itself, because only the route knows what was kept.
    expect(SECTION).toContain("setSaid(sent?.data?.says")
    // The picked file is let go once it has gone, so a second press
    // cannot send yesterday's photograph again.
    expect(SECTION).toContain("setPicked(Object.fromEntries(Object.entries(picked).filter(([k]) => k !== r.id)))")

    // A file too big, or of a kind nobody can open, comes back with its
    // own sentence and lands beside the row it is about. Nothing is
    // written on a refusal, so there is nothing for the page to undo.
    expect(SECTION).toContain('setRefused({ id: r.id, says:')
    expect(SECTION).toMatch(/refused\?\.id === r\.id/)
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

  it('one document is one row on her page, however many ways the route knows about it', () => {
    // The route knew about Helena's own upload twice: as a document on
    // file, and as the requirement it answered, still waiting to be
    // checked. Both came back with the same id and both were drawn, so
    // she read one paper twice under two headings that contradicted
    // each other — and one of them said somebody had sent it to her.
    const rows = paperRows({
      papers: [
        { id: 'doc-1', kind: 'DOCUMENT', name: 'Non-disclosure agreement', askedBy: 'Techpeple', word: 'On file' },
        { id: 'doc-1', kind: 'OUTSTANDING', name: 'Non-disclosure agreement', status: 'AWAITING_REVIEW', received: true, word: 'Sent — waiting for somebody to check it' },
      ],
    })
    expect(rows).toHaveLength(1)
    // And it is the row that says where the document stands with them,
    // not the one that says it is done. The page's job is to tell her
    // what is left to do.
    expect(rows[0].kind).toBe('OWED')
    expect(rows[0].word).toBe('Sent — waiting for somebody to check it')
    expect(sectionOf(rows[0])).toBe('SENT')

    // The same, the other way round in the payload: whichever order the
    // route sends them, the owed row is the one she reads.
    const flipped = paperRows({
      papers: [
        { id: 'doc-1', kind: 'OUTSTANDING', name: 'Non-disclosure agreement', status: 'MISSING', word: 'Not on file', openAskAt: '/api/me/papers', documentTypeKey: 'NDA' },
        { id: 'doc-1', kind: 'DOCUMENT', name: 'Non-disclosure agreement', askedBy: 'Techpeple', word: 'On file' },
      ],
    })
    expect(flipped).toHaveLength(1)
    expect(flipped[0].word).toBe('Not on file')

    // Two different documents are still two rows, and a requirement
    // nobody has opened a request for is a requirement rather than a
    // document — it carries an id no document can have, so nothing
    // collapses into it and two of them never collapse together.
    const many = paperRows({
      papers: [
        { id: 'doc-1', kind: 'DOCUMENT', name: 'NDA', word: 'On file' },
        { id: 'doc-2', kind: 'DOCUMENT', name: 'W-9', word: 'On file' },
        { id: 'owed:I9_EVERIFY', kind: 'OUTSTANDING', name: 'Form I-9', word: 'Not on file', stopsWork: true },
        { id: 'owed:NDA', kind: 'OUTSTANDING', name: 'Non-disclosure agreement', word: 'Not on file' },
      ],
    })
    expect(many).toHaveLength(4)
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


/**
 * Your work opens on the week and the money (founder, 2026-10-19).
 *
 * "Money and the week before paperwork that does not stop the work. A
 * worker's first screen opens on her week and her pay, not on two upload
 * buttons." Read against Helena Marsh, whose page opened on two upload
 * forms for papers that do not stop her working, and Colleen Byrne, an
 * ICU nurse whose license runs out inside her assignment.
 */
describe('Your work opens on the week and the money', () => {
  // The worker's main page, from its own return to the end: the empty
  // and not-a-worker answers above it are other states.
  const MAIN = PAGE.slice(PAGE.indexOf('export default function MyWorkPage('))
  const at = (needle: string) => {
    const i = MAIN.lastIndexOf(needle)
    expect(i, needle).toBeGreaterThan(-1)
    return i
  }

  it('the page reads figures, File your hours, What you are owed, Your hours, Where you work, Your paperwork, then Your CV', () => {
    const order = [
      '<Lbl>Hours this month</Lbl>',
      '<FileYourWeek filing={data.filing}',
      '<YourPay owed={data.owed} />',
      'mb-3">Your hours</h2>',
      'mb-3">Where you work</h2>',
      '<YourPapers onRows={setPaperRows} />',
      '<YourCV />',
    ].map(at)
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })

  it('a week sent back and a week not yet sent sit with File your hours, before the money', () => {
    expect(at('mb-1">Sent back to you</h2>')).toBeGreaterThan(at('<FileYourWeek filing={data.filing}'))
    expect(at('mb-3">Hours to send</h2>')).toBeLessThan(at('<YourPay owed={data.owed} />'))
  })

  it('a paper that stops the work keeps one line at the top, above File your hours, with a link to the paperwork', () => {
    expect(at('{stops.length > 0 && (')).toBeLessThan(at('<Lbl>Hours this month</Lbl>'))
    expect(at('{stops.length > 0 && (')).toBeLessThan(at('<FileYourWeek filing={data.filing}'))
    expect(MAIN).toContain('href="#paperwork"')
    // The line is built from the rows the section below read, so the two
    // cannot disagree, and from what the route says runs out soon.
    expect(MAIN).toContain('workStops({ rows: paperRows, runningOut:')
  })

  it('a license that runs out inside the assignment is said in one sentence: when it runs out, and that her work stops if it lapses', () => {
    const lines = workStops({
      rows: [],
      runningOut: [{ id: 'v1', state: 'RUNS_OUT', name: 'Professional license', issuer: 'Wisconsin Board of Nursing', daysLeft: 24, runsOutOn: '2026-11-12T00:00:00.000Z', startsOn: null }],
    })
    expect(lines).toEqual(['Your professional license (Wisconsin Board of Nursing) runs out in 24 days. Your work stops if it lapses.'])
    expect(workStops({ rows: [], runningOut: [{ id: 'v1', state: 'RUNS_OUT', name: 'Site induction', issuer: null, daysLeft: 1, runsOutOn: '2026-10-20T00:00:00.000Z', startsOn: null }] }))
      .toEqual(['Your site induction runs out in 1 day. Your work stops if it lapses.'])
    expect(workStops({ rows: [], runningOut: [{ id: 'v1', state: 'RUNS_OUT', name: 'Site induction', issuer: null, daysLeft: 0, runsOutOn: '2026-10-19T00:00:00.000Z', startsOn: null }] }))
      .toEqual(['Your site induction runs out today. Your work stops if it lapses.'])
  })

  it('a paper she owes that stops the work is said at the top; one that does not stop the work is not', () => {
    const rows = paperRows({
      owed: [
        owedItem({ key: 'I9_EVERIFY', label: 'I-9 and E-Verify', blocks: true }),
        owedItem({ key: 'NDA', label: 'Non-disclosure agreement', blocks: false }),
      ],
    })
    expect(workStops({ rows })).toEqual(['Your I-9 and E-Verify is not on file. Your work stops without it.'])
  })

  it('Helena Marsh, who owes two papers that do not stop her working, reads no line at the top', () => {
    const rows = paperRows({
      papers: [
        { id: 'owed:PRODUCT_CONFIDENTIALITY', kind: 'OUTSTANDING', name: 'Product confidentiality undertaking', word: 'Not on file', stopsWork: false, todo: 'upload', openAskAt: '/api/me/papers' },
        { id: 'owed:NDA', kind: 'OUTSTANDING', name: 'Non-disclosure agreement', word: 'Not on file', stopsWork: false, todo: 'upload', openAskAt: '/api/me/papers' },
        { id: 'v1', kind: 'HELD', name: 'Background check', word: 'On file until Jun 26, 2027' },
      ],
    })
    expect(workStops({ rows, runningOut: [] })).toEqual([])
  })

  it('a stopping paper that ran out or is not in force yet says so, and one waived or already sent is not said at all', () => {
    const lapsed = paperRows({ papers: [{ id: 'owed:LICENSE', kind: 'OUTSTANDING', name: 'Professional license', word: 'Ran out 3 days ago', stopsWork: true, runsOutOn: '2026-10-16T00:00:00.000Z' }] })
    expect(workStops({ rows: lapsed })).toEqual(['Your professional license ran out on Oct 16, 2026. Your work stops until a new one is on file.'])
    const early = paperRows({ papers: [{ id: 'owed:INSURANCE', kind: 'OUTSTANDING', name: 'Respirator fit test', word: 'On file, but not in force until Nov 2, 2026', stopsWork: true }] })
    expect(workStops({ rows: early })).toEqual(['Your respirator fit test is not in force until Nov 2, 2026. Your work stops until then.'])
    const quiet = paperRows({
      owed: [
        owedItem({ key: 'A', label: 'background check', blocks: true, waived: true, waivedSays: 'Waived by Dana Whitfield.' }),
        owedItem({ key: 'B', label: 'drug screen', blocks: true, received: true }),
      ],
    })
    expect(workStops({ rows: quiet })).toEqual([])
  })

  it('a paper on file is said to stop her work only where it is required of her as blocking and nobody waived it', () => {
    const on = new Date('2026-10-19T12:00:00Z')
    const held = [
      { id: 'v1', key: 'PROFESSIONAL_LICENSE', label: 'Professional license', issuer: 'Wisconsin Board of Nursing', status: 'CLEAR', validFrom: '2024-11-12T00:00:00.000Z', expiresAt: '2026-11-12T00:00:00.000Z' },
      { id: 'v2', key: 'FORKLIFT_TICKET', label: 'Forklift ticket', issuer: null, status: 'CLEAR', validFrom: '2025-11-01T00:00:00.000Z', expiresAt: '2026-11-01T00:00:00.000Z' },
    ]
    const required = [{ key: 'PROFESSIONAL_LICENSE', required: true, blocks: true, waived: false, owedBy: 'WORKER' }]
    const soon = papersRunningOut({ held, required, on })
    // The forklift ticket is on file and no line asks for it: it stops nothing.
    expect(soon.map((p) => p.name)).toEqual(['Professional license'])
    expect(soon[0].daysLeft).toBe(24)
    expect(soon[0].issuer).toBe('Wisconsin Board of Nursing')
    // Waived, not blocking, or owed by somebody else: not hers to lose work over.
    for (const r of [
      { ...required[0], waived: true },
      { ...required[0], blocks: false },
      { ...required[0], owedBy: 'SUPPLIER' },
      { ...required[0], required: false },
    ]) expect(papersRunningOut({ held, required: [r], on })).toEqual([])
  })

  const ON = new Date('2026-10-19T12:00:00Z')
  const REQUIRED = [{ key: 'K', required: true, blocks: true, waived: false, owedBy: 'WORKER' }]
  const copy = (over: Record<string, unknown> = {}) => ({
    id: 'v', key: 'K', label: 'State registration', issuer: null, status: 'CLEAR',
    validFrom: '2025-11-12T00:00:00.000Z', expiresAt: '2026-11-12T00:00:00.000Z', ...over,
  })
  const judged = (...held: ReturnType<typeof copy>[]) => papersRunningOut({ held, required: REQUIRED, on: ON })

  it('a paper in force today is said to run out only inside sixty days, only once it came back, and not where it has no end', () => {
    expect(RUNNING_OUT_DAYS).toBe(60)
    expect(judged(copy())).toMatchObject([{ state: 'RUNS_OUT', daysLeft: 24 }])
    expect(judged(copy({ expiresAt: '2027-02-01T00:00:00.000Z' }))).toEqual([])
    expect(judged(copy({ expiresAt: null }))).toEqual([])
    expect(judged(copy({ status: 'PENDING' }))).toEqual([])
  })

  it('a paper that starts next month does not cover this week: it is said to be not in force until its first day', () => {
    const lines = judged(copy({ validFrom: '2026-11-02T00:00:00.000Z', expiresAt: '2027-11-02T00:00:00.000Z' }))
    expect(lines).toMatchObject([{ state: 'NOT_YET', startsOn: '2026-11-02T00:00:00.000Z' }])
    expect(workStops({ rows: [], runningOut: lines }))
      .toEqual(['Your state registration is not in force until Nov 2, 2026. Your work stops until then.'])
  })

  it('a renewal on file that starts the day after the old one ends keeps her covered, and nothing is said', () => {
    expect(judged(
      copy({ id: 'old' }),
      copy({ id: 'new', validFrom: '2026-11-13T00:00:00.000Z', expiresAt: '2028-11-13T00:00:00.000Z' }),
    )).toEqual([])
    // A renewal that leaves a gap does not: the old one is still said to run out.
    expect(judged(
      copy({ id: 'old' }),
      copy({ id: 'new', validFrom: '2026-12-01T00:00:00.000Z', expiresAt: '2028-12-01T00:00:00.000Z' }),
    )).toMatchObject([{ id: 'old', state: 'RUNS_OUT' }])
  })

  it('a paper that ran out with nothing newer on file is said to have run out, on the day it did', () => {
    const lines = judged(copy({ validFrom: '2024-10-10T00:00:00.000Z', expiresAt: '2026-10-10T00:00:00.000Z' }))
    expect(lines).toMatchObject([{ state: 'RAN_OUT', runsOutOn: '2026-10-10T00:00:00.000Z' }])
    expect(workStops({ rows: [], runningOut: lines }))
      .toEqual(['Your state registration ran out on Oct 10, 2026. Your work stops until a new one is on file.'])
  })

  it('a paper the paperwork section already names as owed is said once at the top, in the paperwork’s words', () => {
    const rows = paperRows({ papers: [{ id: 'owed:K', kind: 'OUTSTANDING', name: 'State registration', word: 'Ran out 9 days ago', stopsWork: true, runsOutOn: '2026-10-10T00:00:00.000Z' }] })
    const lines = workStops({ rows, runningOut: judged(copy({ expiresAt: '2026-10-10T00:00:00.000Z' })) })
    expect(lines).toEqual(['Your state registration ran out on Oct 10, 2026. Your work stops until a new one is on file.'])
  })

  it('every line under a paperwork heading is short: one idea a sentence, and no sentence past twenty words', () => {
    for (const s of SECTIONS) {
      for (const sentence of s.blurb.split(/(?<=\.)\s+/)) {
        expect(sentence.split(/\s+/).length, sentence).toBeLessThanOrEqual(20)
      }
    }
  })
})
