import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { consultantRowPlan, rowFields } from '@/app/api/imports/sheets/consultant-row'

/**
 * The consultants import upserted the name and profile of anybody whose
 * email matched, own account or not. It now follows the edit route's rule
 * (profileEditPlan, supply's, eaddb1fc2): what a firm says about somebody
 * whose record is theirs goes on the firm's bench listing, never on them.
 */
const route = readFileSync(join(__dirname, '../../src/app/api/imports/sheets/route.ts'), 'utf8')
const row = { name: 'Priya R', email: 'priya@example.invalid', headline: 'SAP lead', skills: ['SAP'], location: 'Dayton', workAuth: 'H-1B', rateFloor: 90 }
const base = { isSubject: false, otherFirms: 0, hasListing: true, name: 'Priya Raman', firm: 'Tapin' }

describe('a consultants import never writes on a person who has their own record', () => {
  it('a row whose email matches a person with their own account writes only the firm’s listing and leaves their name and profile alone', () => {
    const plan = consultantRowPlan({ ...base, ownAccount: true, values: row })
    expect(plan.write).toBe('LISTING')
    if (plan.write !== 'LISTING') return
    expect(plan.listing).toEqual({ firmHeadline: 'SAP lead', firmSkills: ['SAP'], firmLocation: 'Dayton' })
    // Nothing of the person's own: no name, no work authorization, no rate.
    expect(Object.keys(plan.listing).sort()).toEqual(['firmHeadline', 'firmLocation', 'firmSkills'])
  })

  it('the import’s summary says per row that it was kept on the listing because the person has their own account', () => {
    const plan = consultantRowPlan({ ...base, ownAccount: true, values: row })
    expect(plan.write === 'LISTING' && plan.says).toBe('Kept on your listing; Priya Raman has their own account.')
    expect(route).toContain('kept.push({ row: r.rowNumber, says: plan.says })')
    expect(route).toContain("written.kept.map((k) => ` Row ${k.row}: ${k.says}`)")
    expect(route).toContain('kept: written.kept,')
  })

  it('a row about somebody another firm lists is kept on the listing, and the sentence never mentions another firm', () => {
    const plan = consultantRowPlan({ ...base, ownAccount: false, otherFirms: 1, values: row })
    expect(plan.write).toBe('LISTING')
    expect(plan.write === 'LISTING' && plan.says).toBe('Kept on your listing; Priya Raman’s own profile is theirs to change.')
    expect(plan.write === 'LISTING' && plan.says).not.toMatch(/firm|another|other/i)
  })

  it('a row about somebody whose record is theirs, at a firm with no bench listing for them, writes nothing and says why', () => {
    const plan = consultantRowPlan({ ...base, ownAccount: true, hasListing: false, values: row })
    expect(plan).toEqual({ write: 'NONE', says: 'Nothing written; Priya Raman has their own account, and Tapin has no bench listing for them to keep your words on.' })
  })

  it('a row with only the person’s own details about somebody whose record is theirs writes nothing', () => {
    const plan = consultantRowPlan({ ...base, ownAccount: true, values: { name: 'Priya R', email: row.email, workAuth: 'H-1B' } })
    expect(plan.write).toBe('NONE')
  })

  it('a row about somebody the firm keeps the record of, with no account and nobody else listing them, still writes their profile', () => {
    expect(consultantRowPlan({ ...base, ownAccount: false, hasListing: false, values: row })).toEqual({ write: 'PROFILE' })
  })

  it('the importer’s own row writes their own record', () => {
    expect(consultantRowPlan({ ...base, isSubject: true, ownAccount: true, values: row })).toEqual({ write: 'PROFILE' })
  })

  it('the import asks the edit route’s own rule before any upsert, and never a second rule', () => {
    expect(readFileSync(join(__dirname, '../../src/app/api/imports/sheets/consultant-row.ts'), 'utf8')).toContain("import { firmViewPatch, profileEditPlan } from '@/lib/consultant-portfolio/firm-view'")
    expect(route.indexOf('consultantRowPlan({')).toBeGreaterThan(0)
    expect(route.indexOf('consultantRowPlan({')).toBeLessThan(route.indexOf('prisma.person.upsert'))
    expect(rowFields(row)).toEqual(['name', 'headline', 'skills', 'location', 'workAuth', 'rateFloor'])
  })
})
