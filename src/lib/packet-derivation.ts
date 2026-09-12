import type { ItemSpec, Purpose, SubjectKind } from '@/lib/packets'

/**
 * Working out what somebody actually needs to send.
 *
 * The five static checklists were the 2017 shape of this: a list somebody
 * typed, which is right for the case it was typed for and quietly wrong
 * for every other. A W-2 employee and a corp-to-corp contractor need
 * almost disjoint sets. A UK placement needs a right-to-work check and no
 * I-9. An H-1B holder needs an approval notice; a citizen does not. A
 * $2m engagement needs cyber cover; a two-week one does not.
 *
 * A list cannot hold that. Rules can.
 *
 * Each rule says what it wants and, critically, **why** — because the
 * counterparty will ask, and "the system requires it" is the answer that
 * makes people phone somebody. "Your people work on our sites, so we need
 * your workers' compensation certificate" is an answer they can act on.
 */

export interface Circumstances {
  /** Where the work happens. Decides the whole legal frame. */
  country: string
  /** W2 · C2C · IND_1099 · C2H_W2 — who employs whom. */
  classification?: string | null
  /** US_CITIZEN · GC · H1B · OPT · null when unknown. */
  workAuth?: string | null
  /** Annualised value in cents. Bigger engagements carry more cover. */
  valueCents?: number | null
  /** Whether the person will be on the client's own premises. */
  onSite?: boolean
  /** Whether they touch the client's systems. */
  systemsAccess?: boolean
  /** For a supplier: whether we already hold a signed agreement. */
  hasAgreement?: boolean
}

export interface DerivedItem extends ItemSpec {
  /** Which rule asked for this, so a disagreement has something to point at. */
  becauseOf: string
}

export interface Derived {
  purpose: Purpose
  subject: SubjectKind
  label: string
  preamble: string
  items: DerivedItem[]
  /** In one line, why this list looks the way it does. */
  reasoning: string[]
}

/** A rule: when it applies, and what it then wants. */
interface Rule {
  id: string
  when: (c: Circumstances) => boolean
  /** Said to the counterparty, in their words. */
  because: string
  items: ItemSpec[]
}

const money = (cents: number) => `$${Math.round(cents / 100).toLocaleString()}`

// ── Bringing on a supplier ────────────────────────────────────────────

const SUPPLIER_RULES: Rule[] = [
  {
    id: 'tax-identity',
    when: (c) => c.country === 'US',
    because: 'we cannot set you up to be paid in the US without a tax identity',
    items: [
      { key: 'W9', label: 'W-9', hint: 'Signed, current year. This is how we set you up to be paid.', required: true, validMonths: null },
    ],
  },
  {
    id: 'tax-identity-uk',
    when: (c) => c.country === 'GB',
    because: 'we need your VAT position before we can settle an invoice',
    items: [
      { key: 'VAT_REG', label: 'VAT registration', hint: 'Your VAT number, or written confirmation that you are not registered.', required: true, validMonths: null },
    ],
  },
  {
    id: 'tax-identity-in',
    when: (c) => c.country === 'IN',
    because: 'GST and PAN are required before an Indian invoice can be paid',
    items: [
      { key: 'GST_REG', label: 'GST registration', hint: 'Your GSTIN certificate.', required: true, validMonths: null },
      { key: 'PAN', label: 'PAN card', hint: 'The entity PAN, not a personal one.', required: true, validMonths: null },
    ],
  },
  {
    id: 'existence',
    when: () => true,
    because: 'we need to know the entity we are contracting with is real',
    items: [
      { key: 'BUSINESS_PARTNER', label: 'Business registration', hint: 'Incorporation certificate, or your DUNS number.', required: true, validMonths: null },
    ],
  },
  {
    id: 'payment-route',
    when: () => true,
    because: 'so payments reach the right account',
    items: [
      { key: 'BANK_LETTER', label: 'Bank letter or voided cheque', hint: 'We only keep the last four digits.', required: true, validMonths: null },
    ],
  },
  {
    id: 'liability',
    when: () => true,
    because: 'anybody working through you is covered by your policy, not ours',
    items: [
      { key: 'INSURANCE_GL', label: 'Certificate of general liability insurance', hint: 'Naming us as certificate holder. Your broker issues this.', required: true, validMonths: 12 },
    ],
  },
  {
    id: 'workers-comp',
    when: (c) => c.country === 'US' && c.onSite !== false,
    because: 'your people will be on our sites, and US law puts that cover on their employer',
    items: [
      { key: 'INSURANCE_WC', label: "Certificate of workers' compensation", hint: 'Required wherever your people work on our premises.', required: true, validMonths: 12 },
    ],
  },
  {
    id: 'cyber',
    when: (c) => c.systemsAccess === true,
    because: 'your people will have access to our systems',
    items: [
      { key: 'INSURANCE_CYBER', label: 'Cyber liability insurance', hint: 'Required where your people touch our systems.', required: true, validMonths: 12 },
    ],
  },
  {
    id: 'professional-indemnity',
    when: (c) => (c.valueCents ?? 0) >= 500_000_00,
    because: 'the engagement is large enough that advice given on it carries real exposure',
    items: [
      { key: 'INSURANCE_EO', label: 'Errors and omissions insurance', hint: 'Professional indemnity cover.', required: true, validMonths: 12 },
    ],
  },
  {
    id: 'agreement',
    when: (c) => c.hasAgreement === false,
    because: 'we have nothing signed with you yet',
    items: [
      { key: 'MSA_SIGNED', label: 'Signed supplier agreement', hint: 'Ours, unless you would rather we reviewed yours.', required: true, validMonths: null },
    ],
  },
]

// ── Starting somebody ─────────────────────────────────────────────────

const START_RULES: Rule[] = [
  {
    id: 'us-work-auth',
    when: (c) => c.country === 'US' && (c.classification === 'W2' || c.classification === 'C2H_W2'),
    because: 'federal law requires it before any work is done, and it cannot be waived',
    items: [
      { key: 'I9_EVERIFY', label: 'I-9 and E-Verify', hint: 'Nobody may start without it.', required: true, validMonths: null },
    ],
  },
  {
    id: 'uk-work-auth',
    when: (c) => c.country === 'GB',
    because: 'a UK right-to-work check is the employer’s legal duty, and there is no I-9 here',
    items: [
      { key: 'RIGHT_TO_WORK_UK', label: 'Right to work check', hint: 'Share code, or passport and visa.', required: true, validMonths: null },
    ],
  },
  {
    id: 'visa-evidence',
    when: (c) => ['H1B', 'OPT', 'L1', 'TN'].includes(String(c.workAuth ?? '')),
    because: 'your status has an end date, and we have to know it before it arrives',
    items: [
      { key: 'VISA_APPROVAL', label: 'Approval notice', hint: 'Your most recent I-797, or EAD card for OPT.', required: true, validMonths: null },
      { key: 'I94', label: 'Most recent I-94', hint: 'Downloadable from the CBP website.', required: true, validMonths: null },
    ],
  },
  {
    id: 'c2c-own-cover',
    when: (c) => c.classification === 'C2C',
    because: 'on corp-to-corp you are the employer, so the cover has to be yours',
    items: [
      { key: 'INSURANCE_GL', label: 'Certificate of general liability insurance', hint: 'In your own company’s name.', required: true, validMonths: 12 },
      { key: 'INSURANCE_WC', label: "Certificate of workers' compensation", hint: 'In your own company’s name.', required: true, validMonths: 12 },
    ],
  },
  {
    id: 'background',
    when: (c) => c.onSite !== false,
    because: 'the client requires it for anybody on their premises',
    items: [
      { key: 'BACKGROUND_CHECK', label: 'Background check', hint: 'Through our provider, or yours if the client accepts it.', required: true, validMonths: 12 },
    ],
  },
  {
    id: 'confidentiality',
    when: () => true,
    because: 'you will see things that are not ours to share',
    items: [
      { key: 'NDA', label: 'Signed non-disclosure agreement', hint: 'Ours, unless the client supplies their own.', required: true, validMonths: null },
    ],
  },
  {
    id: 'drug-screen',
    when: (c) => c.country === 'US' && c.onSite === true && (c.valueCents ?? 0) > 0,
    because: 'the client site requires it',
    items: [
      { key: 'DRUG_SCREENING', label: 'Drug screening', hint: 'Where the client site requires it.', required: false, validMonths: 12 },
    ],
  },
]

// ── Deriving ──────────────────────────────────────────────────────────

function apply(rules: Rule[], c: Circumstances): { items: DerivedItem[]; reasoning: string[] } {
  const byKey = new Map<string, DerivedItem>()
  const reasoning: string[] = []

  for (const rule of rules) {
    if (!rule.when(c)) continue
    reasoning.push(rule.because)
    for (const item of rule.items) {
      const existing = byKey.get(item.key)
      // Two rules can want the same thing. Required wins over optional,
      // and the shorter validity wins — asking for a certificate every
      // twelve months when one rule says twenty-four is the safe direction.
      if (!existing) {
        byKey.set(item.key, { ...item, becauseOf: rule.because })
      } else {
        byKey.set(item.key, {
          ...existing,
          required: existing.required || item.required,
          validMonths:
            existing.validMonths === null
              ? item.validMonths
              : item.validMonths === null
                ? existing.validMonths
                : Math.min(existing.validMonths, item.validMonths),
        })
      }
    }
  }

  return { items: [...byKey.values()], reasoning }
}

export function deriveSupplierPacket(c: Circumstances): Derived {
  const { items, reasoning } = apply(SUPPLIER_RULES, c)
  return {
    purpose: 'VENDOR_ONBOARDING',
    subject: 'COMPANY',
    label: `Bringing on a supplier (${c.country})`,
    preamble:
      'Before we can place anybody through you or pay an invoice, we need these on file. This list is built from where the work happens and what it involves, so it is shorter than a standard pack.',
    items,
    reasoning,
  }
}

export function deriveStartPacket(c: Circumstances): Derived {
  const { items, reasoning } = apply(START_RULES, c)
  const who =
    c.classification === 'C2C' ? 'corp-to-corp' :
    c.classification === 'IND_1099' ? '1099' :
    c.classification === 'W2' ? 'W-2' : 'contract'
  return {
    purpose: 'CONTRACT_START',
    subject: 'PERSON',
    label: `Starting somebody (${who}, ${c.country})`,
    preamble:
      'Before the first day. Some of these are legally required before any work is done, and the list depends on how you are engaged and where.',
    items,
    reasoning,
  }
}

/**
 * What a static list would have asked for that these circumstances do not
 * need, and the other way round.
 *
 * Shown on the screen so somebody can see the derivation working rather
 * than trusting it. A rule engine nobody can inspect is a worse list.
 */
export function differenceFromStatic(
  derived: DerivedItem[],
  staticItems: ItemSpec[]
): { notNeeded: string[]; addedBecause: { label: string; because: string }[] } {
  const derivedKeys = new Set(derived.map((d) => d.key))
  const staticKeys = new Set(staticItems.map((s) => s.key))

  return {
    notNeeded: staticItems.filter((s) => !derivedKeys.has(s.key)).map((s) => s.label),
    addedBecause: derived
      .filter((d) => !staticKeys.has(d.key))
      .map((d) => ({ label: d.label, because: d.becauseOf })),
  }
}

/**
 * Said in one sentence, for whoever receives it.
 *
 * A counterparty asked for eleven documents wants to know why it is
 * eleven and not four, and "our policy" is the answer that makes them
 * phone somebody.
 */
export function explainDerivation(d: Derived, c: Circumstances): string {
  const bits: string[] = [`work in ${c.country}`]
  if (c.classification) {
    // "engaged w2" reads as a machine talking. These are proper names.
    const said: Record<string, string> = {
      W2: 'on W-2', C2C: 'corp-to-corp', IND_1099: 'on a 1099', C2H_W2: 'contract-to-hire',
    }
    bits.push(said[c.classification] ?? `engaged ${c.classification.toLowerCase()}`)
  }
  if (c.workAuth && c.workAuth !== 'US_CITIZEN') bits.push(`on ${c.workAuth}`)
  if (c.systemsAccess) bits.push('with access to our systems')
  if ((c.valueCents ?? 0) >= 500_000_00) bits.push(`at ${money(c.valueCents!)} a year`)

  return `${d.items.length} item(s), because this is ${bits.join(', ')}.`
}
