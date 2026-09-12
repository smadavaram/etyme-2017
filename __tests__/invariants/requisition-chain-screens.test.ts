/**
 * The approval chain, as the screens read it.
 *
 * Founder, on the old screen: the chain was "over $250k → a VP" and the
 * page showed it as a flat list of names with "rank 1" next to each. The
 * engine changed underneath — three desks, each with its own question,
 * two of them deciding alongside each other — and a flat list cannot say
 * why two people are being asked at the same moment, or that a third
 * cleared by rule and did not need to be asked at all.
 *
 * These run the page's own functions rather than matching a regex over
 * JSX, because a regex passes on a page that renders the right words in
 * the wrong place. The pure parts of both requisition screens live in
 * src/app/dashboard/requisitions/chain.tsx for exactly that reason.
 *
 * And where a row does not carry its stage, the desk is recovered from
 * what the engine itself wrote. That recovery is checked against the
 * real engine below — feed `evaluateRequisition`'s own steps back in with
 * the stage stripped, and every one has to land under the desk that wrote
 * it. If somebody rewords a reason, this test fails rather than the
 * screen quietly filing HR's question under the money.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { transformSync } from 'esbuild'
import { join } from 'path'
import { evaluateRequisition, type ApprovalRuleFacts, type RequisitionFacts } from '@/lib/requisition-approval'
import {
  DESKS,
  allTicked,
  byDesk,
  clearedForSentence,
  deskOf,
  myRow,
  outcomeWords,
  tickedIds,
  whoFor,
  whoWillBeAsked,
} from '@/app/dashboard/requisitions/chain'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

/**
 * A file with its comments taken out.
 *
 * Several of these checks are "this string is not in the code any more",
 * and the comment explaining why it was removed quotes it. Without this
 * the explanation fails the test it explains.
 */
const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')

const LIST_PAGE = read('src/app/dashboard/requisitions/page.tsx')
const DETAIL_PAGE = read('src/app/dashboard/requisitions/[id]/page.tsx')
const CHAIN = read('src/app/dashboard/requisitions/chain.tsx')
const TEAM_PAGE = read('src/app/dashboard/program/team/page.tsx')
const TEAM_ROUTE = read('src/app/api/program/team/route.ts')

/**
 * One top-level declaration, whole.
 *
 * Balancing braces from the first `{` does not work here: the first brace
 * after `function resolveDesks(` opens a type annotation, not the body.
 * A top-level declaration in this codebase ends at a `}` in column one,
 * which is both simpler and right.
 */
function block(source: string, from: string): string {
  const start = source.indexOf(from)
  expect(start, `${from} not found`).toBeGreaterThan(-1)
  const end = source.indexOf('\n}', start)
  expect(end, `${from} never closes at the top level`).toBeGreaterThan(start)
  return source.slice(start, end + 2)
}

/**
 * The route's nearest-desk-up-the-tree walk, lifted and made runnable.
 *
 * A route file may export nothing but its HTTP handlers, so this cannot
 * be imported. It is read out of the file and run, because the whole
 * point of it is arithmetic on a tree and a regex cannot check a walk.
 */
const resolveDesks: (
  units: { id: string; name: string; parentId: string | null }[],
  rules: { id: string; kind: string; orgUnitId: string | null; approver: { id: string; name: string } }[]
) => Record<string, { hr: any; procurement: any }> = (() => {
  const source = block(TEAM_ROUTE, 'function resolveDesks(')
  // Transpiled rather than regex-stripped: the types in this signature
  // are three levels deep and a regex that nearly strips them is worse
  // than none, because it fails as a syntax error somewhere unrelated.
  const js = transformSync(source, { loader: 'ts' }).code
  // eslint-disable-next-line no-new-func
  return new Function(`${js}\nreturn resolveDesks`)() as any
})()

// ── Fixtures ──────────────────────────────────────────────

const HR_DESK: ApprovalRuleFacts = {
  id: 'rule-hr', name: 'HR — Technology', kind: 'HR',
  approverId: 'p-shah', approverName: 'Anita Shah', thresholdCents: null, rank: 1, specificity: 1,
}
const PROC_DESK: ApprovalRuleFacts = {
  id: 'rule-proc', name: 'Procurement — Technology', kind: 'PROCUREMENT',
  approverId: 'p-halvorsen', approverName: 'Derek Halvorsen', thresholdCents: null, rank: 1, specificity: 1,
}
const VP_RULE: ApprovalRuleFacts = {
  id: 'rule-vp', name: 'Over $250k', kind: 'VALUE',
  approverId: 'p-chen', approverName: 'Marcus Chen', thresholdCents: 250_000_00, rank: 1,
}
const DESK_IDS = { hrPersonId: 'p-shah', procurementPersonId: 'p-halvorsen' }

function facts(overrides: Partial<RequisitionFacts> = {}): RequisitionFacts {
  return {
    annualValueCents: 200_000_00,
    headcount: 1,
    billMaxCents: 13_000,
    skillMedianCents: 13_400,
    costCenter: {
      id: 'cc-1', code: 'TBC-4100',
      approvedHeads: 10, committedHeads: 4,
      annualBudgetCents: 500_000_00, committedSpendCents: 100_000_00,
    },
    months: 12,
    raisedById: 'p-manager',
    ownerId: 'p-manager',
    lead: { personId: 'p-whitfield', name: 'Dana Whitfield' },
    escalation: { personId: 'p-okoro', name: 'Ngozi Okoro' },
    unitName: 'Technology',
    ...overrides,
  }
}

/** The engine's steps, in the shape the screens receive them. */
function rows(f: Partial<RequisitionFacts>, rules: ApprovalRuleFacts[] = [HR_DESK, PROC_DESK]) {
  return evaluateRequisition(facts(f), rules).steps.map((s, i) => ({
    id: `a${i}`,
    stage: s.stage as string | null,
    rank: s.rank,
    approver: s.approverId ? { id: s.approverId, name: s.approverName! } : null,
    outcome: s.outcome as string,
    reason: s.reason,
    decidedAt: null,
  }))
}

// ── 1. The chain, read by desk ────────────────────────────

describe('The chain is read by desk, not as a list of names', () => {
  it('the chain reads by desk, in the order asked', () => {
    const grouped = byDesk(rows({ headcount: 8, billMaxCents: 17_000 }), DESK_IDS)
    expect(grouped.map((g) => g.heading)).toEqual([
      'Role — HR',
      'Sourcing — Procurement',
      'The money — the lead',
    ])
  })

  it('each desk carries the question it is there to answer', () => {
    expect(DESKS.map((d) => d.asks)).toEqual([
      'Is this a role, and is it in the plan?',
      'Who may supply it, and at what rate?',
      'The one yes on the spend.',
    ])
  })

  it('HR and Procurement are shown side by side, and the lead after both', () => {
    const grouped = byDesk(rows({ headcount: 8, billMaxCents: 17_000 }), DESK_IDS)
    expect(grouped[0].rows[0].approver?.name).toBe('Anita Shah')
    expect(grouped[1].rows[0].approver?.name).toBe('Derek Halvorsen')
    expect(grouped[2].rows[0].approver?.name).toBe('Dana Whitfield')
  })

  it('a desk with nothing on it is left off rather than shown empty', () => {
    // One row, the old shape: the whole chain under the money.
    const grouped = byDesk(
      [{ id: 'x', stage: null, rank: 0, approver: null, outcome: 'AUTO_CLEARED', reason: 'Within plan and under every threshold.' }],
      {}
    )
    expect(grouped.map((g) => g.key)).toEqual(['FINAL'])
  })

  it('a stage cleared by rule says so and says who was not needed', () => {
    const grouped = byDesk(rows({}), DESK_IDS)
    const role = grouped.find((g) => g.key === 'ROLE')!
    expect(outcomeWords(role.rows[0].outcome)).toBe('cleared by rule')
    expect(role.rows[0].approver).toBeNull()
    expect(role.rows[0].reason).toContain('HR (Anita Shah) not needed')
  })

  it('every row the engine writes lands under the desk that wrote it', () => {
    // The stage is stripped, as it arrives from a read path that does not
    // send it, and has to be recovered from the rank, the person and the
    // words the engine itself chose.
    const cases: Partial<RequisitionFacts>[] = [
      {},
      { headcount: 8 },
      { billMaxCents: 17_000 },
      { headcount: 8, billMaxCents: 17_000 },
      { costCenter: null, lead: null, escalation: null },
      { annualValueCents: 450_000_00 },
      { skillMedianCents: null },
      { billMaxCents: null },
      { costCenter: { id: 'c', code: 'TBC-4100', approvedHeads: null, committedHeads: 0, annualBudgetCents: null, committedSpendCents: 0 } },
    ]
    const ruleSets = [[HR_DESK, PROC_DESK], [HR_DESK, PROC_DESK, VP_RULE], []]
    for (const f of cases) {
      for (const rules of ruleSets) {
        const withStage = rows(f, rules)
        for (const row of withStage) {
          const stripped = { ...row, stage: null }
          expect(
            deskOf(stripped, rules.length ? DESK_IDS : {}),
            `${row.stage} row read as the wrong desk: "${row.reason}"`
          ).toBe(row.stage)
        }
      }
    }
  })

  it('an outcome is a word a person would use, never a state name', () => {
    expect(outcomeWords('AUTO_CLEARED')).toBe('cleared by rule')
    expect(outcomeWords('PENDING')).toBe('waiting')
    expect(outcomeWords('APPROVED')).toBe('yes')
    expect(outcomeWords('REJECTED')).toBe('no')
    expect(outcomeWords('CHANGES_REQUESTED')).toBe('sent back')
  })

  it('a requisition not yet released says what is still owed, not its column', () => {
    // "This requisition is changes requested." was the column, lower-cased.
    expect(code(DETAIL_PAGE)).not.toContain("r.approvalState.toLowerCase()")
    expect(DETAIL_PAGE).toContain(
      'Still with the desks above. Suppliers see it once every one of them has said yes.'
    )
    expect(DETAIL_PAGE).toContain(
      'Sent back for changes. Edit it and it goes round again — to the desk that asked, not back to the start.'
    )
  })

  it('no screen prints a state name or a stage name at a reader', () => {
    // The reason text on a row comes from the engine and is prose. What
    // must never appear is a literal rendered as a label.
    for (const [name, src] of [['list', LIST_PAGE], ['detail', DETAIL_PAGE], ['chain', CHAIN], ['team', TEAM_PAGE]] as const) {
      // Between a closing angle bracket and the next tag, on one line —
      // which is where rendered text sits and where a raw enum would show.
      for (const word of ['AUTO_CLEARED', 'SOURCING', 'PENDING_APPROVAL', 'CHANGES_REQUESTED']) {
        expect(code(src), `${name} prints ${word} at a reader`)
          .not.toMatch(new RegExp(`>[^<>\n]*\\b${word}\\b`))
      }
    }
  })
})

// ── 2. Who will be asked, before it is raised ─────────────

const TEAM = {
  budgets: [
    { id: 'cc-apps', code: 'APPS-4100', owner: { id: 'p-cwo', name: 'Contingent workforce office' }, department: { id: 'u-apps', name: 'Apps' } },
    { id: 'cc-orphan', code: 'RND-9000', owner: null, department: { id: 'u-rnd', name: 'R&D' } },
  ],
  desks: [
    { unit: { id: 'u-apps', name: 'Apps' }, hr: { person: { id: 'p-shah', name: 'Anita Shah' }, from: { name: 'Technology' }, inherited: true }, procurement: { person: { id: 'p-halvorsen', name: 'Derek Halvorsen' }, from: { name: 'Apps' }, inherited: false } },
    { unit: { id: 'u-rnd', name: 'R&D' }, hr: null, procurement: null },
  ],
  approvers: [
    { id: 'rule-vp', name: 'Over $250k', kind: 'VALUE', thresholdDollars: 250_000, approver: { id: 'p-chen', name: 'Marcus Chen' } },
    { id: 'rule-hr', name: 'HR — Technology', kind: 'HR', thresholdDollars: null, approver: { id: 'p-shah', name: 'Anita Shah' } },
  ],
}

describe('The raise form says who would be asked, before anything is raised', () => {
  it('the raise form says who will be asked for this cost centre, and that within plan nobody is', () => {
    const asked = whoWillBeAsked('cc-apps', TEAM)
    expect(asked.unitName).toBe('Apps')
    expect(asked.hr?.person.name).toBe('Anita Shah')
    expect(asked.procurement?.person.name).toBe('Derek Halvorsen')
    expect(asked.lead?.name).toBe('Contingent workforce office')
    expect(LIST_PAGE).toContain('Within plan, budget and rate, none of them is asked')
  })

  it('a desk named on the unit above still answers for the unit below, and says where it came from', () => {
    const units = [
      { id: 'u-tech', name: 'Technology', parentId: null },
      { id: 'u-apps', name: 'Apps', parentId: 'u-tech' },
      { id: 'u-rnd', name: 'R&D', parentId: 'u-tech' },
      { id: 'u-rnd1', name: 'R&D 1', parentId: 'u-rnd' },
    ]
    const rules = [
      { id: 'r-hr-tech', kind: 'HR', orgUnitId: 'u-tech', approver: { id: 'p-shah', name: 'Anita Shah' } },
      { id: 'r-hr-apps', kind: 'HR', orgUnitId: 'u-apps', approver: { id: 'p-local', name: 'Ines Duarte' } },
      { id: 'r-pr-tech', kind: 'PROCUREMENT', orgUnitId: 'u-tech', approver: { id: 'p-halvorsen', name: 'Derek Halvorsen' } },
    ]
    const out = resolveDesks(units, rules)
    // Apps has its own HR partner, and she outranks the one on Technology.
    expect(out['u-apps'].hr.person.name).toBe('Ines Duarte')
    expect(out['u-apps'].hr.inherited).toBe(false)
    // Two levels down, nobody local, so Technology answers — and says so.
    expect(out['u-rnd1'].hr.person.name).toBe('Anita Shah')
    expect(out['u-rnd1'].hr.inherited).toBe(true)
    expect(out['u-rnd1'].hr.from.name).toBe('Technology')
    expect(out['u-rnd1'].procurement.person.name).toBe('Derek Halvorsen')
  })

  it('a cost centre with nobody answerable says so rather than naming a lead', () => {
    const asked = whoWillBeAsked('cc-orphan', TEAM)
    expect(asked.lead).toBeNull()
    expect(asked.leadNote).toBe(
      'RND-9000 has nobody answerable for it, so nobody gives the final word on its spend.'
    )
    // And a unit with no desks says what happens instead of who is asked.
    expect(asked.hr).toBeNull()
    expect(LIST_PAGE).toContain('anything over the plan clears with a note instead')
  })

  it('only the rules on the money are listed, never the desks a second time', () => {
    const asked = whoWillBeAsked('cc-apps', TEAM)
    expect(asked.money.map((m) => m.name)).toEqual(['Over $250k'])
  })
})

// ── 3. Owner is not creator ───────────────────────────────

describe('Whose need it is, and who typed it', () => {
  it('a coordinator can raise a requisition for somebody else, and both names show', () => {
    expect(
      whoFor({
        owner: { id: 'p-marcus', name: 'Marcus Oyelaran' },
        raisedBy: { id: 'p-dana', name: 'Dana Whitlock' },
      })
    ).toBe('for Marcus Oyelaran · raised by Dana Whitlock')
  })

  it('a requisition raised for yourself does not say the same name twice', () => {
    expect(
      whoFor({
        owner: { id: 'p-marcus', name: 'Marcus Oyelaran' },
        raisedBy: { id: 'p-marcus', name: 'Marcus Oyelaran' },
      })
    ).toBe('raised by Marcus Oyelaran')
  })

  it('an owner nobody recorded leaves the line saying only what is known', () => {
    expect(whoFor({ raisedBy: { id: 'p-dana', name: 'Dana Whitlock' } })).toBe('raised by Dana Whitlock')
    expect(whoFor({})).toBeNull()
  })

  it('the raise form asks whose need it is and sends the answer', () => {
    expect(LIST_PAGE).toContain('Who is this for?')
    // Never hand somebody a form whose answer is thrown away.
    expect(LIST_PAGE).toContain('ownerId: ownerId || null')
  })
})

// ── 4. Procurement's yes names the suppliers ──────────────

const SUPPLIERS = [
  { companyId: 'v-pinnacle', name: 'Pinnacle' },
  { companyId: 'v-csi', name: 'Computer Systems Inc' },
  { companyId: 'v-brightmoor', name: 'Brightmoor Staffing' },
]

describe("Procurement's yes names the suppliers it cleared", () => {
  it("Procurement's yes offers the suppliers, all ticked, and sends the ones left ticked", () => {
    const picks = allTicked(SUPPLIERS)
    expect(Object.values(picks).every(Boolean)).toBe(true)
    expect(tickedIds(SUPPLIERS, picks)).toEqual(['v-pinnacle', 'v-csi', 'v-brightmoor'])
  })

  it('unticking a supplier leaves it off what Procurement cleared', () => {
    const picks = { ...allTicked(SUPPLIERS), 'v-brightmoor': false }
    expect(tickedIds(SUPPLIERS, picks)).toEqual(['v-pinnacle', 'v-csi'])
  })

  it('the suppliers are only offered on Procurement’s own row, and only on a yes', () => {
    const chain = rows({ headcount: 8, billMaxCents: 17_000 })
    const hrRow = myRow(chain, 'p-shah')!
    const procRow = myRow(chain, 'p-halvorsen')!
    expect(deskOf(procRow, DESK_IDS)).toBe('SOURCING')
    expect(deskOf(hrRow, DESK_IDS)).toBe('ROLE')
    // And the modal itself only offers them on an approval at that desk.
    expect(CHAIN).toContain("const offerSuppliers = sourcing && action === 'approve' && suppliers.length > 0")
    expect(CHAIN).toContain('...(offerSuppliers ? { suppliers: chosen } : {})')
  })

  it('the lead is not offered a decision until both desks have answered', () => {
    const chain = rows({ headcount: 8, billMaxCents: 17_000 })
    expect(myRow(chain, 'p-whitfield')).toBeNull()
    const afterBoth = chain.map((a) => (a.rank === 1 ? { ...a, outcome: 'APPROVED' } : a))
    expect(myRow(afterBoth, 'p-whitfield')?.approver?.name).toBe('Dana Whitfield')
  })

  it('somebody with no row on the requisition is offered no buttons at all', () => {
    expect(myRow(rows({ headcount: 8 }), 'p-stranger')).toBeNull()
    expect(myRow(rows({ headcount: 8 }), null)).toBeNull()
  })

  it('a requisition says which suppliers Procurement cleared it for', () => {
    const names = { 'v-pinnacle': 'Pinnacle', 'v-csi': 'Computer Systems Inc' }
    expect(clearedForSentence(['v-pinnacle', 'v-csi'], names)).toBe(
      'Cleared for: Pinnacle, Computer Systems Inc'
    )
  })

  it('an empty list means every approved supplier, so it claims nothing', () => {
    expect(clearedForSentence([], {})).toBeNull()
    expect(clearedForSentence(undefined, {})).toBeNull()
  })

  it('the release can only go to the suppliers Procurement cleared', () => {
    expect(DETAIL_PAGE).toContain('.filter(v => cleared.size === 0 || cleared.has(v.id))')
  })
})

// ── 5. The programme team ─────────────────────────────────

describe('The programme team names a desk per unit and says what is missing', () => {
  it('the programme team page names HR and Procurement per unit and says what is missing', () => {
    expect(TEAM_PAGE).toContain('Role — HR')
    expect(TEAM_PAGE).toContain('Sourcing — Procurement')
    expect(TEAM_PAGE).toContain('Name one')
    // "Name one" opens the same form with the desk and the unit set.
    expect(TEAM_PAGE).toMatch(/setDraft\(\{\s*\n\s*kind,/)
  })

  it('a unit with no HR desk is told what that means for a requisition over the plan', () => {
    expect(TEAM_ROUTE).toContain(
      'Requisitions over the plan in ${u.name} clear with a note — name an HR desk for ${u.name}, or for the unit above it.'
    )
    expect(TEAM_ROUTE).toContain(
      'Requisitions above the going rate in ${u.name} clear with a note — name a Procurement desk for ${u.name}, or for the unit above it.'
    )
    expect(TEAM_ROUTE).toContain(
      '${c.code} has nobody answerable for it, so nothing charged to it has a lead to give the final word.'
    )
    // And the sentence it replaced, which described a chain that no longer
    // exists, is gone.
    expect(code(TEAM_ROUTE)).not.toContain('No lead approver. Anything a check routes has nobody to go to.')
  })

  it('a rule on the money is not mistaken for a desk', () => {
    // A desk has no threshold either, so counting one as a catch-all lead
    // made three desks read as three duplicated leads.
    expect(TEAM_ROUTE).toContain("const moneyRules = rules.filter((r) => (r.kind ?? 'VALUE') === 'VALUE')")
    expect(TEAM_ROUTE).toContain("isLead: (r.kind ?? 'VALUE') === 'VALUE' && r.thresholdAmount === null")
    expect(TEAM_PAGE).toContain('Rules on the money')
    expect(TEAM_PAGE).toContain("team.approvers.filter((a) => a.kind === 'VALUE')")
  })

  it('a desk must be given a business unit before it can be named', () => {
    expect(TEAM_PAGE).toContain(
      'Say which business unit this desk sits in. Desks are named per unit, and the unit below inherits them.'
    )
    expect(TEAM_PAGE).toContain('kind: draft.kind')
  })

  it('a unit with nobody named anywhere above it has no desk at all', () => {
    const out = resolveDesks(
      [{ id: 'u-solo', name: 'Solo', parentId: null }],
      []
    )
    expect(out['u-solo'].hr).toBeNull()
    expect(out['u-solo'].procurement).toBeNull()
  })

  it('a unit dragged under its own child does not hang the walk', () => {
    const out = resolveDesks(
      [
        { id: 'a', name: 'A', parentId: 'b' },
        { id: 'b', name: 'B', parentId: 'a' },
      ],
      []
    )
    expect(out['a'].hr).toBeNull()
  })
})
