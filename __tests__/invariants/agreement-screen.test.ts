/**
 * The agreements screen, read as sentences.
 *
 * A master agreement grew a term, a standing, two named signatures, an
 * executed document and an amendment trail — and the screen went on
 * drawing the old shape, which carried one date somebody typed. So all
 * of that work existed and nobody could see it. CLAUDE.md is blunt about
 * what that means: "A Vercel preview URL per feature. He clicks it. If he
 * cannot click it, it is not done."
 *
 * These run the screen's own functions rather than matching a regex over
 * JSX, because a regex passes on a page that renders the right words in
 * the wrong place. The pure part lives in
 * src/app/dashboard/program/agreements/standing.ts for exactly that
 * reason. Two checks at the end do read the page source, and both are
 * about something being absent — a thing you cannot test by calling it.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AGREEMENT_REASONS } from '@/app/api/program/agreements/verdict'
import {
  DO_THIS,
  amendmentBody,
  amendmentHeading,
  disclosureControl,
  emptySays,
  headline,
  insideNoticePeriod,
  matchesFilter,
  methodSays,
  noticeSays,
  readSigning,
  readStanding,
  runsOutSays,
  signatureSays,
  tasks,
  termLines,
  type FindingRow,
  type SignatureRow,
  type StandingInput,
} from '@/app/dashboard/program/agreements/standing'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

// ── Fixtures ──────────────────────────────────────────────────────────

function signature(over: Partial<SignatureRow> = {}): SignatureRow {
  return {
    party: 'VENDOR',
    signerName: 'Dana Whitfield',
    signerTitle: 'VP, Delivery',
    signedAt: '2026-03-03T00:00:00.000Z',
    method: 'WET_INK',
    ...over,
  }
}

function row(over: Partial<StandingInput> = {}): StandingInput {
  return {
    id: 'm1',
    role: 'VENDOR',
    counterparty: { id: 'c1', name: 'Northwind' },
    status: 'ACTIVE',
    statusSays: 'In force. Work may be written under it.',
    termSays: 'Runs to December 31, 2026 — 200 days.',
    daysToExpiry: 200,
    endedAt: null,
    endedReason: null,
    terms: {
      paymentTermsDays: 30,
      paymentTermsSays: 'Net 30 — an invoice falls due 30 days after it is issued.',
      currency: 'USD',
      minMarginPct: 20,
      marginFloorSays: 'Nothing may be priced below 20% margin without approval.',
      capacity: null,
      signedAt: null,
      effectiveDate: '2026-01-01T00:00:00.000Z',
      expiresAt: '2026-12-31T00:00:00.000Z',
      renewalKind: 'FIXED',
      renewalMonths: null,
      noticeDays: null,
      disclosesSubVendors: false,
      disclosureSays:
        'Sub-vendors are the supplier\u2019s own; the client sees their standing, not their names.',
    },
    signing: { says: 'Nobody has signed it.', signatures: [] },
    headcount: 0,
    findings: [],
    ...over,
  }
}

function finding(over: Partial<FindingRow> = {}): FindingRow {
  return {
    code: 'MSA_UNSIGNED',
    severity: 'WARN',
    says: 'Two people are working at Northwind under an agreement nobody has signed.',
    subjectType: 'AGREEMENT',
    subjectId: 'm1',
    ...over,
  }
}

// ── Whether we may trade at all, and until when ───────────────────────

describe('Whether we may trade at all, and when it runs out', () => {
  it('an agreement with no end date on file says so, rather than looking like it runs forever', () => {
    const a = row({ daysToExpiry: null, terms: { ...row().terms, expiresAt: null } })
    expect(runsOutSays(a)).toBe('No end date on file')
    // And it is not dressed up as a dash, which a reader takes for "no end".
    expect(runsOutSays(a)).not.toBe('—')
  })

  it('an agreement that runs out names the day and how many days are left', () => {
    expect(runsOutSays(row())).toBe('December 31, 2026 — 200 days')
  })

  it('a day is written the same whatever time zone the reader is in', () => {
    // An agreement that runs out on 1 January must not read as 31
    // December to somebody in Denver. The date on the paper has no time
    // of day and does not move.
    const a = row({
      daysToExpiry: 5,
      terms: { ...row().terms, expiresAt: '2027-01-01T00:00:00.000Z' },
    })
    expect(runsOutSays(a)).toContain('January 1, 2027')
  })

  it('an agreement that rolls on with no end date is not read as lapsed', () => {
    const a = row({
      daysToExpiry: -400,
      terms: { ...row().terms, renewalKind: 'EVERGREEN', expiresAt: '2025-01-01T00:00:00.000Z' },
    })
    expect(readStanding(a).word).toBe('In force')
    expect(runsOutSays(a)).toBe('Rolls on — no end date')
  })

  it('an agreement whose own paper says it renews itself reads as renewing, not as lapsed', () => {
    const a = row({
      daysToExpiry: -3,
      terms: { ...row().terms, renewalKind: 'AUTO_RENEW', renewalMonths: 12 },
    })
    expect(readStanding(a).word).toBe('Renewing')
  })

  it('an agreement whose term ran out reads as lapsed, and says the day it ran out', () => {
    const a = row({ status: 'ACTIVE', daysToExpiry: -12 })
    expect(readStanding(a).word).toBe('Lapsed')
    expect(runsOutSays(a)).toBe('Ran out December 31, 2026')
  })

  it('an agreement running out inside three months reads as running out, even while the stored standing still says active', () => {
    const a = row({ status: 'ACTIVE', daysToExpiry: 42 })
    expect(readStanding(a).word).toBe('Running out')
  })

  it('an agreement somebody ended reads as ended, not as lapsed', () => {
    const a = row({
      status: 'TERMINATED',
      daysToExpiry: -12,
      endedAt: '2026-06-01T00:00:00.000Z',
      endedReason: 'Replaced by the 2027 master agreement.',
    })
    expect(readStanding(a).word).toBe('Ended')
    expect(runsOutSays(a)).toBe('Ended June 1, 2026')
  })

  it('an agreement recorded only so a contract had a parent reads as not papered, never as in force', () => {
    const a = row({
      status: 'DRAFT',
      daysToExpiry: null,
      terms: { ...row().terms, expiresAt: null, effectiveDate: null },
    })
    expect(readStanding(a).word).toBe('Not papered')
    expect(readStanding(a).word).not.toBe('In force')
  })
})

// ── Whether it is actually executed ───────────────────────────────────

describe('Whether both sides actually signed it', () => {
  it('nobody having signed is not a green tick', () => {
    const s = readSigning(row())
    expect(s.state).toBe('NONE')
    expect(s.tone).not.toBe('verified')
    expect(s.says).toContain('Nobody has signed it')
  })

  it('one side signed shows as a half-state, never as executed', () => {
    const a = row({ signing: { says: '', signatures: [signature({ party: 'VENDOR' })] } })
    const s = readSigning(a)
    expect(s.state).toBe('HALF')
    expect(s.word).toBe('Supplier only')
    expect(s.tone).not.toBe('verified')
    expect(s.says).toContain('not executed yet')
  })

  it('a half-signed agreement names the side that still owes a counter-signature', () => {
    const asSupplier = readSigning(
      row({ role: 'VENDOR', signing: { says: '', signatures: [signature({ party: 'VENDOR' })] } })
    )
    expect(asSupplier.owing).toBe('CLIENT')
    expect(asSupplier.says).toBe(
      'You have signed. Northwind has not counter-signed it, so it is not executed yet.'
    )

    const asClient = readSigning(
      row({
        role: 'CLIENT',
        counterparty: { id: 'v1', name: 'Brightmoor Staffing' },
        signing: { says: '', signatures: [signature({ party: 'VENDOR' })] },
      })
    )
    expect(asClient.owing).toBe('CLIENT')
    expect(asClient.says).toBe(
      'Brightmoor Staffing has signed. You have not counter-signed it, so it is not executed yet.'
    )
  })

  it('both sides signed is the only state that reads as executed', () => {
    const a = row({
      signing: {
        says: '',
        signatures: [signature({ party: 'VENDOR' }), signature({ party: 'CLIENT' })],
      },
    })
    const s = readSigning(a)
    expect(s.state).toBe('BOTH')
    expect(s.tone).toBe('verified')
    expect(s.says).toContain('executed')
  })

  it('a signature shows the signer’s name, their title and the day they signed', () => {
    expect(signatureSays(signature())).toBe(
      'Dana Whitfield, VP, Delivery — signed March 3, 2026 in wet ink.'
    )
  })

  it('a signing method reads as wet ink, never as WET_INK', () => {
    expect(methodSays('WET_INK')).toBe('wet ink')
    expect(methodSays('ELECTRONIC')).toBe('electronically')
    expect(methodSays('COUNTERPART')).toBe('in counterparts')
    expect(methodSays('WET_INK')).not.toContain('_')
  })
})

// ── What needs somebody today ─────────────────────────────────────────

describe('What needs somebody today', () => {
  it('the screen opens on a sentence about the reader — six things need you, four of them urgent', () => {
    const six = [
      ...Array.from({ length: 4 }, () => ({ urgent: true })),
      ...Array.from({ length: 2 }, () => ({ urgent: false })),
    ].map((t, i) => ({
      agreementId: `m${i}`,
      counterparty: 'Northwind',
      code: 'MSA_LAPSING',
      says: 'x',
      doThis: 'y',
      urgent: t.urgent,
    }))
    expect(headline(six)).toBe('6 things need you. 4 are urgent.')
  })

  it('one thing needing somebody is one thing, not one things', () => {
    expect(
      headline([
        {
          agreementId: 'm1',
          counterparty: 'Northwind',
          code: 'MSA_UNSIGNED',
          says: 'x',
          doThis: 'y',
          urgent: true,
        },
      ])
    ).toBe('1 thing needs you. 1 is urgent.')
  })

  it('a reader with nothing outstanding is told nothing needs them today', () => {
    expect(headline([])).toBe('Nothing needs you today.')
  })

  it('people working under an agreement nobody has signed is in the queue', () => {
    const q = tasks([row({ headcount: 2, findings: [finding()] })])
    expect(q).toHaveLength(1)
    expect(q[0].says).toContain('nobody has signed')
    expect(q[0].urgent).toBe(true)
  })

  it('an unsigned agreement with nobody placed under it is an ordinary negotiation and stays off the queue', () => {
    const q = tasks([row({ findings: [finding({ severity: 'NOTE' })] })])
    expect(q).toEqual([])
  })

  it('an agreement closer to its end than its own notice period needs somebody, even with nobody placed under it', () => {
    const a = row({
      daysToExpiry: 20,
      terms: { ...row().terms, noticeDays: 60, renewalKind: 'AUTO_RENEW', renewalMonths: 12 },
      findings: [finding({ code: 'MSA_LAPSING', severity: 'NOTE', says: 'It runs out in 20 days.' })],
    })
    expect(insideNoticePeriod(a)).toBe(true)
    expect(tasks([a])).toHaveLength(1)
  })

  it('an agreement further off than its own notice period is not called urgent for it', () => {
    const a = row({ daysToExpiry: 200, terms: { ...row().terms, noticeDays: 60 } })
    expect(insideNoticePeriod(a)).toBe(false)
    expect(noticeSays(a)).toBeNull()
  })

  it('being inside the notice period is explained as the day a decision had to be made by', () => {
    const a = row({
      daysToExpiry: 20,
      terms: {
        ...row().terms,
        noticeDays: 60,
        renewalKind: 'AUTO_RENEW',
        renewalMonths: 12,
        expiresAt: '2026-12-31T00:00:00.000Z',
      },
    })
    const says = noticeSays(a)!
    expect(says).toContain('60 days notice')
    expect(says).toContain('20 days left')
    expect(says).toContain('notice would have had to be given by November 1, 2026')
    expect(says).toContain('renews itself for another 12 months')
  })

  it('an agreement somebody ended is never said to be inside a notice period', () => {
    const a = row({ status: 'TERMINATED', daysToExpiry: 20, terms: { ...row().terms, noticeDays: 60 } })
    expect(insideNoticePeriod(a)).toBe(false)
  })

  it('every thing in the queue carries a reason code, never a note somebody typed', () => {
    const q = tasks([
      row({ headcount: 2, findings: [finding(), finding({ code: 'SOW_MISSING' })] }),
    ])
    expect(q.length).toBeGreaterThan(0)
    for (const t of q) {
      expect(AGREEMENT_REASONS.some((r) => r.code === t.code)).toBe(true)
    }
  })

  it('every reason code the screen can show says what to do about it', () => {
    const missing = AGREEMENT_REASONS.filter((r) => !DO_THIS[r.code])
    expect(missing.map((r) => r.code)).toEqual([])
  })

  it('the worst thing is at the top of the queue — people under torn-up paper before an unsigned scope', () => {
    const q = tasks([
      row({ id: 'a', findings: [finding({ code: 'SOW_UNSIGNED', subjectId: 'e1' })] }),
      row({ id: 'b', findings: [finding({ code: 'MSA_ENDED' })] }),
      row({ id: 'c', findings: [finding({ code: 'MSA_LAPSING' })] }),
    ])
    expect(q.map((t) => t.code)).toEqual(['MSA_ENDED', 'MSA_LAPSING', 'SOW_UNSIGNED'])
  })
})

// ── What the client may read ──────────────────────────────────────────

describe('What each side may read', () => {
  it('a client never sees the supplier’s margin floor on this screen', () => {
    const lines = termLines(row().terms, 'CLIENT')
    expect(lines.map((l) => l.label)).not.toContain('Margin floor')
    expect(JSON.stringify(lines)).not.toContain('20%')
  })

  it('a supplier reading their own agreement does see the floor they set', () => {
    const lines = termLines(row().terms, 'VENDOR')
    expect(lines.find((l) => l.label === 'Margin floor')?.value).toBe('20%')
  })

  it('an agreement with no floor set says none set, never zero percent', () => {
    const lines = termLines({ ...row().terms, minMarginPct: null }, 'VENDOR')
    expect(lines.find((l) => l.label === 'Margin floor')?.value).toBe('None set')
  })

  it('an uncapped agreement says uncapped, because nothing recorded is not a cap of nobody', () => {
    const lines = termLines({ ...row().terms, capacity: null }, 'VENDOR')
    expect(lines.find((l) => l.label === 'People allowed')?.value).toBe('Uncapped')
  })
})

// ── What changed and when ─────────────────────────────────────────────

describe('What the terms were on a day', () => {
  it('an amendment reads as a sentence with the day on it, not as a field dump', () => {
    const heading = amendmentHeading({
      version: 3,
      action: 'AMENDED',
      changed: ['payment days'],
      reason: 'Amendment 2, signed 14 March.',
      changedAt: '2026-03-14T09:00:00.000Z',
      changedBy: { id: 'p1', name: 'Dana Whitfield' },
      says: 'Dana Whitfield changed payment days — amendment 3.',
      terms: {
        paymentTermsDays: 45,
        currency: 'USD',
        minMarginPct: 20,
        capacity: null,
        effectiveDate: '2026-01-01T00:00:00.000Z',
        expiresAt: '2026-12-31T00:00:00.000Z',
        renewalKind: 'FIXED',
        renewalMonths: null,
        noticeDays: 60,
      },
    })
    expect(heading).toBe('March 14, 2026 — Dana Whitfield changed payment days — amendment 3.')
    expect(heading).not.toContain('paymentTerms')
  })

  it('the terms of an amendment read in the trade’s words, never as column names', () => {
    const lines = termLines(
      {
        paymentTerms: 45,
        currency: 'USD',
        minMarginPct: null,
        capacity: 12,
        effectiveDate: '2026-01-01T00:00:00.000Z',
        expiresAt: null,
        renewalKind: 'EVERGREEN',
        renewalMonths: null,
        noticeDays: 60,
      },
      'VENDOR'
    )
    expect(lines.find((l) => l.label === 'Payment days')?.value).toBe('Net 45')
    expect(lines.find((l) => l.label === 'Runs to')?.value).toBe('No end date on file')
    expect(lines.find((l) => l.label === 'Renews')?.value).toBe('Rolls on until somebody ends it')
    expect(lines.find((l) => l.label === 'Notice')?.value).toBe('60 days')
    const dump = JSON.stringify(lines)
    for (const column of ['paymentTerms', 'minMarginPct', 'renewalKind', 'noticeDays']) {
      expect(dump).not.toContain(column)
    }
  })

  it('payment days of nothing read as due on receipt, not as Net 0', () => {
    const lines = termLines({ ...row().terms, paymentTermsDays: 0 }, 'VENDOR')
    expect(lines.find((l) => l.label === 'Payment days')?.value).toBe('Due on receipt')
  })
})

// ── Empty, and the filters ────────────────────────────────────────────

describe('A screen with nothing on it yet', () => {
  it('a company with no agreements is told what to do first, not just that the list is empty', () => {
    for (const role of ['VENDOR', 'CLIENT'] as const) {
      const empty = emptySays(role)
      expect(empty.message).toContain('No agreements')
      expect(empty.detail.length).toBeGreaterThan(80)
      expect(empty.detail).toMatch(/record|Record/)
    }
  })

  it('the same list can be asked five questions, and every one of them means something', () => {
    const list = [
      row({ id: 'a', findings: [finding()] }),
      row({ id: 'b', status: 'TERMINATED' }),
      row({ id: 'c', daysToExpiry: 30 }),
      row({
        id: 'd',
        signing: {
          says: '',
          signatures: [signature({ party: 'VENDOR' }), signature({ party: 'CLIENT' })],
        },
      }),
    ]
    expect(list.filter((r) => matchesFilter(r, 'all')).map((r) => r.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(list.filter((r) => matchesFilter(r, 'needs')).map((r) => r.id)).toEqual(['a'])
    expect(list.filter((r) => matchesFilter(r, 'ended')).map((r) => r.id)).toEqual(['b'])
    expect(list.filter((r) => matchesFilter(r, 'running-out')).map((r) => r.id)).toEqual(['c'])
    expect(list.filter((r) => matchesFilter(r, 'unsigned')).map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })
})

// ── Two things that are true by being absent ──────────────────────────

describe('The screen itself', () => {
  const PAGE = read('src/app/dashboard/program/agreements/page.tsx')

  it('the terms form never sends a signature date, because a date with nobody behind it is not a signature', () => {
    // The route refuses `signedAt` on PATCH for this reason. The old page
    // sent it on every save, so every amendment failed and nobody knew.
    const start = PAGE.indexOf('function AmendForm(')
    expect(start, 'the terms form is not on the page at all').toBeGreaterThan(-1)
    // A top-level declaration in this file ends at a closing brace alone
    // on its own line — not at the first `\n}`, which is the closing of
    // the destructured parameter's type annotation.
    const end = PAGE.indexOf('\n}\n', start)
    // Comments stripped: the one inside the form explains why the
    // signature is not there and quotes the field name.
    const form = PAGE.slice(start, end)
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n')
    expect(form).toContain('JSON.stringify({')
    expect(form).not.toContain('signedAt')
  })

  it('the agreements list offers a feed as well as a table, like every other list', () => {
    expect(PAGE).toContain("from '@/components/list-surface'")
    expect(PAGE).toContain('<ListSurface')
  })

  it('every signature on the screen is drawn with a name, a title and a date beside it', () => {
    expect(PAGE).toContain('sig.signerName')
    expect(PAGE).toContain('sig.signerTitle')
    expect(PAGE).toContain('onDay(sig.signedAt)')
  })

  it('the screen reaches for no color outside the brand', () => {
    const offBrand = PAGE.match(/bg-(red|amber|orange|emerald|green|blue|yellow|purple|indigo)-\d00/g)
    expect(offBrand).toBeNull()
  })
})

// ── Who the client may be told about ─────────────────────────────

/**
 * A sub-vendor's name is the prime's to keep, unless the client's
 * agreement with the prime requires disclosure. That is one column,
 * `MasterAgreement.disclosesSubVendors`, off by default, on the version
 * trail — and for a day it was a decision only reachable by sending a
 * PATCH by hand, because no screen drew it. These are the sentences that
 * would have caught that.
 */

describe('Whether the firms behind a placement are named to the client', () => {
  const clientRow = row({ role: 'CLIENT', counterparty: { id: 'v1', name: 'Computer Systems' } })

  it('the terms panel says whether the firms behind a placement are named to this client', () => {
    const named = termLines({ ...row().terms, disclosesSubVendors: true }, 'VENDOR')
    expect(named.find((l) => l.label === 'Sub-vendor names')?.value).toBe('Named to this client')
  })

  it('a supplier that agreed nothing reads that the names are its own to keep', () => {
    const lines = termLines(row().terms, 'VENDOR')
    expect(lines.find((l) => l.label === 'Sub-vendor names')?.value).toBe('Ours to keep')
  })

  it('a client reading the same agreement sees whether the names are disclosed to it', () => {
    const withheld = termLines(clientRow.terms, 'CLIENT')
    expect(withheld.find((l) => l.label === 'Sub-vendor names')?.value).toBe('Not named to us')
    const named = termLines({ ...clientRow.terms, disclosesSubVendors: true }, 'CLIENT')
    expect(named.find((l) => l.label === 'Sub-vendor names')?.value).toBe('Named to us')
  })

  it('an amendment recorded before the term existed says nothing about it rather than guessing', () => {
    // An older version snapshot carries no answer. Printing today's
    // default as March's agreement would be a fact nobody can stand
    // behind, so the line is left off the trail entirely.
    const lines = termLines(
      {
        paymentTerms: 45,
        currency: 'USD',
        minMarginPct: null,
        capacity: null,
        effectiveDate: null,
        expiresAt: null,
        renewalKind: 'EVERGREEN',
        renewalMonths: null,
        noticeDays: null,
      },
      'VENDOR'
    )
    expect(lines.map((l) => l.label)).not.toContain('Sub-vendor names')
  })

  it('the control is off unless the agreement says otherwise, because the name is the prime’s to keep', () => {
    expect(disclosureControl({}, 'VENDOR', 'ACTIVE', 'Northwind').checked).toBe(false)
    expect(
      disclosureControl({ disclosesSubVendors: null }, 'VENDOR', 'ACTIVE', 'Northwind').checked
    ).toBe(false)
  })

  it('the control is bound to the agreement’s own term, not to a preference', () => {
    const on = disclosureControl(row().terms, 'VENDOR', 'ACTIVE', 'Northwind')
    expect(on.checked).toBe(false)
    const off = disclosureControl(
      { ...row().terms, disclosesSubVendors: true, disclosureSays: 'Sub-vendors are named to the client.' },
      'VENDOR',
      'ACTIVE',
      'Northwind'
    )
    expect(off.checked).toBe(true)
    expect(off.says).toBe('Sub-vendors are named to the client.')
  })

  it('the supplier is asked in its own words whether to name its sub-vendors to this client', () => {
    const control = disclosureControl(row().terms, 'VENDOR', 'ACTIVE', 'Northwind')
    expect(control.label).toBe('Name our sub-vendors to this client')
    expect(control.editable).toBe(true)
    expect(control.whyNot).toBeNull()
    expect(control.says.length).toBeGreaterThan(20)
  })

  it('a client may read who gets named but not change it, and is told whose terms these are', () => {
    const control = disclosureControl(clientRow.terms, 'CLIENT', 'ACTIVE', 'Computer Systems')
    expect(control.editable).toBe(false)
    expect(control.label).toContain('Computer Systems')
    expect(control.whyNot).toContain('Computer Systems')
    expect(control.whyNot).toMatch(/amend/)
  })

  it('an ended agreement offers nobody the control, and says why rather than going gray', () => {
    const control = disclosureControl(row().terms, 'VENDOR', 'TERMINATED', 'Northwind')
    expect(control.editable).toBe(false)
    expect(control.whyNot).toContain('history')
  })

  it('never shows a blank where the term should be, whichever side is reading', () => {
    for (const role of ['VENDOR', 'CLIENT'] as const) {
      for (const discloses of [true, false]) {
        const control = disclosureControl({ disclosesSubVendors: discloses }, role, 'ACTIVE', 'Northwind')
        expect(control.says.trim()).not.toBe('')
        expect(control.label.trim()).not.toBe('')
      }
    }
  })
})

describe('Changing who gets named is an amendment, not a setting', () => {
  const filled = {
    paymentTermsDays: '45',
    marginFloor: '20',
    capacity: '',
    starts: '2026-01-01',
    ends: '2026-12-31',
    renewalKind: 'FIXED',
    renewalMonths: '',
    noticeDays: '60',
    disclosesSubVendors: false,
    reason: '',
  }

  it('ticking the box goes through the amendment path with every other term', () => {
    const body = amendmentBody({ ...filled, disclosesSubVendors: true })
    expect(body.disclosesSubVendors).toBe(true)
    expect(body.paymentTerms).toBe(45)
    expect(body.minMarginPct).toBe(20)
  })

  it('unticking it is sent too, so taking the entitlement away is on the trail as well as granting it', () => {
    expect(amendmentBody(filled).disclosesSubVendors).toBe(false)
  })

  it('the amendment carries the reason somebody typed, the way every other term change does', () => {
    const body = amendmentBody({
      ...filled,
      disclosesSubVendors: true,
      reason: '  Amendment 3, signed 2 April — Northwind is entitled to the names.  ',
    })
    expect(body.reason).toBe('Amendment 3, signed 2 April — Northwind is entitled to the names.')
  })

  it('an amendment nobody explained sends no reason at all, rather than an empty one', () => {
    expect(amendmentBody(filled).reason).toBeUndefined()
  })

  it('the amendment form still never sends a signature, whatever else moved', () => {
    expect(Object.keys(amendmentBody({ ...filled, disclosesSubVendors: true }))).not.toContain(
      'signedAt'
    )
  })

  it('a blank field is sent as nothing on file, not as zero', () => {
    const body = amendmentBody({ ...filled, capacity: '', noticeDays: '', marginFloor: '' })
    expect(body.capacity).toBeNull()
    expect(body.noticeDays).toBeNull()
    expect(body.minMarginPct).toBeNull()
  })
})

describe('The control is actually on the screen', () => {
  const PAGE = read('src/app/dashboard/program/agreements/page.tsx')

  it('the terms panel draws the disclosure term for whoever is reading it', () => {
    expect(PAGE).toContain('disclosureControl(')
    expect(PAGE).toContain('<Disclosure control={disclosure} />')
  })

  it('the supplier’s amendment form carries a checkbox for naming its sub-vendors', () => {
    const start = PAGE.indexOf('function AmendForm(')
    const form = PAGE.slice(start, PAGE.indexOf('\n}\n', start))
    expect(form).toContain('type="checkbox"')
    expect(form).toContain('name="disclosesSubVendors"')
    expect(form).toContain('Name our sub-vendors to this client')
  })

  it('the checkbox shows what the agreement says today, and sends what the reader set', () => {
    const start = PAGE.indexOf('function AmendForm(')
    const form = PAGE.slice(start, PAGE.indexOf('\n}\n', start))
    expect(form).toContain('useState(t.disclosesSubVendors === true)')
    expect(form).toContain('checked={discloses}')
    expect(form).toContain('disclosesSubVendors: discloses')
    expect(form).toContain('amendmentBody({')
  })

  it('the client sees the term on the same panel, with no control to change it', () => {
    // TermPanel is drawn for both sides; only the supplier is handed the
    // amendment form. The client's copy is the sentence and the chip.
    const start = PAGE.indexOf('function TermPanel(')
    const panel = PAGE.slice(start, PAGE.indexOf('\n}\n', start))
    expect(panel).toContain('<Disclosure control={disclosure} />')
    expect(panel).toContain('{editable && agreement.status !==')
  })
})
