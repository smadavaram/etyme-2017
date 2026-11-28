import { describe, expect, it } from 'vitest'
import {
  newChecklist, markItem, withOrderedItems, attachToItem, needsSignedCopy, needsEdition, signedOnFile, readiness,
  type ChecklistItem,
} from '@/lib/supplier-onboarding'

/**
 * Found by the screen walk of 2026-10-22: supplier onboarding marked the
 * MSA and the NDA on file with no signed copy, and the W-9 was verified
 * with no edition recorded (lib/supplier-onboarding).
 */

const now = new Date('2026-10-22T12:00:00Z')
const item = (c: ChecklistItem[], key: string) => c.find((i) => i.key === key)!

describe('an agreement is on file only with the signed copy', () => {
  it('the signed agreement cannot be marked on file without the signed copy attached', () => {
    const r = markItem(newChecklist(), 'AGREEMENT', 'HELD', null, now)
    expect(r).toEqual({
      ok: false,
      code: 'NEEDS_SIGNED_COPY',
      message: 'The signed agreement is on file only with the copy both firms signed. Attach the signed copy, then mark it on file.',
    })
  })

  it('an NDA a client’s orders ask for cannot be marked on file without the signed copy', () => {
    const c = withOrderedItems(newChecklist(), [{ key: 'NDA', label: 'Non-disclosure agreement', purpose: 'AGREEMENT', required: true }], 'Talvern Medical')
    expect(needsSignedCopy(item(c, 'NDA'))).toBe(true)
    const r = markItem(c, 'NDA', 'HELD', null, now)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.message).toBe('Non-disclosure agreement is on file only with the copy both firms signed. Attach the signed copy, then mark it on file.')
  })

  it('a client’s own agreement type is treated as an agreement without a case added for it', () => {
    const c = withOrderedItems(newChecklist(), [{ key: 'SITE_CONDUCT_AGREEMENT', label: 'Site conduct agreement', purpose: 'AGREEMENT', required: true }], 'Cavanaugh Glassworks')
    expect(needsSignedCopy(item(c, 'SITE_CONDUCT_AGREEMENT'))).toBe(true)
  })

  it('a desk attaches the signed copy, the item reads as received, and then it may be marked on file', () => {
    const attached = attachToItem(newChecklist(), 'AGREEMENT', { fileName: 'Harbor-MSA-signed.pdf', fileUrl: '/api/documents/doc1/file' }, now)
    expect(item(attached, 'AGREEMENT')).toMatchObject({ state: 'PROVIDED', fileName: 'Harbor-MSA-signed.pdf', fileUrl: '/api/documents/doc1/file' })
    const r = markItem(attached, 'AGREEMENT', 'HELD', null, now)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(signedOnFile(item(r.checklist, 'AGREEMENT'))).toBe(true)
  })

  it('an agreement marked on file before the copy was required does not read as signed', () => {
    const legacy = newChecklist().map((i) => (i.key === 'AGREEMENT' ? { ...i, state: 'HELD' as const } : i))
    expect(signedOnFile(item(legacy, 'AGREEMENT'))).toBe(false)
  })

  it('an agreement may still be waived with a reason, without a copy', () => {
    expect(markItem(newChecklist(), 'AGREEMENT', 'WAIVED', 'Papered under the prime’s agreement with the client.', now).ok).toBe(true)
  })

  it('a certificate is not asked for a signed copy, only for its dates', () => {
    expect(needsSignedCopy(item(newChecklist(), 'INSURANCE'))).toBe(false)
  })
})

describe('the W-9 is verified with the edition printed on it', () => {
  it('the W-9 cannot be marked verified without the edition printed on it', () => {
    const c = newChecklist()
    expect(needsEdition(item(c, 'TAX_FORM'))).toBe(true)
    const r = markItem(c, 'TAX_FORM', 'HELD', null, now)
    expect(r).toEqual({
      ok: false,
      code: 'NEEDS_EDITION',
      message: 'Say which edition of the tax form was signed before you verify it. The revision date printed at the top left of the W-9, such as “Rev. March 2024”.',
    })
  })

  it('the W-9’s edition is kept on the checklist with the verdict, and cleared when the verdict is undone', () => {
    const r = markItem(newChecklist(), 'TAX_FORM', 'HELD', null, now, undefined, 'Rev. March 2024')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(item(r.checklist, 'TAX_FORM')).toMatchObject({ state: 'HELD', edition: 'Rev. March 2024' })
    const undone = markItem(r.checklist, 'TAX_FORM', 'MISSING', null, now)
    expect(undone.ok && item(undone.checklist, 'TAX_FORM').edition).toBeNull()
  })

  it('Finance may say yes once the W-9 carries its edition and the bank details are verified', () => {
    let c = newChecklist()
    const w9 = markItem(c, 'TAX_FORM', 'HELD', null, now, undefined, 'Rev. March 2024')
    if (!w9.ok) throw new Error(w9.message)
    const bank = markItem(w9.checklist, 'BANK', 'HELD', null, now)
    if (!bank.ok) throw new Error(bank.message)
    c = bank.checklist
    expect(readiness('Harbor Staffing', c, 'FINANCE').ok).toBe(true)
  })

  it('bank details are not a form with an edition', () => {
    expect(needsEdition(item(newChecklist(), 'BANK'))).toBe(false)
  })
})
