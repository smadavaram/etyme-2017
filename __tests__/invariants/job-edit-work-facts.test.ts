import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { readWorkEdit, workFactsOf, sponsorshipValue, type WorkColumns } from '@/app/api/requisitions/work-facts'
import { editWorkBody } from '@/app/dashboard/requisitions/job-body'
import { diff, mayChange, said, WORDS, MONEY } from '@/lib/requisition-change'
import { NEEDS_NO_SPONSOR_VALUE } from '@/lib/checks'

/**
 * The work-country wave's leftover (2026-11-03): the job edit form asks
 * where the work is done and whether sponsorship is offered, the way the
 * job form does, so a job raised before the questions existed, or raised
 * wrong, is put right without raising it again.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const CHAIN = read('src/app/dashboard/requisitions/chain.tsx')
const ROUTE = read('src/app/api/requisitions/[id]/route.ts')

const NOTHING: WorkColumns = { workMode: null, workAuthRequired: null, workAuthBasis: null, workAuthCite: null }
const NO_SPONSOR: WorkColumns = {
  workMode: 'HYBRID', workAuthRequired: NEEDS_NO_SPONSOR_VALUE, workAuthBasis: 'SPONSORSHIP_UNAVAILABLE', workAuthCite: 'We do not sponsor visas for this role',
}
const EXPORT: WorkColumns = { workMode: 'ONSITE', workAuthRequired: 'US_PERSON', workAuthBasis: 'EXPORT_CONTROL', workAuthCite: 'ITAR 22 CFR 120' }
const PUBLISHED = { status: 'OPEN', approvalState: 'APPROVED', archivedAt: null }

function change(row: WorkColumns, body: Record<string, unknown>) {
  const e = readWorkEdit(row, body)
  if (!e.ok) throw new Error(e.says)
  const now = workFactsOf(row)
  return { e, changes: diff({ workMode: now.workMode, sponsorship: sponsorshipValue(now) }, e.after) }
}

describe('the job edit form asks where the work is done and whether sponsorship is offered', () => {
  it('the edit form draws "Where is the work done?" and "Sponsorship" in the job form’s own words', () => {
    expect(CHAIN).toContain('Where is the work done?')
    expect(CHAIN).toContain("[['ONSITE', 'On site'], ['HYBRID', 'Hybrid'], ['REMOTE', 'Remote']]")
    expect(CHAIN).toContain("[['YES', 'Offered'], ['NO', 'Not offered']]")
    expect(CHAIN).toContain('Your policy, in a few words')
    expect(CHAIN).toContain('...editWorkBody({ workMode, sponsorship, sponsorshipPolicy, otherBasis: work.otherBasis, requiredQualification })')
  })

  it('a job that never said where the work is done opens as on site with sponsorship offered, and saving it unchanged changes nothing', () => {
    expect(workFactsOf(NOTHING)).toMatchObject({ workMode: 'ONSITE', sponsorship: 'YES', sponsorshipPolicy: '', otherBasis: null })
    const body = editWorkBody({ workMode: 'ONSITE', sponsorship: 'YES', sponsorshipPolicy: '', otherBasis: null })
    expect(change(NOTHING, body).changes).toEqual([])
  })

  it('a job that offers no sponsorship opens on "Not offered" with its policy in the firm’s words', () => {
    expect(workFactsOf(NO_SPONSOR)).toMatchObject({ workMode: 'HYBRID', sponsorship: 'NO', sponsorshipPolicy: 'We do not sponsor visas for this role' })
  })

  it('moving a job to remote is a change of words: the suppliers are told, and it does not go back through approval', () => {
    const { e, changes } = change(NOTHING, editWorkBody({ workMode: 'REMOTE', sponsorship: 'YES', sponsorshipPolicy: '', otherBasis: null }))
    expect(e.columns).toEqual({ workMode: 'REMOTE' })
    expect(changes.map((c) => c.field)).toEqual(['workMode'])
    expect(mayChange(PUBLISHED, changes)).toMatchObject({ allowed: true, reapprove: false, tellSuppliers: true })
    expect(said(changes)).toBe('Changed where the work is done')
    expect(WORDS).toContain('workMode')
    expect(MONEY as readonly string[]).not.toContain('workMode')
  })

  it('saying no sponsorship on an edit writes the restriction with the policy as the reason on record, as the raise does', () => {
    const { e, changes } = change(NOTHING, editWorkBody({ workMode: 'ONSITE', sponsorship: 'NO', sponsorshipPolicy: '  No visa sponsorship for this site ', otherBasis: null }))
    expect(e.columns).toMatchObject({
      workAuthRequired: NEEDS_NO_SPONSOR_VALUE, workAuthBasis: 'SPONSORSHIP_UNAVAILABLE', workAuthCite: 'No visa sponsorship for this site',
    })
    expect(said(changes)).toBe('Changed whether sponsorship is offered')
  })

  it('offering sponsorship again takes the sponsorship restriction off and nothing else', () => {
    const { e } = change(NO_SPONSOR, editWorkBody({ workMode: 'HYBRID', sponsorship: 'YES', sponsorshipPolicy: '', otherBasis: null }))
    expect(e.columns).toEqual({ workMode: 'HYBRID', workAuthRequired: null, workAuthBasis: null, workAuthCite: null })
  })

  it('"no sponsorship" with no words is refused in the raise’s own sentence, naming the policy field the form draws', () => {
    const e = readWorkEdit(NOTHING, { sponsorship: 'NO', sponsorshipPolicy: '  ' })
    expect(e).toMatchObject({ ok: false, field: 'sponsorshipPolicy' })
    if (!e.ok) expect(e.says).toContain('Say your policy in a few words')
    expect(CHAIN).toContain('id="edit-sponsorship-policy"')
  })

  it('a work mode that is not on site, hybrid or remote is refused in a sentence naming the field', () => {
    const e = readWorkEdit(NOTHING, { workMode: 'sometimes' })
    expect(e).toMatchObject({ ok: false, field: 'workMode', says: 'Say where the work is done: on site, hybrid or remote.' })
  })

  it('a job held back on another recorded basis is never overwritten by a sponsorship policy, and the form draws no sponsorship question for it', () => {
    expect(workFactsOf(EXPORT).otherBasis).toBe('EXPORT_CONTROL')
    const e = readWorkEdit(EXPORT, { sponsorship: 'NO', sponsorshipPolicy: 'We do not sponsor' })
    expect(e).toMatchObject({ ok: false, field: 'sponsorship' })
    expect(editWorkBody({ workMode: 'ONSITE', sponsorship: 'YES', sponsorshipPolicy: '', otherBasis: 'EXPORT_CONTROL' })).toEqual({ workMode: 'ONSITE' })
    expect(CHAIN).toContain('This job already holds people back on its own recorded basis')
  })

  it('a question left off the edit is not a question answered: nothing is compared and nothing is written', () => {
    expect(readWorkEdit(NO_SPONSOR, {})).toEqual({ ok: true, after: {}, columns: {} })
  })

  it('the edit route reads the two questions through the raise’s own reader and refuses before anything is compared', () => {
    expect(ROUTE).toContain('const workEdit = readWorkEdit(requisition, body)')
    expect(ROUTE).toContain("{ error: { code: 'VALIDATION', message: workEdit.says, field: workEdit.field } }")
    expect(ROUTE).toContain('workMode: true, workAuthRequired: true, workAuthBasis: true, workAuthCite: true,')
    expect(ROUTE).toContain('Object.assign(data, workEdit.columns)')
  })
})
