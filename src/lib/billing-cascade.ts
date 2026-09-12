/**
 * Where a billing term actually came from.
 *
 * The schema said payment terms "cascade from the MSA, overridable". That
 * was a comment and not code — nothing read the agreement, so every
 * contract got net 30 until somebody retyped it, and a client with net 45
 * in their signed agreement was silently invoiced on net 30 forever.
 *
 * Four levels, most general to most specific:
 *
 *   PLATFORM   what the system assumes when nobody has said
 *   COMPANY    what this company does by default
 *   AGREEMENT  what the signed master agreement says
 *   CONTRACT   what was agreed for this one placement
 *
 * The important part is not the precedence — that is obvious. It is that
 * every resolved value carries where it came from. When an invoice is
 * wrong, the question is which level to fix, and a bare number cannot
 * answer it. Somebody patches the invoice instead, and next month it is
 * wrong again.
 */

export type Source = 'PLATFORM' | 'COMPANY' | 'AGREEMENT' | 'CONTRACT'

export interface Resolved<T> {
  value: T
  /** Which level decided it. */
  source: Source
  /** In words, for the screen: "from your agreement with Terumo BCT". */
  because: string
  /** What the level below would have given, when something overrode it. */
  overrode: { value: T; source: Source } | null
}

/** The system's own assumptions, used only when nobody has said otherwise. */
export const PLATFORM_DEFAULTS = {
  paymentTermsDays: 30,
  currency: 'USD',
  /** Whether an invoice must quote a purchase order to be payable. */
  poRequired: false,
} as const

export interface Level<T> {
  source: Source
  value: T | null | undefined
  /** How to describe this level when it wins. */
  label: string
}

/**
 * Pick the most specific level that actually said something.
 *
 * Null and undefined both mean "did not say". Zero does not — a zero-day
 * payment term is due on receipt, which is a real arrangement, and
 * treating it as absent would silently push it to net 30.
 */
export function resolve<T>(levels: Level<T>[], platform: T, platformLabel: string): Resolved<T> {
  const order: Source[] = ['CONTRACT', 'AGREEMENT', 'COMPANY', 'PLATFORM']
  const said = levels.filter((l) => l.value !== null && l.value !== undefined)

  const sorted = said
    .slice()
    .sort((a, b) => order.indexOf(a.source) - order.indexOf(b.source))

  if (sorted.length === 0) {
    return {
      value: platform,
      source: 'PLATFORM',
      because: platformLabel,
      overrode: null,
    }
  }

  const winner = sorted[0]
  const next = sorted[1]

  return {
    value: winner.value as T,
    source: winner.source,
    because: winner.label,
    // Only counts as an override when the value below actually differs.
    // Reporting "overrode net 30 with net 30" is noise that trains people
    // to ignore the field.
    overrode:
      next && next.value !== winner.value
        ? { value: next.value as T, source: next.source }
        : next === undefined && winner.source !== 'PLATFORM' && winner.value !== platform
          ? { value: platform, source: 'PLATFORM' }
          : null,
  }
}

// ── The three that matter ─────────────────────────────────────────────

export interface CascadeInputs {
  company: { paymentTermsDays?: number | null; currency?: string | null; name: string }
  agreement: {
    paymentTermsDays?: number | null
    currency?: string | null
    counterpartyName: string
  } | null
  contract: { paymentTermsDays?: number | null; currency?: string | null } | null
}

export interface BillingTerms {
  paymentTermsDays: Resolved<number>
  currency: Resolved<string>
}

export function resolveBillingTerms(input: CascadeInputs): BillingTerms {
  const agreementLabel = input.agreement
    ? `from your agreement with ${input.agreement.counterpartyName}`
    : ''

  return {
    paymentTermsDays: resolve<number>(
      [
        { source: 'CONTRACT', value: input.contract?.paymentTermsDays, label: 'set on this contract' },
        { source: 'AGREEMENT', value: input.agreement?.paymentTermsDays, label: agreementLabel },
        { source: 'COMPANY', value: input.company.paymentTermsDays, label: `${input.company.name}'s default` },
      ],
      PLATFORM_DEFAULTS.paymentTermsDays,
      'nobody has set payment terms, so net 30 is assumed'
    ),
    currency: resolve<string>(
      [
        { source: 'CONTRACT', value: input.contract?.currency, label: 'set on this contract' },
        { source: 'AGREEMENT', value: input.agreement?.currency, label: agreementLabel },
        { source: 'COMPANY', value: input.company.currency, label: `${input.company.name}'s default` },
      ],
      PLATFORM_DEFAULTS.currency,
      'nobody has set a currency, so US dollars is assumed'
    ),
  }
}

/**
 * Said the way somebody would say it, for the screen.
 *
 * "Net 45, from your agreement with Terumo BCT" beats "45" every time an
 * invoice is queried, because it names the document to go and read.
 */
export function explain(r: Resolved<number>): string {
  return `Net ${r.value}, ${r.because}`
}

/**
 * When an override is worth mentioning.
 *
 * Only a contract departing from the signed agreement is a concern. That
 * is somebody having agreed something they may not have meant to, and it
 * is the commonest way money goes missing quietly.
 *
 * An agreement departing from a company default is not a concern at all —
 * the agreement is the thing that was actually signed, and overriding a
 * default is exactly its job. Flagging that would put a warning on every
 * negotiated contract a company has, which teaches people to ignore the
 * warning that matters.
 */
export function overrideConcern(r: Resolved<number>): { concern: boolean; note: string } | null {
  if (!r.overrode) return null

  // A default being superseded by something signed is ordinary.
  if (r.source !== 'CONTRACT') return null

  const worse = r.value > r.overrode.value
  return {
    concern: worse,
    note: worse
      ? `This contract is on net ${r.value} where ${sourceWords(r.overrode.source)} says net ${r.overrode.value}. You wait ${r.value - r.overrode.value} days longer to be paid than you agreed to.`
      : `This contract is on net ${r.value}, better than the net ${r.overrode.value} in ${sourceWords(r.overrode.source)}.`,
  }
}

function sourceWords(s: Source): string {
  switch (s) {
    case 'AGREEMENT': return 'the master agreement'
    case 'COMPANY': return 'your company default'
    case 'CONTRACT': return 'the contract'
    case 'PLATFORM': return 'the system default'
  }
}

// ═════════════════════════════════════════════════════════════════════
// PARTNER FUNCTIONS — who is who on an invoice
// ═════════════════════════════════════════════════════════════════════
//
// A large client signs in one entity, is billed through a shared services
// centre in another country, has the work done at a third site, and pays
// from a fourth. Treating those as one party is how an invoice reaches
// the wrong address and ages ninety days before anybody notices.
//
// SAP calls these partner functions and there are four that matter here:
//
//   SOLD_TO   who signed the agreement this is issued under
//   BILL_TO   where the invoice is sent
//   SHIP_TO   where the work was actually done — which decides the tax
//   PAYER     who settles it, where that is not the bill-to
//
// All four default to the client on the agreement, which is the ordinary
// case and must not need four rows of setup. The point of resolving them
// explicitly is that every one carries where it came from, so when an
// invoice goes to the wrong place the question "which record to fix" has
// an answer.

export type PartnerFunction = 'SOLD_TO' | 'BILL_TO' | 'SHIP_TO' | 'PAYER'

/** Where a partner function was decided. Most specific first. */
export type PartnerSource = 'CONTRACT' | 'ENGAGEMENT' | 'AGREEMENT'

export interface Party {
  id: string
  name: string
}

/**
 * Where work is done. Carries the country and, in the US and India, the
 * state — because place of supply is a fact about a location and not
 * about a company.
 */
export interface Place extends Party {
  country: string
  /** ISO 3166-2 subdivision, where the country taxes by one. */
  state?: string | null
}

export interface ResolvedPartner<T extends Party> {
  function: PartnerFunction
  party: T
  source: PartnerSource
  because: string
  /** True where this is simply the agreement's client with no override. */
  isDefault: boolean
}

export interface PartnerInputs {
  /** The client on the master agreement. The default for all four. */
  agreementClient: Party
  /** Set on the engagement — a shared services centre, usually. */
  engagement?: {
    soldTo?: Party | null
    billTo?: Party | null
    shipTo?: Place | null
    payer?: Party | null
  } | null
  /** Set on the individual contract, which beats the engagement. */
  contract?: {
    soldTo?: Party | null
    billTo?: Party | null
    shipTo?: Place | null
    payer?: Party | null
  } | null
  /**
   * Where the agreement itself names a place of performance. Used only
   * for the ship-to, and only when nothing more specific said.
   */
  agreementPlace?: Place | null
}

export interface PartnerFunctions {
  soldTo: ResolvedPartner<Party>
  billTo: ResolvedPartner<Party>
  /**
   * Null where nobody has said where the work was done. Not defaulted to
   * the client's registered address: an invoice taxed at the wrong place
   * of supply is a liability, and guessing the site is exactly how that
   * happens. `taxFor` refuses rather than inventing a rate.
   */
  shipTo: ResolvedPartner<Place> | null
  payer: ResolvedPartner<Party>
  /** True where any of the four departs from the agreement's client. */
  split: boolean
  says: string
}

function pick<T extends Party>(
  fn: PartnerFunction,
  contract: T | null | undefined,
  engagement: T | null | undefined,
  fallback: T | null,
  fallbackWords: string
): ResolvedPartner<T> | null {
  if (contract) {
    return {
      function: fn,
      party: contract,
      source: 'CONTRACT',
      because: `set on this contract`,
      isDefault: false,
    }
  }
  if (engagement) {
    return {
      function: fn,
      party: engagement,
      source: 'ENGAGEMENT',
      because: `set for this engagement`,
      isDefault: false,
    }
  }
  if (!fallback) return null
  return {
    function: fn,
    party: fallback,
    source: 'AGREEMENT',
    because: fallbackWords,
    isDefault: true,
  }
}

/**
 * Who is who on this invoice, and why.
 *
 * The contract beats the engagement beats the agreement, which is the
 * same shape as the payment-terms cascade above and for the same reason:
 * the most specific thing somebody actually said wins.
 */
export function partnerFunctions(i: PartnerInputs): PartnerFunctions {
  const client = i.agreementClient
  const words = `nobody named one, so it is ${client.name} from the agreement`

  const soldTo = pick('SOLD_TO', i.contract?.soldTo, i.engagement?.soldTo, client, words)!
  const billTo = pick('BILL_TO', i.contract?.billTo, i.engagement?.billTo, client, words)!
  const payer = pick('PAYER', i.contract?.payer, i.engagement?.payer, client, words)!

  // The ship-to has no default. A place of supply nobody stated is not
  // the client's head office, and inventing one decides a tax question
  // that has legal consequences.
  const shipTo = pick<Place>(
    'SHIP_TO',
    i.contract?.shipTo,
    i.engagement?.shipTo,
    i.agreementPlace ?? null,
    `the place of performance on the agreement`
  )

  const split =
    !soldTo.isDefault || !billTo.isDefault || !payer.isDefault

  return {
    soldTo,
    billTo,
    shipTo,
    payer,
    split,
    says: split
      ? `Sold to ${soldTo.party.name}, billed to ${billTo.party.name}, settled by ` +
        `${payer.party.name}. They are not all the same company, which is ordinary at ` +
        `this size and is the commonest reason an invoice ages without anybody chasing it.`
      : `${client.name} throughout — signs, is billed, and pays.`,
  }
}

/**
 * Whether several contracts may go on one invoice.
 *
 * Consolidated billing is the ordinary case: one sales order for a
 * five-person project produces five sell contracts and one invoice a
 * month. What it may never do is cross a bill-to, a currency or a payer —
 * an invoice addressed to two companies is a document neither of them
 * will post.
 */
export interface ConsolidationCandidate {
  sellContractId: string
  billToId: string
  billToName: string
  payerId: string
  currency: string
}

export interface ConsolidationVerdict {
  ok: boolean
  /** The contracts that may share one invoice. Empty where none may. */
  together: string[]
  /** Why not, in a sentence somebody can act on. */
  says: string
}

export function mayConsolidate(rows: ConsolidationCandidate[]): ConsolidationVerdict {
  if (rows.length === 0) {
    return { ok: false, together: [], says: 'Nothing to invoice.' }
  }

  const billTos = [...new Set(rows.map((r) => r.billToId))]
  const payers = [...new Set(rows.map((r) => r.payerId))]
  const currencies = [...new Set(rows.map((r) => r.currency.toUpperCase()))]

  if (billTos.length > 1) {
    const names = [...new Set(rows.map((r) => r.billToName))]
    return {
      ok: false,
      together: [],
      says:
        `These contracts are billed to ${names.join(' and ')}. One invoice can only be ` +
        `addressed to one company — raise one per bill-to rather than a document neither ` +
        `of them will accept.`,
    }
  }
  if (payers.length > 1) {
    return {
      ok: false,
      together: [],
      says:
        `These contracts are settled by different payers. Consolidating them produces an ` +
        `invoice that two AP departments each think belongs to the other.`,
    }
  }
  if (currencies.length > 1) {
    return {
      ok: false,
      together: [],
      says:
        `These contracts bill in ${currencies.join(' and ')}. A total across two currencies ` +
        `is a total of nothing.`,
    }
  }

  return {
    ok: true,
    together: rows.map((r) => r.sellContractId),
    says:
      `${rows.length} contract${rows.length === 1 ? '' : 's'} to ${rows[0].billToName} in ` +
      `${currencies[0]}, on one invoice.`,
  }
}

// ── Self-billing ──────────────────────────────────────────────────────
//
// Some clients — and every large VMS — issue the invoice themselves from
// the timesheets they approved, and send it to us. The document is real,
// the money is real, and the number on it is THEIRS.
//
// The failure this guards against: raising our own invoice alongside
// theirs. Two documents for one debt means the client posts one and
// ignores the other, we chase the one they ignored, and the receipt when
// it arrives matches neither number.

export interface SelfBillingInput {
  /** True where the client issues the document, not us. */
  selfBilled: boolean
  /** Their number for it, where they have sent one. */
  clientDocumentNumber?: string | null
}

export interface SelfBillingVerdict {
  selfBilled: boolean
  /** True where we may allocate a number from our own sequence. */
  mayNumberOurselves: boolean
  /** The number to carry on the record. Null where we do not have theirs yet. */
  number: string | null
  says: string
}

export function selfBilling(i: SelfBillingInput): SelfBillingVerdict {
  if (!i.selfBilled) {
    return {
      selfBilled: false,
      mayNumberOurselves: true,
      number: null,
      says: 'We raise this invoice, so it takes the next number in our own sequence.',
    }
  }

  if (!i.clientDocumentNumber || !i.clientDocumentNumber.trim()) {
    return {
      selfBilled: true,
      mayNumberOurselves: false,
      number: null,
      says:
        'This client self-bills — they raise the document from the hours they approved. ' +
        'We do not number it ourselves: two numbers for one debt means they post one, ' +
        'ignore the other, and the receipt matches neither. Record it when their ' +
        'number arrives.',
    }
  }

  return {
    selfBilled: true,
    mayNumberOurselves: false,
    number: i.clientDocumentNumber.trim(),
    says:
      `Self-billed by the client as ${i.clientDocumentNumber.trim()}. Their number, ` +
      `carried as ours, so the receipt and the chase both use the reference they hold.`,
  }
}

// ═════════════════════════════════════════════════════════════════════
// TAX DETERMINATION — place of supply, rate, and withholding
// ═════════════════════════════════════════════════════════════════════
//
// ── What this is, and firmly is not ──────────────────────────────────
//
// Not a tax engine and not advice. It is a rule table and some
// arithmetic: given where the supplier is, where the work was done, and
// what each side is registered as, decide which regime applies, which
// rate the table holds, and what the line comes to.
//
// The whole value is in the refusals. Where the place of supply is
// unknowable — no ship-to, no state on a US invoice — it returns no rate
// and says why. A plausible zero is the worst possible output here,
// because an under-taxed invoice is a liability that surfaces two years
// later with interest, and nobody audits a number that looked fine.
//
// ── The regimes ──────────────────────────────────────────────────────
//
// US        sales and use tax, by state, destination-based. Most states
//           do not tax professional or staffing services at all; a few
//           do, and they are listed. A state not in the table is not
//           assumed either way.
// EU        VAT. Cross-border B2B with both VAT numbers is reverse
//           charged to the customer. Same member state is that state's
//           own rate.
// UK        VAT, twenty per cent domestic, outside scope on export.
// IN        GST. Same state splits into CGST and SGST; different states
//           is IGST at the same total. Export of services is zero rated.
//
// Anything else returns UNKNOWN_JURISDICTION. Adding a country is adding
// a row to a table, which is a deliberate act by somebody who checked.

export type TaxRegime = 'US_SALES_TAX' | 'EU_VAT' | 'UK_VAT' | 'IN_GST' | 'NONE'

export type TaxOutcome =
  /** A rate applies and is on the line. */
  | 'TAXABLE'
  /** In scope, and the rate is genuinely zero — an export, usually. */
  | 'ZERO_RATED'
  /** The customer accounts for it, not us. */
  | 'REVERSE_CHARGE'
  /** The supply is outside the taxing country altogether. */
  | 'OUT_OF_SCOPE'
  /** Not enough is known to say. No rate, and the reason is named. */
  | 'UNKNOWN'

export interface TaxComponent {
  /** "VAT", "IGST", "CGST", "SGST", "State sales tax". */
  name: string
  /** Basis points. 2000 = 20%. */
  rateBps: number
  amountMinor: number
}

export interface TaxVerdict {
  regime: TaxRegime
  outcome: TaxOutcome
  /** Total rate in basis points across every component. Null when UNKNOWN. */
  rateBps: number | null
  /** Split out, because an Indian invoice must show CGST and SGST apart. */
  components: TaxComponent[]
  /** Tax on the taxable amount, minor units. Null when UNKNOWN. */
  taxMinor: number | null
  /** What the customer pays: net plus tax. Null when UNKNOWN. */
  grossMinor: number | null
  /** The state or country the supply is treated as made in. */
  placeOfSupply: string | null
  /** The rule that decided it, named so a person can go and read it. */
  basis: string
  says: string
}

export interface TaxParty {
  /** ISO 3166-1 alpha-2. */
  country: string
  /** ISO 3166-2 subdivision code without the country prefix — "CT", "MH". */
  state?: string | null
  /** VAT / GST registration, where they hold one. */
  taxId?: string | null
}

export interface TaxInput {
  /** Us. Where we are registered to charge. */
  supplier: TaxParty
  /**
   * Where the work was done. Null where nobody said, which is the
   * commonest reason this refuses.
   */
  placeOfPerformance: TaxParty | null
  /** Who is billed. Used for reverse charge and for export tests. */
  customer: TaxParty
  /** The net amount of the line, minor units. */
  netMinor: number
}

/**
 * EU member states and their standard VAT rate, in basis points.
 *
 * Standard rates only. Staffing and professional services take the
 * standard rate in every member state; the reduced rates are for goods
 * and a short list of services that this product does not sell.
 */
const EU_STANDARD_BPS: Record<string, number> = {
  AT: 2000, BE: 2100, BG: 2000, HR: 2500, CY: 1900, CZ: 2100,
  DK: 2500, EE: 2200, FI: 2550, FR: 2000, DE: 1900, GR: 2400,
  HU: 2700, IE: 2300, IT: 2200, LV: 2100, LT: 2100, LU: 1700,
  MT: 1800, NL: 2100, PL: 2300, PT: 2300, RO: 1900, SK: 2300,
  SI: 2200, ES: 2100, SE: 2500,
}

/**
 * US states that tax staffing or employment services, and at what rate.
 *
 * Most states do not tax professional services at all. These are the ones
 * that specifically reach staffing, help supply or employment services.
 * The rate is the state rate; local rates are added by the firm's own
 * table, which is why every result says the local part is not in it.
 *
 * A state absent from this map is NOT_TAXED with that stated as the
 * reason, rather than a silent zero — the difference matters when
 * somebody asks why an invoice carried no tax.
 */
const US_SERVICE_TAX_BPS: Record<string, { bps: number; basis: string }> = {
  CT: { bps: 100, basis: 'Connecticut taxes employment and personnel services at a special 1% rate' },
  OH: { bps: 575, basis: 'Ohio taxes employment services as an enumerated taxable service' },
  PA: { bps: 600, basis: 'Pennsylvania taxes help supply services' },
  WV: { bps: 600, basis: 'West Virginia taxes services generally unless exempted' },
  SD: { bps: 420, basis: 'South Dakota taxes services generally' },
  NM: { bps: 488, basis: 'New Mexico gross receipts tax reaches services' },
  HI: { bps: 400, basis: 'Hawaii general excise tax reaches services' },
}

/** Whether a country is inside the EU VAT area for these purposes. */
function isEu(country: string): boolean {
  return country.toUpperCase() in EU_STANDARD_BPS
}

function components(name: string, bps: number, netMinor: number): TaxComponent[] {
  return [{ name, rateBps: bps, amountMinor: Math.round((netMinor * bps) / 10_000) }]
}

function finish(
  regime: TaxRegime,
  outcome: TaxOutcome,
  comps: TaxComponent[],
  netMinor: number,
  placeOfSupply: string | null,
  basis: string,
  says: string
): TaxVerdict {
  const rateBps = comps.reduce((n, c) => n + c.rateBps, 0)
  const taxMinor = comps.reduce((n, c) => n + c.amountMinor, 0)
  return {
    regime,
    outcome,
    rateBps,
    components: comps,
    taxMinor,
    grossMinor: netMinor + taxMinor,
    placeOfSupply,
    basis,
    says,
  }
}

function unknown(regime: TaxRegime, basis: string, says: string): TaxVerdict {
  return {
    regime,
    outcome: 'UNKNOWN',
    rateBps: null,
    components: [],
    taxMinor: null,
    grossMinor: null,
    placeOfSupply: null,
    basis,
    says,
  }
}

/**
 * What tax lands on this line, or why no figure can be given.
 *
 * Returns UNKNOWN rather than zero wherever the answer depends on
 * something nobody has recorded. Zero is a claim; UNKNOWN is the truth.
 */
export function taxFor(i: TaxInput): TaxVerdict {
  const net = Math.max(0, Math.round(i.netMinor))
  const supplierCountry = i.supplier.country.toUpperCase()
  const customerCountry = i.customer.country.toUpperCase()

  if (!i.placeOfPerformance) {
    return unknown(
      'NONE',
      'No place of supply on the record',
      'Nobody has said where this work was done, and the place of supply is what decides ' +
        'the tax. No rate is shown rather than a plausible zero — an under-taxed invoice ' +
        'surfaces two years later with interest, and nobody audits a number that looked fine.'
    )
  }

  const place = i.placeOfPerformance
  const placeCountry = place.country.toUpperCase()

  // ── United States ───────────────────────────────────────────────────
  if (placeCountry === 'US') {
    if (supplierCountry !== 'US') {
      return finish(
        'US_SALES_TAX', 'OUT_OF_SCOPE', [], net, 'US',
        'Supplier outside the United States',
        'The supplier is not registered in the United States, so no US sales tax is ' +
          'charged here. Whether the customer owes use tax is their question, not ours.'
      )
    }
    if (!place.state) {
      return unknown(
        'US_SALES_TAX',
        'Sales tax is a state question and no state is on the ship-to',
        'Sales tax in the United States is decided state by state and this invoice does ' +
          'not say which state the work was done in. Set the ship-to before billing — ' +
          'guessing the state guesses the rate.'
      )
    }
    const st = place.state.toUpperCase()
    const rule = US_SERVICE_TAX_BPS[st]
    if (!rule) {
      return finish(
        'US_SALES_TAX', 'ZERO_RATED', [], net, st,
        `${st} does not enumerate staffing services as taxable`,
        `No sales tax in ${st}: it does not tax professional or staffing services. That is ` +
          `a rule about the state and not an absence of data — the states that do tax ` +
          `these services are listed and ${st} is not one of them.`
      )
    }
    return finish(
      'US_SALES_TAX', 'TAXABLE', components('State sales tax', rule.bps, net), net, st,
      rule.basis,
      `${(rule.bps / 100).toFixed(2)}% state tax in ${st}. ${rule.basis}. Local district ` +
        `rates are not in this figure — those come from your own rate table.`
    )
  }

  // ── United Kingdom ──────────────────────────────────────────────────
  if (placeCountry === 'GB') {
    if (supplierCountry !== 'GB') {
      return finish(
        'UK_VAT', 'OUT_OF_SCOPE', [], net, 'GB',
        'Supplier not registered in the United Kingdom',
        'The supplier is not UK-registered, so this is outside the scope of UK VAT.'
      )
    }
    if (customerCountry !== 'GB') {
      return finish(
        'UK_VAT', 'OUT_OF_SCOPE', [], net, 'GB',
        'Place of supply for B2B services is where the customer belongs',
        `The customer belongs in ${customerCountry}, so for a business-to-business service ` +
          `the place of supply is there and no UK VAT is charged.`
      )
    }
    return finish(
      'UK_VAT', 'TAXABLE', components('VAT', 2000, net), net, 'GB',
      'UK standard rate',
      'Twenty per cent VAT, the UK standard rate for services.'
    )
  }

  // ── European Union ──────────────────────────────────────────────────
  if (isEu(placeCountry)) {
    if (!isEu(supplierCountry)) {
      return finish(
        'EU_VAT', 'OUT_OF_SCOPE', [], net, placeCountry,
        'Supplier outside the EU VAT area',
        'The supplier is not established in the EU, so no member state VAT is charged here.'
      )
    }
    const sameState = supplierCountry === customerCountry
    if (!sameState && isEu(customerCountry) && i.customer.taxId) {
      return finish(
        'EU_VAT', 'REVERSE_CHARGE', [], net, customerCountry,
        'Article 196 — reverse charge on cross-border B2B services',
        `${i.customer.country.toUpperCase()} customer with a VAT number, supplier in ` +
          `${supplierCountry}. The customer accounts for the VAT, not us, and the invoice ` +
          `has to say "reverse charge" on its face.`
      )
    }
    if (!isEu(customerCountry)) {
      return finish(
        'EU_VAT', 'OUT_OF_SCOPE', [], net, customerCountry,
        'Customer outside the EU',
        'The customer belongs outside the EU, so the place of supply for the service is ' +
          'outside it too and no member state VAT applies.'
      )
    }
    if (!sameState && !i.customer.taxId) {
      // Cross-border without a VAT number is not B2B. The supplier's own
      // rate applies, and it is worth saying which fact decided it.
      const bps = EU_STANDARD_BPS[supplierCountry]
      return finish(
        'EU_VAT', 'TAXABLE', components('VAT', bps, net), net, supplierCountry,
        'No customer VAT number, so not treated as a business customer',
        `The customer has given no VAT number, so this is not a reverse-charged B2B supply ` +
          `and ${supplierCountry} VAT at ${(bps / 100).toFixed(0)}% applies. If they are a ` +
          `business, get the number — it moves the liability to them.`
      )
    }
    const bps = EU_STANDARD_BPS[supplierCountry]
    return finish(
      'EU_VAT', 'TAXABLE', components('VAT', bps, net), net, supplierCountry,
      `${supplierCountry} standard rate`,
      `Domestic supply in ${supplierCountry} — VAT at ${(bps / 100).toFixed(0)}%.`
    )
  }

  // ── India ───────────────────────────────────────────────────────────
  if (placeCountry === 'IN') {
    if (supplierCountry !== 'IN') {
      return finish(
        'IN_GST', 'OUT_OF_SCOPE', [], net, 'IN',
        'Supplier not registered in India',
        'The supplier is not registered in India, so Indian GST is not charged on this ' +
          'invoice. Reverse charge may fall on the recipient, which is their filing.'
      )
    }
    if (customerCountry !== 'IN') {
      return finish(
        'IN_GST', 'ZERO_RATED', [], net, 'IN',
        'Export of services — zero rated under a letter of undertaking',
        'Export of services from India is zero rated. Zero rated is not the same as exempt: ' +
          'it is in scope, input credit survives, and it needs the LUT on file.'
      )
    }
    if (!i.supplier.state || !place.state) {
      return unknown(
        'IN_GST',
        'GST splits on the state pair and one of them is missing',
        'Indian GST is IGST across states and CGST plus SGST within one, so both states ' +
          'have to be known. One of them is not on the record, and the split cannot be ' +
          'guessed — the two produce identical totals but different returns.'
      )
    }
    const intra = i.supplier.state.toUpperCase() === place.state.toUpperCase()
    if (intra) {
      // The total is the same 18%; the split is what the return needs.
      const half = 900
      const halfAmount = Math.round((net * half) / 10_000)
      return finish(
        'IN_GST', 'TAXABLE',
        [
          { name: 'CGST', rateBps: half, amountMinor: halfAmount },
          { name: 'SGST', rateBps: half, amountMinor: halfAmount },
        ],
        net, place.state.toUpperCase(),
        'Intra-state supply — CGST and SGST at 9% each',
        `Supplier and place of supply are both in ${place.state.toUpperCase()}, so the 18% ` +
          `splits into CGST and SGST at nine per cent each. Same money, two lines, because ` +
          `the return needs them apart.`
      )
    }
    return finish(
      'IN_GST', 'TAXABLE', components('IGST', 1800, net), net, place.state.toUpperCase(),
      'Inter-state supply — IGST at 18%',
      `Supplier in ${i.supplier.state.toUpperCase()}, work done in ` +
        `${place.state.toUpperCase()}. Different states, so it is IGST at eighteen per cent ` +
        `rather than a CGST and SGST split.`
    )
  }

  return unknown(
    'NONE',
    `No rule on file for ${placeCountry}`,
    `Nothing here knows how ${placeCountry} taxes this supply. No rate is shown rather ` +
      `than a zero somebody would take for an answer. Adding a country is adding a row to ` +
      `the table, and it should be added by somebody who has checked.`
  )
}

// ── Withholding ───────────────────────────────────────────────────────
//
// The opposite direction. Tax adds to what the customer pays; withholding
// is subtracted from what they remit, and paid to their revenue authority
// on the supplier's behalf. The supplier still EARNED the gross — the
// withheld part is a prepayment of their own tax, not a discount — which
// is why the two figures are kept apart and never netted into one.

export interface WithholdingInput {
  /** The country whose rules the payer is subject to. */
  payerCountry: string
  /** The country the supplier belongs to. */
  supplierCountry: string
  /** True where the supplier has given a tax identification number. */
  supplierHasTaxId: boolean
  /** The net amount, minor units, before any sales tax or VAT. */
  netMinor: number
}

export interface Withholding {
  applies: boolean
  rateBps: number
  withheldMinor: number
  /** What actually arrives in the bank. */
  netOfWithholdingMinor: number
  basis: string
  says: string
}

/**
 * What the payer holds back, and what that means.
 *
 * Two rules, both real and both narrow:
 *
 *   **India, section 194J.** Ten per cent on fees for professional or
 *   technical services, deducted by the payer, evidenced on a Form 16A.
 *   The supplier claims it against their own liability.
 *
 *   **United States backup withholding.** Twenty-four per cent, and only
 *   where the payee has not given a taxpayer identification number. It is
 *   not a tax on the transaction — it is a consequence of a missing W-9,
 *   and it stops the day the number arrives.
 */
export function withholdingFor(i: WithholdingInput): Withholding {
  const net = Math.max(0, Math.round(i.netMinor))
  const payer = i.payerCountry.toUpperCase()

  if (payer === 'IN' && i.supplierCountry.toUpperCase() === 'IN') {
    const bps = 1000
    const withheld = Math.round((net * bps) / 10_000)
    return {
      applies: true,
      rateBps: bps,
      withheldMinor: withheld,
      netOfWithholdingMinor: net - withheld,
      basis: 'Section 194J — fees for professional or technical services',
      says:
        'Ten per cent is deducted at source and paid to the revenue authority in the ' +
        'supplier’s name. The supplier still earned the whole amount — this is a ' +
        'prepayment of their tax, not a reduction of the invoice, and it must never be ' +
        'netted into revenue.',
    }
  }

  if (payer === 'US' && !i.supplierHasTaxId) {
    const bps = 2400
    const withheld = Math.round((net * bps) / 10_000)
    return {
      applies: true,
      rateBps: bps,
      withheldMinor: withheld,
      netOfWithholdingMinor: net - withheld,
      basis: 'Backup withholding — no taxpayer identification number on file',
      says:
        'Twenty-four per cent is held back because there is no TIN on file. This is not a ' +
        'tax on the work; it is the consequence of a missing W-9 and it stops the day the ' +
        'number arrives. Chase the form rather than absorbing the deduction.',
    }
  }

  return {
    applies: false,
    rateBps: 0,
    withheldMinor: 0,
    netOfWithholdingMinor: net,
    basis: 'No withholding rule reaches this pair',
    says: 'Nothing is held back — the payer remits the full invoice.',
  }
}
