import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  verificationFromChecklistItem,
  verificationsFromChecklist,
  type OnboardingEvidenceItem,
} from '@/lib/onboarding-evidence'
import { CHECKLIST, withOrderedItems, newChecklist, wantsDates } from '@/lib/supplier-onboarding'
import { checkKindOf, whoRendersCheck } from '@/lib/attestation'

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

  // ── Who renders the verdict, 2026-09-22 ────────────────────────────
  //
  // The founder: background check companies are the ones that confirm
  // pass or fail, and the risk is passed there. So a desk may repeat an
  // assertion an insurer or a registry already printed, and may never
  // render one a screening company or an employer of record renders.

  it('a desk records the dates on a certificate the insurer issued, and never a verdict a laboratory or a screening firm renders', () => {
    const cover = verificationFromChecklistItem(item(), 'veritan', by)
    expect(cover.ok).toBe(true)
    expect(cover.rows.map((r) => r.type)).toEqual(['INSURANCE_GL', 'INSURANCE_WC'])

    const check = verificationFromChecklistItem(
      item({ key: 'BACKGROUND', label: 'Background check', answers: ['BACKGROUND_CHECK'] }),
      'veritan',
      by
    )
    expect(check.ok).toBe(false)
    expect(check.rows).toEqual([])
  })

  it('a background check a desk marks verified writes nothing to the compliance record, however complete its dates are', () => {
    // Two good dates and a file name. The dates are not the problem —
    // the verdict is, and no amount of paperwork makes it this desk's.
    const check = verificationFromChecklistItem(
      item({
        key: 'BACKGROUND',
        label: 'Background check',
        answers: ['BACKGROUND_CHECK'],
        fileName: 'ramirez-background-2026.pdf',
        validFrom: '2026-03-12',
        validUntil: '2027-03-12',
      }),
      'veritan',
      by
    )
    expect(check.ok).toBe(false)
    expect(check.rows).toEqual([])
  })

  it('a refusal names the party whose opinion it is, so the desk knows who to ask rather than what it did wrong', () => {
    const check = verificationFromChecklistItem(
      item({ key: 'BACKGROUND', label: 'Background check', answers: ['BACKGROUND_CHECK'] }),
      'veritan',
      by
    )
    expect(check.says).toContain('screening company')
    // What a real record of it would carry, because that door is not
    // built and a refusal that does not say so teaches nothing.
    expect(check.says).toContain('their reference number')
    expect(check.says).toContain('the day they ran it')
    // And where the answer that was given stays.
    expect(check.says).toContain('stay on the checklist')
    // Never a code, and never a scolding.
    expect(check.says).not.toMatch(/[A-Z]{4,}_[A-Z]{4,}/)
  })

  it('a drug screen is refused the same way, because a laboratory renders that result and nobody in Etyme does', () => {
    const screen = verificationFromChecklistItem(
      item({ key: 'DRUG', label: 'Drug screening', answers: ['DRUG_SCREENING'] }),
      'veritan',
      by
    )
    expect(screen.ok).toBe(false)
    expect(screen.says).toContain('laboratory')
  })

  it('work authorization is the employer of record’s own check, and a desk at the firm buying from them cannot clear it', () => {
    const i9 = verificationFromChecklistItem(
      item({ key: 'I9', label: 'I-9 and E-Verify', answers: ['I9_EVERIFY'] }),
      'veritan',
      by
    )
    expect(i9.ok).toBe(false)
    expect(i9.says).toContain('employer of record')
    expect(i9.says).toContain('running its own')
  })

  it('a desk is never asked for the two dates on a check it was never going to be allowed to record', () => {
    // `needsDates` is the one refusal a screen acts on — it opens the
    // two date fields. Opening them here would ask a desk to finish
    // something it is being told not to start.
    for (const key of ['BACKGROUND_CHECK', 'DRUG_SCREENING', 'I9_EVERIFY', 'RIGHT_TO_WORK']) {
      const verdict = verificationFromChecklistItem(
        item({ key, label: key, answers: [key], validFrom: null, validUntil: null }),
        'veritan',
        by
      )
      expect(verdict.ok, key).toBe(false)
      expect(verdict.needsDates, key).toBe(false)
    }
  })

  it('an item answering both a certificate and a screening report records the certificate and says what it left off', () => {
    // One checklist row can answer two things. Writing nothing would
    // lose the cover; writing both would render the verdict. It does
    // neither, and says so.
    const mixed = verificationFromChecklistItem(
      item({ key: 'PACK', label: 'Onboarding pack', answers: ['INSURANCE_GL', 'BACKGROUND_CHECK'] }),
      'veritan',
      by
    )
    expect(mixed.ok).toBe(true)
    expect(mixed.rows.map((r) => r.type)).toEqual(['INSURANCE_GL'])
    expect(mixed.says).toContain('Background check')
    expect(mixed.says).toContain('not this desk’s to render')
  })

  it('one table says who renders a check, and this file keeps no second list of its own', () => {
    // The answer for every type this door can write is read off
    // `lib/attestation`. Two tables would be two answers to one
    // question, and the stale one would be the one letting a desk clear
    // a background check.
    const src = readFileSync(join(process.cwd(), 'src/lib/onboarding-evidence.ts'), 'utf8')
    const map = src.slice(src.indexOf('const VERIFICATION_TYPE'), src.indexOf('/** One row, ready'))
    const keys = [...map.matchAll(/^\s{2}([A-Z0-9_]+):/gm)].map((m) => m[1])
    expect(keys.length).toBeGreaterThan(8)

    for (const key of keys) {
      const kind = checkKindOf(key)
      const renders = kind ? whoRendersCheck(kind).renders : null
      const theirs = renders === 'PROVIDER' || renders === 'EMPLOYER'
      const verdict = verificationFromChecklistItem(
        item({ key, label: key, answers: [key] }),
        'veritan',
        by
      )
      if (theirs) expect(verdict.ok, `${key} is rendered by ${renders} and must not be recorded here`).toBe(false)
    }
  })

  it('a client whose order asks its suppliers for a background check does not get its own HR desk rendering one', () => {
    // The route this actually arrives by. The shipped walk asks for no
    // background check, so this was never reachable with the twelve
    // items it ships \u2014 and the required set is deliberately open-ended,
    // so a client folds one on and its own HR desk is handed the button.
    const folded = withOrderedItems(
      newChecklist(),
      [{ key: 'BACKGROUND_CHECK', label: 'Background check', purpose: 'COMPLIANCE', required: true }],
      'Northbend Athletic'
    )
    const added = folded.find((i) => i.key === 'BACKGROUND_CHECK')!
    expect(added.answers).toEqual(['BACKGROUND_CHECK'])
    expect(added.says).toContain('Northbend Athletic')

    // And the desk is not even asked for the two dates, because the two
    // dates were never the thing standing between it and a row.
    expect(wantsDates(added)).toBe(false)

    const verdict = verificationFromChecklistItem(
      { ...added, state: 'HELD', validFrom: '2026-03-12', validUntil: '2027-03-12' },
      'veritan',
      by
    )
    expect(verdict.ok).toBe(false)
    expect(verdict.rows).toEqual([])
    expect(verdict.says).toContain('screening company')
  })

  it('a whole checklist replayed at approval writes the certificates and reports the verdicts it left alone', () => {
    const { rows, skipped } = verificationsFromChecklist(
      [
        item(),
        item({ key: 'BACKGROUND', label: 'Background check', answers: ['BACKGROUND_CHECK'] }),
      ],
      'veritan',
      by
    )
    expect(rows.map((r) => r.type)).toEqual(['INSURANCE_GL', 'INSURANCE_WC'])
    // Reported rather than dropped: a desk that is told nothing assumes
    // it did the whole job.
    expect(skipped.map((s) => s.key)).toEqual(['BACKGROUND'])
    expect(skipped[0].needsDates).toBe(false)
    expect(skipped[0].says).toContain('screening company')
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

  // ── The keys the map had never heard of, 2026-09-22 ─────────────────
  //
  // `checkKindOf` has recognized PASSPORT and DRIVERS_LICENSE as an
  // IDENTITY check since it was written, and `VERIFICATION_TYPE` has no
  // row for either — so the key was filtered out before anybody asked
  // whose check it was, and the item fell to the sentence that says
  // nothing expires. A passport has an expiry date printed on the front
  // of it. Found on the release walk; it cannot arise on the shipped
  // walk, only on an item a client's own order added.

  it('a passport a desk marks verified is not called a check with nothing to expire, because a passport runs out', () => {
    const verdict = verificationFromChecklistItem(
      item({ key: 'PASSPORT', label: 'Passport', answers: ['PASSPORT'], validFrom: null, validUntil: null }),
      'veritan',
      by
    )
    expect(verdict.ok).toBe(false)
    expect(verdict.says).not.toContain('nothing here expires')
    expect(verdict.says).not.toContain('this desk\u2019s own check')
  })

  it('a passport is the employer of record\u2019s to look at, and the refusal names them rather than blaming the desk', () => {
    const verdict = verificationFromChecklistItem(
      item({ key: 'PASSPORT', label: 'Passport', answers: ['PASSPORT'] }),
      'veritan',
      by
    )
    expect(verdict.ok).toBe(false)
    expect(verdict.says).toContain('employer of record')
    expect(verdict.says).toContain('running its own')
    // And never the two date fields, because the desk is being told not
    // to start this one rather than to finish it.
    expect(verdict.needsDates).toBe(false)
  })

  it('a driver\u2019s license is answered the same way, because one table says who renders a check and this file asks it', () => {
    const verdict = verificationFromChecklistItem(
      item({ key: 'DRIVERS_LICENSE', label: 'Driver\u2019s license', answers: ['DRIVERS_LICENSE'] }),
      'veritan',
      by
    )
    expect(verdict.ok).toBe(false)
    expect(whoRendersCheck(checkKindOf('DRIVERS_LICENSE')!).renders).toBe('EMPLOYER')
    expect(verdict.says).toContain('employer of record')
  })

  it('a document type this client invented is told the compliance record has no room for it, not that it never expires', () => {
    // The required set is deliberately open-ended, so a client whose
    // orders ask its suppliers for a hot floor induction folds that onto
    // the same checklist. `Verification.type` is an enum and a company's
    // dictionary is not, so nothing can be written — and the desk is
    // told that, so it knows the expiry is somebody\u2019s to watch by hand.
    const verdict = verificationFromChecklistItem(
      item({ key: 'HOT_FLOOR_INDUCTION', label: 'Hot floor induction', answers: ['HOT_FLOOR_INDUCTION'] }),
      'veritan',
      by
    )
    expect(verdict.ok).toBe(false)
    expect(verdict.needsDates).toBe(false)
    expect(verdict.says).toContain('no type for it')
    expect(verdict.says).toContain('somewhere else')
    expect(verdict.says).not.toContain('nothing here expires')
  })

  it('a signed agreement is told it lives with the agreement, which is where it is chased from', () => {
    const verdict = verificationFromChecklistItem(
      item({ key: 'AGREEMENT', label: 'Signed agreement', answers: ['MSA'] }),
      'veritan',
      by
    )
    expect(verdict.ok).toBe(false)
    expect(verdict.says).toContain('lives with the agreement')
    expect(verdict.says).not.toContain('nothing here expires')
  })

  it('a check the desk ran itself keeps the sentence that is true of it, and only of it', () => {
    // The one item that really has nothing to expire: no document type
    // behind it at all.
    const verdict = verificationFromChecklistItem(
      item({ key: 'VENDOR_SCREENING', label: 'Vendor screening (sanctions, litigation)', answers: [] }),
      'veritan',
      by
    )
    expect(verdict.ok).toBe(false)
    expect(verdict.says).toContain('nothing here expires')
  })

  it('a pack holding a certificate and a passport records the certificate and leaves the passport to the employer', () => {
    const verdict = verificationFromChecklistItem(
      item({ key: 'PACK', label: 'Onboarding pack', answers: ['INSURANCE_GL', 'PASSPORT'] }),
      'veritan',
      by
    )
    expect(verdict.ok).toBe(true)
    expect(verdict.rows.map((r) => r.type)).toEqual(['INSURANCE_GL'])
    expect(verdict.says).toContain('Passport')
    expect(verdict.says).toContain('not this desk\u2019s to render')
  })
})
