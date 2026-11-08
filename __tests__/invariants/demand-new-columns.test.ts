import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readQualification, qualificationFromText, QUALIFICATION_MAX } from '@/app/api/requisitions/qualification'
import { jobBody, editWorkBody } from '@/app/dashboard/requisitions/job-body'
import { diff, mayChange, said } from '@/lib/requisition-change'
import { soldBy } from '@/app/api/submissions/[id]/award/commission-earners'
import { regionRows, NO_REGION, type Facts, type Site } from '@/app/api/program/regions/rollup'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('the qualification a job asks for', () => {
  it('is kept as the hiring manager typed it, spaces tidied', () => {
    expect(readQualification('  Bachelor’s in   mechanical engineering ')).toEqual({ ok: true, value: 'Bachelor’s in mechanical engineering' })
  })

  it('left empty, the job asks none, stored as nothing', () => {
    expect(readQualification('')).toEqual({ ok: true, value: null })
    expect(readQualification('   ')).toEqual({ ok: true, value: null })
    expect(readQualification(undefined)).toEqual({ ok: true, value: null })
  })

  it('a qualification that is not words, or runs past one phrase, is refused in a sentence', () => {
    const notWords = readQualification(42)
    expect(notWords.ok).toBe(false)
    if (!notWords.ok) expect(notWords.says).toContain('Say the qualification in words')
    const long = readQualification('x'.repeat(QUALIFICATION_MAX + 1))
    expect(long.ok).toBe(false)
    if (!long.ok) expect(long.says).toContain(`${QUALIFICATION_MAX} characters`)
  })

  it('the job form sends it, and sends nothing for a job that asks none', () => {
    const base = {
      title: 'Line nurse', skills: 'ICU', siteId: null, location: 'Dayton', workMode: 'ONSITE', sponsorship: 'YES', sponsorshipPolicy: '',
      sendTo: null, headcount: '1', budget: '', hoursPerWeek: '', billMin: '', billMax: '', months: '', neededBy: '',
      description: '', justification: '', costCenterId: '', ownerId: null, panel: [],
    }
    expect(jobBody({ ...base, requiredQualification: ' BSN ' }).requiredQualification).toBe('BSN')
    expect(jobBody({ ...base, requiredQualification: '' }).requiredQualification).toBeNull()
  })

  it('the edit form sends it where it draws the field', () => {
    expect(editWorkBody({ workMode: 'ONSITE', sponsorship: 'YES', sponsorshipPolicy: '', otherBasis: null, requiredQualification: 'MSN' }).requiredQualification).toBe('MSN')
    expect('requiredQualification' in editWorkBody({ workMode: 'ONSITE', sponsorship: 'YES', sponsorshipPolicy: '', otherBasis: null })).toBe(false)
  })

  it('changing it on a published job is a word change: the suppliers are told and nothing goes back through approval', () => {
    const changes = diff({ requiredQualification: null }, { requiredQualification: 'BSN' })
    expect(changes).toEqual([{ field: 'requiredQualification', from: null, to: 'BSN' }])
    const v = mayChange({ status: 'OPEN', approvalState: 'APPROVED' }, changes)
    expect(v).toMatchObject({ allowed: true, reapprove: false, tellSuppliers: true })
    expect(said(changes)).toBe('Changed the qualification asked for')
  })

  it('the raise and the edit read it through the one reader and write it on the job', () => {
    const raise = read('src/app/api/requisitions/route.ts')
    expect(raise).toContain('readQualification(requiredQualification)')
    expect(raise).toContain('requiredQualification: qualification.value,')
    const edit = read('src/app/api/requisitions/[id]/route.ts')
    expect(edit).toContain('readQualification(body.requiredQualification)')
    expect(edit).toContain('requiredQualification: r.requiredQualification ?? null')
  })
})

describe('the parse reads the qualification by rules, and a person confirms it', () => {
  it('a line labeled "Qualification" is read as written', () => {
    expect(qualificationFromText('Senior nurse\nQualification: BSN and a current RN license\nLocation: Dayton')).toEqual({ value: 'BSN and a current RN license', confidence: 0.9, flagged: false })
  })

  it('a degree named in the text is offered, flagged for a person to confirm', () => {
    const found = qualificationFromText('We need a Bachelor’s degree in mechanical engineering, five years on a line.')
    expect(found.value).toBe('Bachelor’s degree in mechanical engineering')
    expect(found.flagged).toBe(true)
  })

  it('a description that names no qualification offers none', () => {
    expect(qualificationFromText('Forklift driver, second shift, Dayton.')).toEqual({ value: null, confidence: 0, flagged: true })
  })

  it('the parse route returns it beside the other fields', () => {
    expect(read('src/app/api/requirements/parse/route.ts')).toContain('fields.requiredQualification = qualificationFromText(text)')
  })
})

describe('asking a firm on probation keeps the reason on the invitation', () => {
  it('the pick writes the reason, who gave it and when in the same write that asks the firm', () => {
    const route = read('src/app/api/contractor-invites/[id]/route.ts')
    expect(route).toContain("state: 'REPRESENTED',\n        supplierCompanyId: approved.otherCompany.id,")
    expect(route).toContain('{ pickReason: reason, pickedById: caller.person.id, pickedAt: now }')
  })

  it('a firm not on probation carries no reason, so an earlier pick’s reason never reads as this one’s', () => {
    expect(read('src/app/api/contractor-invites/[id]/route.ts')).toContain('{ pickReason: null, pickedById: null, pickedAt: null }')
  })

  it('the Event stays as the trail', () => {
    expect(read('src/app/api/contractor-invites/[id]/route.ts')).toContain("type: 'representation.requested'")
  })
})

describe('the account manager the firm named on the client sells the deal', () => {
  it('the named account manager is read before whoever recorded the client', () => {
    expect(soldBy({ jobOwner: null, namedAccountManager: { personId: 'omar', seatedAtSeller: true }, relationship: { personId: 'nia', isAccountManager: true } })).toBe('omar')
  })

  it('the job’s owner at the selling firm still comes first', () => {
    expect(soldBy({ jobOwner: { personId: 'owner', seatedAtSeller: true }, namedAccountManager: { personId: 'omar', seatedAtSeller: true }, relationship: null })).toBe('owner')
  })

  it('a named account manager who has left the firm names nobody, and no guess replaces them', () => {
    expect(soldBy({ jobOwner: null, namedAccountManager: { personId: 'omar', seatedAtSeller: false }, relationship: { personId: 'nia', isAccountManager: true } })).toBeNull()
  })

  it('where nobody was named, the account manager who recorded the client sells it, as before', () => {
    expect(soldBy({ jobOwner: null, namedAccountManager: null, relationship: { personId: 'nia', isAccountManager: true } })).toBe('nia')
  })
})

describe('the regions follow the company’s own order after the home region', () => {
  const site = (id: string, region: string, primary = false): Site => ({ id, name: id, city: id, state: null, country: 'US', region, primary } as Site)
  const onSite = (n: number, siteId: string) => ({
    contractId: `c${n}`, personId: `w${n}`, personName: `W${n}`, manager: { id: 'm', name: 'M' }, siteId,
    rateMinor: 100, currency: 'USD', supplier: 'S', job: 'J', monthsHere: 1, daysLeft: 300,
  })
  const facts = (position?: Map<string, number>): Facts => ({
    sites: [site('dayton', 'United States', true), site('belfast', 'Europe'), site('monterrey', 'Latin America'), site('pune', 'Asia')],
    leads: new Map(),
    onSite: [onSite(1, 'dayton'), onSite(2, 'monterrey'), onSite(3, 'monterrey'), onSite(4, 'monterrey'), onSite(5, 'pune'), onSite(6, 'pune'), onSite(7, 'belfast')],
    held: [], open: [{ id: 'j', title: 'J', manager: { id: null, name: '' }, siteId: null, region: null }], weeks: [], asked: [], receipts: null,
    ...(position ? { regionPosition: position } : {}),
  })

  it('with no order set, the home region leads and the rest follow by contractors', () => {
    expect(regionRows(facts()).map((r) => r.label)).toEqual(['United States', 'Latin America', 'Asia', 'Europe', NO_REGION])
  })

  it('with an order set, the home region leads and the rest follow the company’s order, whatever their size', () => {
    const rows = regionRows(facts(new Map([['Europe', 1], ['Asia', 2], ['Latin America', 3]])))
    expect(rows.map((r) => r.label)).toEqual(['United States', 'Europe', 'Asia', 'Latin America', NO_REGION])
  })

  it('a region with no place in the order follows the ordered ones, by contractors', () => {
    const rows = regionRows(facts(new Map([['Europe', 1]])))
    expect(rows.map((r) => r.label)).toEqual(['United States', 'Europe', 'Latin America', 'Asia', NO_REGION])
  })

  it('the read takes each region’s place from its REGION unit', () => {
    const r = read('src/app/api/program/regions/read.ts')
    expect(r).toContain("units.filter((u) => u.kind === 'REGION' && u.position != null)")
  })
})
