/**
 * Changing a requirement that is already out, as the route and the
 * screens do it.
 *
 * The rule itself is pure and tested next door in
 * requisition-change.test.ts: words change freely and every supplier who
 * received it is told; money goes back through the checks. What is
 * tested here is the part nobody could see — that the route actually
 * obeys it, that the chain is replaced rather than added to, that the
 * suppliers are reached, and that the form says what saving will do
 * before it does it.
 *
 * The pure parts of the route are lifted out and run, in the style of
 * requisition-chain-screens.test.ts, because a route file may export
 * nothing but its HTTP handlers. Everything that needs a database is
 * asserted against the source, and stated as such rather than dressed up
 * as behaviour.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { transformSync } from 'esbuild'
import { join } from 'path'
import { WORDS, MONEY, diff, mayChange, said, noticeForSuppliers } from '@/lib/requisition-change'
import { mayEdit, stageOf } from '@/lib/requisition-stage'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

/** A file with its comments taken out — several checks quote what must be gone. */
const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')

const EDIT_ROUTE = read('src/app/api/requisitions/[id]/route.ts')
const RAISE_ROUTE = read('src/app/api/requisitions/route.ts')
const LIST_PAGE = read('src/app/dashboard/requisitions/page.tsx')
const DETAIL_PAGE = read('src/app/dashboard/requisitions/[id]/page.tsx')
const CHAIN = read('src/app/dashboard/requisitions/chain.tsx')
const CONVERSATIONS = read('src/app/api/conversations/route.ts')
const SUBMISSIONS_ROUTE = read('src/app/api/submissions/route.ts')
const SUBMISSIONS_PAGE = read('src/app/dashboard/submissions/page.tsx')

/** One top-level declaration, whole. It ends at a `}` in column one. */
function block(source: string, from: string): string {
  const start = source.indexOf(from)
  expect(start, `${from} not found`).toBeGreaterThan(-1)
  const end = source.indexOf('\n}', start)
  expect(end, `${from} never closes at the top level`).toBeGreaterThan(start)
  return source.slice(start, end + 2)
}

/**
 * The route's own pure helpers, lifted and made runnable.
 *
 * Read out of the file rather than imported: these decide what counts as
 * a change, and a regex over them would pass on a file that reads the
 * right fields into the wrong shape.
 */
const route = (() => {
  const src = ['function words(', 'function figure(', 'function asItStands(', 'function proposed(',
    'function mayReassignOwner(', 'function pausedByChecks(']
    .map((f) => block(EDIT_ROUTE, f)).join('\n')
  const js = transformSync(src, { loader: 'ts' }).code
  // eslint-disable-next-line no-new-func
  return new Function(
    `${js}\nreturn { words, figure, asItStands, proposed, mayReassignOwner, pausedByChecks }`
  )() as {
    words: (v: unknown) => string | null
    figure: (v: unknown) => number | null
    asItStands: (r: Record<string, any>) => Record<string, unknown>
    proposed: (b: Record<string, any>) => Record<string, unknown>
    mayReassignOwner: (r: { ownerId?: string | null; raisedById?: string | null }, me: string, distributes: boolean) => boolean
    pausedByChecks: (state: string) => boolean
  }
})()

/** The keys of a `const facts: RequisitionFacts = {...}` literal, at its own level. */
function factKeys(source: string): string[] {
  const start = source.indexOf('const facts: RequisitionFacts = {')
  expect(start, 'no facts object in this file').toBeGreaterThan(-1)
  const end = source.indexOf('\n  }\n', start)
  const body = source.slice(start, end)
  // `: ` or a bare `,` — the shorthand keys count too.
  return [...body.matchAll(/^ {4}(\w+)[:,]/gm)].map((m) => m[1]).sort()
}

/** The `facts.x = ...` assignments made after the literal. */
function factsSetAfter(source: string): string[] {
  return [...source.matchAll(/^ {2}facts\.(\w+) =/gm)].map((m) => m[1]).sort()
}

const PUBLISHED = { status: 'OPEN', approvalState: 'APPROVED', archivedAt: null }
const DRAFT = { status: 'DRAFT', approvalState: 'DRAFT', archivedAt: null }

// ── 1. Words on one that is out ───────────────────────────

describe('Changing a requirement that suppliers already have', () => {
  it('words on a published requirement are saved and every supplier who received it is told what changed', () => {
    const before = route.asItStands({ title: 'SAP MM Consultant', description: 'Old words', skills: ['SAP MM'] })
    const after = route.proposed({ title: 'SAP MM Consultant', description: 'New words', skills: ['SAP MM'] })
    const changes = diff(before, after)
    expect(changes.map((c) => c.field)).toEqual(['description'])

    const verdict = mayChange(PUBLISHED, changes)
    expect(verdict.allowed).toBe(true)
    expect(verdict.reapprove).toBe(false)
    expect(verdict.tellSuppliers).toBe(true)

    // And the route reaches the firms that were sent it, at the seats
    // that work it — not one contact per firm and not the consultants.
    const c = code(EDIT_ROUTE)
    expect(c).toContain('prisma.requirementInvitation.findMany')
    expect(c).toContain("type: { in: ['EMPLOYEE', 'PARTNER'] }")
    expect(c).toContain('revokedAt: null')
    expect(c).toContain('noticeForSuppliers({')
    expect(c).toContain('notifyBulk(rows)')
    // The bell files a SYSTEM notice where the whole sentence can be read.
    expect(c).toContain("type: 'SYSTEM'")
    expect(c).toContain('entityId: id')
  })

  it('a supplier is told who changed it, what changed, and whether to keep working it', () => {
    const changes = diff(
      route.asItStands({ description: 'Old', skills: ['SAP MM'] }),
      route.proposed({ description: 'New', skills: ['SAP MM', 'S/4HANA'] })
    )
    const notice = noticeForSuppliers({ who: 'Marcus Oyelaran', title: 'SAP MM Consultant', changes, paused: false })
    expect(notice.title).toBe('SAP MM Consultant has changed')
    expect(notice.body).toContain('Marcus Oyelaran changed the description and the skills')
    expect(notice.body).toContain('Submissions already in stand')
  })

  it('a change to the money on a published requirement runs the checks again and replaces the chain', () => {
    const changes = diff(
      route.asItStands({ billMax: 13_000, months: 12 }),
      route.proposed({ billMax: 17_000, months: 12 })
    )
    expect(changes.map((c) => c.field)).toEqual(['billMax'])
    const verdict = mayChange(PUBLISHED, changes)
    expect(verdict.reapprove).toBe(true)
    expect(verdict.reason).toContain('the money moved, so it goes back through approval')

    const c = code(EDIT_ROUTE)
    expect(c).toContain('evaluateRequisition(facts, rules)')
    // An APPROVED row from before is not an approval of a different
    // number, so the chain goes and is written again from the decision.
    expect(c).toContain('tx.requirementApproval.deleteMany({ where: { requirementId: id } })')
    expect(c).toContain('tx.requirementApproval.createMany')
    expect(c).toContain('decision.steps.map')
    expect(c).toContain('approvalState: decision.state')
  })

  it('the checks after a change are built from the same facts as the checks when it was raised', () => {
    expect(factKeys(RAISE_ROUTE)).toContain('skillMedianCents')
    expect(factKeys(EDIT_ROUTE)).toEqual(factKeys(RAISE_ROUTE))
    expect(factsSetAfter(EDIT_ROUTE)).toEqual(factsSetAfter(RAISE_ROUTE))
    // And the parts that are arithmetic rather than a column.
    for (const piece of ['annualValue({', 'ancestry(orgUnits, team)', 'medianRateForSkills', 'specificity:']) {
      expect(code(EDIT_ROUTE), `the re-check is missing ${piece}`).toContain(piece)
    }
  })

  it('a published requirement stays where the suppliers can see it while it waits on a desk', () => {
    // Not sent back to drafts: it keeps its status and reads off the
    // approval state, which is what puts "Awaiting approval" on the row.
    expect(stageOf({ status: 'OPEN', approvalState: 'PENDING_APPROVAL', archivedAt: null })).toBe('AWAITING')
    expect(code(EDIT_ROUTE)).not.toMatch(/data:\s*{[^}]*status:\s*'DRAFT'/)
    expect(code(EDIT_ROUTE)).not.toContain("status: 'DRAFT',")
  })

  it('the suppliers are told it is paused while the money is re-approved, and told again when it clears', () => {
    expect(route.pausedByChecks('PENDING_APPROVAL')).toBe(true)
    expect(route.pausedByChecks('AUTO_APPROVED')).toBe(false)

    const changes = diff(route.asItStands({ billMax: 13_000 }), route.proposed({ billMax: 17_000 }))
    const held = noticeForSuppliers({ who: 'Dana Whitfield', title: 'Validation Engineer', changes, paused: route.pausedByChecks('PENDING_APPROVAL') })
    expect(held.title).toBe('Validation Engineer is paused while the money is re-approved')
    expect(held.body).toContain('Hold submissions until it is approved again')

    const clear = noticeForSuppliers({ who: 'Dana Whitfield', title: 'Validation Engineer', changes, paused: route.pausedByChecks('AUTO_APPROVED') })
    expect(clear.title).toBe('Validation Engineer has changed')
    expect(clear.body).toContain('Submissions already in stand')
  })

  it('a filled or cancelled requirement cannot be changed, in a sentence', () => {
    const change = diff(route.asItStands({ description: 'Old' }), route.proposed({ description: 'New' }))
    for (const row of [
      { status: 'FILLED', approvalState: 'APPROVED', archivedAt: null },
      { status: 'OPEN', approvalState: 'APPROVED', archivedAt: new Date() },
      { status: 'CANCELLED', approvalState: 'APPROVED', archivedAt: null },
    ]) {
      const verdict = mayChange(row, change)
      expect(verdict.allowed).toBe(false)
      expect(verdict.reason).toMatch(/Raise a new requirement\./)
      expect(verdict.reason).not.toMatch(/[A-Z]{4,}_[A-Z]{4,}/)
      expect(mayEdit(row)).toBe(false)
    }
    // And the refusal the caller reads is that sentence, not a code.
    expect(code(EDIT_ROUTE)).toContain('message: verdict.reason')
  })

  it('changing nothing is refused rather than written down as a change', () => {
    const same = diff(
      route.asItStands({ title: 'SAP MM Consultant', neededBy: new Date('2026-03-01T00:00:00.000Z'), skills: ['SAP MM'] }),
      route.proposed({ title: 'SAP MM Consultant', neededBy: '2026-03-01', skills: ['SAP MM'] })
    )
    expect(same).toEqual([])
    expect(mayChange(PUBLISHED, same)).toMatchObject({ allowed: false, reason: 'Nothing changed.' })
  })

  it('a figure cleared to blank is no figure, and a rate of zero is still a rate', () => {
    expect(route.figure('')).toBeNull()
    expect(route.figure(null)).toBeNull()
    expect(route.figure(undefined)).toBeNull()
    expect(route.figure(0)).toBe(0)
    expect(route.figure(17_000)).toBe(17_000)
    expect(route.words('  ')).toBeNull()
    expect(route.words(' Backfill ')).toBe('Backfill')
  })

  it('a field left off the form is not a field set to nothing', () => {
    // A PATCH that sends only a title must not read as "and clear the
    // description, the skills and the rate band".
    const after = route.proposed({ title: 'SAP MM Consultant' })
    expect(Object.keys(after)).toEqual(['title'])
    expect(diff(route.asItStands({ title: 'SAP MM Consultant', description: 'Words', billMax: 13_000 }), after)).toEqual([])
  })

  it('the budget that pays for a published requirement cannot be moved underneath its suppliers', () => {
    const c = code(EDIT_ROUTE)
    expect(c).toContain("code: 'BUDGET_FIXED'")
    expect(EDIT_ROUTE).toContain(
      'Which budget pays for this cannot move once suppliers have it. Cancel this one and raise it against the right budget.'
    )
  })

  it('only the manager it is for, whoever raised it, or somebody who releases roles may hand it on', () => {
    const row = { ownerId: 'p-marcus', raisedById: 'p-dana' }
    expect(route.mayReassignOwner(row, 'p-marcus', false)).toBe(true)
    expect(route.mayReassignOwner(row, 'p-dana', false)).toBe(true)
    expect(route.mayReassignOwner(row, 'p-stranger', false)).toBe(false)
    expect(route.mayReassignOwner(row, 'p-stranger', true)).toBe(true)
    expect(code(EDIT_ROUTE)).toContain("hasPermission(caller.permissions, 'requirements.distribute')")
  })

  it('every change to a requisition leaves a reason on the record, not a free-text note', () => {
    const c = code(EDIT_ROUTE)
    expect(c).toContain("action: 'REQUISITION_CHANGED'")
    expect(c).toContain('said(changes)')
    expect(c).toContain('reversible: true')
    // The reason is the rule's own sentence and the payload is the
    // changes themselves — never a note somebody typed.
    expect(c).toContain('changes: changes as any')
    expect(said(diff(route.asItStands({ billMin: 10_000, billMax: 13_000 }), route.proposed({ billMin: 11_000, billMax: 14_000 }))))
      .toBe('Changed the rate band')
  })
})

// ── 2. The form ───────────────────────────────────────────

describe('The edit form on a published row', () => {
  it('the edit form on a published row says what will happen before it happens', () => {
    expect(LIST_PAGE).toContain(
      'Words change now and your suppliers are told. Changing the rate, months, headcount or budget sends it back through approval.'
    )
    // And it knows which row it is on the same way every other screen does.
    expect(code(LIST_PAGE)).toContain("const out = stageOf(req) === 'OPEN'")
  })

  it('after saving, the form says what actually happened in the route’s own words', () => {
    expect(code(LIST_PAGE)).toContain('setSaid(body?.data?.message')
    // Not a modal that shuts on a change nobody saw the consequence of.
    expect(code(LIST_PAGE)).toContain('{said ? (')
  })

  it('the Edit button opens on a published row, now that words can change', () => {
    expect(mayEdit({ status: 'OPEN', approvalState: 'APPROVED', archivedAt: null })).toBe(true)
    expect(code(LIST_PAGE)).toContain("{(mayEdit(r) || (!pending && r.status !== 'CANCELLED')) && (")
    // The old sentence, which said the opposite, is gone with the rule.
    expect(LIST_PAGE).not.toContain('Published\n                          is deliberately not editable')
  })
})

// ── 3. The panel ──────────────────────────────────────────

describe('Who is interviewing', () => {
  it('the panel is names, saved with the requirement, and every round starts with it', () => {
    // A word, not a figure: it changes freely and the suppliers are told.
    expect(WORDS).toContain('interviewers')
    expect(MONEY).not.toContain('interviewers')

    // Names, tidied and never doubled.
    expect(route.proposed({ interviewers: ['  Anita Shah ', 'Anita Shah', '', 'Derek Halvorsen'] }).interviewers)
      .toEqual(['Anita Shah', 'Derek Halvorsen'])

    // Asked on both forms, and the answer is sent both times.
    expect(CHAIN).toContain('export function PanelField(')
    expect(CHAIN).toContain('Who is interviewing')
    expect(code(LIST_PAGE).match(/interviewers: panel/g)?.length).toBe(2)
    expect(code(LIST_PAGE).match(/<PanelField names=\{panel\}/g)?.length).toBe(2)

    // Shown on the row it belongs to.
    expect(DETAIL_PAGE).toContain('Who is interviewing')
    expect(code(DETAIL_PAGE)).toContain('r.interviewers')

    // And it is where the interview form's first round starts.
    expect(code(SUBMISSIONS_PAGE)).toContain('defaultInterviewers={propose.row.requirement.interviewers ?? []}')
  })

  it('a supplier reading its own submission is not shown the client’s panel', () => {
    expect(code(SUBMISSIONS_ROUTE)).toContain(
      's.requirement.companyId === caller.company?.id ? s.requirement.interviewers : null'
    )
  })
})

// ── 4. The discussion ─────────────────────────────────────

describe('The discussion on a requisition', () => {
  it('a requisition has a discussion its own people can read and add to', () => {
    const c = code(DETAIL_PAGE)
    // Read: the thread for this requirement, and its messages.
    expect(c).toContain('/api/conversations?topic=REQUIREMENT&topicId=')
    expect(c).toContain('/api/conversations/messages?conversationId=')
    // Write: the thread is made by the first message, not by the row.
    expect(c).toContain("topic: 'REQUIREMENT', topicId: requisitionId")
    expect(c).toContain("conversationId: threadId, body")
    // Names and times, so a thread reads as people talking.
    expect(c).toContain('m.authorName ?? ')
    expect(c).toContain('new Date(m.createdAt).toLocaleString()')
    expect(DETAIL_PAGE).toContain('Your own people only. Suppliers never see this.')
  })

  it('the client’s own people are the participants, and the API decides that, not the screen', () => {
    const c = code(CONVERSATIONS)
    expect(c).toContain('where.companyId = caller.company.id')
    expect(c).toContain('companyId: caller.company.id')
    // One thread per requirement, so two people posting at once do not
    // make two threads.
    expect(c).toContain('companyId_topic_topicId')
  })

  it('an empty discussion says what it is for rather than showing an empty box', () => {
    expect(DETAIL_PAGE).toContain('Nothing said yet. Notes here stay with your own people — no supplier sees them.')
  })
})
