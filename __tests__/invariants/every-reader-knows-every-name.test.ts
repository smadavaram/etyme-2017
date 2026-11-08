import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('@/lib/db', () => ({ prisma: {} }))

import { heldFromDocInstances, typeKeyForTemplate } from '@/lib/document-request'
import { BUILT_IN } from '@/lib/document-type'
import { PACKETS } from '@/lib/packets'
import { keyOfPaper } from '@/lib/document-stages/arrived-papers'
import { examineNeedsOf } from '@/lib/document-stages/examine-form'

/**
 * Walk 7, 2026-11-08: the product names one kind of paper two ways (the
 * NDA is "Non-disclosure agreement" in the dictionary and "Signed
 * non-disclosure agreement" in the start packet), and a reader that knew
 * only one of them chased, owed or listed as missing a paper already on
 * file. Every reader matches a paper to what is owed through one door,
 * `typeKeyForTemplate`, and that door knows every name the product writes
 * for a kind. Exact names only, never a guess.
 */
const src = (p: string) => readFileSync(join(__dirname, '../../src', p), 'utf8')
const dictionary = BUILT_IN.map((t) => ({ key: t.key, label: t.label }))
const line = (key: string) => [{ key, label: BUILT_IN.find((t) => t.key === key)!.label }]
const paper = (name: string) => ({ id: 'd', status: 'SIGNED', template: { name }, signedAt: new Date('2026-10-01T00:00:00Z') })

describe('every reader that matches a paper to what is owed knows every name the product gives it', () => {
  it('Paperwork and the examine route read the NDA asked as “Signed non-disclosure agreement” as the NDA, so its dialog asks for its dates', () => {
    const key = typeKeyForTemplate('Signed non-disclosure agreement', dictionary, { guess: false })
    expect(key).toBe('NDA')
    expect(examineNeedsOf(key!, false)).toMatchObject({ start: true, end: true })
  })

  it('the clearance, the request builder, Compliance, the nightly chase and the backfill hold a certificate of workers’ compensation named the way the start packet names it', () => {
    // These all read a line's set through heldFromDocInstances (via heldOnRecord).
    const held = heldFromDocInstances([paper("Certificate of workers' compensation")], line('INSURANCE_WC'))
    expect(held.map((h) => h.key)).toContain('INSURANCE_WC')
  })

  it('a straight and a curly apostrophe are one name', () => {
    expect(typeKeyForTemplate("Certificate of workers' compensation", line('INSURANCE_WC'), { guess: false })).toBe('INSURANCE_WC')
  })

  it('a paper that arrived as the start packet names it is read as arrived for the placement and for At your suppliers', () => {
    expect(keyOfPaper('Most recent I-94')).toBe('I94')
    expect(keyOfPaper('Passport biographic page')).toBe('PASSPORT')
  })

  it('every name a start packet writes for a paper is read back as that paper, with no other names given', () => {
    for (const p of PACKETS) for (const i of p.items) {
      expect(typeKeyForTemplate(i.label, [], { guess: false }), `${p.key}: ${i.label}`).toBe(i.key)
    }
  })

  it('a name nobody in the product gave a kind is still read as nothing when nothing may be guessed', () => {
    expect(typeKeyForTemplate('Mutual NDA 2026', dictionary, { guess: false })).toBeNull()
  })

  it('a firm’s own name for a kind wins over the product’s', () => {
    expect(typeKeyForTemplate('Signed non-disclosure agreement', [{ key: 'CLIENT_NDA', label: 'Signed non-disclosure agreement' }], { guess: false })).toBe('CLIENT_NDA')
  })

  it('every reader that matches a paper by name goes through the one door', () => {
    for (const f of [
      'app/api/me/papers/route.ts', 'app/api/documents/route.ts', 'app/api/documents/[id]/act.ts', 'app/api/documents/[id]/examine/route.ts',
      'lib/document-stages/arrived-papers.ts', 'lib/document-stages/paper-record.ts', 'lib/contract-clearance.ts',
    ]) expect(src(f), f).toMatch(/typeKeyForTemplate|heldFromDocInstances|keyOfPaper/)
    expect(src('lib/document-request.ts')).toMatch(/export function typeKeyForTemplate[\s\S]{0,1600}productNameKey\(/)
  })
})
