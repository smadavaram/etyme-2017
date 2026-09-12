import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * A candidate answering their own interview.
 *
 * `/api/me/pipeline` shipped showing proposed slots, and
 * `POST /api/me/interviews/:id/respond` shipped accepting an answer —
 * and the consultant's own page had no interview section at all, so
 * neither could be reached by the only person entitled to use them.
 * A screen that tells somebody three times they are wanted and gives
 * them no button. LEGACY_RULES.md §15.4 names the same gap: the 2017
 * build had `accept_interview` and this one lost it.
 *
 * Checked at source, in the style of mobile-shell.test.ts, because the
 * behaviour lives in a client component with no route handler to call.
 * What is pinned is the shape that makes the screen work: that the
 * buttons post the right body, that a refusal lands on the page as a
 * sentence, and that no time is rendered in the server's time zone.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const PAGE = read('src/app/dashboard/my-work/page.tsx')
const PIPELINE = read('src/app/api/me/pipeline/route.ts')

describe('A candidate can answer an interview from their own page', () => {

  it('a candidate can accept one of the times offered from their own page', () => {
    // The section exists at all — the thing that was missing.
    expect(PAGE).toContain('Your interviews')
    // Every offered slot is its own button, in their own words.
    expect(PAGE).toMatch(/iv\.slots\.map\(/)
    expect(PAGE).toContain('I can do this')
    // And tapping one posts that slot's own start to the respond route.
    expect(PAGE).toContain('/api/me/interviews/${iv.id}/respond')
    expect(PAGE).toMatch(/respond\(\{\s*action: 'ACCEPT', slot: s\.start\s*\}\)/)
    expect(PAGE).toMatch(/method: 'POST'/)
  })

  it('a candidate can say they cannot make any of them, in a sentence', () => {
    expect(PAGE).toContain("I can&apos;t make any of these")
    expect(PAGE).toMatch(/respond\(\{ action: 'DECLINE', reason: reason\.trim\(\) \}\)/)
    // A reason nobody wrote is not a reason. The send stays disabled
    // until there is a sentence in the box.
    expect(PAGE).toMatch(/disabled=\{busy \|\| reason\.trim\(\) === ''\}/)
  })

  it('the reason for declining is typed on the page, never in a browser prompt', () => {
    // window.prompt cannot be read on a phone, cannot be corrected, and
    // is the browser's voice rather than the product's.
    expect(PAGE).toContain('<textarea')
    expect(PAGE).not.toContain('window.prompt')
    expect(PAGE).not.toMatch(/\bprompt\(/)
  })

  it('a refused answer is a sentence on the page, never an overlay', () => {
    // readJson turns a 403, a 409 or an empty 500 into a readable
    // sentence; the try/catch keeps it on the card instead of throwing
    // it at the Next.js error overlay.
    expect(PAGE).toContain("import { readJson } from '@/lib/read-response'")
    expect(PAGE).toMatch(/const body = await readJson\(res\)[\s\S]{0,400}catch \(e: any\) \{\s*setRefusal\(e\.message\)/)
    expect(PAGE).toMatch(/\{refusal && <p[^>]*etyme-attention[^>]*>\{refusal\}<\/p>\}/)
    // The route's own sentence on success, not one this page invented.
    expect(PAGE).toContain('setSaid(body.data.says)')
    // And the pipeline is re-read after either answer, so the card
    // stops offering buttons it can no longer honour.
    expect(PAGE).toContain('onAnswered()')
    expect(PAGE).toMatch(/onAnswered=\{load\}/)
  })

  it('a booked round shows its time and place', () => {
    expect(PAGE).toMatch(/iv\.state === 'CONFIRMED'/)
    expect(PAGE).toContain('Booked for {localTime(iv.confirmedStart)}')
    expect(PAGE).toMatch(/\$\{iv\.location\}/)
  })

  it('a confirmed round with no time on file says so rather than guessing one', () => {
    // A plausible wrong hour on an interview is worse than a blank.
    expect(PAGE).toContain('has not sent the exact time back yet')
    expect(PIPELINE).toMatch(/if \(scheduledAt\) return \{ start: scheduledAt\.toISOString\(\), basis: 'scheduled' \}/)
    // One offered time, accepted, is the time. Two and no scheduledAt
    // is genuinely unknown, and picking the first would be a booking
    // nobody made.
    expect(PIPELINE).toMatch(/slots\.length === 1/)
    expect(PIPELINE).toMatch(/return \{ start: null, basis: null \}/)
  })

  it("the times offered are shown in the reader's own time zone, not the server's", () => {
    // Stored absolute, read local. A candidate in Pune reading a slot
    // rendered in the server's zone turns up on the wrong hour, and
    // every test still passes.
    expect(PAGE).toContain('new Intl.DateTimeFormat(undefined')
    expect(PAGE).toMatch(/localTime\(s\.start\)/)
    // No hand-rolled slicing of an ISO string, which is the server's
    // zone by another name.
    expect(PAGE).not.toMatch(/\.start\.slice\(/)
  })

  it('an interview says which client, which role, which stage and which round', () => {
    expect(PAGE).toMatch(/\{iv\.with\}/)
    expect(PAGE).toMatch(/\{iv\.role\}/)
    expect(PAGE).toContain('round ${iv.round}')
    expect(PAGE).toContain('{roundLine(iv)}')
    expect(PAGE).toContain('{howLine(iv)}')
    // Their word for the round, and plain words for how — never PHONE,
    // VIDEO, ONSITE on the screen.
    expect(PAGE).toContain("'Phone call'")
    expect(PAGE).toContain("'Video call'")
    expect(PAGE).toContain("'In person'")
  })

  it('a round already done or cancelled is not put in front of them to answer', () => {
    // The route only carries what is still ahead.
    expect(PIPELINE).toMatch(/\.filter\(\(i\) => i\.state === 'PROPOSED' \|\| i\.state === 'CONFIRMED'\)/)
    // And the buttons appear only while it is genuinely waiting on them.
    expect(PAGE).toMatch(/const waiting = iv\.state === 'PROPOSED' && !iv\.answeredByYou/)
    expect(PAGE).toMatch(/\{waiting && iv\.slots\.length > 0 && \(/)
  })

  it('a yes the others have not confirmed yet does not call itself booked', () => {
    // Three diaries, and the candidate's is one of them. "Booked" on a
    // round the supplier has not confirmed puts a meeting in a calendar
    // nobody else agreed to, and makes the no-show record a liar.
    expect(PAGE).toContain('still has to confirm it.')
    expect(PAGE).toMatch(/You said yes\$\{iv\.confirmedStart \? `, for \$\{localTime\(iv\.confirmedStart\)\}`/)
    // Which means a round they answered stops offering the buttons even
    // while it is still PROPOSED.
    expect(PIPELINE).toContain("answeredByYou: i.state !== 'PROPOSED' || i.consultantConfirmedAt !== null")
  })

  it('the page asks the pipeline for the interview rather than inventing one', () => {
    expect(PAGE).toContain("fetch('/api/me/pipeline')")
    expect(PAGE).toContain('body.data.interviewsAhead')
    // Nothing ahead is not a state worth a heading.
    expect(PAGE).toMatch(/if \(!ahead \|\| ahead\.length === 0\) return null/)
  })

  it("the pipeline sends the interview's id, stage, how, where and how long", () => {
    for (const field of ['id: true', 'stage: true', 'mode: true', 'state: true',
      'durationMins: true', 'location: true', 'consultantConfirmedAt: true']) {
      expect(PIPELINE, field).toContain(field)
    }
    // The slot value posted back is the start, which is what the
    // respond route compares on — so three historic slot shapes
    // (`{start}`, `{at}`, a bare string) all answer correctly.
    expect(PIPELINE).toMatch(/s\?\.start \?\? s\?\.at/)
  })

  it('a time that has already passed is not offered as something they can do', () => {
    // Slots sit unanswered for days. A button still saying "I can do
    // this" against last Monday books a meeting nobody can attend, and
    // the respond route would accept it — it checks the slot was
    // offered, not that it is still ahead.
    expect(PAGE).toMatch(/const gone = new Date\(s\.start\)\.getTime\(\) < Date\.now\(\)/)
    expect(PAGE).toContain('line-through')
    expect(PAGE).toContain('Every time offered has passed.')
  })

  it('the interview cards stack on a phone and fix no widths', () => {
    const section = PAGE.slice(PAGE.indexOf('function InterviewCard'), PAGE.indexOf('function YourInterviews'))
    expect(section).toContain('flex flex-col gap-2')
    expect(section).toContain('flex flex-wrap')
    expect(section).toContain('w-full md:w-auto')
    // No pixel or rem width that a 390px phone cannot hold.
    expect(section).not.toMatch(/\bw-\[\d+px\]/)
    expect(section).not.toMatch(/\bmin-w-\[\d/)
    // A pasted meeting link is the usual cause of a page wider than the
    // screen.
    expect(PAGE).toContain('break-all')
  })
})
