import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  verificationFromChecklistItem,
  verificationsFromChecklist,
  type OnboardingEvidenceItem,
} from '@/lib/onboarding-evidence'
import { CHECKLIST } from '@/lib/supplier-onboarding'

/**
 * A certificate HR verified on the way in reaches the compliance record.
 *
 * HR cleared a supplier's insurance at onboarding and the compliance page
 * went on saying the firm had no cover on file, because the four-desk
 * walk keeps its answers in a JSON checklist and every gate in the
 * product reads `Verification`. The two never met, so a firm HR
 * personally cleared on Tuesday blocked a start on Wednesday.
 */

const item = (over: Partial<OnboardingEvidenceItem> = {}): OnboardingEvidenceItem => ({
  key: 'INSURANCE',
  label: 'Certificate of insurance (general liability and workers’ comp)',
  state: 'HELD',
  answers: ['INSURANCE_GL', 'INSURANCE_WC'],
  fileName: 'veritan-coi-2026.pdf',
  validFrom: '2026-01-01',
  validUntil: '2027-01-01',
  ...over,
})

const ON = new Date('2026-09-21T00:00:00Z')
const by = { personId: 'priya', at: ON }

describe('what a desk verified at onboarding, on the compliance record', () => {
  it('a certificate HR verified with its dates becomes a row the compliance record can read', () => {
    const verdict = verificationFromChecklistItem(item(), 'veritan', by)
    expect(verdict.ok).toBe(true)
    expect(verdict.rows).toHaveLength(2)
    const gl = verdict.rows.find((r) => r.type === 'INSURANCE_GL')!
    expect(gl.companyId).toBe('veritan')
    expect(gl.status).toBe('CLEAR')
    expect(gl.validFrom.toISOString().slice(0, 10)).toBe('2026-01-01')
    expect(gl.expiresAt.toISOString().slice(0, 10)).toBe('2027-01-01')
    expect(gl.verifiedById).toBe('priya')
    expect(gl.result.notes).toContain('veritan-coi-2026.pdf')
    expect(verdict.says).toContain('January 1, 2027')
  })

  it('a certificate verified with no dates is refused, in a sentence asking for the two that are printed on it', () => {
    const verdict = verificationFromChecklistItem(item({ validFrom: null, validUntil: null }), 'veritan', by)
    expect(verdict.ok).toBe(false)
    expect(verdict.rows).toEqual([])
    expect(verdict.needsDates).toBe(true)
    expect(verdict.says).toContain('the day it starts and the day it runs out')
    // The reason, not just the ask: a row with no expiry is never chased.
    expect(verdict.says).toContain('until the day somebody audits it')
  })

  it('a certificate that ran out before the desk looked at it is refused rather than recorded as clear', () => {
    const verdict = verificationFromChecklistItem(
      item({ validFrom: '2024-01-01', validUntil: '2025-01-01' }),
      'veritan',
      by
    )
    expect(verdict.ok).toBe(false)
    expect(verdict.says).toContain('ran out on January 1, 2025')
    expect(verdict.says).toContain('ask the firm for the current one')
  })

  it('a certificate whose end date is not after its start is refused, because one of the two was mistyped', () => {
    const verdict = verificationFromChecklistItem(
      item({ validFrom: '2027-01-01', validUntil: '2026-01-01' }),
      'veritan',
      by
    )
    expect(verdict.ok).toBe(false)
    expect(verdict.needsDates).toBe(true)
    expect(verdict.says).toContain('which is not after the day it starts')
  })

  it('an item the desk waived is not recorded as a document, and the waiver stays where it is', () => {
    const verdict = verificationFromChecklistItem(item({ state: 'WAIVED' }), 'veritan', by)
    expect(verdict.ok).toBe(false)
    expect(verdict.needsDates).toBe(false)
    expect(verdict.says).toContain('waived rather than verified')
  })

  it('an item nobody has verified yet records nothing at all', () => {
    for (const state of ['MISSING', 'PROVIDED']) {
      const verdict = verificationFromChecklistItem(item({ state }), 'veritan', by)
      expect(verdict.ok, state).toBe(false)
      expect(verdict.says, state).toContain('not verified yet')
    }
  })

  it('a check the desk ran itself is not a document with a life, so nothing expires and nothing is written', () => {
    // Vendor screening and a D&B report are this desk's own work. They
    // have a verdict and no validity window, and inventing one would put
    // a date on the record that nobody read off a piece of paper.
    const screening = verificationFromChecklistItem(
      item({ key: 'VENDOR_SCREENING', label: 'Vendor screening (sanctions, litigation)', answers: [] }),
      'veritan',
      by
    )
    expect(screening.ok).toBe(false)
    expect(screening.needsDates).toBe(false)
    expect(screening.says).toContain('this desk’s own check')
  })

  it('a signed agreement is not a verification, because an agreement is not a thing that gets chased for renewal', () => {
    // The AGREEMENT item answers MSA. An MSA lives on `MasterAgreement`
    // with its own signing and countersigning; recording it here would
    // be a second record of the same paper, in the one model whose whole
    // job is expiry.
    const verdict = verificationFromChecklistItem(
      item({ key: 'AGREEMENT', label: 'Signed agreement', answers: ['MSA'] }),
      'veritan',
      by
    )
    expect(verdict.ok).toBe(false)
    expect(verdict.rows).toEqual([])
  })

  it('a certificate of good standing is recorded the same way cover is, because it has the same shape', () => {
    const verdict = verificationFromChecklistItem(
      item({ key: 'GOOD_STANDING', label: 'Certificate of good standing', answers: ['GOOD_STANDING'] }),
      'veritan',
      by
    )
    expect(verdict.ok).toBe(true)
    expect(verdict.rows).toHaveLength(1)
    expect(verdict.rows[0].type).toBe('GOOD_STANDING')
    expect(verdict.rows[0].documentTypeKey).toBe('GOOD_STANDING')
  })

  it('nothing is written against a firm that is not on the register yet, and the sentence says when to come back', () => {
    // The supplier's own company row does not exist until Finance
    // approves it, so an HR desk verifying on Tuesday may have nowhere
    // to put the row until Thursday.
    const verdict = verificationFromChecklistItem(item(), '', by)
    expect(verdict.ok).toBe(false)
    expect(verdict.says).toContain('until the firm itself is on the register')
  })

  it('a whole checklist gives back every row it can write and names every verified item it could not', () => {
    const { rows, skipped } = verificationsFromChecklist(
      [
        item(),
        item({ key: 'GOOD_STANDING', label: 'Certificate of good standing', answers: ['GOOD_STANDING'], validFrom: null, validUntil: null }),
        item({ key: 'VENDOR_SCREENING', label: 'Vendor screening (sanctions, litigation)', answers: [] }),
        item({ key: 'TAX_FORM', label: 'Tax form', answers: [], state: 'MISSING' }),
      ],
      'veritan',
      by
    )
    expect(rows).toHaveLength(2)
    // Only items a desk actually verified are reported back as skipped —
    // an item nobody has touched is not a gap in the record.
    expect(skipped.map((s) => s.key)).toEqual(['GOOD_STANDING', 'VENDOR_SCREENING'])
    expect(skipped.find((s) => s.key === 'GOOD_STANDING')!.needsDates).toBe(true)
  })

  it('every document type this file can record is a verification type the database actually has', () => {
    // A mapping to an enum value that does not exist writes nothing and
    // throws at the call site, months after anybody remembers why the
    // list was written.
    const schema = readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8')
    const block = schema.match(/^enum VerificationType \{([\s\S]*?)^\}/m)![1]
    const known = new Set(
      block.split('\n').map((l) => l.trim().split(/[\s/]/)[0]).filter((w) => /^[A-Z][A-Z0-9_]*$/.test(w))
    )
    const src = readFileSync(join(process.cwd(), 'src/lib/onboarding-evidence.ts'), 'utf8')
    const map = src.slice(src.indexOf('const VERIFICATION_TYPE'), src.indexOf('/** One row, ready'))
    const values = [...map.matchAll(/:\s*'([A-Z0-9_]+)'/g)].map((m) => m[1])
    expect(values.length).toBeGreaterThan(8)
    for (const v of values) expect(known, `${v} is not a VerificationType`).toContain(v)
  })

  it('every item the supplier walk asks for either becomes a verification or says why it does not', () => {
    // The whole checklist, run through the door: no item may fall
    // through it silently, because a silent skip is exactly the crack
    // this file closes.
    for (const c of CHECKLIST) {
      const verdict = verificationFromChecklistItem(
        { key: c.key, label: c.label, state: 'HELD', answers: c.answers ?? [], validFrom: '2026-01-01', validUntil: '2027-01-01' },
        'veritan',
        by
      )
      expect(verdict.says.length, c.key).toBeGreaterThan(30)
      if (verdict.ok) {
        for (const row of verdict.rows) expect(row.companyId, c.key).toBe('veritan')
      }
    }
  })
})
