import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  approvedFrom, siteSuppliersFrom, mayFillAtSite, siteManagersFrom, notApprovedForCompany, notApprovedAtSite,
  placementsStillAt, outsideYourRegion, notYourSites, skipStops, confirmAllWords, sourceWords, managerLoadWords,
} from '@/lib/site-rules'
import { stepsFor, recordStep, outstanding, reminderFor, railFor, SKIPPABLE } from '@/lib/setup-steps'
import { getNavForKind } from '@/lib/nav-table'
import { CORVANE_PLANTS, plantSuppliers } from '@/lib/seed-corvane'

/**
 * Sites: where people work, who hires there, and which approved suppliers
 * fill jobs there (founder, 2026-10-28, "Build it, sites sounds good").
 * The rules with no database in them; __integration__/sites.test.ts walks
 * the routes on the seeded world.
 */

const NOW = new Date('2026-10-28T09:14:00Z')
const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('a site names only suppliers approved for the company', () => {
  const trading = new Set(['ridgeline', 'harbor', 'probation', 'paid-once', 'by-agreement'])
  const tiers = new Map<string, string | null>([['ridgeline', 'APPROVED'], ['harbor', 'PREFERRED'], ['probation', 'PROBATION']])
  const agreements = new Set(['by-agreement', 'probation'])
  const approved = approvedFrom({ trading, tiers, agreements })

  it('reads approval from the supplier standing: approved, preferred, or an agreement with no standing', () => {
    expect([...approved].sort()).toEqual(['by-agreement', 'harbor', 'ridgeline'])
  })

  it('does not count a firm on probation, or one the client only paid once with nothing signed, as approved', () => {
    expect(approved.has('probation')).toBe(false)
    expect(approved.has('paid-once')).toBe(false)
  })

  it('refuses a firm not approved for the company in a sentence that says Procurement approves it first', () => {
    expect(notApprovedForCompany('Lakemont Workforce', 'Corvane Packaging')).toBe(
      'Lakemont Workforce is not approved for Corvane Packaging. Procurement approves a firm first, under Suppliers; then any site may name it.'
    )
  })

  it('reads a site that names nobody as every approved supplier, so a client that never opened Sites still sends its jobs', () => {
    expect(siteSuppliersFrom({ named: [], approved })).toMatchObject({ everyApproved: true, ids: [...approved] })
  })

  it('stops sending to a firm the site named once and the company has since stopped approving', () => {
    const v = siteSuppliersFrom({ named: ['ridgeline', 'paid-once'], approved })
    expect(v).toMatchObject({ ids: ['ridgeline'], lapsed: ['paid-once'], everyApproved: false })
  })

  it('refuses a job sent to an approved firm the site does not name, naming the firm and the site', () => {
    const atSite = siteSuppliersFrom({ named: ['ridgeline'], approved })
    const v = mayFillAtSite({ supplier: { id: 'harbor', name: 'Lakemont Workforce' }, site: { name: 'Dayton, Ohio', city: 'Dayton' }, client: 'Corvane', approved, atSite })
    expect(v).toEqual({ ok: false, says: 'Lakemont Workforce is not approved at Dayton. Ask Procurement to add them to this site, or pick another supplier.' })
    expect(notApprovedAtSite('Lakemont Workforce', { name: 'Dayton, Ohio', city: 'Dayton' })).toBe(v.ok ? '' : v.says)
    expect(mayFillAtSite({ supplier: { id: 'ridgeline', name: 'Ridgeline' }, site: { name: 'Dayton, Ohio' }, client: 'Corvane', approved, atSite })).toEqual({ ok: true })
  })
})

describe('a site reads who hires there from the record before anybody types it', () => {
  it('reads a hiring manager from the jobs they posted, then the placements they manage, then a name a person typed', () => {
    const m = siteManagersFrom({
      jobs: [{ personId: 'marcus', name: 'Marcus Hollins', open: true }, { personId: 'marcus', name: 'Marcus Hollins', open: true }, { personId: 'marcus', name: 'Marcus Hollins', open: false }],
      placements: Array.from({ length: 14 }, () => ({ personId: 'marcus', name: 'Marcus Hollins' })),
      named: [{ personId: 'marcus', name: 'Marcus Hollins' }, { personId: 'new', name: 'Nadia New' }],
    })
    expect(m.map((x) => [x.name, x.from])).toEqual([['Marcus Hollins', 'JOBS'], ['Nadia New', 'NAMED']])
    expect(managerLoadWords(m[0])).toBe('14 contractors, 2 open jobs')
  })
})

describe('who may change a site, said in a sentence', () => {
  it('tells a supplier or a seated MSP whose sites they are', () => {
    expect(notYourSites('Corvane Packaging')).toBe("Sites are Corvane Packaging's own to set. Its Owner, Admin or Procurement changes them.")
  })

  it('tells a regional manager the site is outside her region', () => {
    expect(outsideYourRegion('Dayton, Ohio', 'United States', 'Latin America')).toBe(
      'Dayton, Ohio is in United States, and your seat covers Latin America only. Ask an Owner or Admin to change it.'
    )
  })

  it('refuses deleting a site with placements, and says to move them first', () => {
    expect(placementsStillAt({ name: 'Dayton, Ohio', city: 'Dayton' }, 14)).toBe('Dayton, Ohio has 14 placements at it. Move the 14 placements at Dayton first.')
    expect(placementsStillAt({ name: 'Antrim', city: 'Antrim' }, 1)).toBe('Antrim has a placement at it. Move the placement at Antrim first.')
  })

  it('says where each site came from in the drawing’s words', () => {
    expect([sourceWords('IMPORT'), sourceWords('WEBSITE'), sourceWords('PERSON')]).toEqual(['From your contractor list', 'From your website', 'Typed by a person'])
  })

  it('checks the region and the owning company on every route that writes a site', () => {
    for (const f of ['src/app/api/settings/locations/route.ts', 'src/app/api/settings/locations/[id]/suppliers/route.ts', 'src/app/api/settings/locations/[id]/managers/route.ts']) {
      const s = src(f)
      expect(s, f).toContain('narrowsToRegion: true')
      expect(s, f).toContain('notYourSites(')
      expect(s, f).toContain('outsideYourRegion(')
    }
  })
})

describe('Sites in setup', () => {
  it('asks a client, an MSP, an integrator and a supplier to confirm their sites right after the company', () => {
    for (const kind of ['CLIENT', 'MSP', 'GSI', 'VENDOR']) {
      const steps = stepsFor(kind)
      expect(steps.indexOf('SITES'), kind).toBe(steps.indexOf('COMPANY') + 1)
    }
    expect(railFor('CLIENT').map((s) => s.label)).toContain('Sites')
  })

  it('a one-person firm is never asked to confirm sites', () => {
    expect(stepsFor('CONSULTANT_CORP')).not.toContain('SITES')
    expect(recordStep({}, 'SITES', 'DONE', 'p1', NOW, 'CONSULTANT_CORP').ok).toBe(false)
    expect(outstanding({}, { peopleImported: true, teammates: 1 }, 'CONSULTANT_CORP')).not.toContain('SITES')
  })

  it('records confirming the sites as done with who and when, and skipping as skipped', () => {
    const done = recordStep({}, 'SITES', 'DONE', 'graham', NOW, 'CLIENT')
    expect(done.ok && done.record.SITES).toEqual({ outcome: 'DONE', byId: 'graham', at: NOW.toISOString() })
    expect(SKIPPABLE).toContain('SITES')
    const skipped = recordStep({}, 'SITES', 'SKIPPED', 'graham', NOW, 'CLIENT')
    expect(skipped.ok && skipped.record.SITES?.outcome).toBe('SKIPPED')
  })

  it('keeps Sites on the setup reminder until the company confirms them', () => {
    const facts = { peopleImported: true, teammates: 2 }
    const at = NOW.toISOString()
    const r = { COMPANY: { outcome: 'DONE' as const, byId: 'g', at }, WORK: { outcome: 'DONE' as const, byId: 'g', at }, SITES: { outcome: 'SKIPPED' as const, byId: 'g', at } }
    expect(reminderFor({ startedAt: NOW, record: r, facts, kind: 'CLIENT' })?.says).toBe('Finish setting up: your sites.')
    expect(reminderFor({ startedAt: NOW, record: { ...r, SITES: { outcome: 'DONE', byId: 'g', at } }, facts, kind: 'CLIENT' })).toBeNull()
  })

  it('says the one thing skipping stops, and how many sites the button confirms', () => {
    expect(skipStops('Dayton, Ohio')).toBe('If you skip: a job with no site is posted at Dayton, Ohio, and goes to every approved supplier.')
    expect(confirmAllWords(31)).toBe('Confirm all 31 and continue')
  })
})

describe('Sites on the menu', () => {
  it('is a tab under Settings for a client, a supplier, an integrator and an MSP, and not for a one-person firm', () => {
    for (const kind of ['CLIENT', 'VENDOR', 'GSI', 'MSP'] as const) {
      const settings = getNavForKind(kind, false).find((s) => s.label === 'Settings')
      expect(settings?.items.map((i) => i.label), kind).toContain('Sites')
    }
    const solo = getNavForKind('CONSULTANT_CORP', false).find((s) => s.label === 'Settings')
    expect(solo?.items.map((i) => i.label)).not.toContain('Sites')
  })
})

describe('Corvane’s sites, as drawn', () => {
  it('Corvane’s Dayton site names three suppliers and not Lakemont', () => {
    const dayton = CORVANE_PLANTS.find((p) => p.key === 'dayton')!
    expect(plantSuppliers(dayton)).toEqual(['Ridgeline Staffing', 'Harbor Industrial Labor', 'Keystone Crew Partners'])
    expect(dayton.manager).toBe('Marcus Hollins')
  })
})
