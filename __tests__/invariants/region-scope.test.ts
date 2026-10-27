import { describe, it, expect } from 'vitest'
import {
  regionScopeFrom, regionDoor, regionRefusal, regionContracts, regionRequirements, REGION_UNIT_KIND, SITE_UNIT_KIND,
} from '@/lib/region-scope'
import { getNavForKind, landingFor, BY_REGION_HREF, ASK_ETYME_HREF, openBecause } from '@/lib/nav-table'
import { rolesFor } from '@/lib/company-defaults'

/**
 * A seat that reads one region of a client's program (founder,
 * 2026-10-27, the region map): "Nothing a regional manager reads crosses
 * regions." The rule is pure; these are its sentences.
 */

const CO = 'corvane'
const units = [
  { id: 'r-latam', parentId: null, name: 'Latin America', kind: REGION_UNIT_KIND, companyId: CO },
  { id: 'r-us', parentId: null, name: 'United States', kind: REGION_UNIT_KIND, companyId: CO },
  { id: 's-monterrey', parentId: 'r-latam', name: 'Monterrey, Mexico', kind: SITE_UNIT_KIND, companyId: CO },
  { id: 's-campinas', parentId: 'r-latam', name: 'Campinas, Brazil', kind: SITE_UNIT_KIND, companyId: CO },
  { id: 's-dayton', parentId: 'r-us', name: 'Dayton, Ohio', kind: SITE_UNIT_KIND, companyId: CO },
]
const sites = [
  { id: 'site-monterrey', region: 'Latin America' },
  { id: 'site-campinas', region: 'Latin America' },
  { id: 'site-dayton', region: 'United States' },
  { id: 'site-hq', region: null },
]
const scopeOn = (unitId: string | null, companyId = CO) =>
  regionScopeFrom({ companyId, unit: units.find((u) => u.id === unitId) ?? null, units, sites })

describe('a seat on a region reads that region and nothing else', () => {
  it('a seat on a REGION unit reads the sites whose region is that unit’s name, and the plants under that unit', () => {
    const s = scopeOn('r-latam')!
    expect(s.label).toBe('Latin America')
    expect(s.siteIds.sort()).toEqual(['site-campinas', 'site-monterrey'])
    expect(s.unitIds.sort()).toEqual(['r-latam', 's-campinas', 's-monterrey'])
    expect(regionContracts(s)).toEqual({ workLocationId: { in: s.siteIds } })
    expect(regionRequirements(s)).toEqual({ orgUnitId: { in: s.unitIds } })
  })

  it('never reaches another region’s site or plant', () => {
    const s = scopeOn('r-latam')!
    expect(s.siteIds).not.toContain('site-dayton')
    expect(s.unitIds).not.toContain('s-dayton')
    expect(s.siteIds).not.toContain('site-hq')
  })

  it('a seat on a plant, or on no unit, is not a region seat and is not narrowed by the region door', () => {
    expect(scopeOn('s-dayton')).toBeNull()
    expect(scopeOn(null)).toBeNull()
    expect(regionDoor({ path: '/api/program', region: null, narrows: false })).toEqual({ open: true })
  })

  it('a region whose unit was renamed reads no site at all, never every site', () => {
    const renamed = { ...units[0], name: 'LATAM' }
    const s = regionScopeFrom({ companyId: CO, unit: renamed, units, sites })!
    expect(s.siteIds).toEqual([])
  })

  it('a region unit at another company reads nothing at this one', () => {
    const s = scopeOn('r-latam', 'someone-else')!
    expect(s.siteIds).toEqual([])
    expect(s.unitIds).toEqual([])
  })
})

describe('the region door', () => {
  const region = { label: 'Latin America' }

  it('a region seat opens a route that says it narrows to a region', () => {
    expect(regionDoor({ path: '/api/program', region, narrows: true })).toEqual({ open: true })
  })

  it('a region seat is refused any other route, in a sentence that names its region and where its list is', () => {
    const v = regionDoor({ path: '/api/timesheets', region, narrows: false, pageName: 'Timesheets' })
    expect(v.open).toBe(false)
    if (!v.open) {
      expect(v.says).toBe('Timesheets reads every region, and your seat reads Latin America only. Open By region on Today for Latin America.')
      expect(v.says).not.toMatch(/\bdesk\b|program office/i)
    }
  })

  it('a region seat still opens who it is and the demo door, which read nobody else', () => {
    for (const path of ['/api/me', '/api/me/context', '/api/demo', '/api/onboarding/setup']) {
      expect(regionDoor({ path, region, narrows: false }), path).toEqual({ open: true })
    }
  })

  it('says the page in general words where the route has no page name', () => {
    expect(regionRefusal('India', null)).toBe('This page reads every region, and your seat reads India only. Open By region on Today for India.')
  })
})

describe('By region on the menu', () => {
  const clientPerms = rolesFor('CLIENT').find((r) => r.name === 'Program Manager')!.permissions

  it('a client’s Today carries a By region tab beside the program page', () => {
    const today = getNavForKind('CLIENT', false, { permissions: clientPerms }).find((s) => s.label === 'Today')!
    expect(today.items.map((i) => i.label)).toEqual(['Today', 'By region'])
    expect(today.items[1].href).toBe(BY_REGION_HREF)
    expect(openBecause(BY_REGION_HREF)).toBeTruthy()
  })

  it('a region seat’s menu is By region alone, because every other page reads every region', () => {
    const menu = getNavForKind('CLIENT', false, { permissions: clientPerms, region: 'Latin America' })
    expect(menu.flatMap((s) => s.items.map((i) => i.href))).toEqual([BY_REGION_HREF])
  })

  it('a region seat lands on its region, and every other client seat still lands in Ask Etyme', () => {
    expect(landingFor({ kind: 'CLIENT', permissions: clientPerms, region: 'Latin America' })).toBe(BY_REGION_HREF)
    expect(landingFor({ kind: 'CLIENT', permissions: clientPerms })).toBe(ASK_ETYME_HREF)
  })
})
