import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ownPage, type WorkingLife } from '@/lib/consultant-portfolio'
import { getNavForKind } from '@/components/shell/sidebar'
import { sidebarPropsFrom } from '@/components/shell/sidebar-props'

/**
 * The person with a page and nothing else.
 *
 * Party 8B in the lane drawings, and the state `POST /api/onboarding`
 * puts every consumer-email sign-in into on their first day: a
 * `ConsultantProfile` and not one other fact — no bench listing, no
 * employer, no corporation, no placement, no submission.
 *
 * `ownPage` asked three questions — a bench, an employer, the work —
 * and this person fell out of the bottom as PLACED, which opens
 * "Your work is on the record here". It is not. Nothing of theirs is
 * on any record, and somebody reading a sentence about themselves on
 * day one, knowing it is wrong, trusts nothing else on the screen.
 *
 * The right thing to say is that the page is theirs because they made
 * it, in one short line, with what comes next on the screen's cards.
 * Somebody paid through their own company signs up as the one-person
 * firm (sign-up walk, 2026-10-08); this page no longer offers that as
 * a step it does not have.
 */

const NOBODY: WorkingLife = {
  benches: [], employers: [], placements: 0, submissions: 0, paidEngagements: 0, hasProfile: false,
}

/** The independent candidate: a profile they made, and nothing else. */
const INDEPENDENT: WorkingLife = { ...NOBODY, hasProfile: true }

describe('somebody with a page and nothing else is told the truth about what is on it', () => {
  it('a person with a profile and nothing else has a page because they made it, and is not told their work is on the record', () => {
    const verdict = ownPage(INDEPENDENT)

    expect(verdict.ok).toBe(true)
    expect(verdict.because).toBe('OWN_MAKING')
    expect(verdict.says).toContain('You made this page yourself')
    expect(verdict.says).not.toContain('Your work is on the record')
  })

  it('their standing is one short line, not a paragraph', () => {
    const says = ownPage(INDEPENDENT).says
    expect(says.split(/\s+/).length).toBeLessThanOrEqual(30)
    expect(says).toContain('Nobody has put you forward yet')
  })

  it('the line offers no "company of your own" door, because that is a sign-up type and not a step on this page', () => {
    const says = ownPage(INDEPENDENT).says
    expect(says).not.toMatch(/company of your own|sell yourself/i)
  })

  it('tells them no firm markets them and nothing is public until they turn it on', () => {
    const says = ownPage(INDEPENDENT).says

    expect(says).toContain('no firm markets you')
    expect(says).toContain('public until you turn it on')
  })

  it('a consultant with a listing keeps the sentence they had', () => {
    const helena = { ...NOBODY, benches: ['Brightmoor Staffing'], hasProfile: true, placements: 2 }
    const verdict = ownPage(helena)

    expect(verdict.because).toBe('BENCH')
    expect(verdict.says).toContain('Brightmoor Staffing markets you')
  })

  it('an employer’s own W2 keeps the sentence they had', () => {
    const karthik = { ...NOBODY, employers: ['Teleworld Solutions'], placements: 1, hasProfile: true }
    const verdict = ownPage(karthik)

    expect(verdict.because).toBe('EMPLOYED')
    expect(verdict.says).toContain('need no listing')
  })

  it('somebody a firm has already put forward still reads the work-on-the-record sentence, because somebody did put them forward', () => {
    const verdict = ownPage({ ...INDEPENDENT, submissions: 1 })

    expect(verdict.because).toBe('PLACED')
    expect(verdict.says).toContain('Your work is on the record here')
  })

  it('somebody being paid for work reads the work-on-the-record sentence too, listing or no listing', () => {
    expect(ownPage({ ...INDEPENDENT, paidEngagements: 1 }).because).toBe('PLACED')
    expect(ownPage({ ...INDEPENDENT, placements: 1 }).because).toBe('PLACED')
  })

  it('a client’s own bookkeeper still has no page at all, because a seat is not work', () => {
    const clerk = { ...NOBODY, employers: ['Northbend Athletic'] }

    expect(ownPage(clerk).ok).toBe(false)
    expect(ownPage(clerk).because).toBe('NOBODY')
  })
})

// ── The screen ────────────────────────────────────────────────────────

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const PAGE = read('src/app/dashboard/my-work/page.tsx')
const WORK_ROUTE = read('src/app/api/me/work/route.ts')

/** The empty state on its own, so the rest of the page cannot answer for it. */
const EMPTY_STATE = (() => {
  const from = PAGE.indexOf('function NothingYet(')
  const to = PAGE.indexOf('export default function MyWorkPage(')
  expect(from, 'the empty state must exist to be read').toBeGreaterThan(-1)
  expect(to).toBeGreaterThan(from)
  return PAGE.slice(from, to)
})()

describe('the empty state on their own work is what to do, not four zeros', () => {
  it('somebody who made their page themselves is shown the empty state rather than a page of zeros', () => {
    // The branch is taken on the verdict, ahead of the stat grid.
    expect(PAGE).toContain("data.standing?.because === 'OWN_MAKING'")
    expect(PAGE).toContain('<NothingYet says={data.standing.says} />')
  })

  it('the route hands the page the standing sentence, so the screen and the nav cannot disagree about it', () => {
    // One answer to one question: the same `ownPage` the shell and their
    // own page already read, asked on the server.
    expect(WORK_ROUTE).toContain("import { ownPageFor } from '@/lib/portfolio-data'")
    expect(WORK_ROUTE).toContain('const standing = await ownPageFor(personId)')
    expect(WORK_ROUTE).toMatch(/standing: \{ ok: standing\.ok, because: standing\.because, says: standing\.says \}/)
    // And the page prints that sentence rather than writing a second one.
    expect(EMPTY_STATE).toContain('{says}')
  })

  it('the empty state is short cards, not paragraphs of prose', () => {
    // Read from the empty state's own function, not the helpers after it.
    const own = EMPTY_STATE.slice(0, EMPTY_STATE.indexOf('\n}\n'))
    expect(own.match(/<section /g) ?? []).toHaveLength(2)
    expect(own).not.toMatch(/leading-relaxed/)
  })

  it('one card says what this page will show once a firm puts you forward: where you work, the weeks you file, what is approved, what you are owed', () => {
    expect(EMPTY_STATE).toContain('There is no work here yet.')
    expect(EMPTY_STATE).toContain('Once a firm puts you forward')
    expect(EMPTY_STATE).toContain('The weeks you file')
    expect(EMPTY_STATE).toContain('What is approved')
    expect(EMPTY_STATE).toContain('What you are owed')
  })

  it('one card says what you can do now: turn your page on, keep it current, answer your paperwork', () => {
    expect(EMPTY_STATE).toContain('What you can do now')
    expect(EMPTY_STATE).toContain('Turn your page on')
    expect(EMPTY_STATE).toContain('Keep it current')
    expect(EMPTY_STATE).toContain('Your paperwork')
  })

  it('says once that Etyme places nobody', () => {
    expect(EMPTY_STATE).toContain('Etyme places nobody.')
  })

  it('somebody paid through their own company is told to sign up again as "I work through my own company", the one door that exists', () => {
    expect(EMPTY_STATE).toContain(
      'If you work through your own company, sign up again as &ldquo;I work through my own company&rdquo;.'
    )
    expect(EMPTY_STATE).not.toMatch(/set up a company of your own/i)
  })

  it('the empty state offers no button that Etyme cannot honor, because Etyme places nobody', () => {
    // Every one of these would be a promise nobody here can keep: Etyme
    // runs no bench, submits nobody and forwards no name.
    for (const lie of [
      /submit yourself/i,
      /find (a|me|your) (role|job|placement)/i,
      /apply (for|to)/i,
      /browse (roles|jobs|requirements)/i,
      /search (for )?(roles|jobs)/i,
      /get (placed|hired)/i,
      /join a bench/i,
    ]) {
      expect(EMPTY_STATE, `the empty state may not offer ${lie}`).not.toMatch(lie)
    }
  })

  it('the empty state links to their own page and their own paperwork, and nowhere else', () => {
    const hrefs = [...EMPTY_STATE.matchAll(/href="([^"]+)"/g)].map((m) => m[1])
    expect(hrefs.sort()).toEqual(['/dashboard/my-page', '/dashboard/my-work/paperwork'])
  })
})

// ── The menu ──────────────────────────────────────────────────────────

describe('somebody with nothing but a page still reads their own menu', () => {
  /**
   * Read rather than changed. `components/shell` belongs to the
   * architect; what is pinned here is that an independent candidate
   * lands on the Consultant row of CLAUDE.md's navigation table by two
   * different routes into the shell, so the answer is not accidental.
   */
  it('a candidate seat with no company reads the Consultant row of the navigation table', () => {
    const props = sidebarPropsFrom({
      company: null, contextType: 'CONSULTANT', loading: false, isWorker: true, permissions: undefined,
    } as any)

    expect(props.isConsultant).toBe(true)
    expect(props.companyLabel).toBe('Consultant')

    const sections = getNavForKind(props.companyKind, props.isConsultant, { worker: props.worker })
    expect(sections.map((s) => s.label)).toEqual(['You'])
  })

  it('their own work, their page and what is held about them are all on that menu', () => {
    const items = getNavForKind(null, true, {}).flatMap((s) => s.items.map((i) => i.href))

    expect(items).toContain('/dashboard/my-work')
    expect(items).toContain('/dashboard/my-page')
    expect(items).toContain('/dashboard/my-data')
  })
})
