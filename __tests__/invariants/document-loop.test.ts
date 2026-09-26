import { describe, it, expect } from 'vitest'
import { contractClearance, startPreview } from '@/lib/contract-clearance'
import { effectiveRequirements, type RequirementRow } from '@/lib/document-requirements'
import { supplierCoverGate } from '@/lib/document-stages'
import { outboundPackByKey, packForLine } from '@/lib/outbound-pack'
import {
  myPapers,
  heldFromDocInstances,
  typeKeyForTemplate,
  type HeldRecord,
} from '@/lib/document-request'

/**
 * The loop of documents, and the places it used to crack.
 *
 * "Ensure the loop of documents never cracks between parties."
 * — the founder, 2026-09-21.
 *
 * Three desks each decided what a placement needed, their own way, in
 * three separate lists in the code. A client could not ask for one more
 * document on one role; a supplier's certificate of good standing could
 * lapse and refuse nothing; a required non-disclosure agreement sat as
 * "needed" for ever and moved no verdict at all; and a worker could not
 * see the day her own license runs out until a chase fired.
 *
 * These are the sentences that hold it shut.
 */

const ON = new Date('2026-09-21T00:00:00Z')
const inDays = (n: number) => new Date(ON.getTime() + n * 86_400_000)

const clear = (type: string, expiresAt: Date | null = null) => ({ type, status: 'CLEAR', expiresAt })
const gl = (expiresAt: Date) => ({ type: 'INSURANCE_GL', status: 'CLEAR', validFrom: inDays(-100), expiresAt, verifiedAt: inDays(-100) })
const wc = (expiresAt: Date) => ({ type: 'INSURANCE_WC', status: 'CLEAR', validFrom: inDays(-100), expiresAt, verifiedAt: inDays(-100) })
const insured = [gl(inDays(200)), wc(inDays(200))]
const signedNda = [{ key: 'NDA', expiresAt: null, accepted: true }]

const ORDER_SAYS = 'required by Cavanaugh Glassworks’ order PO-2026-2'

/** A row on the order, as it comes out of the database. */
const orderRow = (over: Partial<RequirementRow> & { documentTypeKey: string }): RequirementRow => ({
  id: `order-${over.documentTypeKey}`,
  required: true,
  owedBy: 'WORKER',
  blocks: null,
  inheritedFromId: null,
  note: null,
  waivedReason: null,
  waivedById: null,
  waivedAt: null,
  ...over,
})

/** The client's own document type, invented by the client and no migration. */
const INDUCTION = {
  key: 'HOT_FLOOR_INDUCTION',
  label: 'Hot floor induction',
  purpose: 'COMPLIANCE',
  validityShape: 'END_ONLY',
  validMonths: 12,
  suppliedBy: 'CANDIDATE',
  blocks: true,
}

function verdict(over: Partial<Parameters<typeof contractClearance>[0]> = {}) {
  return contractClearance({
    personName: 'Aisha Bello',
    personVerifications: [clear('I9_EVERIFY'), clear('BACKGROUND_CHECK', inDays(200))],
    supplierName: 'Wrenfield Technical',
    supplierCertificates: insured,
    clientName: 'Cavanaugh Glassworks',
    on: ON,
    extraHeld: signedNda,
    ...over,
  })
}

describe('a start reads what the line requires', () => {
  it('a start reads what the line requires, not a list in the code', () => {
    const items = effectiveRequirements({
      shape: 'W2',
      role: 'Furnace technician',
      orderRows: [orderRow({ documentTypeKey: 'HOT_FLOOR_INDUCTION', owedBy: 'WORKER' })],
      orderSays: ORDER_SAYS,
      documentTypes: [INDUCTION] as never,
    })

    const v = verdict({ requirements: items, documentTypes: [INDUCTION] as never })
    // The client invented the document last Tuesday. Nothing in this
    // repository has ever heard of a furnace floor induction, and the
    // start asks for it.
    expect(v.items.map((i) => i.key)).toContain('HOT_FLOOR_INDUCTION')
    // And the shipped floor is still under it: an order adds to the
    // federal form, it does not replace it.
    expect(v.items.map((i) => i.key)).toContain('I9_EVERIFY')
  })

  it('an item the order requires and nobody holds blocks the start and says whose order asked for it', () => {
    const items = effectiveRequirements({
      shape: 'W2',
      role: 'Furnace technician',
      orderRows: [orderRow({ documentTypeKey: 'HOT_FLOOR_INDUCTION', owedBy: 'WORKER' })],
      orderSays: ORDER_SAYS,
      documentTypes: [INDUCTION] as never,
    })

    const v = verdict({ requirements: items, documentTypes: [INDUCTION] as never })
    expect(v.outcome).toBe('BLOCK')
    expect(v.blocking.map((b) => b.key)).toContain('HOT_FLOOR_INDUCTION')
    // A refusal naming a document nobody at the supplier recognizes is a
    // refusal they ring us about. This one names the desk to ring.
    expect(v.says).toContain('Cavanaugh Glassworks’ order PO-2026-2')
  })

  it('an item waived on the record never blocks, and the waiver’s reason and the name travel with the verdict', () => {
    const items = effectiveRequirements({
      shape: 'W2',
      role: 'Furnace technician',
      orderRows: [orderRow({ documentTypeKey: 'BACKGROUND_CHECK' })],
      lineRows: [
        orderRow({
          id: 'line-bgc',
          documentTypeKey: 'BACKGROUND_CHECK',
          inheritedFromId: 'order-BACKGROUND_CHECK',
          waivedReason: 'The plant runs its own screening on every badge holder before a card is issued.',
          waivedById: 'p-noor',
          waivedAt: inDays(-55),
        }),
      ],
      orderSays: ORDER_SAYS,
      waiverNames: { 'p-noor': 'Noor Haddad' },
    })

    // Nothing on file, and the item was waived by a named person.
    const v = verdict({ personVerifications: [clear('I9_EVERIFY')], requirements: items })
    expect(v.blocking.map((b) => b.key)).not.toContain('BACKGROUND_CHECK')
    expect(v.chasing.map((c) => c.key)).not.toContain('BACKGROUND_CHECK')
    expect(v.waived.map((w) => w.key)).toContain('BACKGROUND_CHECK')
    expect(v.says).toContain('Noor Haddad')
    expect(v.says).toContain('badge holder')
  })

  it('work authorization cannot be waived, and a waiver on the row is refused in a sentence', () => {
    const items = effectiveRequirements({
      shape: 'W2',
      lineRows: [
        orderRow({
          id: 'line-i9',
          documentTypeKey: 'I9_EVERIFY',
          waivedReason: 'He starts Monday and the client has agreed.',
          waivedById: 'p-noor',
          waivedAt: inDays(-1),
        }),
      ],
      waiverNames: { 'p-noor': 'Noor Haddad' },
    })

    const v = verdict({ personVerifications: [], requirements: items })
    expect(v.outcome).toBe('BLOCK')
    expect(v.blocking.map((b) => b.key)).toContain('I9_EVERIFY')
    const i9 = v.items.find((i) => i.key === 'I9_EVERIFY')!
    expect(i9.note).toContain('cannot be')
    expect(i9.note).toContain('Nobody may agree to work without authorization')
  })
})

describe('the papers nobody could hold', () => {
  it('a required NDA nobody signed warns with a reason, and stops saying “needed” for ever', () => {
    const items = effectiveRequirements({
      shape: 'W2',
      orderRows: [orderRow({ documentTypeKey: 'NDA', owedBy: 'CUSTOMER' })],
      orderSays: ORDER_SAYS,
      names: { CUSTOMER: 'Cavanaugh Glassworks' },
    })

    const v = verdict({ requirements: items, extraHeld: [] })
    expect(v.outcome).toBe('WARN')
    expect(v.chasing.map((c) => c.key)).toContain('NDA')
    expect(v.says).toContain('The contract can start with a reason recorded.')
    expect(v.says).toContain('Cavanaugh Glassworks’ order PO-2026-2')
  })

  it('an NDA the shipped packet asks for and nobody ordered is still only listed, so no warning fires on every start', () => {
    // The other half of the same decision, and the reason it is safe.
    // A default is a floor, not somebody's decision, and there is still
    // nowhere to record the NDA the start packet lists. A warning that
    // fires on a hundred percent of placements is a click.
    const v = verdict({ extraHeld: [] })
    expect(v.items.map((i) => i.key)).toContain('NDA')
    expect(v.chasing.map((c) => c.key)).not.toContain('NDA')
    expect(v.outcome).toBe('PASS')
  })

  it('a signed paper is recognized by its own name, and one nobody named satisfies nothing', () => {
    expect(typeKeyForTemplate('Mutual non-disclosure agreement — 2026')).toBe('NDA')
    expect(typeKeyForTemplate('Non-compete and non-solicitation')).toBe('NCA')
    expect(typeKeyForTemplate('Employment agreement')).toBe('EMPLOYMENT_AGREEMENT')
    // The honest failure: a paper filed under a name nobody can read is
    // chased until somebody names it, rather than counting as the one
    // the line required.
    expect(typeKeyForTemplate('Form 7')).toBeNull()
    // A client's own dictionary is read first, by its own label.
    expect(typeKeyForTemplate('Hot floor induction', [{ key: 'HOT_FLOOR_INDUCTION', label: 'Hot floor induction' }]))
      .toBe('HOT_FLOOR_INDUCTION')
  })

  it('an agreement is held from the later of the two signatures, not from the first', () => {
    const [held] = heldFromDocInstances([
      {
        id: 'd1',
        status: 'SIGNED',
        signedAt: new Date('2026-03-01T00:00:00Z'),
        countersignedAt: new Date('2026-04-14T00:00:00Z'),
        expiresAt: new Date('2027-04-14T00:00:00Z'),
        template: { name: 'Mutual NDA' },
      },
    ])
    expect(held.key).toBe('NDA')
    expect(held.validFrom?.toISOString().slice(0, 10)).toBe('2026-04-14')
  })
})

describe('the firm’s standing to trade at all', () => {
  it('a supplier not in good standing cannot start anybody or put anybody forward', () => {
    const lapsed = [...insured, { type: 'GOOD_STANDING', status: 'CLEAR', validFrom: inDays(-400), expiresAt: inDays(-20), verifiedAt: inDays(-400) }]

    // Putting somebody forward.
    const gate = supplierCoverGate({ supplierName: 'Wrenfield Technical', certificates: lapsed, on: ON })
    expect(gate.outcome).toBe('BLOCK')
    expect(gate.says).toMatch(/good standing/i)

    // And starting them.
    const v = verdict({ supplierCertificates: lapsed })
    expect(v.outcome).toBe('BLOCK')
    expect(v.says).toMatch(/good standing/i)
  })

  it('a certificate of good standing nobody asked for and nobody filed stops nothing and is not mentioned', () => {
    const v = verdict()
    expect(v.outcome).toBe('PASS')
    expect(v.says).not.toMatch(/good standing/i)
  })

  it('a client’s order can insist on good standing, and then its absence is chased rather than ignored', () => {
    const items = effectiveRequirements({
      shape: 'SUB_VENDOR',
      orderRows: [orderRow({ documentTypeKey: 'GOOD_STANDING', owedBy: 'SUPPLIER' })],
      orderSays: ORDER_SAYS,
      names: { SUPPLIER: 'Wrenfield Technical' },
    })
    const v = verdict({ requirements: items })
    // Missing, not lapsed: at activation that is a chase, by the same
    // rule that downgrades cover nobody ever asked for.
    expect(v.outcome).toBe('WARN')
    expect(v.cover.chasing.map((c) => c.key)).toContain('GOOD_STANDING')
  })
})

describe('the same set, wherever it is read', () => {
  it('a W2 with no order gets the same verdict it got before the line learned to carry a set', () => {
    const before = verdict({ personVerifications: [clear('BACKGROUND_CHECK', inDays(200))] })
    const after = verdict({
      personVerifications: [clear('BACKGROUND_CHECK', inDays(200))],
      requirements: effectiveRequirements({ shape: 'W2' }),
    })
    expect(after.outcome).toBe(before.outcome)
    expect(after.says).toBe(before.says)
    expect(after.fix).toBe(before.fix)
    expect(after.items.map((i) => i.key)).toEqual(before.items.map((i) => i.key))
  })

  it('the preview the desk reads and the refusal the start gives are still the same sentences with a set on the line', () => {
    const requirements = effectiveRequirements({
      shape: 'W2',
      orderRows: [orderRow({ documentTypeKey: 'HOT_FLOOR_INDUCTION' })],
      orderSays: ORDER_SAYS,
      documentTypes: [INDUCTION] as never,
    })
    const refusal = verdict({ requirements, documentTypes: [INDUCTION] as never })
    const preview = startPreview({
      personName: 'Aisha Bello',
      personVerifications: [clear('I9_EVERIFY'), clear('BACKGROUND_CHECK', inDays(200))],
      supplierName: 'Wrenfield Technical',
      supplierCertificates: insured,
      clientName: 'Cavanaugh Glassworks',
      on: ON,
      extraHeld: signedNda,
      requirements,
      documentTypes: [INDUCTION] as never,
      startDate: inDays(9),
    })
    expect(preview.says).toBe(refusal.says)
    expect(preview.fix).toBe(refusal.fix)
    // And the worker is the one asked for it, because the set says who
    // owes it rather than a list in the code.
    expect(preview.askOfPerson.map((a) => a.key)).toContain('HOT_FLOOR_INDUCTION')
  })

  it('the outbound pack and the start packet ask for the same items the line requires', () => {
    const requirements = effectiveRequirements({
      shape: 'SUB_VENDOR',
      orderRows: [
        orderRow({ documentTypeKey: 'GOOD_STANDING', owedBy: 'SUPPLIER' }),
        orderRow({ documentTypeKey: 'HOT_FLOOR_INDUCTION', owedBy: 'WORKER' }),
      ],
      orderSays: ORDER_SAYS,
      documentTypes: [INDUCTION] as never,
    })

    const pack = packForLine(outboundPackByKey('CLIENT_SCREENING_US')!, requirements)
    const keys = pack.items.map((i) => i.key)
    // What this client asked of the firm goes out in the firm's own pack.
    expect(keys).toContain('GOOD_STANDING')
    // And what it asked of the worker does not: a qualification pack is
    // our papers going out, and a worker's file is not ours to send.
    expect(keys).not.toContain('HOT_FLOOR_INDUCTION')
  })

  it('a waived item is not sent out as outstanding, because this client decided it on the record', () => {
    const requirements = effectiveRequirements({
      shape: 'SUB_VENDOR',
      orderRows: [orderRow({ documentTypeKey: 'GOOD_STANDING', owedBy: 'SUPPLIER' })],
      lineRows: [
        orderRow({
          id: 'line-gs',
          documentTypeKey: 'GOOD_STANDING',
          owedBy: 'SUPPLIER',
          waivedReason: 'Sole trader in a state that issues none.',
          waivedById: 'p-noor',
          waivedAt: inDays(-3),
        }),
      ],
      orderSays: ORDER_SAYS,
    })
    const pack = packForLine(outboundPackByKey('CLIENT_SCREENING_US')!, requirements)
    expect(pack.items.map((i) => i.key)).not.toContain('GOOD_STANDING')
  })
})

describe('what the worker can see about their own file', () => {
  const HERS = 'colleen.byrne@example.invalid'

  const license: HeldRecord = {
    id: 'v-1',
    key: 'PROFESSIONAL_LICENSE',
    label: 'Professional license',
    status: 'CLEAR',
    provider: 'Wisconsin Board of Nursing',
    validFrom: inDays(-300),
    expiresAt: inDays(84),
    stopsWork: true,
  }

  it('the worker’s own page lists every document they owe with the day it runs out, and it is the list clearance reads', () => {
    const papers = myPapers({ myEmail: HERS, documents: [], packets: [], held: [license], on: ON })
    const row = papers.find((p) => p.name.toLowerCase().includes('license'))!
    expect(row).toBeTruthy()
    expect(row.kind).toBe('HELD')
    expect(row.runsOutOn).toBe(inDays(84).toISOString())
    // Nobody is waiting on her for it, so she is offered nothing to press.
    expect(row.todo).toBeNull()

    // And it is the same document clearance is reading: the key on her
    // page is the key the verdict resolves against.
    const v = verdict({
      personName: 'Colleen Byrne',
      role: 'ICU travel nurse — nights',
      personVerifications: [
        clear('I9_EVERIFY'),
        clear('BACKGROUND_CHECK', inDays(200)),
        { type: license.key, status: 'CLEAR', expiresAt: license.expiresAt },
      ],
    })
    expect(v.items.map((i) => i.key)).toContain(license.key)
  })

  it('a document on file with no expiry recorded says so, rather than reading as permanent', () => {
    const papers = myPapers({
      myEmail: HERS,
      documents: [],
      packets: [],
      held: [{ ...license, expiresAt: null }],
      on: ON,
    })
    // The fourth state, and the one that went green in 2017: on file, no
    // expiry recorded, on a kind that expires.
    expect(papers[0].word).toBe('On file — no expiry recorded')
  })

  it('a check still running is not shown to her as held, because saying “on file” of it would be a lie', () => {
    const papers = myPapers({
      myEmail: HERS,
      documents: [],
      packets: [],
      held: [{ ...license, status: 'PENDING' }],
      on: ON,
    })
    expect(papers).toEqual([])
  })

  it('a document that has already run out tells her how long ago, in days rather than in a status', () => {
    const papers = myPapers({
      myEmail: HERS,
      documents: [],
      packets: [],
      held: [{ ...license, expiresAt: inDays(-3) }],
      on: ON,
    })
    expect(papers[0].word).toBe('Ran out 3 days ago')
  })
})
