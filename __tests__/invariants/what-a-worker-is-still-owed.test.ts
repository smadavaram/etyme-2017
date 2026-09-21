/**
 * The loop has to reach the worker.
 *
 * Every chase letter this system sends ends "upload it from your
 * Paperwork page". A release walk on 2026-09-21 opened that page as
 * Helena Marsh and found three held documents and nothing outstanding —
 * because `/api/me/papers` read documents sent, packets raised and
 * checks on file, and never the set the line she is on actually
 * requires. She was being chased for a document her own page did not
 * know existed.
 *
 * The rule these sentences hold is the founder's: the list a worker
 * reads and the list clearance reads are the same items.
 */

import { describe, it, expect } from 'vitest'
import {
  outstandingItems,
  myPapers,
  humanKey,
  sayType,
  type RequiredItem,
  type HeldKeyRecord,
} from '@/lib/document-request'
import { supplierCoverGate, nameCredential } from '@/lib/document-stages'

const TODAY = new Date('2026-09-21T00:00:00Z')

function required(over: Partial<RequiredItem> = {}): RequiredItem {
  return {
    key: 'BACKGROUND_CHECK',
    label: 'background check',
    required: true,
    owedBy: 'WORKER',
    owedByName: 'Helena Marsh',
    blocks: false,
    waived: false,
    waivedSays: null,
    says: 'required by Cavanaugh Glassworks’s order PO-2026-2',
    ...over,
  }
}

function held(over: Partial<HeldKeyRecord> = {}): HeldKeyRecord {
  return { key: 'BACKGROUND_CHECK', validFrom: null, expiresAt: null, accepted: true, ...over }
}

describe('what a worker is still owed, on the lines she is on', () => {
  it('names a document her line requires that nobody has filed, so the page she is sent to knows it exists', () => {
    const out = outstandingItems({ items: [required()], on: TODAY })
    expect(out).toHaveLength(1)
    expect(out[0].key).toBe('BACKGROUND_CHECK')
    expect(out[0].state).toBe('MISSING')
  })

  it('says who asked for it, in the words the order used, rather than leaving her to guess', () => {
    const out = outstandingItems({ items: [required()], on: TODAY })
    expect(out[0].asked).toBe('required by Cavanaugh Glassworks’s order PO-2026-2')
  })

  it('says that work cannot start without it where the absence of it stops work', () => {
    const out = outstandingItems({ items: [required({ key: 'I9_EVERIFY', label: 'I-9 and E-Verify', blocks: true })], on: TODAY })
    expect(out[0].stopsWork).toBe(true)
    expect(out[0].word).toBe('Not on file — work cannot start without it')
  })

  it('drops an item she has already filed and which is still in date, because nobody is waiting on her for it', () => {
    const out = outstandingItems({
      items: [required()],
      held: [held({ expiresAt: new Date('2027-01-01T00:00:00Z') })],
      on: TODAY,
    })
    expect(out).toEqual([])
  })

  it('reads a document she filed and let run out as lapsed rather than as never filed, because the two are different problems', () => {
    const out = outstandingItems({
      items: [required()],
      held: [held({ expiresAt: new Date('2026-09-01T00:00:00Z') })],
      on: TODAY,
    })
    expect(out[0].state).toBe('LAPSED')
    expect(out[0].word).toBe('Ran out 20 days ago')
  })

  it('counts a certificate whose period has not begun as not in force, and says the day it starts', () => {
    const out = outstandingItems({
      items: [required({ key: 'INSURANCE_GL', label: 'certificate of general liability insurance', owedBy: 'SUPPLIER' })],
      held: [held({ key: 'INSURANCE_GL', validFrom: new Date('2026-10-01T00:00:00Z') })],
      on: TODAY,
    })
    expect(out[0].state).toBe('NOT_YET_VALID')
    expect(out[0].word).toContain('2026-10-01')
  })

  it('treats a check still running as nothing held at all, because saying "on file" of it is how somebody relies on paperwork that does not exist', () => {
    const out = outstandingItems({
      items: [required()],
      held: [held({ accepted: false, expiresAt: new Date('2027-01-01T00:00:00Z') })],
      on: TODAY,
    })
    expect(out[0].state).toBe('MISSING')
  })

  it('shows a waived item marked rather than outstanding, so a decision somebody made by name does not read as a gap', () => {
    const out = outstandingItems({
      items: [required({ waived: true, waivedSays: 'Waived by Dana Whitfield on September 18: the plant runs its own screening.' })],
      on: TODAY,
    })
    expect(out[0].state).toBe('WAIVED')
    expect(out[0].stopsWork).toBe(false)
    expect(out[0].waivedSays).toContain('Dana Whitfield')
  })

  it('never puts the supplier’s insurance on a worker’s page, because it is not hers to produce', () => {
    const out = outstandingItems({
      items: [
        required(),
        required({ key: 'INSURANCE_GL', label: 'certificate of general liability insurance', owedBy: 'SUPPLIER' }),
      ],
      owedBy: ['WORKER'],
      on: TODAY,
    })
    expect(out.map((o) => o.key)).toEqual(['BACKGROUND_CHECK'])
  })

  it('leaves an optional item off the list of what is owed, because nobody is chasing it', () => {
    expect(outstandingItems({ items: [required({ required: false })], on: TODAY })).toEqual([])
  })

  it('puts what stops her working at the top, above what merely ran out', () => {
    const out = outstandingItems({
      items: [required(), required({ key: 'I9_EVERIFY', label: 'I-9 and E-Verify', blocks: true })],
      on: TODAY,
    })
    expect(out[0].key).toBe('I9_EVERIFY')
  })
})

describe('the worker’s own paperwork page shows what is still asked of her', () => {
  const owed = outstandingItems({
    items: [required({ key: 'I9_EVERIFY', label: 'I-9 and E-Verify', blocks: true })],
    on: TODAY,
  })

  it('lists an outstanding document beside the ones already on file, under the subtitle that promised it', () => {
    const papers = myPapers({ myEmail: null, documents: [], packets: [], owed })
    expect(papers).toHaveLength(1)
    expect(papers[0].kind).toBe('OUTSTANDING')
    expect(papers[0].name).toBe('I-9 and E-Verify')
  })

  it('asks her to upload it, which is the one thing she can do about it from her own page', () => {
    const papers = myPapers({ myEmail: null, documents: [], packets: [], owed })
    expect(papers[0].todo).toBe('upload')
  })

  it('puts the document that stops her working above everything else on the page', () => {
    const papers = myPapers({
      myEmail: null,
      documents: [
        {
          id: 'doc-1',
          status: 'SENT',
          templateName: 'Non-disclosure agreement',
          needsSignature: true,
          issuerName: 'Veritan Talent',
          sentAt: new Date('2026-09-20T00:00:00Z'),
          signedAt: null,
        },
      ],
      packets: [],
      owed,
    })
    expect(papers[0].kind).toBe('OUTSTANDING')
  })

  it('asks her for nothing where the item was waived, and still shows it so the record is not silent', () => {
    const waived = outstandingItems({
      items: [required({ waived: true, waivedSays: 'Waived by Dana Whitfield on September 18.' })],
      on: TODAY,
    })
    const papers = myPapers({ myEmail: null, documents: [], packets: [], owed: waived })
    expect(papers[0].todo).toBeNull()
    expect(papers[0].waived).toBe(true)
  })
})

describe('a document type nobody defined is still said in words, never in the key somebody typed', () => {
  it('reads a key the dictionary has never heard of as the words inside it', () => {
    expect(humanKey('FURNACE_SAFETY_INDUCTION')).toBe('furnace safety induction')
  })

  it('says the type is not defined, so the reply can tell the client once rather than pretending it knows it', () => {
    const said = sayType('FURNACE_SAFETY_INDUCTION', (k) => k)
    expect(said.known).toBe(false)
    expect(said.label).toBe('furnace safety induction')
  })

  it('keeps the dictionary’s own label where there is one, and says so', () => {
    const said = sayType('I9_EVERIFY', () => 'I-9 and E-Verify')
    expect(said).toEqual({ label: 'I-9 and E-Verify', known: true })
  })

  it('never invents a definition — an unknown key gets its own words and nothing more', () => {
    expect(humanKey('DRUG_SCREEN_10_PANEL')).toBe('drug screen 10 panel')
  })
})

// ── Two certificates, two different things wrong ──────────────────────
//
// Added 2026-09-21, the hour the submit door started passing the
// client's own required set. A firm can now be refused over a
// certificate that ran out and one that was never filed at once, and
// the two sentences that existed were each wrong for half of it.

describe('a refusal that names several certificates says what is true of each', () => {
  const on = new Date('2026-09-21T00:00:00Z')

  it('names the one that ran out and the one that is not on file in the same sentence, because one instruction cannot cover both', () => {
    const gate = supplierCoverGate({
      supplierName: 'Teleworld Solutions',
      certificates: [
        { type: 'INSURANCE_GL', status: 'CLEAR', issuedAt: new Date('2025-03-03T00:00:00Z'), expiresAt: new Date('2026-03-03T00:00:00Z'), verifiedAt: on },
        { type: 'INSURANCE_WC', status: 'CLEAR', issuedAt: on, expiresAt: new Date('2027-01-01T00:00:00Z'), verifiedAt: on },
      ],
      requiredTypes: ['GOOD_STANDING'],
      on,
    })
    expect(gate.outcome).toBe('BLOCK')
    expect(gate.says).toBe(
      'Nobody can be submitted through Teleworld Solutions: its certificate of general liability insurance ' +
        'ran out on March 3 and its certificate of good standing is not on file.'
    )
  })

  it('never tells a firm to renew a certificate it has never had, because there is nothing to renew', () => {
    const gate = supplierCoverGate({
      supplierName: 'Teleworld Solutions',
      certificates: [
        { type: 'INSURANCE_GL', status: 'CLEAR', issuedAt: new Date('2025-03-03T00:00:00Z'), expiresAt: new Date('2026-03-03T00:00:00Z'), verifiedAt: on },
        { type: 'INSURANCE_WC', status: 'CLEAR', issuedAt: on, expiresAt: new Date('2027-01-01T00:00:00Z'), verifiedAt: on },
      ],
      requiredTypes: ['GOOD_STANDING'],
      on,
    })
    expect(gate.says).not.toContain('until they are renewed')
    expect(gate.fix).toContain('has to be collected before anybody starts')
  })

  it('says a policy that has not begun does not start until the day it starts, beside whatever else is wrong', () => {
    const gate = supplierCoverGate({
      supplierName: 'Teleworld Solutions',
      certificates: [
        { type: 'INSURANCE_GL', status: 'CLEAR', issuedAt: on, validFrom: new Date('2026-10-12T00:00:00Z'), expiresAt: new Date('2027-10-12T00:00:00Z'), verifiedAt: on },
        { type: 'INSURANCE_WC', status: 'CLEAR', issuedAt: on, expiresAt: new Date('2027-01-01T00:00:00Z'), verifiedAt: on },
      ],
      requiredTypes: ['GOOD_STANDING'],
      on,
    })
    expect(gate.says).toContain('does not start until October 12')
    expect(gate.says).toContain('certificate of good standing is not on file')
  })

  it('keeps the sentence it already had where every certificate has the same thing wrong with it', () => {
    const gate = supplierCoverGate({
      supplierName: 'Teleworld Solutions',
      certificates: [
        { type: 'INSURANCE_GL', status: 'CLEAR', issuedAt: on, validFrom: new Date('2026-10-12T00:00:00Z'), expiresAt: new Date('2027-10-12T00:00:00Z'), verifiedAt: on },
        { type: 'INSURANCE_WC', status: 'CLEAR', issuedAt: on, validFrom: new Date('2026-10-12T00:00:00Z'), expiresAt: new Date('2027-10-12T00:00:00Z'), verifiedAt: on },
      ],
      on,
    })
    expect(gate.says).toContain('until they begin')
  })
})

describe('a license says which state once', () => {
  it('does not say the state twice where the label a company typed already carries it', () => {
    expect(
      nameCredential({ label: 'professional license (RN 154-882, WI)', type: 'PROFESSIONAL_LICENSE', state: 'WI' })
      // The label is lowercased for the sentence it sits in, as it always
      // was. What changed is that "(WI)" is not appended to a label that
      // already ends in it.
    ).toBe('professional license (rn 154-882, wi)')
  })

  it('adds the state where the label does not carry it, because a board that is not named is a board nobody can call', () => {
    expect(nameCredential({ label: 'Professional license', type: 'PROFESSIONAL_LICENSE', state: 'WI' })).toBe(
      'professional license (WI)'
    )
  })

  it('adds the number and the state where the label carries neither, which is what somebody types into a renewal page', () => {
    expect(
      nameCredential({ label: 'Professional license', type: 'PROFESSIONAL_LICENSE', number: 'RN 154-882', state: 'WI' })
    ).toBe('professional license (RN 154-882, WI)')
  })
})
