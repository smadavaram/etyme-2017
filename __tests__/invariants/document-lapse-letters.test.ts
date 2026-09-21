/**
 * The letters that go when a document runs out, and the walls they keep.
 *
 * "Ensure the loop of documents never cracks between parties." The watch
 * knows what is running out and who owes it; these are the sentences
 * each party actually reads, and the rules about who may read what.
 *
 * Everything here is pure: a document, a cast, and the words. Who sits
 * at which desk is resolved against the database in
 * `__integration__/document-lapse-letters.test.ts`.
 */

import { describe, it, expect } from 'vitest'
import {
  chaseLetter,
  noticeLetter,
  lettersFor,
  milestoneFor,
  docSaidKeyFor,
  leftToDemand,
  article,
  LAPSE_MILESTONES,
  LAPSED_MILESTONE,
  NEVER_FILED_MILESTONE,
  CHASE_DESK,
  EXPOSED_DESK,
  type OwedDocument,
  type Cast,
} from '@/lib/notify/documents'
import { saidKeyFor } from '@/lib/agreement-term'
import { mayNameSubVendors, nameForClient, type ChainRung } from '@/lib/chain-names'
import { readsAsAimedAtSuppliers } from '@/lib/positioning'
import { DEFAULT_ROLES } from '@/lib/permissions'
import { rolesFor } from '@/lib/company-defaults'
import { hasPermission } from '@/lib/permissions'

const OCT_3 = new Date('2026-10-03T00:00:00Z')
const SEP_30 = new Date('2026-09-30T00:00:00Z')

function doc(over: Partial<OwedDocument> = {}): OwedDocument {
  return {
    id: 'doc1',
    key: 'PROFESSIONAL_LICENSE',
    document: 'Nursing license',
    line: { side: 'SELL', id: 'line1' },
    owedBy: 'WORKER',
    owedByName: 'Ingrid Sørensen',
    personId: 'p1',
    companyId: null,
    tellCompanyId: 'byrne',
    expiresAt: OCT_3,
    daysLeft: 12,
    lapsed: false,
    neverFiled: false,
    stopsWork: true,
    ...over,
  }
}

function cast(over: Partial<Cast> = {}): Cast {
  return {
    personName: 'Ingrid Sørensen',
    clientName: 'Cavanaugh Glassworks',
    owedByName: 'Byrne Critical Care',
    aboutFirmName: 'Byrne Critical Care',
    chase: [{ personId: 'p1', companyId: 'byrne', audience: 'candidate' }],
    exposed: [
      {
        companyId: 'cavanaugh',
        people: ['officer'],
        sees: {
          companyId: 'byrne',
          name: 'Byrne Critical Care',
          masked: false,
          through: null,
          phrase: 'Byrne Critical Care',
          says: 'Byrne Critical Care',
        },
      },
    ],
    ...over,
  }
}

/** The chain the wall is tested on: a client, its prime, and a sub below. */
const CHAIN: ChainRung[] = [
  { id: 'r1', personId: 'p1', companyId: 'csi', companyName: 'Computer Systems Inc', clientCompanyId: 'cavanaugh' },
  { id: 'r2', personId: 'p1', companyId: 'byrne', companyName: 'Byrne Critical Care', clientCompanyId: 'csi' },
]

describe('a document running out is told to every party it costs, and to nobody else', () => {

  it('the party that owes a document is asked for it in its own words, and the party exposed by it is told in theirs', () => {
    const d = doc()
    const c = cast()
    const letters = lettersFor(d, c)

    const ask = letters.find((l) => l.side === 'OWES')!
    const told = letters.find((l) => l.side === 'EXPOSED')!

    expect(ask.body).toContain('Your nursing license')
    expect(ask.body).toContain('Upload the renewal from your Paperwork page')
    // The party that owes it is never told to go and ask somebody else.
    expect(ask.body).not.toContain('Ask ')

    expect(told.body).toContain('A document one of your contractors depends on')
    expect(told.body).toContain('Ask Byrne Critical Care for it')
    // And the firm that is not the one that owes it is never handed the
    // worker's own upload page, which it cannot use.
    expect(told.body).not.toContain('your Paperwork page')
  })

  it('a worker reads their own license by name and where to upload the renewal', () => {
    const letter = chaseLetter(doc(), cast())!
    expect(letter.title).toBe('Your nursing license runs out on October 3, 2026')
    expect(letter.body).toBe(
      'Your nursing license runs out on October 3, 2026. Cavanaugh Glassworks cannot keep you on site ' +
        'past that day without a current one. Upload the renewal from your Paperwork page.'
    )
  })

  it('a supplier reads its own certificate and that nobody starts through it until it is renewed', () => {
    const d = doc({
      key: 'GOOD_STANDING',
      document: 'Certificate of good standing',
      owedBy: 'SUPPLIER',
      owedByName: 'Brightmoor Staffing',
      personId: null,
      companyId: 'brightmoor',
      expiresAt: SEP_30,
      daysLeft: -3,
      lapsed: true,
    })
    const letter = chaseLetter(d, cast({ owedByName: 'Brightmoor Staffing', aboutFirmName: 'Brightmoor Staffing', personName: null }))!
    expect(letter.body).toBe(
      'Your certificate of good standing ran out on September 30, 2026. Nobody can start through ' +
        'Brightmoor Staffing until it is renewed and on file. File the renewal on your Compliance page.'
    )
  })

  it('a client reads standing and no name for a sub-vendor its agreement does not disclose', () => {
    // No disclosure term anywhere, which is the default and the answer
    // for every client that did not demand one at signing.
    const sees = nameForClient(CHAIN[1], CHAIN, 'cavanaugh', (prime) => mayNameSubVendors([], 'cavanaugh', prime))
    expect(sees.masked).toBe(true)

    const letter = noticeLetter(doc(), cast(), sees)
    expect(letter.body).toContain('at the firm supplied through Computer Systems Inc')
    expect(letter.body).not.toContain('Byrne Critical Care')
    // The standing itself is never withheld: the client still reads what
    // it costs and who it can call about it.
    expect(letter.body).toContain('Ingrid Sørensen cannot be on site')
    expect(letter.body).toContain('Ask Computer Systems Inc for it')
  })

  it('a client whose agreement discloses sub-vendors reads the name', () => {
    const terms = [{ clientId: 'cavanaugh', vendorId: 'csi', disclosesSubVendors: true, status: 'ACTIVE' }]
    const sees = nameForClient(CHAIN[1], CHAIN, 'cavanaugh', (prime) =>
      mayNameSubVendors(terms, 'cavanaugh', prime)
    )
    expect(sees.masked).toBe(false)

    const letter = noticeLetter(doc(), cast(), sees)
    expect(letter.body).toContain('through Byrne Critical Care')
  })

  it('a document nobody’s name resolves for is written about without a name, never with an invented one', () => {
    const d = doc({ owedBy: 'SUPPLIER', owedByName: null, personId: null })
    const c = cast({ owedByName: null, aboutFirmName: null, personName: null, exposed: [] })

    const ask = chaseLetter(d, c)!
    expect(ask.body).toContain('Nobody can start through this firm')
    expect(ask.body).not.toMatch(/undefined|null/)

    const told = noticeLetter(d, c, null)
    expect(told.body).toContain('owed by the firm that owes it')
    expect(told.body).toContain('Ask the firm you buy this placement from for it')
    expect(told.body).not.toMatch(/undefined|null/)
  })

  it('a lapse the line says warns is never told as a block', () => {
    const d = doc({ key: 'BACKGROUND_CHECK', document: 'Background check', stopsWork: false })
    const ask = chaseLetter(d, cast())!
    const told = noticeLetter(d, cast(), null)

    for (const body of [ask.body, told.body]) {
      expect(body).toContain('It stops nothing on its own')
      expect(body).toContain('the reason on the record')
      expect(body).not.toContain('cannot be on site')
      expect(body).not.toContain('cannot keep you on site')
      expect(body).not.toContain('Nobody can start')
    }
  })

  it('each party is told once per milestone, and the supplier’s key matches the watch’s', () => {
    // The chased party's key is the bare one the agreement watch has
    // always written, so the two halves of the loop dedupe alike.
    expect(docSaidKeyFor('doc1', 30)).toBe(saidKeyFor('doc1', 30, 'VENDOR'))
    expect(docSaidKeyFor('doc1', 30, 'cavanaugh')).not.toBe(docSaidKeyFor('doc1', 30))

    // Sixty days out, thirty, the day itself, and once when it has gone.
    expect(milestoneFor(75)).toBeNull()
    expect(milestoneFor(45)).toBe(60)
    expect(milestoneFor(30)).toBe(30)
    expect(milestoneFor(12)).toBe(30)
    expect(milestoneFor(0)).toBe(0)
    expect(milestoneFor(-4)).toBe(LAPSED_MILESTONE)
    expect(milestoneFor(null, true)).toBe(NEVER_FILED_MILESTONE)
    expect(LAPSE_MILESTONES).toEqual([60, 30, 0])

    const d = doc()
    const first = lettersFor(d, cast())
    expect(first.length).toBe(2)

    const said = new Set(first.map((l) => l.saidKey))
    expect(lettersFor(d, cast(), said)).toEqual([])

    // A tighter milestone is new news and goes.
    const closer = lettersFor(doc({ daysLeft: 2 }), cast(), said)
    expect(closer.length).toBe(0) // twelve days and two days are both the thirty-day milestone
    expect(lettersFor(doc({ daysLeft: 0 }), cast(), said).length).toBe(2)
  })

  it('every letter writes one log row that names the document and the day and never a masked firm', () => {
    const sees = nameForClient(CHAIN[1], CHAIN, 'cavanaugh', () => false)
    const letters = lettersFor(
      doc(),
      cast({ exposed: [{ companyId: 'cavanaugh', people: ['officer'], sees }] })
    )
    for (const l of letters) {
      expect(l.logSummary).toContain('nursing license')
      expect(l.logSummary).toContain('October 3, 2026')
      expect(l.logReason).toContain('October 3, 2026')
      // The row is written in the reader's own books, so it may not
      // carry a name the letter withheld.
      if (l.side === 'EXPOSED') {
        expect(l.logSummary).not.toContain('Byrne Critical Care')
        expect(l.logSummary).toContain('supplied through Computer Systems Inc')
      }
    }
    expect(letters.map((l) => l.data.milestone)).toEqual([30, 30])
  })

  it('an agreement running out is not told twice, because demand’s letters already go', () => {
    const msa = doc({ key: 'MSA', document: 'Master service agreement', owedBy: 'SUPPLIER' })
    expect(leftToDemand(msa)).toBe(true)
    // An agreement nobody ever papered has no row for demand to warn
    // about, so it is this file's to tell.
    expect(leftToDemand({ ...msa, neverFiled: true, expiresAt: null, daysLeft: null })).toBe(false)
    // Nothing else is left to anybody.
    expect(leftToDemand(doc())).toBe(false)
  })

  it('no letter says push, watch, monitor or catch about a supplier', () => {
    const shapes: OwedDocument[] = [
      doc(),
      doc({ stopsWork: false }),
      doc({ lapsed: true, daysLeft: -2, expiresAt: SEP_30 }),
      doc({ owedBy: 'SUPPLIER', owedByName: 'Brightmoor Staffing', personId: null }),
      doc({ owedBy: 'SUPPLIER', neverFiled: true, expiresAt: null, daysLeft: null }),
      doc({ owedBy: 'CUSTOMER', owedByName: 'Cavanaugh Glassworks' }),
      doc({ owedBy: 'US', owedByName: 'Wrenfield Technical' }),
    ]
    const bad: string[] = []
    for (const d of shapes) {
      for (const l of lettersFor(d, cast())) {
        bad.push(...readsAsAimedAtSuppliers(`${l.title}. ${l.body} ${l.logSummary} ${l.logReason}`))
      }
    }
    expect(bad, bad.join('\n')).toEqual([])
  })

  it('a desk is named by what it may do, never by what a company calls it', () => {
    // A client's compliance officer and its program manager both read a
    // notice; its AP clerk does not, because an AP clerk cannot renew
    // anybody's paper.
    const client = rolesFor('CLIENT')
    const holds = (role: string, list: readonly string[]) => {
      const r = client.find((x) => x.name === role)!
      return list.some((p) => hasPermission(r.permissions, p as never))
    }
    expect(holds('Compliance Officer', EXPOSED_DESK)).toBe(true)
    expect(holds('Program Manager', EXPOSED_DESK)).toBe(true)
    expect(holds('AP Clerk', EXPOSED_DESK)).toBe(false)
    expect(holds('Hiring Manager', EXPOSED_DESK)).toBe(false)

    // A supplier's contracting and compliance desks are asked for the
    // firm's own paper; its recruiter is not.
    const vendor = rolesFor('VENDOR')
    const vendorHolds = (role: string, list: readonly string[]) => {
      const r = vendor.find((x) => x.name === role)!
      return list.some((p) => hasPermission(r.permissions, p as never))
    }
    expect(vendorHolds('Compliance Officer', CHASE_DESK)).toBe(true)
    expect(vendorHolds('Contract Manager', CHASE_DESK)).toBe(true)
    expect(vendorHolds('Owner', CHASE_DESK)).toBe(true)
    expect(vendorHolds('Recruiter', CHASE_DESK)).toBe(false)
    // And the default role set, which is what a company formed before
    // any of this holds, still answers the same way for its owner.
    const owner = DEFAULT_ROLES.find((r) => r.name === 'Owner')
    if (owner) expect(CHASE_DESK.some((p) => hasPermission(owner.permissions, p))).toBe(true)
  })

  it('an agreement between two firms is never told as a document the contractor mislaid', () => {
    const msa = doc({
      key: 'MSA',
      document: 'Master service agreement',
      owedBy: 'SUPPLIER',
      owedByName: 'Wrenfield Technical',
      neverFiled: true,
      expiresAt: null,
      daysLeft: null,
      stopsWork: false,
    })
    const letter = noticeLetter(msa, cast({ owedByName: 'Wrenfield Technical', aboutFirmName: 'Wrenfield Technical' }), null)
    expect(letter.body).toContain('a master service agreement, owed by Wrenfield Technical')
    // The person is on the line and is not the party that owes it.
    expect(letter.body).not.toContain('held by Ingrid Sørensen')
  })

  it('a document is named with the article its first letter is said with, not the one it is spelled with', () => {
    expect(article('Nursing license')).toBe('a')
    expect(article('I-9 and E-Verify')).toBe('an')
    expect(article('W-9')).toBe('a')
    expect(article('Errors and omissions insurance')).toBe('an')
    expect(article('Certificate of good standing')).toBe('a')
  })

  it('a firm is never asked for a document by itself, when the document is its own to supply', () => {
    const nda = doc({
      key: 'NDA',
      document: 'Signed non-disclosure agreement',
      owedBy: 'CUSTOMER',
      owedByName: 'Cavanaugh Glassworks',
      neverFiled: true,
      expiresAt: null,
      daysLeft: null,
      stopsWork: false,
    })
    const letter = chaseLetter(nda, cast({ owedByName: 'Cavanaugh Glassworks', aboutFirmName: 'Cavanaugh Glassworks' }))!
    expect(letter.body).toContain('This placement requires a signed non-disclosure agreement from you')
    expect(letter.body).not.toContain('Cavanaugh Glassworks requires a signed non-disclosure agreement from Cavanaugh Glassworks')
  })

  it('a worker is written to by email and a firm on the channel its company has', () => {
    const letters = lettersFor(doc(), cast())
    const ask = letters.find((l) => l.side === 'OWES')!
    const told = letters.find((l) => l.side === 'EXPOSED')!
    // A consultant is in nobody's Teams tenant, so a card sent to one is
    // a card sent nowhere.
    expect(ask.audience).toBe('candidate')
    expect(told.audience).toBe('business')
    for (const l of letters) expect(l.channel).toBe('EMAIL')
  })

  it('a document that is not inside the window is told to nobody at all', () => {
    expect(lettersFor(doc({ daysLeft: 90 }), cast())).toEqual([])
  })
})
