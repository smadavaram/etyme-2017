import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { centsTyped, typedFromCents } from '@/app/dashboard/requisitions/facts'
import { maySendJob, whoSends } from '@/app/api/requisitions/who-sends'
import { putForward } from '@/app/dashboard/requirements/words'
import { rateHelp } from '@/app/dashboard/submissions/rate-words'
import { bandHint } from '@/app/dashboard/submissions/rate-words'
import { rolesFor } from '@/lib/company-defaults'
import { refusalSays } from '@/app/dashboard/submissions/words'

/**
 * The Tapin walk, 2026-10-29: what demand's screens did to a bench
 * supplier answering a prime's job.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const perms = (kind: 'VENDOR' | 'CLIENT' | 'GSI' | 'MSP', role: string) =>
  rolesFor(kind).find((r) => r.name === role)!.permissions as readonly string[]

describe('a rate typed on a job', () => {
  it('a rate band typed in dollars is stored in cents and read back as dollars', () => {
    expect(centsTyped('90')).toBe(9_000)
    expect(centsTyped('110')).toBe(11_000)
    expect(centsTyped('$1,250.50')).toBe(125_050)
    expect(typedFromCents(9_000)).toBe('90')
    expect(typedFromCents(12_550)).toBe('125.5')
    // And a sub-vendor reads it back as the prime typed it.
    expect(bandHint({ payMin: centsTyped('90'), payMax: centsTyped('110') })).toBe('Your band on this job: $90 to $110 per hour.')
  })

  it('an empty or unreadable box is no figure, never zero', () => {
    expect(centsTyped('')).toBeNull()
    expect(centsTyped('   ')).toBeNull()
    expect(centsTyped('ninety')).toBeNull()
    expect(typedFromCents(null)).toBe('')
  })

  it('the send form, the raise forms, the edit form and the award read every rate through the one reader', () => {
    const files = [
      'src/app/dashboard/requirements/[id]/page.tsx',
      'src/app/dashboard/requirements/page.tsx',
      'src/app/dashboard/requisitions/page.tsx',
      'src/app/dashboard/requisitions/[id]/page.tsx',
      'src/app/dashboard/requisitions/chain.tsx',
    ]
    for (const f of files) {
      const src = read(f)
      expect(src, f).toContain('centsTyped(')
      // No dollars-to-cents by hand, and no band posted as typed.
      expect(src, f).not.toMatch(/parseFloat\([^)]*\)\s*\*\s*100/)
      expect(src, f).not.toMatch(/Number\([^)]*\)\s*\*\s*100/)
      expect(src, f).not.toMatch(/payM(in|ax): payM(in|ax) \? Number\(/)
    }
  })
})

describe('who sends a job out', () => {
  it('a supplier’s account manager sends a job down to its sub-vendor, and the refusal names the right role', () => {
    const brightmoor = { kind: 'VENDOR', name: 'Brightmoor Staffing' }
    expect(maySendJob(brightmoor, perms('VENDOR', 'Account Manager'))).toEqual({ ok: true })
    expect(maySendJob(brightmoor, perms('VENDOR', 'Owner'))).toEqual({ ok: true })
    const recruiter = maySendJob(brightmoor, perms('VENDOR', 'Recruiter'))
    expect(recruiter).toEqual({
      ok: false,
      says: 'At Brightmoor Staffing, the account manager or the owner sends a job down to a sub-vendor. Ask one of them to send it out.',
    })
    expect(maySendJob(brightmoor, perms('VENDOR', 'HR')).ok).toBe(false)
  })

  it('at a client the hiring manager still does not choose who sees a job, and is told it is the program manager or Procurement', () => {
    const northbend = { kind: 'CLIENT', name: 'Northbend Athletic' }
    expect(maySendJob(northbend, perms('CLIENT', 'Program Manager')).ok).toBe(true)
    expect(maySendJob(northbend, perms('CLIENT', 'Procurement Lead')).ok).toBe(true)
    const hm = maySendJob(northbend, perms('CLIENT', 'Hiring Manager'))
    expect(hm).toEqual({
      ok: false,
      says: 'At Northbend Athletic, the program manager or Procurement decides which suppliers see a job. Ask one of them to send it out.',
    })
  })

  it('no refusal tells a supplier to ask a program manager it does not have', () => {
    for (const kind of ['VENDOR', 'GSI', 'CONSULTANT_CORP']) expect(whoSends(kind)).not.toContain('program manager')
    expect(read('src/app/api/requisitions/[id]/distribute/route.ts')).not.toContain('program manager\\\'s call')
  })
})

describe('answering a job that was sent', () => {
  const open = { status: 'OPEN', raiser: false, kind: 'VENDOR', maySubmit: true, requirementId: 'job1' }

  it('a sub-vendor puts a bench person forward from the job it was sent', () => {
    expect(putForward(open)).toEqual({ href: '/dashboard/submissions?new=1&job=job1' })
    const page = read('src/app/dashboard/requirements/[id]/page.tsx')
    expect(page).toContain('Put forward')
    expect(page).toContain('putForward(')
    // The form it opens has the job already chosen.
    const subs = read('src/app/dashboard/submissions/page.tsx')
    expect(subs).toContain("searchParams.get('job')")
    expect(subs).toContain("requirementId: initialRequirementId ?? ''")
  })

  it('Put forward is not offered to the firm that raised the job, to a client, on a closed job, or to a seat that cannot submit', () => {
    expect(putForward({ ...open, raiser: true })).toBeNull()
    expect(putForward({ ...open, kind: 'CLIENT' })).toBeNull()
    expect(putForward({ ...open, status: 'FILLED' })).toBeNull()
    expect(putForward({ ...open, maySubmit: false })).toBeNull()
  })

  it('the rate on the submit form names the firm it is billed to, not "the client"', () => {
    expect(rateHelp('Brightmoor Staffing')).toBe('What you will bill Brightmoor Staffing for each hour. There is no default: type the rate you agreed.')
  })

  it('the job’s own firm’s people are not offered back to it', () => {
    const subs = read('src/app/dashboard/submissions/page.tsx')
    expect(subs).toContain('network.filter((o) => o.supplierId !== selectedReq.company.id)')
  })

  it('a firm the job was sent to reads who sent it, not "Typed in here"', () => {
    const page = read('src/app/dashboard/requirements/[id]/page.tsx')
    expect(page).toContain('label="Sent by"')
  })
})

describe('a refused award, on the screen', () => {
  it('a one-reason refusal at the award says it once, and names the firm', () => {
    const one = "Tapin has neither a general liability nor a workers' compensation certificate on file"
    expect(refusalSays(one, [one])).toBe(one)
    expect(refusalSays(`${one}.`, [one])).toBe(`${one}.`)
    // Two reasons: the summary carries the first, the second follows it once.
    const two = "Tapin's certificate of good standing has lapsed"
    expect(refusalSays(`2 reasons this cannot proceed — ${one}`, [one, two])).toBe(`2 reasons this cannot proceed — ${one} — ${two}`)
    // Every screen that places somebody prints it through the same function.
    expect(read('src/app/dashboard/submissions/page.tsx')).toContain('refusalSays(body.error.message')
    expect(read('src/app/dashboard/requisitions/[id]/page.tsx')).toContain('refusalSays(')
    // And the award names the firm whose cover it read.
    expect(read('src/app/api/submissions/[id]/award/route.ts')).toContain('vendorName: vendorCompany?.name')
  })
})
