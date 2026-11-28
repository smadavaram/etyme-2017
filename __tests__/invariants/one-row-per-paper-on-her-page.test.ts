import { describe, it, expect } from 'vitest'
import { paperNames } from '@/lib/document-stages/paper-names'
import { myPapers, typeKeyForTemplate, type OutstandingItem, type SentDocument } from '@/lib/document-request'

/**
 * Walk 7, 2026-11-08, item 2: Samuel Adeyinka's own page listed his NDA
 * as "Non-disclosure agreement · Not on file" and as "Signed
 * non-disclosure agreement · Asked for", because the placement asks for
 * it in the start packet's words and the line's set names it in the
 * dictionary's. One paper per firm that asked is one row.
 */
const owedNda = { key: 'NDA', label: 'Non-disclosure agreement', owedBy: 'WORKER', owedByName: 'Samuel Adeyinka', stopsWork: false, state: 'MISSING', word: 'Not on file', asked: 'asked of every employee as standard paperwork', ranOutOn: null, waivedSays: null, hers: true } as unknown as OutstandingItem
const sent = (id: string, firm: string): SentDocument => ({ id, status: 'SENT', templateName: 'Signed non-disclosure agreement', needsSignature: false, issuerName: firm, sentAt: new Date('2026-11-08T00:00:00Z'), signedAt: null })

describe('one row per paper per firm that asked, on the worker’s own page', () => {
  it('a request the placement opened as “Signed non-disclosure agreement” is read as the NDA she owes, by a name the product gave it and never by a guess', () => {
    // Since 2026-11-08 the one door knows every name the product gives a kind.
    expect(typeKeyForTemplate('Signed non-disclosure agreement', [{ key: 'NDA', label: 'Non-disclosure agreement' }], { guess: false })).toBe('NDA')
    expect(typeKeyForTemplate('Signed non-disclosure agreement', paperNames([{ key: 'NDA', label: 'Non-disclosure agreement' }]), { guess: false })).toBe('NDA')
  })

  it('a name nobody in the product gave a kind is still read as nothing', () => {
    expect(typeKeyForTemplate('Mutual NDA 2026', paperNames([{ key: 'NDA', label: 'Non-disclosure agreement' }]), { guess: false })).toBeNull()
  })

  it('a firm’s own name for a kind wins over the product’s', () => {
    expect(typeKeyForTemplate('Signed non-disclosure agreement', paperNames([{ key: 'CLIENT_NDA', label: 'Signed non-disclosure agreement' }]), { guess: false })).toBe('CLIENT_NDA')
  })

  it('the NDA one firm asked for is one row on her page, saying that firm asked', () => {
    const rows = myPapers({ myEmail: null, documents: [sent('doc-1', 'Halcyon Talent')], packets: [], owed: [owedNda], asksByKey: { NDA: 'doc-1' } })
    const ndas = rows.filter((r) => /non-disclosure/i.test(r.name))
    expect(ndas).toHaveLength(1)
    expect(ndas[0]).toMatchObject({ id: 'doc-1', askedBy: 'Halcyon Talent' })
  })

  it('the same paper asked by two firms is two rows, one for each firm that asked, never three', () => {
    const rows = myPapers({ myEmail: null, documents: [sent('doc-1', 'Halcyon Talent'), sent('doc-2', 'Brightmoor Staffing')], packets: [], owed: [owedNda], asksByKey: { NDA: 'doc-1' } })
    const ndas = rows.filter((r) => /non-disclosure/i.test(r.name))
    expect(ndas.map((r) => r.askedBy).sort()).toEqual(['Brightmoor Staffing', 'Halcyon Talent'])
  })
})
