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
  type RequiredItem,
  type HeldKeyRecord,
  typeKeyForTemplate,
} from '@/lib/document-request'
import { readJson } from '@/lib/read-response'
import { mayWaive } from '@/lib/document-requirements'
import { supplierCoverGate, nameCredential } from '@/lib/document-stages'
import { humanKey, sayType, labelFor, type DefinedType } from '@/lib/document-type'

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
    const said = sayType('FURNACE_SAFETY_INDUCTION')
    expect(said.known).toBe(false)
    expect(said.label).toBe('furnace safety induction')
  })

  it('keeps the dictionary’s own label where there is one, and says so', () => {
    expect(sayType('I9_EVERIFY')).toEqual({ label: 'I-9 and E-Verify', known: true })
  })

  it('never invents a definition — an unknown key gets its own words and nothing more', () => {
    expect(humanKey('DRUG_SCREEN_10_PANEL')).toBe('drug screen 10 panel')
  })

  // ── The sentence that would have caught the swap ──
  //
  // For a day this file detected an undefined type by the label coming
  // back equal to the key. The hour `labelFor` learned to humanize its
  // own fallback, that became false everywhere: the name went on
  // rendering correctly, the "nobody here has defined this" caveat
  // silently stopped printing, and every test stayed green — because
  // every test was checking the rendered name. A test that pins the
  // spelling cannot see a caveat that is missing.
  it('a type nobody defined still says so, whoever humanized its name', () => {
    // The label and the key are now different for an unknown type, which
    // is exactly the condition the old detection read as "known".
    expect(labelFor('FURNACE_SAFETY_INDUCTION')).not.toBe('FURNACE_SAFETY_INDUCTION')
    expect(sayType('FURNACE_SAFETY_INDUCTION').known).toBe(false)
  })

  it('reads a type the company defined itself as known, by the label that company typed', () => {
    const mine: DefinedType[] = [
      { key: 'FURNACE_SAFETY_INDUCTION', label: 'Hot floor induction', purpose: 'COMPLIANCE' } as DefinedType,
    ]
    expect(sayType('FURNACE_SAFETY_INDUCTION', mine)).toEqual({ label: 'Hot floor induction', known: true })
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

// ── The loop closes: she can send what she is chased for ──────────────
//
// Supply landed the worker's page against this list on 2026-09-21 and it
// exposed the last gap: there was no door that received a file against a
// requirement, because a requirement is a rule and a request is an act,
// and nobody had performed the act. A letter that says "upload it from
// your Paperwork page" and a page that cannot take the file is not a
// closed loop.

describe('a worker can send the document she is being chased for from the page the letter sends her to', () => {
  const owed = outstandingItems({
    items: [required({ key: 'HOT_FLOOR_INDUCTION', label: 'hot floor induction', blocks: true })],
    on: TODAY,
  })

  it('names the document type on the row, because an item nobody has asked for has no id of its own to act on', () => {
    const papers = myPapers({ myEmail: null, documents: [], packets: [], owed })
    expect(papers[0].documentTypeKey).toBe('HOT_FLOOR_INDUCTION')
  })

  it('says where to open a request for it, so the button on the row has somewhere to go', () => {
    const papers = myPapers({ myEmail: null, documents: [], packets: [], owed })
    expect(papers[0].openAskAt).toBe('/api/me/papers')
    expect(papers[0].todo).toBe('upload')
  })

  it('becomes that request once one is open, so a second press is the same request rather than a second one', () => {
    const papers = myPapers({
      myEmail: null,
      documents: [],
      packets: [],
      owed,
      asksByKey: { HOT_FLOOR_INDUCTION: 'doc-99' },
    })
    expect(papers[0].id).toBe('doc-99')
  })

  it('offers to open nothing against a waived item, because nobody is asking her for it', () => {
    const waived = outstandingItems({
      items: [required({ waived: true, waivedSays: 'Waived by Dana Whitfield on September 18.' })],
      on: TODAY,
    })
    const papers = myPapers({ myEmail: null, documents: [], packets: [], owed: waived })
    expect(papers[0].openAskAt).toBeNull()
  })

  it('never says she asked herself for it — nobody has asked, and the row says whose order requires it instead', () => {
    const papers = myPapers({ myEmail: null, documents: [], packets: [], owed })
    expect(papers[0].askedBy).toBeNull()
    expect(papers[0].why).toContain('Cavanaugh Glassworks')
  })
})

describe('a document she has already sent is not asked for again the next morning', () => {
  it('reads as sent and waiting rather than as missing, because it is no longer her move', () => {
    const out = outstandingItems({
      items: [required()],
      held: [held({ accepted: false, received: true })],
      on: TODAY,
    })
    expect(out[0].state).toBe('AWAITING_REVIEW')
    expect(out[0].word).toBe('Sent — waiting for somebody to check it')
  })

  it('still counts as nothing held, because a check still running is not a document on file', () => {
    const out = outstandingItems({
      items: [required()],
      held: [held({ accepted: false, received: true })],
      on: TODAY,
    })
    expect(out).toHaveLength(1)
  })

  it('asks her to do nothing about it, and offers her nowhere to send it twice', () => {
    const papers = myPapers({
      myEmail: null,
      documents: [],
      packets: [],
      owed: outstandingItems({ items: [required()], held: [held({ accepted: false, received: true })], on: TODAY }),
    })
    expect(papers[0].todo).toBeNull()
    expect(papers[0].openAskAt).toBeNull()
  })
})

describe('a document already proved is not asked for again', () => {
  it('does not chase a permanent resident for proof of her right to work, because her green card is that proof', () => {
    const out = outstandingItems({
      items: [required({ key: 'RIGHT_TO_WORK', label: 'proof of right to work', blocks: true })],
      held: [held({ key: 'GREEN_CARD' })],
      on: TODAY,
    })
    expect(out).toEqual([])
  })

  it('takes a completed I-9 as proof of the right to work, because it is the form recording that somebody checked one', () => {
    const out = outstandingItems({
      items: [required({ key: 'RIGHT_TO_WORK', label: 'proof of right to work', blocks: true })],
      held: [held({ key: 'I9_EVERIFY' })],
      on: TODAY,
    })
    expect(out).toEqual([])
  })

  it('does not take a passport as proof of the right to work, because a foreign passport proves identity and nothing more', () => {
    const out = outstandingItems({
      items: [required({ key: 'RIGHT_TO_WORK', label: 'proof of right to work', blocks: true })],
      held: [held({ key: 'PASSPORT' })],
      on: TODAY,
    })
    expect(out).toHaveLength(1)
    expect(out[0].state).toBe('MISSING')
  })

  it('still asks for the right to work where the green card that proved it has run out', () => {
    const out = outstandingItems({
      items: [required({ key: 'RIGHT_TO_WORK', label: 'proof of right to work', blocks: true })],
      held: [held({ key: 'GREEN_CARD', expiresAt: new Date('2026-09-01T00:00:00Z') })],
      on: TODAY,
    })
    expect(out[0].state).toBe('LAPSED')
  })
})

// ── The paper she sent is a paper she has sent ────────────────────────
//
// Supply wired the button on 2026-09-21 and clicked it as two workers.
// A document she uploaded lives on `DocInstance`; this list was built
// from `Verification` alone, so the row stayed MISSING and she was asked
// again the next morning for the file she had sent the night before —
// the exact failure the sent state exists to prevent, arriving because
// nothing ever reached it.

describe('a paper on file against a requirement counts as held, whoever recorded it', () => {
  it('a document she sent last night is not asked for again this morning', () => {
    const out = outstandingItems({
      items: [required({ key: 'HOT_FLOOR_INDUCTION', label: 'hot floor induction', blocks: true })],
      // What an uploaded paper amounts to: with them, and unchecked.
      held: [held({ key: 'HOT_FLOOR_INDUCTION', accepted: false, received: true })],
      on: TODAY,
    })
    expect(out[0].state).toBe('AWAITING_REVIEW')
    expect(out[0].word).toBe('Sent — waiting for somebody to check it')
  })

  it('asks her for nothing about it and offers her nowhere to send it twice', () => {
    const papers = myPapers({
      myEmail: null,
      documents: [],
      packets: [],
      owed: outstandingItems({
        items: [required({ key: 'HOT_FLOOR_INDUCTION', label: 'hot floor induction' })],
        held: [held({ key: 'HOT_FLOOR_INDUCTION', accepted: false, received: true })],
        on: TODAY,
      }),
    })
    expect(papers[0].todo).toBeNull()
    expect(papers[0].openAskAt).toBeNull()
  })

  it('takes a paper she signed as held outright, because there is nothing further for anybody to do about it', () => {
    const out = outstandingItems({
      items: [required({ key: 'NDA', label: 'non-disclosure agreement' })],
      held: [held({ key: 'NDA', accepted: true })],
      on: TODAY,
    })
    expect(out).toEqual([])
  })

  it('goes on asking where the paper that answered it has run out, because a renewal is a new paper', () => {
    const out = outstandingItems({
      items: [required({ key: 'HOT_FLOOR_INDUCTION', label: 'hot floor induction' })],
      held: [held({ key: 'HOT_FLOOR_INDUCTION', accepted: false, received: true, expiresAt: new Date('2026-09-01T00:00:00Z') })],
      on: TODAY,
    })
    expect(out[0].state).toBe('LAPSED')
    expect(out[0].word).toBe('Ran out 20 days ago')
  })
})

describe('pressing send twice is one request, because an answered request is still the request for that document', () => {
  it('keeps the row on the request she already answered, rather than putting it back on an item with no id', () => {
    const papers = myPapers({
      myEmail: null,
      documents: [],
      packets: [],
      owed: outstandingItems({
        items: [required({ key: 'HOT_FLOOR_INDUCTION', label: 'hot floor induction' })],
        held: [held({ key: 'HOT_FLOOR_INDUCTION', accepted: false, received: true })],
        on: TODAY,
      }),
      asksByKey: { HOT_FLOOR_INDUCTION: 'doc-77' },
    })
    expect(papers[0].id).toBe('doc-77')
    expect(papers[0].id).not.toContain('owed:')
  })
})

describe('what a worker reads on a document type her client invented', () => {
  it('says it in words on her own page, never in the key somebody typed into an order', () => {
    const out = outstandingItems({
      // What `effectiveRequirements` hands over for a type nobody has
      // defined: the key, standing in for a label.
      items: [required({ key: 'FURNACE_SAFETY_INDUCTION', label: 'FURNACE_SAFETY_INDUCTION' })],
      on: TODAY,
    })
    expect(out[0].label).toBe('furnace safety induction')
  })

  it('keeps a label somebody did define, because a company’s own word beats ours', () => {
    const out = outstandingItems({
      items: [required({ key: 'FURNACE_SAFETY_INDUCTION', label: 'Hot floor induction' })],
      on: TODAY,
    })
    expect(out[0].label).toBe('Hot floor induction')
  })
})

// ── A paper answers the requirement it was opened for ─────────────────
//
// The release re-walk, 2026-09-21. Helena owed two documents. She sent
// one — a "Product confidentiality undertaking" — and her page then
// reported BOTH as sent, including a non-disclosure agreement nobody had
// ever sent, while still offering to send the one she had. Two rows
// wrong in opposite directions from one upload, on the page built to be
// the one honest view a contractor has of her own file.
//
// The cause was a pattern matching a concept rather than a name:
// "confidentiality" counted as an NDA. A compliance record saying a
// paper arrived when no paper exists is the worst thing this file can
// produce, and it came from a guess.

describe('a document she never sent is never reported as sent, whatever another document on her page is called', () => {
  const KNOWN = [
    { key: 'PRODUCT_CONFIDENTIALITY', label: 'Product confidentiality undertaking' },
    { key: 'NDA', label: 'Non-disclosure agreement' },
  ]

  it('reads a paper by its own name, not by a word inside it', () => {
    expect(typeKeyForTemplate('Product confidentiality undertaking', KNOWN)).toBe('PRODUCT_CONFIDENTIALITY')
  })

  it('never credits a paper against a requirement it was not opened for, even where a word matches', () => {
    // The line that asks for an NDA and nothing else. The undertaking she
    // sent is not that document and must satisfy nothing here.
    expect(
      typeKeyForTemplate('Product confidentiality undertaking', [{ key: 'NDA', label: 'Non-disclosure agreement' }], {
        guess: false,
      })
    ).toBeNull()
  })

  it('stops calling a confidentiality undertaking a non-disclosure agreement, because that is a concept and not a name', () => {
    expect(typeKeyForTemplate('Product confidentiality undertaking')).toBeNull()
  })

  it('still reads a paper somebody named their own way where a verdict is being assembled, because that is a different question', () => {
    expect(typeKeyForTemplate('Mutual NDA — 2026')).toBe('NDA')
  })

  it('leaves the row she has not sent asking her to send it, and says nothing about a paper that does not exist', () => {
    const out = outstandingItems({
      items: [
        required({ key: 'NDA', label: 'Non-disclosure agreement' }),
        required({ key: 'PRODUCT_CONFIDENTIALITY', label: 'Product confidentiality undertaking' }),
      ],
      // Only the undertaking arrived.
      held: [held({ key: 'PRODUCT_CONFIDENTIALITY', accepted: false, received: true })],
      on: TODAY,
    })
    const nda = out.find((o) => o.key === 'NDA')!
    const pcu = out.find((o) => o.key === 'PRODUCT_CONFIDENTIALITY')!
    expect(nda.state).toBe('MISSING')
    expect(pcu.state).toBe('AWAITING_REVIEW')
  })

  it('says on the row itself that a paper arrived, rather than leaving a screen to infer it from having nowhere to send it', () => {
    const papers = myPapers({
      myEmail: null,
      documents: [],
      packets: [],
      owed: outstandingItems({
        items: [
          required({ key: 'NDA', label: 'Non-disclosure agreement' }),
          required({ key: 'PRODUCT_CONFIDENTIALITY', label: 'Product confidentiality undertaking' }),
        ],
        held: [held({ key: 'PRODUCT_CONFIDENTIALITY', accepted: false, received: true })],
        on: TODAY,
      }),
    })
    const nda = papers.find((p) => p.documentTypeKey === 'NDA')!
    const pcu = papers.find((p) => p.documentTypeKey === 'PRODUCT_CONFIDENTIALITY')!
    // Two states that mean opposite things, and two different signals.
    expect(nda.received).toBe(false)
    expect(nda.todo).toBe('upload')
    expect(pcu.received).toBe(true)
    expect(pcu.todo).toBeNull()
  })
})

describe('a waiver the law refuses is refused on the screen, in the route’s own words', () => {
  it('hands the route’s own sentence to the page rather than a parser error', async () => {
    // The defect: the screen read `body.error` off a resolved promise
    // and `readJson` throws on anything that is not a 2xx. So waiving
    // I-9 and E-Verify returned 422 with the best sentence in the loop
    // and the page showed nothing at all — the form stayed open with the
    // reason still typed, and the only trace was a development overlay
    // that does not exist in production.
    const refusal =
      'I-9 and E-Verify cannot be waived. Nobody may agree to work without authorization, ' +
      'however urgent the start is. Get it on file, then activate.'
    const res = new Response(JSON.stringify({ error: { code: 'CANNOT_BE_WAIVED', message: refusal } }), {
      status: 422,
      headers: { 'Content-Type': 'application/json' },
    })
    await expect(readJson(res)).rejects.toThrow(refusal)
  })

  it('says what is missing and what to do, never a code', async () => {
    const verdict = mayWaive('I9_EVERIFY', 'the plant runs its own checks', () => 'I-9 and E-Verify')
    expect(verdict.ok).toBe(false)
    expect(verdict.says).toContain('cannot be waived')
    expect(verdict.says).not.toContain('CANNOT_BE_WAIVED')
  })
})
