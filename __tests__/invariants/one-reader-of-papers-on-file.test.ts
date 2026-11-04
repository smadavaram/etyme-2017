import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  heldAbout, heldAcross, heldOnRecord, paperInstancesWhere, isAuthorizationFor, authorizationOnRecord,
  type PapersOnRecord, type PaperOnFile,
} from '@/lib/document-stages/paper-record'
import { resolveItems, type PacketSpec } from '@/lib/packets'
import { mayAct, myPapers, type SentDocument } from '@/lib/document-request'
import { itemsAlreadyOnRecord } from '@/app/api/packets/backfill'
import { heldFrom } from '@/lib/contract-clearance'

/**
 * The release walk on f2f342723 (2026-11-03): an undertaking accepted on
 * Paperwork read "on file" on Omar Haddad's placement, was asked for again
 * by a fresh request and was owed on Compliance. One reader now says what
 * is on file for a person and a line, and every door reads through it.
 */

const NOW = new Date('2026-11-03T12:00:00Z')
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

const paper = (over: Partial<PaperOnFile>): PaperOnFile => ({
  id: 'd1', status: 'UPLOADED', validFrom: null, expiresAt: null, signedAt: new Date('2026-11-02T10:00:00Z'), countersignedAt: null,
  sellContractId: null, buyContractId: null, subjectType: 'PERSON', subjectId: 'omar',
  template: { name: 'Confidentiality undertaking', needsSignature: false }, ...over,
})
const TYPES = [{ key: 'CONFIDENTIALITY', label: 'Confidentiality undertaking' }, { key: 'NDA', label: 'Non-disclosure agreement' }]

describe('one reader of what is on file for a person and a line', () => {
  it('a paper accepted on Paperwork is on file on the placement, in a fresh request and on Compliance, in one read', () => {
    const record: PapersOnRecord = { papers: [paper({})], accepted: [] }
    const held = heldAbout(record, { personId: 'omar', companyIds: ['brightmoor'], types: TYPES })
    expect(held.map((h) => h.key)).toEqual(['CONFIDENTIALITY'])
    // A fresh request reads it the same way, and does not ask again.
    const spec = { items: [{ key: 'CONFIDENTIALITY', label: 'Confidentiality undertaking', hint: '', required: true, validMonths: null }] } as unknown as PacketSpec
    expect(resolveItems(spec, held, NOW)[0].state).toBe('ALREADY_HELD')
    // And each door reads through the one reader.
    expect(read('src/lib/contract-clearance.ts')).toContain('heldAbout(')
    expect(read('src/lib/contract-clearance.ts').match(/paperInstancesWhere\(/g)?.length).toBe(2)
    expect(read('src/app/api/packets/route.ts')).toContain('heldOnRecord(')
    expect(read('src/app/api/compliance/route.ts')).toMatch(/lineExtrasForSellLines\(lines\.map/)
    expect(read('src/app/api/compliance/route.ts')).not.toContain('where: { sellContractId: { in: lines.map((l) => l.id) } }')
  })

  it('a supplier’s NDA with its client is on file for every line between them, and for no other firm', () => {
    const record: PapersOnRecord = { papers: [paper({ subjectType: 'COMPANY', subjectId: 'brightmoor', template: { name: 'Non-disclosure agreement', needsSignature: true }, status: 'SIGNED' })], accepted: [] }
    expect(heldAbout(record, { personId: 'omar', companyIds: ['brightmoor', 'northbend'], types: TYPES }).map((h) => h.key)).toEqual(['NDA'])
    expect(heldAbout(record, { personId: 'omar', companyIds: ['veritan'], types: TYPES })).toEqual([])
  })

  it('a paper another firm’s request accepted stands on that firm’s lines only', () => {
    const record: PapersOnRecord = { papers: [], accepted: [{ key: 'NDA', state: 'ACCEPTED', validUntil: null, personId: 'omar', companyId: 'brightmoor' }] }
    expect(heldAbout(record, { personId: 'omar', companyIds: ['brightmoor'] }).map((h) => h.key)).toEqual(['NDA'])
    expect(heldAbout(record, { personId: 'omar', companyIds: ['techpeple'] })).toEqual([])
  })

  it('the papers read are the signed and the sent, against the line, about the person and about either firm', () => {
    const where = paperInstancesWhere({ sellContractIds: ['s1'], personIds: ['omar'], companyIds: ['brightmoor'] }) as { status: { in: string[] }; OR: unknown[] }
    expect(where.status.in).toEqual(['SIGNED', 'UPLOADED'])
    expect(where.OR).toHaveLength(3)
  })
})

describe('the backfill reads open requests through the same reader', () => {
  it('the backfill closes a Nov 1 request whose papers are on the record', () => {
    const items = [
      { id: 'i1', key: 'CONFIDENTIALITY', label: 'Confidentiality undertaking' },
      { id: 'i2', key: 'BACKGROUND_CHECK', label: 'Background check' },
      { id: 'i3', key: 'DRUG_SCREENING', label: 'Drug screening' },
    ]
    const held = [
      { key: 'CONFIDENTIALITY', validFrom: null, expiresAt: null, accepted: true },
      { key: 'BACKGROUND_CHECK', validFrom: new Date('2026-10-01'), expiresAt: new Date('2027-10-01'), accepted: true },
    ]
    const closed = itemsAlreadyOnRecord(items, held, [{ id: 'v-bg', type: 'BACKGROUND_CHECK' }], NOW)
    expect(closed.map((c) => [c.item.key, c.verificationId])).toEqual([['CONFIDENTIALITY', null], ['BACKGROUND_CHECK', 'v-bg']])
    expect(closed[0].note).toMatch(/^Already on the record when this was asked: on file/)
  })

  it('a screening company’s check held with no recorded check behind it is not closed by the backfill', () => {
    const items = [{ id: 'i2', key: 'BACKGROUND_CHECK', label: 'Background check' }]
    expect(itemsAlreadyOnRecord(items, [{ key: 'BACKGROUND_CHECK', validFrom: null, expiresAt: null, accepted: true }], [], NOW)).toEqual([])
  })
})

describe('the person’s authorization for a check is read off the record', () => {
  it('a drug screening authorization is the authorization for a drug screen, and not for a background check', () => {
    expect(isAuthorizationFor('DRUG_SCREENING', 'Drug screening authorization')).toBe(true)
    expect(isAuthorizationFor('BACKGROUND_CHECK', 'Drug screening authorization')).toBe(false)
    expect(isAuthorizationFor('BACKGROUND_CHECK', 'Background check disclosure and authorization')).toBe(true)
    expect(isAuthorizationFor('BACKGROUND_CHECK', 'Background check details')).toBe(false)
  })

  it('a verdict accepted an hour after the person’s authorization was accepted on Paperwork names that authorization', async () => {
    const accepted = new Date('2026-11-02T09:00:00Z')
    const db = {
      packetItem: { findMany: async () => [] },
      docInstance: {
        findMany: async () => [
          { status: 'UPLOADED', signedAt: new Date('2026-11-01T09:00:00Z'), examinedAt: accepted, template: { name: 'Drug screening authorization' } },
          { status: 'UPLOADED', signedAt: new Date('2026-11-02T08:00:00Z'), examinedAt: null, template: { name: 'Background check authorization' } },
        ],
      },
    }
    expect(await authorizationOnRecord('omar', 'DRUG_SCREENING', db as never)).toEqual(new Date('2026-11-01T09:00:00Z'))
    // A file that arrived and nobody looked at is not yet the authorization.
    expect(await authorizationOnRecord('omar', 'BACKGROUND_CHECK', db as never)).toBeNull()
    for (const door of ['src/app/api/packets/examination.ts', 'src/app/api/compliance/verifications/route.ts']) {
      expect(read(door), door).toContain('authorizationOnRecord(')
    }
  })
})

describe('the worker is told what is true about her own papers', () => {
  it('after the worker’s upload she is told it was received and who will look at it, never that it is on file', () => {
    const v = mayAct('upload',
      { status: 'SENT', templateName: 'I-9 and E-Verify', needsSignature: false, subjectPersonId: 'omar', issuerName: 'Brightmoor Staffing' },
      { personId: 'omar', staffOfIssuer: false },
      { fileUrl: 'file://on-record' })
    expect(v).toMatchObject({ ok: true, says: 'I-9 and E-Verify received. Thank you. Brightmoor Staffing will look at it before it counts.' })
    expect(v.ok && v.says).not.toMatch(/on file/)
  })

  it('her own page reads an upload the firm examined as on file, and what her firms accepted through a request, as the placement does', () => {
    const src = read('src/app/api/me/papers/route.ts')
    expect(src).toContain("accepted: r.status === 'SIGNED' || (r.status === 'UPLOADED' && !!r.examinedAt)")
    expect(src).toContain('heldOnRecord({ personId, firms: [], lines, examinedOnly: true })')
  })
})

// ── The fourth screen walk (2026-11-03), R1, R1b and R3 ────────────────
//
// Rosa Delgado's product confidentiality undertaking is Brightmoor's paper
// on file, and the type it answers is Northbend's, named on Northbend's
// order. The placement reads it with both firms' names; the request, the
// backfill and the worker's page now read it the same way.

const UNDERTAKING = paper({
  id: 'u1', subjectId: 'rosa', status: 'SIGNED', buyContractId: null, sellContractId: null,
  template: { name: 'Product confidentiality undertaking', needsSignature: true },
})
const NORTHBEND_TYPES = [{ companyId: 'northbend', key: 'PRODUCT_CONFIDENTIALITY', label: 'Product confidentiality undertaking' }]
const BRIGHTMOOR_TYPES = [{ companyId: 'brightmoor', key: 'W2_NDA', label: 'Brightmoor NDA' }]
const ROSA_LINE = { sellContractId: 's-rosa', firms: ['brightmoor', 'northbend'] }

describe('a fresh request, the backfill and the worker read what the placement reads', () => {
  it('a paper the client named, accepted by the supplier on Paperwork, is skipped by a fresh request for that line', () => {
    const record: PapersOnRecord = { papers: [UNDERTAKING], accepted: [] }
    // Brightmoor asks; the line it shares with Rosa is Northbend's too.
    const held = heldAcross(record, [...NORTHBEND_TYPES, ...BRIGHTMOOR_TYPES], { personId: 'rosa', firms: ['brightmoor'], lines: [ROSA_LINE] })
    expect(held.map((h) => h.key)).toContain('PRODUCT_CONFIDENTIALITY')
    const spec = { items: [{ key: 'PRODUCT_CONFIDENTIALITY', label: 'Product confidentiality undertaking', hint: '', required: true, validMonths: null }] } as unknown as PacketSpec
    expect(resolveItems(spec, held, NOW)[0].state).toBe('ALREADY_HELD')
    // With only the asking firm's names, the old read, it matched nothing.
    expect(heldAbout(record, { personId: 'rosa', companyIds: ['brightmoor'], types: BRIGHTMOOR_TYPES }).map((h) => h.key)).not.toContain('PRODUCT_CONFIDENTIALITY')
  })

  it('the request builder and the placement read one answer for every paper on the line’s set', () => {
    const record: PapersOnRecord = {
      papers: [
        UNDERTAKING,
        paper({ id: 'n1', subjectType: 'COMPANY', subjectId: 'brightmoor', status: 'SIGNED', template: { name: 'Brightmoor NDA', needsSignature: true } }),
        paper({ id: 'x1', subjectId: 'rosa', status: 'SIGNED', sellContractId: 's-rosa', template: { name: 'Site safety induction', needsSignature: false } }),
      ],
      accepted: [{ key: 'NDA', state: 'ACCEPTED', validUntil: null, personId: 'rosa', companyId: 'brightmoor' }],
    }
    const types = [...NORTHBEND_TYPES, ...BRIGHTMOOR_TYPES, { companyId: 'northbend', key: 'SITE_INDUCTION', label: 'Site safety induction' }]
    // The placement: per line, both firms' names (contract-clearance's read).
    const placement = heldAbout(record, {
      personId: 'rosa', companyIds: ROSA_LINE.firms, sellContractId: 's-rosa',
      types: types.map((t) => ({ key: t.key, label: t.label })),
    })
    const request = heldAcross(record, types, { personId: 'rosa', firms: ['brightmoor'], lines: [ROSA_LINE] })
    const keys = (h: { key: string }[]) => [...new Set(h.map((x) => x.key))].sort()
    expect(keys(request)).toEqual(keys(placement))
    expect(keys(placement)).toEqual(['NDA', 'PRODUCT_CONFIDENTIALITY', 'SITE_INDUCTION', 'W2_NDA'])
    // And the route reads it through the one reader, never the asking firm's names alone.
    const route = read('src/app/api/packets/route.ts')
    expect(route).toContain('linesOfPerson(subjectPersonId, { firm: caller.company.id })')
    expect(route).not.toMatch(/documentType\.findMany\(\{ where: \{ companyId: caller\.company\.id \}/)
  })

  it('heldOnRecord reads the names of every firm on the person’s lines, not only the asking firm’s', async () => {
    const asked: unknown[] = []
    const db = {
      packetItem: { findMany: async () => [] },
      docInstance: { findMany: async () => [UNDERTAKING] },
      documentType: { findMany: async (q: unknown) => { asked.push(q); return [...NORTHBEND_TYPES, ...BRIGHTMOOR_TYPES] } },
    }
    const held = await heldOnRecord({ personId: 'rosa', firms: ['brightmoor'], lines: [ROSA_LINE] }, db as never)
    expect(held.map((h) => h.key)).toContain('PRODUCT_CONFIDENTIALITY')
    expect(JSON.stringify(asked[0])).toContain('northbend')
  })

  it('the backfill closes a request item for the right to work and for the undertaking where the placement holds them', () => {
    const items = [
      { id: 'i1', key: 'RIGHT_TO_WORK', label: 'Proof of right to work' },
      { id: 'i2', key: 'PRODUCT_CONFIDENTIALITY', label: 'Product confidentiality undertaking' },
    ]
    const record: PapersOnRecord = { papers: [UNDERTAKING], accepted: [] }
    const held = [
      // Rajesh's I-9, a recorded check that stands in for the right to work,
      // read the way the backfill reads its checks.
      ...heldFrom([{ id: 'v-i9', type: 'I9_EVERIFY', status: 'CLEAR', issuedAt: new Date('2026-10-20'), validFrom: null, expiresAt: null, verifiedAt: new Date('2026-10-20') }] as never),
      ...heldAcross(record, NORTHBEND_TYPES, { personId: 'rosa', firms: ['brightmoor'], lines: [ROSA_LINE] }),
    ]
    const closed = itemsAlreadyOnRecord(items, held, [{ id: 'v-i9', type: 'I9_EVERIFY' }], NOW)
    expect(closed.map((c) => [c.item.key, c.verificationId])).toEqual([['RIGHT_TO_WORK', 'v-i9'], ['PRODUCT_CONFIDENTIALITY', null]])
    expect(read('src/app/api/packets/backfill.ts')).toContain('heldOnRecord({ personId, firms, lines })')
  })

  it('the worker’s page never lists as still needed a paper her placement reads as on file', () => {
    const request = {
      id: 'p1', label: 'W-2 start papers', askedBy: 'Brightmoor Staffing', recipientEmail: 'rosa@example.invalid', token: 't1',
      expiresAt: new Date('2026-11-20T00:00:00Z'), cancelledAt: null, createdAt: new Date('2026-11-03T09:00:00Z'), reason: null,
      items: [
        { id: 'i1', key: 'PRODUCT_CONFIDENTIALITY', label: 'Product confidentiality undertaking', state: 'PENDING', required: true, position: 0 },
        { id: 'i2', key: 'DRUG_SCREENING', label: 'Drug screening', state: 'PENDING', required: true, position: 1 },
      ],
    }
    const base = { documents: [] as SentDocument[], packets: [request], myEmail: 'rosa@example.invalid', held: [], owed: [], on: NOW } as unknown as Parameters<typeof myPapers>[0]
    const shown = (onFileKeys?: string[]) => myPapers({ ...base, onFileKeys }).map((p) => p.name)
    expect(shown()).toContain('Product confidentiality undertaking')
    expect(shown(['PRODUCT_CONFIDENTIALITY'])).not.toContain('Product confidentiality undertaking')
    expect(shown(['PRODUCT_CONFIDENTIALITY'])).toContain('Drug screening')
    // The route hands her page what is on file on her lines, read the placement's way.
    const src = read('src/app/api/me/papers/route.ts')
    expect(src).toContain('linesOfPerson(personId, { live: true })')
    expect(src).toContain('onFileKeys,')
  })
})
