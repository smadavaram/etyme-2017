import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { startRefusalSays, START_NOT_CHECKED, keepRefusal, keptRefusal, REFUSAL_KEPT_MS } from '@/lib/award/start-refusal'
import { ticksToEdit, readTickEdit, goesOnceApprovedSays } from '@/lib/job-site'
import { supplierChoice, lapsedCoverSays } from '@/lib/contractor-invite'
import { jobBandReadable } from '@/app/api/requirements/[id]/band-readable'

/**
 * The founder's tester on production, 2026-11-08 (CLAUDE.md): Activate
 * inert with no sentence, the Edit form with no supplier section, a
 * lapsed certificate read as "runs out in 20 days", and a recruiter
 * reading a rate band. Demand's half of each, as sentences.
 */

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')

describe('Activate always says why a start was refused', () => {
  it('a refused start says the route’s own sentence for papers that block, terms pending, a client rule and a placement already started', () => {
    expect(startRefusalSays(403, { code: 'DOCUMENTS_BLOCK', message: 'Noor Rahman cannot start without an I-9.', fix: 'Get it on file, then activate.' }))
      .toBe('Noor Rahman cannot start without an I-9. Get it on file, then activate.')
    expect(startRefusalSays(409, { code: 'TERMS_PENDING', message: 'Noor Rahman has not agreed the terms yet.' }))
      .toBe('Noor Rahman has not agreed the terms yet.')
    expect(startRefusalSays(403, { code: 'GOVERNANCE_BLOCK', message: 'Northbend Athletic’s time limit stops this start.' }))
      .toBe('Northbend Athletic’s time limit stops this start.')
    expect(startRefusalSays(409, { code: 'INVALID_TRANSITION', message: 'This placement has already started.' }))
      .toBe('This placement has already started.')
  })

  it('a start the server could not answer, or answered with an error page, reads "The start could not be checked. Try again."', () => {
    expect(startRefusalSays(null, undefined)).toBe('The start could not be checked. Try again.')
    expect(startRefusalSays(500, { message: 'Internal error' })).toBe(START_NOT_CHECKED)
    expect(startRefusalSays(502, '<html>Bad gateway</html>')).toBe(START_NOT_CHECKED)
  })

  it('a refusal with no words of its own never draws a blank: it says the start could not be checked', () => {
    expect(startRefusalSays(403, { code: 'DOCUMENTS_BLOCK', message: '', fix: null })).toBe(START_NOT_CHECKED)
    expect(startRefusalSays(422, {})).toBe(START_NOT_CHECKED)
    expect(startRefusalSays(403, { message: '  ', fix: 'Get the I-9 on file.' })).toBe('Get the I-9 on file.')
  })

  it('a refusal is kept across the page’s reload for a minute, then it is gone', () => {
    const at = Date.UTC(2026, 10, 8, 15, 0, 0)
    const raw = keepRefusal('Noor Rahman cannot start without an I-9.', at)
    expect(keptRefusal(raw, at + 5_000)).toBe('Noor Rahman cannot start without an I-9.')
    expect(keptRefusal(raw, at + REFUSAL_KEPT_MS)).toBeNull()
    expect(keptRefusal('not json', at)).toBeNull()
    expect(keptRefusal(null, at)).toBeNull()
  })
})

const DAYTON = { name: 'Dayton, Ohio', city: 'Dayton' }
const FIRMS = [
  { id: 'brightmoor', name: 'Brightmoor Staffing' },
  { id: 'csi', name: 'Computer Systems Inc' },
  { id: 'veritan', name: 'Veritan Talent' },
]
const ids = FIRMS.map((f) => f.id)

describe('the Edit form keeps who the job goes to', () => {
  it('the edit form opens on the ticks the hiring manager left, read against the firms the site still sends to', () => {
    expect(ticksToEdit(ids, ['veritan', 'brightmoor', 'gone-firm'])).toEqual(['brightmoor', 'veritan'])
  })

  it('a job that kept no ticks opens with every supplier its site sends to ticked', () => {
    expect(ticksToEdit(ids, [])).toEqual(ids)
  })

  it('a hiring manager may untick a supplier on Edit and the job keeps the narrower list', () => {
    const v = readTickEdit({ asked: ['csi', 'brightmoor'], offered: FIRMS, kept: [], out: false, site: DAYTON })
    expect(v).toEqual({ ok: true, ids: ['brightmoor', 'csi'], changed: true })
  })

  it('a firm the site does not send to is refused on Edit in a sentence that says to ask Procurement', () => {
    const v = readTickEdit({ asked: ['brightmoor', 'lakemont'], offered: FIRMS, kept: [], out: false, site: DAYTON })
    expect(v).toEqual({ ok: false, field: 'sendTo', says: 'That firm is not one of the suppliers Dayton sends to. Ask Procurement to add it to the site first.' })
  })

  it('unticking every supplier on Edit is refused rather than read as the site’s default', () => {
    const v = readTickEdit({ asked: [], offered: FIRMS, kept: ['csi'], out: false, site: DAYTON })
    expect(v.ok).toBe(false)
    expect(!v.ok && v.says).toBe('Leave at least one supplier ticked, or this job goes to nobody once it is approved.')
  })

  it('once the job is out, who it went to does not change from Edit, and the sentence says where to send it on', () => {
    const v = readTickEdit({ asked: ['csi'], offered: FIRMS, kept: [], out: true, site: DAYTON })
    expect(!v.ok && v.says).toMatch(/already with its suppliers.*from the job’s page/)
  })

  it('an unchanged list on Edit is not a change, even on a job already out', () => {
    expect(readTickEdit({ asked: ids, offered: FIRMS, kept: [], out: true, site: DAYTON })).toEqual({ ok: true, ids, changed: false })
  })

  it('before approval the job page says it goes to three suppliers once approved, with their names', () => {
    expect(goesOnceApprovedSays({ names: FIRMS.map((f) => f.name), everyApproved: false, site: DAYTON }))
      .toBe('Goes to three suppliers once approved: Brightmoor Staffing, Computer Systems Inc and Veritan Talent.')
    expect(goesOnceApprovedSays({ names: ['Veritan Talent'], everyApproved: false, site: DAYTON }))
      .toBe('Goes to one supplier once approved: Veritan Talent.')
    expect(goesOnceApprovedSays({ names: [], everyApproved: true, site: null }))
      .toBe('Goes to every approved supplier once approved.')
    expect(goesOnceApprovedSays({ names: [], everyApproved: false, site: DAYTON }))
      .toBe('Goes to no supplier once approved: none is approved at Dayton any more. Ask Procurement to add one, then edit the job.')
  })

  it('the Edit form draws "Send the job to" and posts the ticks the edit route reads, and the job page says who it goes to before approval', () => {
    const form = read('src/app/dashboard/requisitions/chain.tsx')
    const route = read('src/app/api/requisitions/[id]/route.ts')
    const page = read('src/app/dashboard/requisitions/[id]/page.tsx')
    expect(form).toContain('Send the job to')
    expect(form).toMatch(/sendTo: sendTo\.offered\.map/)
    expect(route).toContain('Array.isArray(body.sendTo)')
    expect(route).toContain('sendToSupplierIds: ticks.ids, sendToSetById: caller.person.id')
    expect(page).toContain('data.goesTo?.says')
  })
})

const ON = new Date('2026-11-08T12:00:00Z')
const cert = (expiresAt: string, type = 'INSURANCE_GL') => ({
  type, status: 'CLEAR', issuedAt: new Date('2025-10-28T00:00:00Z'), validFrom: null,
  expiresAt: new Date(expiresAt), verifiedAt: new Date('2025-10-29T00:00:00Z'),
})

describe('a lapsed certificate is read on the day the picker is drawn', () => {
  it('a supplier whose insurance has lapsed is held back in the picker with the day it lapsed, never "runs out in 20 days"', () => {
    const says = lapsedCoverSays('Brightmoor Staffing', [cert('2026-10-28T00:00:00Z'), cert('2027-06-01T00:00:00Z', 'INSURANCE_WC')], ON)
    expect(says).toBe('Brightmoor Staffing’s certificate of general liability insurance lapsed Oct 28, 2026. Ask them for the renewal before they take anybody on.')
    const choice = supplierChoice({ name: 'Brightmoor Staffing', tier: 'APPROVED', status: 'ACTIVE', blocked: false, blockedReason: null, lapsed: says })
    expect(choice).toEqual({ offered: false, why: says })
    expect(says).not.toMatch(/runs out in/)
  })

  it('a certificate still in date holds nothing back, and cover never filed is not said as a lapse', () => {
    expect(lapsedCoverSays('Brightmoor Staffing', [cert('2026-11-28T00:00:00Z'), cert('2027-06-01T00:00:00Z', 'INSURANCE_WC')], ON)).toBeNull()
    expect(lapsedCoverSays('Brightmoor Staffing', [], ON)).toBeNull()
  })

  it('lapsed cover holds a firm back ahead of probation, which only warns', () => {
    const choice = supplierChoice({ name: 'Veritan Talent', tier: 'PROBATION', status: 'ACTIVE', blocked: false, blockedReason: null, lapsed: 'Veritan Talent’s certificate of general liability insurance lapsed Nov 1, 2026. Ask them for the renewal before they take anybody on.' })
    expect(choice.offered).toBe(false)
    expect('withReason' in choice).toBe(false)
  })
})

describe('a job’s own rate band stays with the firm whose job it is', () => {
  it('a job’s own band is read by the firm that raised it or pays for it, and by no other firm, whatever reaches the read-back', () => {
    const job = { companyId: 'northbend', payerCompanyId: null }
    expect(jobBandReadable(job, 'northbend')).toBe(true)
    expect(jobBandReadable(job, 'brightmoor')).toBe(false)
    expect(jobBandReadable({ companyId: 'aptiva', payerCompanyId: 'cavanaugh' }, 'cavanaugh')).toBe(true)
    expect(read('src/app/api/requirements/[id]/screen/route.ts')).toContain('...bandFor(requirement, companyId)')
  })
})

import { lineEnd } from '@/lib/award/line-end'
import { pickChains } from '../../scripts/simulate/stages/demand/common'

describe('the thousand-job run, 2026-11-08: duplicates, every rung awarded, and lapsed cover', () => {
  it('a second submission of the same person to the same job is refused as a duplicate before any other check is asked', () => {
    const route = read('src/app/api/submissions/route.ts')
    const dup = route.indexOf('First submission wins — unique on (requirementId, personId)')
    expect(dup).toBeGreaterThan(0)
    expect(dup).toBeLessThan(route.indexOf('const verdict = await maySubmit({'))
    expect(dup).toBeLessThan(route.indexOf('const consented = mayMarket('))
    expect(route.match(/requirementId_personId: \{ requirementId, personId \}/g)?.length).toBe(1)
  })

  it('a rung below the client with no end date of its own ends on the day the line above it ends, so the time limit reads one window at every rung', () => {
    const start = new Date('2026-10-11T00:00:00Z')
    const above = new Date('2027-04-11T00:00:00Z')
    expect(lineEnd({ typed: null, start, months: null, above })).toEqual(above)
    expect(lineEnd({ typed: null, start, months: null, above: null })).toBeNull()
  })

  it('an end date typed on the award, or the job’s own months, still decide the last day before the line above does', () => {
    const start = new Date('2026-10-11T00:00:00Z')
    const typed = new Date('2027-01-31T00:00:00Z')
    const above = new Date('2027-04-11T00:00:00Z')
    expect(lineEnd({ typed, start, months: 6, above })).toEqual(typed)
    expect(lineEnd({ typed: null, start, months: 3, above })?.toISOString().slice(0, 10)).toBe('2027-01-11')
    expect(read('src/app/api/submissions/[id]/award/route.ts')).toContain('const end = lineEnd({')
  })

  it('the run never picks a firm whose cover has lapsed for a rung of a chain, because the award refuses it by design', () => {
    const firms = new Map(['client', 'prime', 'sub', 'subLapsed', 'bench'].map((id) => [id, { id, slug: id, name: id, kind: id === 'client' ? 'CLIENT' : 'VENDOR' }]))
    const ties = [
      { seller: 'sub', buyer: 'prime' }, { seller: 'subLapsed', buyer: 'prime' },
      { seller: 'bench', buyer: 'sub' }, { seller: 'bench', buyer: 'subLapsed' },
    ] as any
    const jobs = [{ id: 'j1', clientId: 'client', skills: ['Java'], invited: ['prime'] }]
    const benchSkills = new Map([['bench', [['Java']]]])
    const without = pickChains({ jobs, ties, firms, benchSkills, want: 1, lapsed: new Set(['sub']) })
    expect(without.map((c) => c.sub.id)).toEqual(['subLapsed'])
    const none = pickChains({ jobs, ties, firms, benchSkills, want: 1, lapsed: new Set(['sub', 'subLapsed']) })
    expect(none).toEqual([])
    expect(read('scripts/simulate/stages/demand/send-to-suppliers.ts')).toContain('want: aim, lapsed,')
  })

  it('the award report never prints "wait on terms: ." over an empty list', () => {
    const station = read('scripts/simulate/stages/demand/award.ts')
    expect(station).toContain('placements wait on terms nobody has stated yet')
    expect(station).toMatch(/termsSaid\.size\s*\?/)
  })
})

describe('a supplier’s Timesheets and the examiner’s queue', () => {
  it('a supplier, integrator or MSP reads every week its own sell lines bill, wherever in the chain the week was filed', () => {
    const route = read('src/app/api/timesheets/route.ts')
    expect(route).toContain("await firmWeeksWhere(caller.company!.id)")
    expect(route).toContain("caller.company.kind !== 'CLIENT'")
  })

  it('a paper a worker sent and nobody checked is a row in the examiner’s queue, one per paper, so the mark and Today count it', () => {
    const route = read('src/app/api/decisions/route.ts')
    expect(route).toContain('papersWaitingOn({ companyId, personId: caller.person.id })')
    expect(route).toContain("type: 'PAPER_TO_CHECK'")
    expect(read('src/app/dashboard/decisions/chips.ts')).toContain("['PAPER_TO_CHECK', 'Papers to check']")
  })
})
