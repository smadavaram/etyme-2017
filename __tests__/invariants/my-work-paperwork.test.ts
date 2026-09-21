import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import {
  paperRows, outstanding, countedAgainst, paperworkHeadline,
  owedWord, owedConsequence, owedTodo, owedFrom, NO_DOOR_YET,
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

  it('a document with no request open against it says where to send it, rather than offering a box that posts nowhere', () => {
    // A requirement is not a request. There is no endpoint that receives
    // a file against a DocumentRequirement, so the row says so.
    expect(owedTodo(owedItem({ askId: null, link: null }))).toBeNull()
    expect(owedTodo(owedItem({ askId: 'doc-1' }))).toBe('upload')
    expect(owedTodo(owedItem({ askId: 'doc-1', needsSignature: true }))).toBe('sign')
    expect(owedTodo(owedItem({ link: '/packet/abc' }))).toBe('open')
    expect(NO_DOOR_YET).toContain('nowhere to upload them here')
    expect(SECTION).toContain('NO_DOOR_YET')
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
    // The route asks for an upload button; there is no route that
    // receives a file against a requirement, so the screen says where to
    // send it instead of drawing a button that posts to a 404.
    expect(papers[0].todo).toBe('upload')
    expect(rows[0].todo).toBeNull()
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
