/**
 * The outbound screening pack — us being screened, rather than us screening.
 *
 * ── Why this exists ──────────────────────────────────────────────────
 *
 * Everything in `packets.ts` points inward. We ask a supplier for a W-9,
 * we ask a candidate for a resume, and we watch three of four arrive.
 * That is half the job. A staffing vendor spends as much time being
 * screened as screening: a client's procurement team wants the W-9, the
 * certificates of insurance, the business registration, a SOC 2 report,
 * financials, a signed NDA, a diversity certification — and it wants
 * them this week, because the bid closes.
 *
 * Today that is a person searching their own Google Drive at nine at
 * night and emailing a zip file. The certificate they attach lapsed in
 * March.
 *
 * ── The rule this file exists to enforce ─────────────────────────────
 *
 * **An expired document is never sent.** Not with a warning, not with a
 * note, not because the bid closes tomorrow. Sending a lapsed
 * certificate of insurance to a client's procurement team is worse than
 * sending nothing: it is a live claim that we are covered when we are
 * not, made in writing, to the party who would rely on it. Nothing
 * sending it is honest, and the vendor who does it has swapped a lost
 * bid for a misrepresentation.
 *
 * The 2017 build had an expiry column that nothing swept, so a
 * certificate that lapsed in March was still green in July. The state
 * that caused it is the fourth one: **on file, no expiry recorded, on a
 * kind that expires**. It passes every check ever written until the day
 * somebody audits it, so here it is refused exactly as an expired
 * document is refused. An unknown expiry is not a good one.
 *
 * ── Scope ────────────────────────────────────────────────────────────
 *
 * A pack is a named subset with a stated purpose, never everything we
 * hold. A client asking for proof of insurance does not receive our bank
 * letter, and a procurement team screening us as a supplier does not
 * receive our audited financials because they happened to be in the same
 * folder. Getting this wrong leaks our own commercial information to the
 * counterparty we are negotiating with.
 *
 * So sensitivity is classified per document kind, each purpose says
 * which sensitivities it admits, and `scopeViolations()` is a test the
 * pack list has to pass rather than a convention somebody remembers.
 *
 * ── The link ─────────────────────────────────────────────────────────
 *
 * A share link with no end outlives the reason it was sent, and a link
 * that outlives the documents inside it is worse — the recipient opens
 * it in November and reads a certificate that lapsed in October as
 * current. So the link is clamped twice: never longer than we grant, and
 * never longer than the shortest-lived document in the pack.
 */

import type { ItemSpec, PacketSpec } from '@/lib/packets'
import { standingOf, type Held, type Standing } from '@/lib/document-stages'

// ── Who asks, and what they may see ──────────────────────────────────

export type OutboundPurpose =
  /** A client's procurement team qualifying us as a supplier. */
  | 'CLIENT_SCREENING'
  /** Somebody wants only the certificates. */
  | 'INSURANCE_PROOF'
  /** A security or vendor-risk review before we touch their systems. */
  | 'SECURITY_REVIEW'
  /** A competitive bid, where commercial standing is legitimately asked. */
  | 'RFP_BID'
  /** Their accounts payable setting us up to be paid. */
  | 'PAYMENT_SETUP'

/**
 * How much damage the document does in the wrong hands.
 *
 * Not how secret it feels — how it can be used against us. A W-9 is our
 * tax identity and is handed to every client we bill; audited financials
 * in the hands of the party setting our rates are a negotiating
 * position.
 */
export type Sensitivity =
  /** Given to every counterparty as a matter of course. */
  | 'ROUTINE'
  /** Ours, shared under an agreement, on request, for a stated reason. */
  | 'CONFIDENTIAL'
  /** Tells a counterparty what we can afford to accept. */
  | 'COMMERCIAL'
  /** Payment instructions. The target of every invoice-redirection fraud. */
  | 'BANKING'

const SENSITIVITY: Record<string, Sensitivity> = {
  SOC2: 'CONFIDENTIAL',
  FINANCIALS: 'COMMERCIAL',
  BANK_LETTER: 'BANKING',
}

export function sensitivityOf(key: string): Sensitivity {
  return SENSITIVITY[key] ?? 'ROUTINE'
}

/** What each purpose is entitled to ask of us. */
const PURPOSE_ADMITS: Record<OutboundPurpose, Sensitivity[]> = {
  CLIENT_SCREENING: ['ROUTINE'],
  INSURANCE_PROOF: ['ROUTINE'],
  SECURITY_REVIEW: ['ROUTINE', 'CONFIDENTIAL'],
  RFP_BID: ['ROUTINE', 'CONFIDENTIAL', 'COMMERCIAL'],
  PAYMENT_SETUP: ['ROUTINE', 'BANKING'],
}

/**
 * A pack of our own documents, going out.
 *
 * Deliberately the same shape as an inbound `PacketSpec` — collecting
 * and sending are one idea seen from two ends, and a second parallel
 * type is how the two drift apart.
 */
export interface OutboundPackSpec extends PacketSpec {
  purpose: OutboundPurpose
  subject: 'COMPANY'
  /** Who typically asks for this, and when, in one line. */
  askedBy: string
}

// ── The packs a vendor is actually asked for ─────────────────────────

const GL: ItemSpec = {
  key: 'INSURANCE_GL',
  label: 'Certificate of general liability insurance',
  hint: 'Current certificate, with the client named as certificate holder.',
  required: true,
  validMonths: 12,
}
const WC: ItemSpec = {
  key: 'INSURANCE_WC',
  label: "Certificate of workers' compensation",
  hint: 'Current certificate covering every state our people work in.',
  required: true,
  validMonths: 12,
}
const W9: ItemSpec = {
  key: 'W9',
  label: 'W-9',
  hint: 'Signed, current, showing our legal entity name and EIN.',
  required: true,
  validMonths: null,
}
const REGISTRATION: ItemSpec = {
  key: 'BUSINESS_PARTNER',
  label: 'Business registration',
  hint: 'Incorporation certificate, or our DUNS number where they use one.',
  required: true,
  validMonths: null,
}
const NDA: ItemSpec = {
  key: 'NDA',
  label: 'Signed non-disclosure agreement',
  hint: 'Countersigned. Theirs where they insist, ours where they do not.',
  required: true,
  validMonths: null,
}

export const OUTBOUND_PACKS: OutboundPackSpec[] = [
  {
    key: 'CLIENT_SCREENING_US',
    label: 'Supplier screening — US client',
    purpose: 'CLIENT_SCREENING',
    subject: 'COMPANY',
    askedBy:
      "A client's procurement or supplier-management team, before we are added to their approved list.",
    preamble:
      'Everything you asked for to qualify us as a supplier. Each certificate below is current on the day this link was created, and the link expires before the earliest of them does.',
    items: [
      W9,
      GL,
      WC,
      REGISTRATION,
      NDA,
      {
        key: 'DIVERSITY_CERT',
        label: 'Diversity certification',
        hint: 'MBE, WBE, SDVOSB or equivalent, where we hold one. Certifying bodies reissue annually.',
        required: false,
        validMonths: 12,
      },
      {
        key: 'INSURANCE_EO',
        label: 'Errors and omissions insurance',
        hint: 'Where our people advise rather than deliver.',
        required: false,
        validMonths: 12,
      },
    ],
  },
  {
    key: 'INSURANCE_PROOF',
    label: 'Proof of insurance',
    purpose: 'INSURANCE_PROOF',
    subject: 'COMPANY',
    askedBy:
      'A client site, a prime contractor, or a facilities team, usually days before somebody is due to badge in.',
    preamble:
      'Our current certificates of insurance, and nothing else. If you need our tax or registration documents as well, ask and we will send a separate pack.',
    items: [
      GL,
      WC,
      {
        key: 'INSURANCE_EO',
        label: 'Errors and omissions insurance',
        hint: 'Where our people advise rather than deliver.',
        required: false,
        validMonths: 12,
      },
      {
        key: 'INSURANCE_CYBER',
        label: 'Cyber liability insurance',
        hint: 'Where our people touch your systems.',
        required: false,
        validMonths: 12,
      },
    ],
  },
  {
    key: 'SECURITY_REVIEW',
    label: 'Security and vendor-risk review',
    purpose: 'SECURITY_REVIEW',
    subject: 'COMPANY',
    askedBy:
      'A client information-security team, before our people are given accounts on their systems.',
    preamble:
      'Our security attestations and the cover behind them. The SOC 2 report is confidential and is shared under the non-disclosure agreement included here.',
    items: [
      {
        key: 'SOC2',
        label: 'SOC 2 Type II report',
        hint: 'Most recent report and bridge letter. Confidential — shared under NDA.',
        required: true,
        validMonths: 12,
      },
      {
        key: 'INSURANCE_CYBER',
        label: 'Cyber liability insurance',
        hint: 'Current certificate.',
        required: true,
        validMonths: 12,
      },
      NDA,
    ],
  },
  {
    key: 'RFP_BID',
    label: 'Bid and RFP response pack',
    purpose: 'RFP_BID',
    subject: 'COMPANY',
    askedBy:
      'A client running a competitive tender, where commercial standing is a scored criterion.',
    preamble:
      'What a bid response is assembled from. Financial statements are included because your tender asked for them, and are commercially confidential.',
    items: [
      W9,
      GL,
      WC,
      REGISTRATION,
      NDA,
      {
        key: 'SOC2',
        label: 'SOC 2 Type II report',
        hint: 'Most recent report. Confidential — shared under NDA.',
        required: false,
        validMonths: 12,
      },
      {
        key: 'FINANCIALS',
        label: 'Audited financial statements',
        hint: 'Most recent audited year. Commercially confidential — only where the tender asks.',
        required: false,
        validMonths: 12,
      },
      {
        key: 'DIVERSITY_CERT',
        label: 'Diversity certification',
        hint: 'MBE, WBE, SDVOSB or equivalent, where we hold one.',
        required: false,
        validMonths: 12,
      },
    ],
  },
  {
    key: 'PAYMENT_SETUP',
    label: 'Payment setup',
    purpose: 'PAYMENT_SETUP',
    subject: 'COMPANY',
    askedBy:
      'A client accounts-payable team, setting us up as a payee. Never procurement, and never over email alone.',
    preamble:
      'Our tax and payment details, for accounts payable only. Confirm the account by phoning a number you already hold for us — invoice-redirection fraud looks exactly like this message.',
    items: [
      W9,
      {
        key: 'BANK_LETTER',
        label: 'Bank letter',
        hint: 'On the bank\'s letterhead, confirming the account we are paid into.',
        required: true,
        validMonths: null,
      },
    ],
  },
]

export function outboundPackByKey(key: string): OutboundPackSpec | null {
  return OUTBOUND_PACKS.find((p) => p.key === key) ?? null
}

export function outboundPacksFor(purpose: OutboundPurpose): OutboundPackSpec[] {
  return OUTBOUND_PACKS.filter((p) => p.purpose === purpose)
}

/**
 * Any pack carrying something its purpose does not entitle the recipient to.
 *
 * A test rather than a convention, because the mistake this catches —
 * the bank letter riding along in a screening pack — is made by adding
 * one line to a list, months after anybody remembers why the list was
 * split.
 */
export function scopeViolations(packs: OutboundPackSpec[] = OUTBOUND_PACKS): string[] {
  const out: string[] = []
  for (const p of packs) {
    const admits = PURPOSE_ADMITS[p.purpose]
    for (const item of p.items) {
      const s = sensitivityOf(item.key)
      if (!admits.includes(s)) {
        out.push(
          `${p.key} sends ${item.label} (${s.toLowerCase()}) to a recipient whose purpose ` +
            `(${p.purpose}) only admits ${admits.join(', ').toLowerCase()}.`
        )
      }
    }
  }
  return out
}

// ── Our own documents ────────────────────────────────────────────────

/**
 * One of our own documents, as held.
 *
 * The same shape as anything else whose standing gets checked. Reusing
 * `Held` rather than inventing an outbound twin is deliberate: the day
 * expiry logic changes it must change for both directions at once.
 */
export type OwnDocument = Held

export type Disposition =
  /** Going out, current, and somebody has confirmed they looked at it. */
  | 'SENDING'
  /** Going out, with something the sender needs to be told first. */
  | 'SENDING_WITH_WARNING'
  /** On file and will not go out. Expired, or expiry unknown. */
  | 'REFUSED'
  /** We do not hold it. */
  | 'NOT_HELD'

export interface PackedItem {
  key: string
  label: string
  required: boolean
  standing: Standing
  daysLeft: number | null
  expiresAt: Date | null
  disposition: Disposition
  /** True where it is on file but nobody ever said they had looked at it. */
  unconfirmed: boolean
  /** What the person about to press send needs to read. */
  says: string
  /** Why it will not go, where it will not go. */
  refusedBecause: string | null
}

export interface WithheldDocument {
  key: string
  label: string
  because: string
}

export interface AssembledPack {
  spec: OutboundPackSpec
  items: PackedItem[]
  /** What actually goes out. */
  sending: PackedItem[]
  /** On file, deliberately not going out. */
  refusals: PackedItem[]
  /** Asked for, not held at all. */
  absent: PackedItem[]
  /** Held, and outside this pack's scope. Listed so nobody thinks it was forgotten. */
  withheld: WithheldDocument[]
  /** False where a required document is missing or cannot honestly be sent. */
  sendable: boolean
  /** One paragraph, for somebody who is not going to read the table. */
  says: string
}

/**
 * Effective expiry: the date on the document, or the issue date plus the
 * window where the kind expires and the date was not recorded.
 *
 * Mirrors `standingOf` deliberately — the two must agree, and the second
 * caller of the same arithmetic is where they stop agreeing.
 */
function effectiveExpiry(held: OwnDocument, spec: ItemSpec): Date | null {
  if (held.expiresAt) return held.expiresAt
  if (spec.validMonths != null && held.issuedAt) {
    return new Date(
      Date.UTC(
        held.issuedAt.getUTCFullYear(),
        held.issuedAt.getUTCMonth() + spec.validMonths,
        held.issuedAt.getUTCDate()
      )
    )
  }
  return null
}

/**
 * Build the pack, and refuse the parts that would be a false claim.
 *
 * Nothing here has a force flag and nothing here takes an override. The
 * only way to send a lapsed certificate is to renew it.
 */
export function assemble(
  spec: OutboundPackSpec,
  held: OwnDocument[],
  on: Date
): AssembledPack {
  // Where several copies are held, the one that lasts longest counts.
  const byKey = new Map<string, OwnDocument>()
  for (const h of held) {
    const prior = byKey.get(h.key)
    if (!prior) {
      byKey.set(h.key, h)
      continue
    }
    const a = prior.expiresAt
    const b = h.expiresAt
    if (a && (!b || b > a)) byKey.set(h.key, h)
  }

  const items: PackedItem[] = spec.items.map((item) => {
    const doc = byKey.get(item.key) ?? null
    const st = standingOf(doc, item, on)
    const expiresAt = doc ? effectiveExpiry(doc, item) : null

    if (st.standing === 'MISSING') {
      return {
        key: item.key,
        label: item.label,
        required: item.required,
        standing: st.standing,
        daysLeft: null,
        expiresAt: null,
        disposition: 'NOT_HELD',
        unconfirmed: false,
        says: `${item.label} is not on file. There is nothing to send.`,
        refusedBecause: null,
      }
    }

    if (st.standing === 'EXPIRED') {
      const days = Math.abs(st.daysLeft ?? 0)
      const because =
        `${item.label} expired ${days} day${days === 1 ? '' : 's'} ago. ` +
        `Sending it would be a written claim that it is current, to the party who ` +
        `would rely on it. Renew it and send again.`
      return {
        key: item.key,
        label: item.label,
        required: item.required,
        standing: st.standing,
        daysLeft: st.daysLeft,
        expiresAt,
        disposition: 'REFUSED',
        unconfirmed: st.unverified,
        says: because,
        refusedBecause: because,
      }
    }

    // The fourth state. On file, no expiry recorded, on a kind that
    // expires — the state that made the 2017 build wrong for four months
    // without anybody seeing it.
    if (st.standing === 'NO_EXPIRY_RECORDED') {
      const because =
        `${item.label} is on file with no expiry date recorded, and this kind ` +
        `expires. We cannot say it is current, so it does not go out. Add the ` +
        `date from the certificate — an unknown expiry is not a good one.`
      return {
        key: item.key,
        label: item.label,
        required: item.required,
        standing: st.standing,
        daysLeft: null,
        expiresAt: null,
        disposition: 'REFUSED',
        unconfirmed: st.unverified,
        says: because,
        refusedBecause: because,
      }
    }

    // Current. It goes — with whatever the sender needs to know.
    const notes: string[] = []
    if (st.standing === 'EXPIRING' && st.daysLeft != null) {
      notes.push(
        `${item.label} is current but expires in ${st.daysLeft} day${st.daysLeft === 1 ? '' : 's'}. ` +
          `If their review takes longer than that, they will be holding a lapsed certificate.`
      )
    }
    if (st.unverified) {
      notes.push(
        `Nobody here has confirmed they looked at ${item.label}. It is going out on trust.`
      )
    }

    return {
      key: item.key,
      label: item.label,
      required: item.required,
      standing: st.standing,
      daysLeft: st.daysLeft,
      expiresAt,
      disposition: notes.length ? 'SENDING_WITH_WARNING' : 'SENDING',
      unconfirmed: st.unverified,
      says: notes.length
        ? notes.join(' ')
        : st.daysLeft == null
          ? `${item.label} is on file and does not expire.`
          : `${item.label} is current for another ${st.daysLeft} days.`,
      refusedBecause: null,
    }
  })

  const sending = items.filter(
    (i) => i.disposition === 'SENDING' || i.disposition === 'SENDING_WITH_WARNING'
  )
  const refusals = items.filter((i) => i.disposition === 'REFUSED')
  const absent = items.filter((i) => i.disposition === 'NOT_HELD')

  // What we hold and are deliberately not sending. Stated rather than
  // silent — a counterparty's checklist and ours never match exactly, and
  // "you did not send X" is answered better by "we chose not to, here is
  // why" than by a shrug.
  const inPack = new Set(spec.items.map((i) => i.key))
  const withheld: WithheldDocument[] = []
  for (const [key, doc] of byKey) {
    if (inPack.has(key)) continue
    const s = sensitivityOf(key)
    withheld.push({
      key,
      label: doc.label,
      because:
        s === 'ROUTINE'
          ? `Held, but "${spec.label}" does not ask for it. A pack is what was asked for, not everything we have.`
          : `Held, and deliberately out of scope for "${spec.label}" — ${s.toLowerCase()} documents go only to a recipient whose purpose covers them.`,
    })
  }
  withheld.sort((a, b) => a.label.localeCompare(b.label))

  const requiredBlocked = items.filter(
    (i) => i.required && i.disposition !== 'SENDING' && i.disposition !== 'SENDING_WITH_WARNING'
  )
  const sendable = requiredBlocked.length === 0 && sending.length > 0

  return {
    spec,
    items,
    sending,
    refusals,
    absent,
    withheld,
    sendable,
    says: summarise(spec, items, sending, refusals, absent, requiredBlocked, sendable),
  }
}

function summarise(
  spec: OutboundPackSpec,
  items: PackedItem[],
  sending: PackedItem[],
  refusals: PackedItem[],
  absent: PackedItem[],
  requiredBlocked: PackedItem[],
  sendable: boolean
): string {
  if (items.length === 0) return `"${spec.label}" asks for nothing.`

  if (sending.length === 0 && refusals.length === 0) {
    return (
      `We do not hold any of the ${items.length} document${items.length === 1 ? '' : 's'} ` +
      `"${spec.label}" asks for, so there is nothing to send.`
    )
  }

  if (!sendable) {
    const worst = requiredBlocked[0]
    const others = requiredBlocked.length - 1
    return (
      `Not sending. ${worst.says}` +
      (others > 0 ? ` ${others} other required document${others === 1 ? '' : 's'} in the same state.` : '')
    )
  }

  const parts = [`Sending ${sending.length} of ${items.length}.`]
  if (refusals.length) {
    parts.push(
      `${refusals.length} held back: ${refusals.map((r) => r.label).join(', ')}. ` +
        `Nothing out of date goes out, so the recipient can rely on what does.`
    )
  }
  if (absent.length) {
    parts.push(
      `${absent.length} not on file: ${absent.map((a) => a.label).join(', ')}.`
    )
  }
  const warned = sending.filter((s) => s.disposition === 'SENDING_WITH_WARNING')
  if (warned.length) {
    parts.push(`${warned.length} going out with something you should read first.`)
  }
  return parts.join(' ')
}

// ── The link ─────────────────────────────────────────────────────────

/** The longest we will ever leave one of our own document packs open. */
export const MAX_LINK_DAYS = 60
export const DEFAULT_LINK_DAYS = 30
export const MIN_LINK_DAYS = 1

export interface LinkLife {
  days: number
  expiresAt: Date
  /** Set where the requested life was cut, and why. */
  clampedBecause: string | null
}

/**
 * How long the link may live.
 *
 * Two clamps. Never longer than we grant, because a share link with no
 * practical end outlives the reason it was sent. And never longer than
 * the earliest document inside it, because a recipient opening a pack in
 * November and reading an October certificate has been told something
 * untrue by a link we created.
 */
export function linkLife(
  on: Date,
  requestedDays: number | undefined,
  sending: Pick<PackedItem, 'label' | 'daysLeft'>[]
): LinkLife {
  const asked = Number.isFinite(requestedDays) ? Number(requestedDays) : DEFAULT_LINK_DAYS
  let days = Math.min(MAX_LINK_DAYS, Math.max(MIN_LINK_DAYS, Math.floor(asked)))
  let clampedBecause: string | null =
    asked > MAX_LINK_DAYS
      ? `Cut to ${MAX_LINK_DAYS} days — the longest we leave a pack of our own documents open.`
      : null

  let earliest: Pick<PackedItem, 'label' | 'daysLeft'> | null = null
  for (const item of sending) {
    if (item.daysLeft == null) continue
    if (!earliest || item.daysLeft < (earliest.daysLeft as number)) earliest = item
  }

  if (earliest && (earliest.daysLeft as number) < days) {
    const d = Math.max(MIN_LINK_DAYS, earliest.daysLeft as number)
    clampedBecause =
      `Cut to ${d} day${d === 1 ? '' : 's'} — ${earliest.label} expires then, and a link ` +
      `that outlives the certificate inside it shows a lapsed document as current.`
    days = d
  }

  return {
    days,
    expiresAt: new Date(on.getTime() + days * 86_400_000),
    clampedBecause,
  }
}

// ── Readiness, before the bid ────────────────────────────────────────

export interface Readiness {
  packKey: string
  packLabel: string
  /** How many documents this client's screening asks for. */
  asked: number
  /** How many we could put in front of them today. */
  answerable: number
  /** Null where there is nothing to score. A blank beats a made-up hundred. */
  percent: number | null
  /** True where every required document could go today. */
  ready: boolean
  neverCollected: PackedItem[]
  lapsed: PackedItem[]
  /** On file, expiry unknown, on a kind that expires. */
  noExpiryRecorded: PackedItem[]
  /** Current today, gone before the horizon — usually the assignment length. */
  expiresInsideHorizon: PackedItem[]
  /** On file, nobody ever confirmed they looked at it. */
  unconfirmed: PackedItem[]
  horizonDays: number | null
  says: string
}

/** A quarter. Long enough that a renewal can still be arranged. */
export const DEFAULT_HORIZON_DAYS = 90

/**
 * Before a bid: can we even answer this client's screening questionnaire?
 *
 * The number worth putting on a screen. A vendor losing a bid on a
 * certificate that lapsed three weeks ago is a common and entirely
 * avoidable way to lose work, and nobody finds out until the rejection
 * arrives with no reason attached.
 */
export function readiness(
  spec: OutboundPackSpec,
  held: OwnDocument[],
  on: Date,
  opts: { horizonDays?: number | null } = {}
): Readiness {
  const horizonDays =
    opts.horizonDays === null ? null : (opts.horizonDays ?? DEFAULT_HORIZON_DAYS)

  const pack = assemble(spec, held, on)
  const items = pack.items

  const answerable = pack.sending.length
  const asked = items.length

  const neverCollected = items.filter((i) => i.standing === 'MISSING')
  const lapsed = items.filter((i) => i.standing === 'EXPIRED')
  const noExpiryRecorded = items.filter((i) => i.standing === 'NO_EXPIRY_RECORDED')
  const unconfirmed = items.filter((i) => i.unconfirmed && i.standing !== 'MISSING')
  const expiresInsideHorizon =
    horizonDays == null
      ? []
      : items.filter(
          (i) => i.daysLeft != null && i.daysLeft >= 0 && i.daysLeft <= horizonDays
        )

  const missingRequired = items.filter(
    (i) =>
      i.required &&
      i.disposition !== 'SENDING' &&
      i.disposition !== 'SENDING_WITH_WARNING'
  )

  const percent = asked === 0 ? null : Math.round((answerable / asked) * 100)

  return {
    packKey: spec.key,
    packLabel: spec.label,
    asked,
    answerable,
    percent,
    ready: missingRequired.length === 0,
    neverCollected,
    lapsed,
    noExpiryRecorded,
    expiresInsideHorizon,
    unconfirmed,
    horizonDays,
    says: readinessSays({
      asked,
      answerable,
      spec,
      missingRequired,
      lapsed,
      noExpiryRecorded,
      expiresInsideHorizon,
      unconfirmed,
      horizonDays,
    }),
  }
}

function readinessSays(x: {
  asked: number
  answerable: number
  spec: OutboundPackSpec
  missingRequired: PackedItem[]
  lapsed: PackedItem[]
  noExpiryRecorded: PackedItem[]
  expiresInsideHorizon: PackedItem[]
  unconfirmed: PackedItem[]
  horizonDays: number | null
}): string {
  if (x.asked === 0) return `"${x.spec.label}" asks for nothing, so there is nothing to be ready for.`

  const head = `${x.answerable} of ${x.asked} — `
  const parts: string[] = []

  if (x.missingRequired.length === 0) {
    parts.push(
      `we could answer ${x.spec.label.toLowerCase()} today.`
    )
  } else {
    parts.push(
      `we could not answer ${x.spec.label.toLowerCase()} today. ` +
        `${x.missingRequired.map((m) => m.label).join(', ')} would stop the bid.`
    )
  }

  if (x.lapsed.length) {
    parts.push(
      `${x.lapsed.length} document${x.lapsed.length === 1 ? ' has' : 's have'} lapsed and cannot be sent.`
    )
  }
  if (x.noExpiryRecorded.length) {
    parts.push(
      `${x.noExpiryRecorded.length} ${x.noExpiryRecorded.length === 1 ? 'is' : 'are'} on file with no expiry recorded, which is not the same as being current.`
    )
  }
  if (x.expiresInsideHorizon.length && x.horizonDays != null) {
    parts.push(
      `${x.expiresInsideHorizon.length} expire${x.expiresInsideHorizon.length === 1 ? 's' : ''} inside the next ${x.horizonDays} days — renew before, not during.`
    )
  }
  if (x.unconfirmed.length) {
    parts.push(
      `${x.unconfirmed.length} ${x.unconfirmed.length === 1 ? 'has' : 'have'} never been checked by anybody here.`
    )
  }

  return head + parts.join(' ')
}

/** Readiness across every pack, worst first. Answers "what is stopping us bidding". */
export function readinessAcross(
  held: OwnDocument[],
  on: Date,
  opts: { horizonDays?: number | null; packs?: OutboundPackSpec[] } = {}
): Readiness[] {
  const packs = opts.packs ?? OUTBOUND_PACKS
  return packs
    .map((p) => readiness(p, held, on, { horizonDays: opts.horizonDays }))
    .sort((a, b) => {
      if (a.ready !== b.ready) return a.ready ? 1 : -1
      return (a.percent ?? 0) - (b.percent ?? 0)
    })
}
