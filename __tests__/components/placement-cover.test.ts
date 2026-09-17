import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CoverChip,
  SubVendorCover,
  coverStandingLabel,
  coverStandingChipClass,
  type CoverCertificateRow,
} from '@/components/cover-standing'
import { standingOf, supplierCoverGate, coverLabel } from '@/lib/document-stages'

/**
 * Station 5 of the placement thread — "Cleared to work" — as a reader sees it.
 *
 * The arithmetic was fixed on 2026-09-16 and the screen went on printing
 * the stored status, so a certificate whose cover begins in October read
 * "clear" on the thread while the submission door refused it the same
 * afternoon. The API computed a standing, a sentence and a whole
 * sub-vendor verdict; the page rendered none of them.
 *
 * These tests render the chip and the verdict rather than re-deriving
 * their logic, because the gap was never in the arithmetic — it was
 * between the arithmetic and the screen.
 */

const TODAY = new Date('2026-09-17T00:00:00Z')
const inDays = (n: number) => new Date(TODAY.getTime() + n * 86_400_000)

/** What a person actually reads: markup with the tags and entities taken out. */
function text(markup: string): string {
  return markup
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

const chip = (cover: CoverCertificateRow) => renderToStaticMarkup(createElement(CoverChip, { cover }))

/** A certificate on file for cover that begins three weeks from today. */
const NOT_STARTED: CoverCertificateRow = {
  type: 'INSURANCE_GL',
  status: 'CLEAR',
  validFrom: inDays(21).toISOString(),
  expiresAt: inDays(386).toISOString(),
  standing: 'NOT_YET_VALID',
  says:
    'Certificate of general liability insurance is on file but does not start until ' +
    '2026-10-08 — 21 days away. It does not cover today.',
}

describe('a certificate that covers nobody today does not read as clear on the placement thread', () => {

  it('a sub-vendor certificate that has not started yet reads "Not started yet"', () => {
    expect(text(chip(NOT_STARTED))).toContain('Not started yet')
  })

  it('and it carries the blocked tone, the same tone as cover that has lapsed', () => {
    expect(chip(NOT_STARTED)).toContain('chip--danger')
    expect(coverStandingChipClass({ ...NOT_STARTED, standing: 'EXPIRED' })).toBe('chip--danger')
  })

  it('and the word "Clear" appears nowhere on that row', () => {
    const markup = chip(NOT_STARTED)
    expect(text(markup)).not.toMatch(/clear/i)
    expect(markup).not.toMatch(/clear/i)
  })

  it('and it says the day the cover begins, which is the date somebody can act on', () => {
    // The day, not the month it runs out in. Matched loosely because the
    // formatter reads the machine's own zone, and a test that fails in
    // Denver and passes in London is worse than no test.
    expect(text(chip(NOT_STARTED))).toMatch(/starts Oct \d{1,2}/)
  })

  it('the sentence the system computed is what a person reads when they hover the chip', () => {
    expect(chip(NOT_STARTED)).toContain('does not start until')
  })

  it('and nothing on that chip tells anybody to renew a policy that has not begun', () => {
    expect(chip(NOT_STARTED).toLowerCase()).not.toContain('renew')
  })
})

describe('the other standings keep their own tone, so a good certificate is not gray', () => {

  const valid: CoverCertificateRow = {
    type: 'INSURANCE_WC', status: 'CLEAR',
    validFrom: inDays(-200).toISOString(), expiresAt: inDays(160).toISOString(),
    standing: 'VALID', says: "Certificate of workers' compensation is valid for 160 more days.",
  }

  it('cover that is in date reads as verified, not as a chip nobody looks at', () => {
    expect(coverStandingChipClass(valid)).toBe('chip--verified')
    expect(text(chip(valid))).toContain('Clear')
  })

  it('cover running out inside the warning window asks for attention rather than blocking', () => {
    const expiring = { ...valid, standing: 'EXPIRING' }
    expect(coverStandingLabel(expiring)).toBe('Expiring')
    expect(coverStandingChipClass(expiring)).toBe('chip--attention')
  })

  it('cover on file with no expiry recorded says exactly that, because an unknown expiry passes every check', () => {
    const noExpiry = { ...valid, expiresAt: null, standing: 'NO_EXPIRY_RECORDED' }
    expect(coverStandingLabel(noExpiry)).toBe('No expiry recorded')
    expect(coverStandingChipClass(noExpiry)).toBe('chip--attention')
  })

  it('cover that has lapsed reads "Lapsed", the word the compliance page uses', () => {
    expect(coverStandingLabel({ ...valid, standing: 'EXPIRED' })).toBe('Lapsed')
  })

  it('and the placement thread never invents a word the compliance page does not use for the same state', () => {
    // Two screens naming one state differently is its own bug, and the
    // cheapest way to catch it is to read the other screen.
    const compliance = readFileSync(
      join(process.cwd(), 'src/app/dashboard/compliance/page.tsx'), 'utf8'
    )
    for (const word of ['Not started yet', 'Lapsed', 'Expiring', 'No expiry recorded']) {
      expect(compliance, `the compliance page does not say "${word}"`).toContain(word)
    }
  })
})

describe('the verdict on the firm below us reaches the screen', () => {

  // The same gate the submission door calls, on the same facts.
  const gate = supplierCoverGate({
    supplierName: 'Brightmoor Talent',
    clientName: 'Nike',
    certificates: [
      { type: 'INSURANCE_GL', status: 'CLEAR', issuedAt: inDays(-2), validFrom: inDays(21), expiresAt: inDays(386), verifiedAt: inDays(-2) },
      { type: 'INSURANCE_WC', status: 'CLEAR', issuedAt: inDays(-200), validFrom: inDays(-200), expiresAt: inDays(160), verifiedAt: inDays(-200) },
    ],
    on: TODAY,
  })
  const verdict = renderToStaticMarkup(
    createElement(SubVendorCover, {
      cover: { vendor: 'Brightmoor Talent', outcome: gate.outcome, says: gate.says, fix: gate.fix },
    })
  )

  it('a supplier is asked, by name, whether the firm below it could still supply today', () => {
    expect(text(verdict)).toContain('Can Brightmoor Talent still supply today?')
  })

  it('and where the cover does not hold, the answer on the screen is no', () => {
    expect(gate.outcome).toBe('BLOCK')
    expect(text(verdict)).toContain('No — cover does not hold today')
    expect(verdict).toContain('chip--danger')
  })

  it('and the sentence the gate computed is printed as computed, not paraphrased', () => {
    expect(text(verdict)).toContain(text(gate.says))
  })

  it('and the remedy is printed with it, so the reader knows what to do next', () => {
    expect(gate.fix).toBeTruthy()
    expect(text(verdict)).toContain(text(gate.fix!))
  })

  it('and nowhere does the screen tell this supplier to renew cover that has not begun', () => {
    expect(text(verdict).toLowerCase()).not.toContain('renew')
    expect(text(verdict).toLowerCase()).not.toContain('back in date')
  })

  it('a firm whose cover holds is told so, rather than shown a blank', () => {
    const clear = supplierCoverGate({
      supplierName: 'Vertex Talent',
      clientName: 'Nike',
      certificates: [
        { type: 'INSURANCE_GL', status: 'CLEAR', issuedAt: inDays(-200), validFrom: inDays(-200), expiresAt: inDays(160), verifiedAt: inDays(-200) },
        { type: 'INSURANCE_WC', status: 'CLEAR', issuedAt: inDays(-200), validFrom: inDays(-200), expiresAt: inDays(160), verifiedAt: inDays(-200) },
      ],
      on: TODAY,
    })
    const markup = renderToStaticMarkup(
      createElement(SubVendorCover, {
        cover: { vendor: 'Vertex Talent', outcome: clear.outcome, says: clear.says, fix: clear.fix },
      })
    )
    expect(clear.outcome).toBe('PASS')
    expect(markup).toContain('chip--verified')
    expect(text(markup)).toContain("Vertex Talent's cover is on file and in date")
  })

  it('and a placement with nobody below it draws no verdict at all, because that is a fact and not a gap', () => {
    expect(renderToStaticMarkup(createElement(SubVendorCover, { cover: null }))).toBe('')
  })
})

describe('the chip reads the standing the API computed, not the status somebody typed', () => {

  it('a row stored as clear whose policy starts next month is judged by the standing, not the status', () => {
    // The API computes this with standingOf; the chip must not second-guess it.
    const computed = standingOf(
      { key: 'INSURANCE_GL', label: coverLabel('INSURANCE_GL'), issuedAt: inDays(-2), validFrom: inDays(21), expiresAt: inDays(386), verifiedAt: inDays(-2) },
      { key: 'INSURANCE_GL', label: coverLabel('INSURANCE_GL'), validMonths: 12 },
      TODAY
    )
    const row: CoverCertificateRow = {
      type: 'INSURANCE_GL', status: 'CLEAR',
      validFrom: inDays(21).toISOString(), expiresAt: inDays(386).toISOString(),
      standing: computed.standing, says: computed.says,
    }
    expect(computed.standing).toBe('NOT_YET_VALID')
    expect(text(chip(row))).toContain('Not started yet')
    expect(text(chip(row))).not.toMatch(/clear/i)
  })

  it('and where no standing was computed at all, the chip falls back to the stored status rather than going silent', () => {
    const row: CoverCertificateRow = { type: 'INSURANCE_EO', status: 'PENDING', standing: null, says: null }
    expect(coverStandingLabel(row)).toBe('Pending')
    expect(text(chip(row))).toContain('Errors and omissions cover · Pending')
  })
})
