import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { globSync } from 'glob'
import {
  describeLine,
  lineHeading,
  lineName,
  lineDoes,
  masterContractLine,
  pairLine,
  paidBy,
  AGREEMENT_WORD,
  MASTER_CONTRACT_WORD,
} from '@/lib/order-naming'
import { nextLineOnSameDocument } from '@/lib/replacement'

/**
 * A purchase order is a header and its lines.
 *
 * `WorkOrder` is the header; `SellContract` and `BuyContract` are its
 * lines (CLAUDE.md, 2026-09-18). Two rows stay and the two documents
 * become one, which means a line needs a name of its own — and the name
 * is never a row id, because nobody has ever read a cuid to an AP clerk.
 *
 * The founder's own words for the two sides may appear on a screen:
 *
 *   > Sell contract will bill customer. Buy contract will pay supplier
 *   > or run payroll for candidate.
 *
 * What may not appear is either one offered as a document of its own,
 * with its own creation flow, beside the order it is a line of.
 */

const CLIENT = 'co-northbend'
const SUPPLIER = 'co-veritan'
const STRANGER = 'co-auralis'

const ORDER = {
  issuedById: CLIENT,
  issuedToId: SUPPLIER,
  billToId: null,
  payerId: null,
  number: 'PO-4471',
  sellerNumber: 'SO-0913',
}

const SELL_LINE = { side: 'SELL' as const, personName: 'Priya Raman', siteName: 'Tualatin, OR' }

describe('a line has a name, and it is the person and the place', () => {
  it('the client reads the paper it raised as a purchase order, and this line as line two of five', () => {
    expect(lineHeading(ORDER, CLIENT, { position: 2, of: 5 })).toBe(
      'Purchase order PO-4471, line 2 of 5'
    )
  })

  it('the supplier reads the same row as its own sales order, quoting its own number', () => {
    expect(lineHeading(ORDER, SUPPLIER, { position: 2, of: 5 })).toBe(
      'Sales order SO-0913, line 2 of 5'
    )
  })

  it('a reader who is neither party gets the trade’s own word for the document', () => {
    expect(lineHeading(ORDER, STRANGER, { position: 2, of: 5 })).toContain('Work order')
  })

  it('a line is named by the person and the site, and never by a contract id', () => {
    expect(lineName(SELL_LINE)).toBe('Priya Raman — Tualatin, OR')
    expect(lineName({ ...SELL_LINE, siteName: null })).toBe('Priya Raman')
    const described = describeLine({ order: ORDER, companyId: CLIENT, line: SELL_LINE, place: { position: 2, of: 5 } })
    expect(described.says).not.toMatch(/c[a-z0-9]{24}/)
    expect(described.says).toContain('Priya Raman')
  })

  it('a count nobody loaded is left off rather than guessed — “line 2”, never “line 2 of 1”', () => {
    expect(lineHeading(ORDER, SUPPLIER, { position: 2 })).toBe('Sales order SO-0913, line 2')
    expect(lineHeading(ORDER, SUPPLIER, { position: 2, of: 1 })).toBe('Sales order SO-0913, line 2')
  })
})

describe('what each side of the trade is for', () => {
  it('the sell line is what the firm bills the customer from', () => {
    expect(lineDoes(SELL_LINE, 'SELLER')).toBe('You bill from this line.')
    expect(lineDoes(SELL_LINE, 'BUYER')).toBe('Your supplier bills from this line.')
  })

  it('a buy line below a sub-vendor is paid against that firm’s invoice, received and matched', () => {
    const line = { side: 'BUY' as const, personName: 'Priya Raman', paidToName: 'Veritan Talent' }
    expect(paidBy(line)).toBe('INVOICE_RECEIPT')
    expect(lineDoes(line, 'BUYER')).toContain("Veritan Talent's invoice")
  })

  it('a buy line for the firm’s own employee is paid by payroll, and no order is raised to an employee', () => {
    const line = { side: 'BUY' as const, personName: 'Karthik Menon', paidToName: null }
    expect(paidBy(line)).toBe('PAYROLL')
    expect(lineDoes(line, 'BUYER')).toContain('payroll')
    const described = describeLine({ order: null, companyId: SUPPLIER, line })
    expect(described.says).toContain('no order, and none is due'.slice(3))
    expect(described.says).toContain('you do not raise one to your own employee')
  })
})

describe('a line with no document behind it says so, in a sentence', () => {
  it('a placement written before anybody raised an order says what will attach, and where', () => {
    const described = describeLine({ order: null, companyId: SUPPLIER, line: SELL_LINE })
    expect(described.onOrder).toBe(false)
    expect(described.says).toBe(
      "Not yet on an order. The client's paper, when it arrives, attaches here."
    )
  })

  it('a buy line waiting on the order we owe a sub-vendor names the firm it is owed to', () => {
    const described = describeLine({
      order: null,
      companyId: SUPPLIER,
      line: { side: 'BUY', personName: 'Priya Raman', paidToName: 'Pinnacle Staffing' },
    })
    expect(described.says).toContain('The order you raise to Pinnacle Staffing attaches here.')
  })
})

describe('the three levels above a line, each with one word', () => {
  it('the roll-up a company tags its lines to is the master contract — the 2017 word, kept', () => {
    expect(MASTER_CONTRACT_WORD.noun).toBe('master contract')
    expect(masterContractLine({ code: 'PRJ-0042', name: 'Northbend platform rebuild' })).toBe(
      'Master contract PRJ-0042 — Northbend platform rebuild.'
    )
  })

  it('a line on no master contract is offered one rather than warned about it — tagging is the company’s choice', () => {
    expect(masterContractLine(null)).toBe(
      "Not on a master contract. Tag it to one to see this deal's margin alongside its siblings."
    )
    expect(masterContractLine(null)).not.toMatch(/must|required|missing/i)
  })

  it('the legal umbrella between two firms is the agreement, or the MSA, and never “master agreement”', () => {
    expect(AGREEMENT_WORD.Noun).toBe('Agreement')
    expect(AGREEMENT_WORD.short).toBe('MSA')
    expect(`${AGREEMENT_WORD.Noun} ${AGREEMENT_WORD.noun}`.toLowerCase()).not.toContain('master')
  })

  it('a placement’s own pair is the line that funds it, or payroll where the firm employs them', () => {
    expect(pairLine({ side: 'SELL', counterpartName: 'Pinnacle Staffing' })).toContain('Pinnacle Staffing')
    expect(pairLine({ side: 'SELL', counterpartName: null })).toContain('payroll')
  })
})

describe('somebody taking over a seat joins the document, and does not start a new one', () => {
  const header = {
    id: 'wo-1',
    number: 'PO-4471',
    billFrequency: 'BIWEEKLY',
    billAnchor: 'CONTRACT_START',
    billStraddle: 'TO_LATER',
    paymentTerms: 45,
    startDate: new Date('2026-01-05'),
    endDate: new Date('2026-12-31'),
  }
  const old = {
    workOrderId: 'wo-1',
    projectOrderId: 'prj-7',
    engagementId: 'eng-3',
    msaId: 'msa-9',
    billFrequency: 'MONTHLY',
    billAnchor: 'CALENDAR',
    billStraddle: 'SPLIT',
    paymentTerms: 30,
    paymentTermsFrom: 'PERIOD_END',
  }
  const at = { startsOn: new Date('2026-06-01'), endsOn: new Date('2026-12-31') }

  it('the person who takes over a seat is a line on the same order as the person who left it', () => {
    const next = nextLineOnSameDocument({ old, header, ...at, outgoingName: 'Priya Raman', incomingName: 'Ravi Menon' })
    expect(next.workOrderId).toBe('wo-1')
    expect(next.says).toContain('PO-4471')
    expect(next.says).toContain('the same document')
  })

  it('the new line is billed on the document’s rhythm, not on the old line’s copy of it', () => {
    const next = nextLineOnSameDocument({ old, header, ...at, outgoingName: 'Priya Raman', incomingName: 'Ravi Menon' })
    expect(next.billFrequency).toBe('BIWEEKLY')
    expect(next.billAnchor).toBe('CONTRACT')
    expect(next.billStraddle).toBe('END')
    expect(next.paymentTerms).toBe(45)
    expect(next.termsFrom).toBe('ORDER')
  })

  it('the dates stay the person’s, because a line is a person and a document is not', () => {
    const next = nextLineOnSameDocument({ old, header, ...at, outgoingName: 'Priya Raman', incomingName: 'Ravi Menon' })
    expect(next.startDate).toEqual(at.startsOn)
    expect(next.endDate).toEqual(at.endsOn)
  })

  it('a replacement carries the master contract tag the old line had, and never invents one', () => {
    const next = nextLineOnSameDocument({ old, header, ...at, outgoingName: 'Priya', incomingName: 'Ravi' })
    expect(next.projectOrderId).toBe('prj-7')
    const untagged = nextLineOnSameDocument({
      old: { ...old, projectOrderId: null }, header, ...at, outgoingName: 'Priya', incomingName: 'Ravi',
    })
    expect(untagged.projectOrderId).toBeNull()
  })

  it('a line running past the last day of the order says so rather than being quietly shortened', () => {
    const next = nextLineOnSameDocument({
      old,
      header: { ...header, endDate: new Date('2026-09-30') },
      startsOn: at.startsOn,
      endsOn: new Date('2026-12-31'),
      outgoingName: 'Priya',
      incomingName: 'Ravi',
    })
    expect(next.outsideOrderWindow).toBe(true)
    expect(next.endDate).toEqual(new Date('2026-12-31'))
  })

  it('a seat that was never on an order does not acquire one by somebody being replaced', () => {
    const next = nextLineOnSameDocument({
      old: { ...old, workOrderId: null },
      header: null,
      ...at,
      outgoingName: 'Priya Raman',
      incomingName: 'Ravi Menon',
    })
    expect(next.workOrderId).toBeNull()
    expect(next.says).toContain('The paper, when it arrives, attaches to both.')
  })

  it('the route that replaces somebody writes the line through that one door', () => {
    const src = read('src/app/api/placements/[id]/replace/route.ts')
    expect(src).toContain('nextLineOnSameDocument')
    expect(src).toContain('workOrderId: line.workOrderId')
    expect(src).toContain('projectOrderId: line.projectOrderId')
  })
})

// ── The guard: a line is never a document of its own ─────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

/** Source with its comments removed, so a note about a word is not a word on a screen. */
function spoken(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

const screens = [
  ...globSync('src/app/dashboard/**/*.tsx'),
  ...globSync('src/components/**/*.tsx'),
]

/** "New sell contract", "Create buy contracts", "Add a sell contract". */
const OFFERS_A_CONTRACT_AS_A_DOCUMENT = /\b(new|create|creates|add|raise)\b[^"'`\n]{0,24}\b(sell|buy)\s+contract/i

/**
 * Screens whose subject is the contract itself. Anywhere else a contract
 * id is a join — a timesheet is filed against one, an invoice bills one —
 * and naming the order on every such screen would be noise. These three
 * are where a person goes to read the thing, so these three have to say
 * what document it is part of.
 */
const CONTRACT_SCREENS = [
  'src/app/dashboard/contracts/page.tsx',
  'src/app/dashboard/placements/[id]/page.tsx',
]

const NAMES_A_DOCUMENT = /purchase order|sales order|work order|order-naming|document\.heading/i

/**
 * Screens that still show a line as a document of its own.
 *
 * Named with the agent who answers for each and what it costs a reader,
 * on the pattern of `client-facing-names.test.ts`: a list that grows
 * fails the build, and a file fixed and left on the list fails it too,
 * so the list cannot quietly become decoration.
 */
const KNOWN_TO_SHOW_A_LINE_AS_A_DOCUMENT: Record<string, string> = {
  'src/app/dashboard/contracts/page.tsx':
    'etyme-money — the Contracts screen creates a sell contract and a linked buy contract from its own ' +
    'form, lists them as rows, and never names the order either one is a line of. A reader concludes ' +
    'the contract is the document and the order is something else, which is the confusion the ' +
    'header-and-lines correction exists to end. Money applies the words to its screens in the piece ' +
    'after this one.',
  'src/app/dashboard/payroll/page.tsx':
    'etyme-money — "Create buy contracts to set up payroll for your consultants" offers the pay line as ' +
    'a thing to create on its own. A buy line is a line on an order, or on nothing at all where the ' +
    'firm employs the person; payroll is how it is settled, not what it is.',
}

describe('a sell line and a buy line are lines, never documents beside the order', () => {
  it('no screen offers a sell contract or a buy contract as a thing to create on its own', () => {
    const offenders = screens
      .filter((f) => OFFERS_A_CONTRACT_AS_A_DOCUMENT.test(spoken(read(f))))
      .filter((f) => !(f in KNOWN_TO_SHOW_A_LINE_AS_A_DOCUMENT))
    expect(
      offenders,
      'these offer a line as a document of its own. A line is created on an order, or beside the ' +
        'person it pays:\n  ' + offenders.join('\n  ')
    ).toEqual([])
  })

  it('a screen whose subject is the contract names the document it is a line of', () => {
    const silent = CONTRACT_SCREENS
      .filter((f) => !NAMES_A_DOCUMENT.test(read(f)))
      .filter((f) => !(f in KNOWN_TO_SHOW_A_LINE_AS_A_DOCUMENT))
    expect(
      silent,
      'these read a contract as the whole story and never say what document it is part of:\n  ' +
        silent.join('\n  ')
    ).toEqual([])
  })

  it('the placement screen shows the document, its ceiling, and everybody else on it', () => {
    const page = read('src/app/dashboard/placements/[id]/page.tsx')
    expect(page).toContain('function Document(')
    expect(page).toContain('doc.heading')
    expect(page).toContain('Billed against it')
    expect(page).toContain('One document, {lines.length} lines.')

    const route = read('src/app/api/placements/[id]/route.ts')
    expect(route).toContain('describeLine')
    expect(route).toContain('poBalance')
    // The siblings travel with the header, so five people on one order
    // read as one document with five lines.
    expect(route).toContain("where: { workOrderId: header.id }")
  })

  it('every screen still on that list says whose it is and what it costs a reader', () => {
    for (const [file, why] of Object.entries(KNOWN_TO_SHOW_A_LINE_AS_A_DOCUMENT)) {
      expect(why, `${file} needs the agent who answers for it`).toMatch(/etyme-[a-z]+ —/)
      expect(why.length, `${file} needs to say what it costs a reader`).toBeGreaterThan(80)
    }
  })

  it('and nothing stays on that list once somebody has named the document', () => {
    const fixed = Object.keys(KNOWN_TO_SHOW_A_LINE_AS_A_DOCUMENT).filter((f) => {
      const src = read(f)
      return !OFFERS_A_CONTRACT_AS_A_DOCUMENT.test(spoken(src)) && NAMES_A_DOCUMENT.test(src)
    })
    expect(
      fixed,
      'these name the document now — take them off the list so it keeps meaning something:\n  ' +
        fixed.join('\n  ')
    ).toEqual([])
  })
})

// ── The two words that must never sound like one ─────────────────────

const SPELLS_OUT_MASTER_AGREEMENT = /master\s+agreements?/i

const KNOWN_TO_SPELL_OUT_MASTER_AGREEMENT: Record<string, string> = {
  'src/lib/billing-cascade.ts':
    'etyme-money — the cascade names its own top rung "the master agreement" in the sentence it hands ' +
    'a screen, so a payment term explained to a client reads the collision out loud. One word in one ' +
    'return, and the file is money\'s and live in their current piece.',
  'src/app/dashboard/program/agreements/page.tsx':
    'etyme-demand — the placeholder in "why it is ending" reads "Replaced by the 2027 master agreement". ' +
    'Beside the master contract, which is the profitability roll-up, a reader hears one thing where ' +
    'there are two. "Agreement" alone says it.',
  'src/app/dashboard/program/agreements/standing.ts':
    'etyme-demand — the empty state tells a client to "record the master agreement when it is signed". ' +
    'Same collision, on the first screen a client with no agreements sees, which is the worst place ' +
    'for it.',
}

describe('the agreement and the master contract are two things, and a screen never blurs them', () => {
  it('no screen spells out “master agreement”, because beside “master contract” the two become one thing', () => {
    const files = [
      ...globSync('src/app/**/*.tsx'),
      ...globSync('src/app/**/*.ts'),
      ...globSync('src/components/**/*.tsx'),
      ...globSync('src/lib/**/*.ts'),
    ]
    const offenders = files
      .filter((f) => SPELLS_OUT_MASTER_AGREEMENT.test(spoken(read(f))))
      .filter((f) => !(f in KNOWN_TO_SPELL_OUT_MASTER_AGREEMENT))
    expect(
      offenders,
      'these say "master agreement" where a person can read it. The agreement is "Agreement" or ' +
        '"MSA"; "master contract" is the profitability roll-up and nothing else:\n  ' +
        offenders.join('\n  ')
    ).toEqual([])
  })

  it('and nothing stays on that list once somebody has taken the word out', () => {
    const fixed = Object.keys(KNOWN_TO_SPELL_OUT_MASTER_AGREEMENT).filter(
      (f) => !SPELLS_OUT_MASTER_AGREEMENT.test(spoken(read(f)))
    )
    expect(
      fixed,
      'these no longer spell it out — take them off the list:\n  ' + fixed.join('\n  ')
    ).toEqual([])
  })
})
