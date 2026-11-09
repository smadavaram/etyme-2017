import { describe, it, expect } from 'vitest'
import {
  boxLine,
  checkMove,
  childrenOf,
  deletePlan,
  isAtOrUnder,
  kindUnder,
  namesShown,
  orderAfterMove,
  reachChangeSays,
  reachOf,
  regionAt,
  rollUp,
  SHOW_NAMES,
  type UnitFacts,
  type UnitRow,
} from '@/lib/team-structure/tree'
import { ACTS, ACT_FIELDS, actBody, readAct } from '@/lib/team-structure/acts'
import { centeredScroll, foldedAtOpen, holdStopsHere, menuStaysOpen, offersMakeLead } from '@/lib/team-structure/screen'
import { reachWithTeam } from '@/components/settings/give-access'

/**
 * Team structure is one tree the Owner draws (founder, 2026-11-09): the
 * rules with no database in them, on a small Corvane.
 */

const U = (id: string, parentId: string | null, kind: string, name = id, position: number | null = null): UnitRow => ({ id, parentId, name, kind, position })
const TREE: UnitRow[] = [
  U('ops', null, 'DEPARTMENT', 'Operations', 1),
  U('fin', null, 'DEPARTMENT', 'Finance', 2),
  U('us', 'ops', 'REGION', 'United States', 1),
  U('latam', 'ops', 'REGION', 'Latin America', 2),
  U('dayton', 'us', 'SITE', 'Dayton, Ohio', 1),
  U('fresno', 'us', 'SITE', 'Fresno, California', 2),
  U('monterrey', 'latam', 'SITE', 'Monterrey, Mexico', 1),
]

describe('moving a box', () => {
  it('a box cannot be moved under itself or under a box below it', () => {
    expect(checkMove(TREE, 'ops', 'dayton')).toEqual({ ok: false, says: 'A box cannot go under itself or a box below it.' })
    expect(checkMove(TREE, 'us', 'us')).toEqual({ ok: false, says: 'A box cannot go under itself or a box below it.' })
    expect(checkMove(TREE, 'dayton', 'latam')).toEqual({ ok: true })
  })

  it('a box can be moved to the top of the company, beside the departments', () => {
    expect(checkMove(TREE, 'us', null)).toEqual({ ok: true })
  })

  it('a box dropped on the edge of another is put beside it, and the rest of the row keeps its order', () => {
    expect(orderAfterMove(TREE, 'monterrey', 'us', 1)).toEqual(['dayton', 'monterrey', 'fresno'])
    expect(orderAfterMove(TREE, 'fresno', 'us', 0)).toEqual(['fresno', 'dayton'])
    expect(orderAfterMove(TREE, 'monterrey', 'us', null)).toEqual(['dayton', 'fresno', 'monterrey'])
  })

  it('the boxes beside each other read in the order the Owner drew, then by name', () => {
    const rows = [U('b', null, 'TEAM', 'Bravo'), U('a', null, 'TEAM', 'Alpha'), U('z', null, 'TEAM', 'Zulu', 1)]
    expect(childrenOf(rows, null).map((u) => u.id)).toEqual(['z', 'a', 'b'])
  })

  it('a site under a region carries that region, and a site under no region carries none', () => {
    expect(regionAt(TREE, 'us')?.name).toBe('United States')
    expect(regionAt(TREE, 'dayton')?.name).toBe('United States')
    expect(regionAt(TREE, 'ops')).toBeNull()
    expect(isAtOrUnder(TREE, 'monterrey', 'ops')).toBe(true)
  })

  it('a new box under the company is a department, under a department a region, under a region a site, and a team anywhere else', () => {
    expect([kindUnder(null), kindUnder('DEPARTMENT'), kindUnder('REGION'), kindUnder('SITE')]).toEqual(['DEPARTMENT', 'REGION', 'SITE', 'TEAM'])
  })
})

describe('deleting a box', () => {
  const base = { companyName: 'Corvane Packaging', holds: [], accountWalls: false }

  it('deleting a box moves its teams and its people up one level, and says nobody’s history or time on site changes', () => {
    const plan = deletePlan({ ...base, unit: TREE[2], parent: TREE[0], childNames: ['Dayton, Ohio', 'Fresno, California'], people: ['Dana Whitcombe'], contractors: 0 })
    expect(plan.ok).toBe(true)
    expect(plan.says).toBe(
      'Delete United States? Its 2 teams and 1 person move up under Operations. Nobody\'s history or time on site changes. ' +
        'Dana Whitcombe will read the whole of Corvane Packaging rather than only United States.'
    )
  })

  it('a site with contractors charged to it cannot be deleted, in a sentence that says to move them first', () => {
    const plan = deletePlan({ ...base, unit: TREE[4], parent: TREE[2], childNames: [], people: ['Marcus Hollins'], contractors: 14 })
    expect(plan).toEqual({ ok: false, says: 'Dayton, Ohio has 14 contractors on site charged to it. Move them to another box first. A site with contractors at it cannot be deleted.' })
  })

  it('a site’s delete refusal counts the contractors on site the way the box and Sites do, and names a waiting start apart', () => {
    const plan = deletePlan({ ...base, unit: TREE[4], parent: TREE[2], childNames: [], people: [], contractors: 14, starting: 1 })
    expect(plan.says).toBe('Dayton, Ohio has 14 contractors on site and 1 starting charged to it. Move them to another box first. A site with contractors at it cannot be deleted.')
  })

  it('a box that approval rules or access grants name is refused, because moving them up a level would widen them', () => {
    const plan = deletePlan({ ...base, unit: TREE[1], parent: null, childNames: [], people: [], contractors: 0, holds: [{ what: 'approval rules', where: 'Program team' }, { what: 'access grants', where: 'Users & permissions' }] })
    expect(plan).toEqual({ ok: false, says: 'Approval rules and access grants name Finance. Move them under Program team and Users & permissions first, so nothing reaches wider by accident.' })
  })

  it('an empty box is deleted with nothing to move', () => {
    expect(deletePlan({ ...base, unit: TREE[1], parent: null, childNames: [], people: [], contractors: 0 }).says).toBe('Delete Finance? Nothing is under it.')
  })
})

describe('what a seat reads, said when a move changes it', () => {
  it('a seat on a region reads only that region, on a site only that site, and on a department the whole company', () => {
    expect(reachOf(TREE[2], false)).toEqual({ kind: 'REGION', label: 'United States' })
    expect(reachOf(TREE[4], false)).toEqual({ kind: 'SITE', label: 'Dayton, Ohio' })
    expect(reachOf(TREE[0], false)).toEqual({ kind: 'COMPANY' })
    expect(reachOf(TREE[0], true)).toEqual({ kind: 'UNIT', label: 'Operations' })
  })

  it('moving a person between two departments says nothing about what they read, because nothing changes', () => {
    expect(reachChangeSays(['Lucas Fairbairn'], reachOf(TREE[0], false), reachOf(TREE[1], false), 'Corvane Packaging')).toBe('')
  })

  it('moving a person onto a site says they will read only that site', () => {
    expect(reachChangeSays(['Lucas Fairbairn'], reachOf(TREE[1], false), reachOf(TREE[4], false), 'Corvane Packaging')).toBe(
      'Lucas Fairbairn will read only Dayton, Ohio rather than the whole of Corvane Packaging.'
    )
  })
})

describe('what a box rolls up', () => {
  const f = (o: Partial<UnitFacts>): UnitFacts => ({ people: 0, contractors: 0, openJobs: 0, nearestLimitDays: null, countries: [], currencies: [], timeZones: [], ...o })
  const own = new Map<string, UnitFacts>([
    ['dayton', f({ people: 1, contractors: 14, openJobs: 2, nearestLimitDays: 41, countries: ['US'], currencies: ['USD'], timeZones: ['America/New_York'] })],
    ['fresno', f({ people: 1, contractors: 11, openJobs: 3, nearestLimitDays: 18, countries: ['US'], currencies: ['USD'], timeZones: ['America/Los_Angeles'] })],
    ['monterrey', f({ people: 1, contractors: 18, openJobs: 3, nearestLimitDays: 52, countries: ['MX'], currencies: ['MXN'], timeZones: ['America/Monterrey'] })],
    ['us', f({ people: 1 })],
  ])

  it('a box adds up the people, contractors and open jobs under it, and its time limit is the nearest one, never a sum', () => {
    const r = rollUp(TREE, own)
    expect(r.get('us')).toMatchObject({ people: 3, contractors: 25, openJobs: 5, nearestLimitDays: 18, sites: 2, teams: 2, timeZones: ['America/Los_Angeles', 'America/New_York'] })
    expect(r.get('ops')).toMatchObject({ contractors: 43, nearestLimitDays: 18, countries: ['MX', 'US'], currencies: ['MXN', 'USD'], sites: 3 })
    expect(r.get('fin')).toMatchObject({ people: 0, nearestLimitDays: null, sites: 0 })
  })

  it('a box’s line names the time limit only within thirty days', () => {
    expect(boxLine({ people: 1, contractors: 14, openJobs: 2, nearestLimitDays: 41 })).toBe('1 person · 14 contractors · 2 open jobs')
    expect(boxLine({ people: 3, contractors: 25, openJobs: 0, nearestLimitDays: 18 })).toBe('3 people · 25 contractors · limit in 18 days')
  })

  it('a box shows ten names and then says how many more', () => {
    const names = Array.from({ length: 14 }, (_, i) => `Person ${i + 1}`)
    expect(SHOW_NAMES).toBe(10)
    expect(namesShown(names, false)).toEqual({ shown: names.slice(0, 10), more: 4 })
    expect(namesShown(names, true).more).toBe(0)
  })
})

describe('every question the route asks, the screen has a field for', () => {
  const typed: Record<string, string | number> = { parentId: 'ops', at: 1, name: 'Quality', kind: 'TEAM', unitId: 'us', contextId: 'ctx_1', sellContractId: 'sc_1' }

  for (const act of ACTS) {
    it(`the ${act.toLowerCase().replace('_', ' ')} act, posted with only the fields the screen draws for it, is never refused for a missing field`, () => {
      const values = Object.fromEntries(ACT_FIELDS[act].map((f) => [f, typed[f]]))
      const read = readAct(actBody(act, values))
      expect(read.ok, read.ok ? '' : read.says).toBe(true)
    })
  }

  it('a contractor cannot be charged to no box, and the refusal names the box to pick', () => {
    expect(readAct({ act: 'MOVE_CONTRACTOR', sellContractId: 'sc_1', unitId: null })).toEqual({ ok: false, field: 'unitId', says: 'A contractor is charged to a box. Pick the box.' })
  })

  it('an act nobody knows is refused in a sentence that lists what may be changed', () => {
    const r = readAct({ act: 'MERGE' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.says).toMatch(/^Say what to change: add a box/)
  })

  it('a kind outside department, region, site and team is refused on a change of kind', () => {
    expect(readAct({ act: 'KIND', unitId: 'us', kind: 'GALAXY' })).toMatchObject({ ok: false, field: 'kind' })
  })
})

describe('the screen, as walk 10 found it', () => {
  it('the tree opens with every region folded but the first, as the drawing did', () => {
    expect([...foldedAtOpen(TREE)]).toEqual(['latam'])
  })

  it('the tree opens with the company box in the middle of the pane, not off the side of it', () => {
    // Walk 10: a 1,790 px tree in a 704 px pane, the company box at x=791.
    expect(centeredScroll(791, 210, 704)).toBe(544)
    expect(centeredScroll(40, 210, 704)).toBe(0)
  })

  it('holding a name on a phone opens the name’s menu, not its box’s, because the press stops at the name', () => {
    expect(holdStopsHere('person')).toBe(true)
    expect(holdStopsHere('contractor')).toBe(true)
    expect(holdStopsHere('box')).toBe(false)
  })

  it('"Make team lead" is not offered to the person who already leads the box', () => {
    expect(offersMakeLead({ contextId: 'c_marcus' }, 'c_marcus')).toBe(false)
    expect(offersMakeLead({ contextId: 'c_marcus' }, 'c_keisha')).toBe(true)
    expect(offersMakeLead(null, 'c_keisha')).toBe(true)
  })

  it('a menu opened by a held press on a phone stays open through the scroll and the mouse-down the phone sends after it', () => {
    expect(menuStaysOpen({ at: 1000, touch: true }, 1300, 'scroll')).toBe(true)
    expect(menuStaysOpen({ at: 1000, touch: true }, 1300, 'mousedown')).toBe(true)
    expect(menuStaysOpen({ at: 1000, touch: false }, 3000, 'mousedown')).toBe(false)
    expect(menuStaysOpen({ at: 1000, touch: false }, 3000, 'scroll')).toBe(false)
  })

  it('"Give access to this team…" opens Give access with that team as the reach, wherever the permission can reach a team', () => {
    expect(reachWithTeam(['COMPANY', 'UNIT', 'PERSON'], 'cv_unit_region_us')).toEqual({ scope: 'UNIT', orgUnitId: 'cv_unit_region_us' })
    expect(reachWithTeam(['COMPANY'], 'cv_unit_region_us')).toEqual({ scope: 'COMPANY', orgUnitId: '' })
    expect(reachWithTeam(['COMPANY', 'UNIT'], null)).toEqual({ scope: 'COMPANY', orgUnitId: '' })
  })
})
