import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { applyFilter, isRecent, locationsOf, FILTER_WORD, NETWORK_FILTERS } from '@/lib/network-filters'
import { getNavForKind } from '@/components/shell/sidebar'

/**
 * "People & Suppliers can be changed to Network. Contractors and
 * suppliers should have a table view as well as the feed. Filter
 * suppliers by their existing contractors, and contractors by recent
 * engagement, favorites, location, blocked."
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const now = new Date('2026-09-13T12:00:00Z')
const row = (over: Partial<ReturnType<typeof base>> = {}) => ({ ...base(), ...over })
const base = () => ({ id: 'x', onSite: false, lastEngagement: null as string | null, favorite: false, blocked: false, location: null as string | null })

describe('the five questions every Network list answers', () => {
  it('reads Everyone · On site now · Recent engagement · Favorites · Pending · Blocked, in that order', () => {
    expect(NETWORK_FILTERS.map((f) => FILTER_WORD[f])).toEqual(['Everyone', 'On site now', 'Recent engagement', 'Favorites', 'Pending', 'Blocked'])
  })
  it('Pending is whoever is still in a pipeline — a firm walking the desks, or somebody asked who no supplier has put forward yet', () => {
    const rows = [row({ id: 'p', pending: { stageWord: 'HR' } } as any), row({ id: 'q' })]
    expect(applyFilter(rows, 'PENDING', null, now).map((r) => r.id)).toEqual(['p'])
    expect(read('src/components/network-view.tsx')).toContain('NETWORK_FILTERS.filter((f) => counts[f] !== undefined)')
    expect(read('src/app/dashboard/suppliers/page.tsx')).toContain('PENDING: listed.filter((r) => !!r.pending).length')
  })

  it('a list offers Pending only once something is behind it — Contractors had nothing until a client could ask for somebody itself', () => {
    // This read `not.toContain('PENDING:')` on the contractors page,
    // which was the truth while the register was built from submissions
    // alone: nobody could be pending because nobody could be on it
    // without a supplier. Now a client can ask for somebody it already
    // knows, so the rule to hold is the general one both lists follow —
    // the count is offered conditionally, never hard-coded on.
    const page = read('src/app/dashboard/people/page.tsx')
    expect(page).toContain('...(pending.length > 0 ? { PENDING: pending.length } : {})')
  })
  it('somebody engaged within ninety days is recent; ninety-one days ago is not; never engaged is not', () => {
    expect(isRecent('2026-06-16T00:00:00Z', now)).toBe(true)
    expect(isRecent('2026-06-13T00:00:00Z', now)).toBe(false)
    expect(isRecent(null, now)).toBe(false)
  })
  it('a blocked person stays on the register but is out of every list except Blocked', () => {
    const rows = [row({ id: 'ok', onSite: true, favorite: true, lastEngagement: '2026-09-01T00:00:00Z' }), row({ id: 'bad', onSite: true, favorite: true, lastEngagement: '2026-09-01T00:00:00Z', blocked: true })]
    for (const f of ['ALL', 'ON_SITE', 'RECENT', 'FAVORITES'] as const) expect(applyFilter(rows, f, null, now).map((r) => r.id)).toEqual(['ok'])
    expect(applyFilter(rows, 'BLOCKED', null, now).map((r) => r.id)).toEqual(['bad'])
  })
  it('a place narrows every list, and the places offered are the ones on the list, each once', () => {
    const rows = [row({ id: 'a', location: 'Portland, OR' }), row({ id: 'b', location: 'Austin, TX' }), row({ id: 'c', location: 'Portland, OR' }), row({ id: 'd' })]
    expect(locationsOf(rows)).toEqual(['Austin, TX', 'Portland, OR'])
    expect(applyFilter(rows, 'ALL', 'Portland, OR', now).map((r) => r.id)).toEqual(['a', 'c'])
  })
  it('On site now is the people with a running contract, not everybody ever submitted', () => {
    const rows = [row({ id: 'here', onSite: true }), row({ id: 'gone' })]
    expect(applyFilter(rows, 'ON_SITE', null, now).map((r) => r.id)).toEqual(['here'])
  })
})

describe('the two Network pages', () => {
  const sidebar = read('src/components/shell/sidebar.tsx')
  const people = read('src/app/dashboard/people/page.tsx')
  const suppliers = read('src/app/dashboard/suppliers/page.tsx')
  const peopleApi = read('src/app/api/people/route.ts')
  const suppliersApi = read('src/app/api/suppliers/route.ts')
  const favorites = read('src/app/api/favorites/route.ts')

  it('the nav group is Network, holding Contractors, Suppliers and Contacts', () => {
    // Counted in the source until the same group reached the supplier
    // side too and three became six. The claim was always about what a
    // client's Network group holds, so it asks the menu itself now.
    expect(sidebar).not.toContain("group: 'People & suppliers'")
    const network = getNavForKind('CLIENT', false)
      .flatMap((s) => s.items)
      .filter((i) => i.group === 'Network')
    expect(network.map((i) => i.label)).toEqual(['Contractors', 'Suppliers', 'Contacts'])
  })
  it('both pages have a feed and a table of the same rows, and the same filter bar', () => {
    for (const src of [people, suppliers]) {
      expect(src).toContain("<ViewToggle view={view} onChange={setView} />")
      expect(src).toContain("<FilterBar filter={filter} onFilter={setFilter} counts={counts} places={places} place={place} onPlace={setPlace} />")
      expect(src).toContain("view === 'table'")
      expect(src).toContain("view === 'feed'")
    }
  })
  it('a supplier row says how many of its people are on site now, and when we last dealt with it', () => {
    expect(suppliersApi).toContain("if (c.state === 'IN_PROGRESS') onSiteCount.set(c.companyId")
    expect(suppliersApi).toContain("lastEngagement: (onSiteCount.get(r.companyId) ?? 0) > 0 ? now.toISOString() : lastDealt.get(r.companyId)?.toISOString() ?? r.invitedAt ?? null")
    expect(peopleApi).toContain("lastEngagement: onSite ? now.toISOString() : last?.toISOString() ?? null")
  })
  it('a contractor row says whether they are on site, their last engagement, where they are, and whether this client would take them again', () => {
    expect(peopleApi).toContain("const onSite = mine.some((c) => c.state === 'IN_PROGRESS')")
    expect(peopleApi).toContain('favorite: starred.has(row.personId)')
    expect(peopleApi).toContain('location: profileByPerson.get(row.personId)?.location ?? null')
  })
  it("a favorite is this company's own mark, on a person or a firm, and is never read across companies", () => {
    expect(favorites).toContain("where: { companyId: caller.company!.id }")
    expect(favorites).toContain('companyId_targetType_targetId: { companyId, targetType, targetId }')
    expect(peopleApi).toContain("where: { companyId, targetType: 'PERSON', targetId: { in: personIds } }")
    expect(suppliersApi).toContain("prisma.favorite.findMany({ where: { companyId, targetType: 'COMPANY' }")
  })
  it('the star is on the row in both views, and a block reads as a sentence on the supplier', () => {
    expect(people).toContain("targetType: 'PERSON', targetId: r.personId, on")
    expect(suppliers).toContain("targetType: 'COMPANY', targetId: s.companyId, on")
    expect(suppliers).toContain('Nothing is sent to them.')
  })
})
