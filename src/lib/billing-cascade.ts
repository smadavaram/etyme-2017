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
