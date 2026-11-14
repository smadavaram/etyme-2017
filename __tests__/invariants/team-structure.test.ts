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
import { centeredScroll, foldedAtOpen, holdStopsHere, menuStaysOpen, offersMakeLead, offersMove } from '@/lib/team-structure/screen'
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

  it('a company with no teams is never offered "Move to another team", because there is nowhere to move a person to', () => {
    expect(offersMove([], null)).toBe(false)
    expect(offersMove([], null, 'contractor')).toBe(false)
    expect(offersMove([{ id: 'ops' }], null)).toBe(true)
    // On the only team: "on no team" is still somewhere to go.
    expect(offersMove([{ id: 'ops' }], 'ops')).toBe(true)
    expect(offersMove([{ id: 'ops' }], 'ops', 'contractor')).toBe(false)
    const page = readScreen('src/app/dashboard/settings/team-structure/page.tsx', 'utf8')
    expect(page).toContain("offersMove(props.tree.boxes, menu.box) && item('Move to another team…'")
    expect(page).toContain('Choose where they go first.')
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

  it('Give access reads the team from the address through the page’s own reader, so a value that is not a plain id chooses no team', () => {
    const giveAccess = readScreen('src/components/settings/give-access.tsx', 'utf8')
    expect(giveAccess).toContain("import { focusFromQuery } from '@/app/dashboard/access/focus'")
    expect(giveAccess).toContain('const { unit } = focusFromQuery(')
    expect(focusFromQuery('?unit=cv_unit_region_us').unit).toBe('cv_unit_region_us')
    expect(focusFromQuery('?unit=%22%3E%3Cscript%3E').unit).toBeNull()
  })
})

/**
 * ── A company with no teams, and two doors that point at each other ──
 *
 * The founder's first-day list, faults 18 and 22 (2026-11-13), read as
 * Tapin's Owner: six people and no teams opened as a chart of one box with
 * every role cut ("Account Man…"), and "Import" meant two different things.
 */
import { drawsAsList, listPeople, noTeamsSays, roleInWords, PERSON_LINK, personLink, LIST_SHOWS } from '@/lib/team-structure/screen'
import { focusFromQuery } from '@/app/dashboard/access/focus'
import {
  importRecordsLoads, importRecordsSubtitle, splitSources, tileStatus, READ_TEAMS_LABEL, READ_TEAMS_SAYS,
  IMPORT_RECORDS_SAYS, IMPORT_RECORDS_POINTS, IMPORT_RECORDS_HREF, TEAM_STRUCTURE_HREF, NOT_AVAILABLE_YET, WAITING_ON_ETYME,
  TEAMS_LINK_HREF,
} from '@/lib/team-structure/directory/words'
import { directorySources as sourcesNow } from '@/lib/team-structure/directory/providers'
import { IMPORTABLE } from '@/lib/importable'
import { readFileSync as readScreen } from 'node:fs'

describe('a company with no teams opens as a plain list of its people', () => {
  const page = readScreen('src/app/dashboard/settings/team-structure/page.tsx', 'utf8')
  const owner = { contextId: 'o', name: 'Sharath', role: 'Owner', email: 'sharath@etyme.com' }
  const rest = [
    { contextId: 'a', name: 'Oliver', role: 'Account Manager', email: 'oliver@etyme.com' },
    { contextId: 't', name: 'timesheets@etyme.com', role: 'AP & Payroll', email: 'timesheets@etyme.com' },
    { contextId: 'm', name: 'Sidhu', role: 'Member', email: 'sidhu871@gmail.com' },
  ]

  it('a company with no teams opens Team structure as a list of its people, not a chart', () => {
    expect(drawsAsList({ boxes: [] })).toBe(true)
    expect(page).toMatch(/if \(asList\) \{/)
  })

  it('a company with one box and everybody in it still opens as the chart', () => {
    expect(drawsAsList({ boxes: [{ id: 'r1' }] })).toBe(false)
  })

  it('the empty team structure says the company has no teams yet and offers Add a team, the add-under act on the company box', () => {
    expect(noTeamsSays('Tapin')).toBe('Tapin has no teams yet. Add a team when one person starts answering for others.')
    expect(page).toMatch(/className="btn-primary" disabled=\{busy\} onClick=\{\(\) => addUnder\(null\)\}>Add a team</)
  })

  it('the list names every person once, the Owner first, with the role in words and the sign-in address', () => {
    const people = listPeople(owner, [...rest, owner])
    expect(people.map((p) => p.contextId)).toEqual(['o', 'a', 't', 'm'])
    expect(people.map((p) => roleInWords(p.role))).toEqual(['Owner', 'Account Manager', 'AP & Payroll', 'No role yet'])
    expect(page).toMatch(/\{p\.email && <span className="block break-all/)
  })

  it('a person’s name on the team structure opens Users and permissions at that person’s row', () => {
    expect(PERSON_LINK).toBe('/dashboard/access')
    expect(personLink('ctx_tapin-hr')).toBe('/dashboard/access?person=ctx_tapin-hr')
    expect(focusFromQuery(personLink('ctx_tapin-hr').split('?')[1]).person).toBe('ctx_tapin-hr')
    expect(page).toMatch(/<a href=\{personLink\(p\.contextId\)\}[^>]*>\{p\.name\}<\/a>/)
    expect(page).toMatch(/<a href=\{personLink\(m\.contextId\)\}/)
    expect(page).not.toMatch(/href=\{PERSON_LINK\}/)
  })

  it('Change role and Change the lead’s role land on that person’s row in Users and permissions, never on the plain page', () => {
    expect(page).toContain("item('Change the lead’s role…', () => { window.location.href = personLink(b.lead!.contextId) })")
    expect(page).toContain("item('Change role…', () => { window.location.href = personLink(menu.contextId) })")
    expect(page).not.toContain("window.location.href = '/dashboard/access'")
  })

  it('the right-click and press-and-hold menu still work on a person in the list', () => {
    const row = page.slice(page.indexOf('if (asList) {'))
    expect(row).toMatch(/onContextMenu=\{onContext\(m\)\}/)
    expect(row).toMatch(/onTouchStart=\{onTouchStart\(m\)\}/)
  })

  it('a long list shows the first rows and then Show everyone, never three hundred rows at once', () => {
    expect(LIST_SHOWS).toBeGreaterThan(0)
    expect(page).toMatch(/Show everyone \(\$\{people\.length\}\)/)
  })

  it('a role name on the team structure is never cut with an ellipsis, at any width', () => {
    expect(page).not.toMatch(/max-w-\[80px\]/)
    expect(page).not.toMatch(/className="truncate"/)
  })

  it('Undo is drawn only where there is a change to undo', () => {
    expect(page).toMatch(/\{tree\.lastChange && \(\s*<button/)
  })
})

describe('two verbs for two doors, each pointing at the other', () => {
  it('Import records says what it really loads, read off the kinds list, and promises no supplier or team', () => {
    expect(importRecordsLoads()).toBe('candidates, sites, purchase orders, cost centers and holidays')
    expect(importRecordsLoads(IMPORTABLE).split(/, | and /).length).toBe(IMPORTABLE.length)
    expect(importRecordsSubtitle()).not.toMatch(/supplier|team|contractor/i)
  })

  it('Import records says it does not bring in teams and links to Team structure', () => {
    expect(`${IMPORT_RECORDS_SAYS} ${IMPORT_RECORDS_POINTS}`).toBe('This does not bring in your teams or who leads them. Read those from your directory.')
    expect(TEAM_STRUCTURE_HREF).toBe('/dashboard/settings/team-structure')
    const data = readScreen('src/app/dashboard/data/page.tsx', 'utf8')
    expect(data).toMatch(/<a href=\{TEAM_STRUCTURE_HREF\}/)
    expect(data).toMatch(/title=\{IMPORT_RECORDS_LABEL\}/)
  })

  it('Read teams from your directory says what it reads and links to Import records', () => {
    expect(READ_TEAMS_LABEL).toBe('Read teams from your directory')
    expect(READ_TEAMS_SAYS).toBe('This reads teams, leads and staff. Candidates, sites, purchase orders, cost centers and holidays come in under')
    expect(IMPORT_RECORDS_HREF).toBe('/dashboard/data')
    const page = readScreen('src/app/dashboard/settings/team-structure/page.tsx', 'utf8')
    expect(page).toMatch(/\{READ_TEAMS_LABEL\}<\/button>/)
    expect(page).not.toMatch(/Import from your directory/)
  })

  it('a cross-link is drawn only where the reader may open the page it points at', () => {
    for (const f of ['src/app/dashboard/data/page.tsx', 'src/app/dashboard/settings/team-structure/page.tsx', 'src/app/dashboard/integrations/page.tsx']) {
      expect(readScreen(f, 'utf8'), f).toMatch(/mayOpen\([A-Z_]+_HREF, seat\.permissions\)/)
    }
  })

  it('a directory source waiting on Etyme is folded under Not available yet and says whose move it is', () => {
    const none = sourcesNow({})
    const { open, waiting } = splitSources(none)
    expect(open.map((s) => s.key)).toEqual(['CSV'])
    expect(waiting.map((s) => s.key).sort()).toEqual(['ENTRA', 'GOOGLE'])
    for (const s of waiting) expect(tileStatus(s)).toBe(WAITING_ON_ETYME)
    expect(WAITING_ON_ETYME).toBe('Waiting on Etyme to switch this on. Use a file exported from your directory until then.')
    expect(NOT_AVAILABLE_YET).toBe('Not available yet')
  })

  it('a company with no keys sees the file source first and working', () => {
    const { open } = splitSources([
      { key: 'GOOGLE', connected: false, connectable: true },
      { key: 'CSV', connected: true },
    ])
    expect(open.map((s) => s.key)).toEqual(['CSV', 'GOOGLE'])
    expect(tileStatus({ key: 'GOOGLE', connected: false, connectable: true })).toBe('Your admin connects it here, once.')
    expect(tileStatus({ key: 'CSV', connected: true })).toBeNull()
  })

  it('no directory tile reads only Not connected or Not ready yet', () => {
    const dialog = readScreen('src/app/dashboard/settings/team-structure/import-dialog.tsx', 'utf8')
    expect(dialog).not.toMatch(/>Not connected</)
    expect(dialog).not.toMatch(/Not ready yet/)
    expect(dialog).toMatch(/<details/)
  })

  it('Integrations has one line that links to where the Teams link is pasted, and no new panel', () => {
    expect(TEAMS_LINK_HREF).toBe('/dashboard/settings?tab=company')
    const page = readScreen('src/app/dashboard/integrations/page.tsx', 'utf8')
    expect(page).toMatch(/<a href=\{TEAMS_LINK_HREF\}/)
  })
})

/**
 * ── The company box and the box menu, as the 2026-11-14 walk found them ──
 *
 * Once a team existed, the people on no team were drawn in ink on the ink
 * company box and could not be read; and a box menu low in the window ran
 * below it, so Move under, Give access and Delete could not be reached.
 */
import { menuPlace, MENU_MARGIN, nameTones, ROOT_BOX } from '@/lib/team-structure/screen'

describe('the company box and its menu can be read and reached', () => {
  const page = readScreen('src/app/dashboard/settings/team-structure/page.tsx', 'utf8')
  const color = (cls: string) => cls.replace(/^(hover:)?(text|bg|border)-/, '').replace(/\/\d+$/, '')

  it('a name drawn in the company box never shares the company box’s background color', () => {
    const bg = color(ROOT_BOX.bg)
    const tone = nameTones(true)
    for (const cls of [tone.link, tone.label, tone.aside, tone.more.split(' ')[0]]) expect(color(cls)).not.toBe(bg)
    // The page draws the company box from ROOT_BOX and its names on the root tone.
    expect(page).toContain('${ROOT_BOX.border} ${ROOT_BOX.bg} ${ROOT_BOX.text}')
    expect(page).toContain("{ for: 'person', contextId: p.contextId, box: b?.id ?? null, name: p.name }, !b)")
    expect(page).not.toMatch(/className="min-w-0 break-words text-etyme-ink/)
  })

  it('a name on a team box keeps the dark ink it always had', () => {
    expect(nameTones(false).link).toBe('text-etyme-ink')
  })

  it('a box menu opened low in a 900 px window is moved up so its last item, Delete, is inside the window', () => {
    const at = menuPlace({ x: 600, y: 600 }, { width: 240, height: 412 }, { width: 1400, height: 900 })
    expect(at.top + 412).toBeLessThanOrEqual(900 - MENU_MARGIN)
    expect(at.top).toBe(900 - 412 - MENU_MARGIN)
    expect(at.left).toBe(600)
  })

  it('a menu opened near the right edge is moved left so it is whole inside the window', () => {
    const at = menuPlace({ x: 1350, y: 100 }, { width: 240, height: 200 }, { width: 1400, height: 900 })
    expect(at.left + 240).toBeLessThanOrEqual(1400 - MENU_MARGIN)
    expect(at.top).toBe(100)
  })

  it('a menu taller than a short window starts at the top margin and scrolls inside itself', () => {
    const at = menuPlace({ x: 100, y: 300 }, { width: 240, height: 412 }, { width: 1400, height: 360 })
    expect(at.top).toBe(MENU_MARGIN)
    expect(at.maxHeight).toBe(360 - 2 * MENU_MARGIN)
    expect(page).toMatch(/role="menu"[^>]*maxHeight: place\.maxHeight/)
    expect(page).toMatch(/role="menu"[^>]*overflow-y-auto/)
  })

  it('the menu is placed from its measured height, never a guessed one, and scrolling inside it does not close it', () => {
    expect(page).not.toMatch(/innerHeight : 800\) - 320/)
    expect(page).toContain('menuPlace({ x: menu.x, y: menu.y }, { width: r.width, height: el.scrollHeight }')
    expect(page).toContain(`e.target.closest('[role="menu"]')`)
  })

  it('the box menu, the chooser and the import dialog take no margin from the page’s spacing, so a low box’s menu ends 8 pixels above the window’s bottom', () => {
    // The page's space-y-5 gives every child after the first a 20 px top
    // margin, and that moves a fixed pop-up too (walk, 2026-11-14: 14 px past).
    const dialog = readScreen('src/app/dashboard/settings/team-structure/import-dialog.tsx', 'utf8')
    const fixed = [page, dialog].flatMap((src) => src.match(/className="fixed [^"]*"/g) ?? [])
    expect(fixed.length).toBe(3)
    for (const cls of fixed) expect(cls.split(/[ "]/)).toContain('!m-0')
  })
})
