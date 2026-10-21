/**
 * The generated world's papers (etyme-regulatory), decided without the
 * database: every row the papers' steps write, with its id, from the
 * frame and supply's people.
 *
 * What is written, and the rule each row stands on:
 *
 *   An I-9 for everybody on a live W2 line at a US site, completed by the
 *   employer from a named document on the list (a passport, a green card,
 *   a visa, a work permit), on the edition in force the day it was
 *   completed; the document it was completed from as a row of its own,
 *   and the backing between the two. A handful are on a retired edition
 *   (an audit finding), and a few old rows from a past employer carry no
 *   edition at all, the way paper I-9s did before anybody recorded one.
 *
 *   A right-to-work check for everybody on a live line at a UK site. India
 *   and Australia carry no right-to-work row: the clearance table holds
 *   the US and UK rules only, and a row nothing reads is a fact nobody
 *   checks.
 *
 *   A background check recorded as the screening company's verdict, with
 *   its name, its reference, its date and its words, ordered by the firm
 *   that employs or places the person. Most clear; some clear with
 *   conditions; a few flagged, and on a flagged report somebody is
 *   working, the firm's decision not to act on it with the reason. A few
 *   sent out and not back. A twelve-month report on somebody still on site
 *   is mostly run again; a few have aged out and are chased.
 *
 *   A visa petition for every H-1B person, with its trail and its papers:
 *   filed, evidence asked for and sent, approved, stamped, working on it;
 *   a few running out inside the assignment.
 *
 *   The employer's own position on overtime for every live W2 line at a
 *   US site: nonexempt by default, exempt as a computer employee where
 *   the pay test leaves it open and the employer says so.
 *
 *   A supplier's cover (general liability, workers' compensation, errors
 *   and omissions, good standing) recorded by the firm that buys from it,
 *   in every state: current, running out inside thirty days with the
 *   renewal on file and not yet started, lapsed (a handful, each naming
 *   its supplier), and missing.
 *
 *   A professional license for the licensed healthcare and manufacturing
 *   roles, and a CPA license for some of the finance accountants.
 *
 *   What each generated order asks for on paper (the client's set and the
 *   chain's set, the way the base world's orders ask), and on a few lines
 *   the background check waived by the client's compliance officer with
 *   the reason. Never the I-9 or the right-to-work check: work
 *   authorization cannot be waived.
 *
 * Every id is `idFor('papers/…')`, so it sorts after the base world's and
 * a second seeding finds every row and writes nothing.
 */

import type { Prisma } from '@prisma/client'
import { day } from '@/lib/seed-days'
import { checkToRecord, type CheckRow } from '@/lib/attestation'
import { PUBLISHED_EDITIONS } from '@/lib/contract-clearance'
import { checkAssertion, screenExemption } from '@/lib/worker-classification'
import { applyMove, EVENT_FOR, type PetitionStatus } from '@/lib/visa-petition'
import { planPeople, rungIds, type LinePlan, type PersonPlan } from '../people'
import { between, idFor, keyed, pick } from '../kit'
import type { PersonFacts, ScaleFirm, ScaleFrame } from '../types'

type WithId<T> = T & { id: string }

const DAY = 86_400_000
const plus = (d: Date, n: number) => new Date(d.getTime() + n * DAY)
const addMonths = (d: Date, m: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + m, d.getUTCDate()))
const earliest = (a: Date, b: Date) => (a.getTime() <= b.getTime() ? a : b)
const pkey = (p: PersonPlan, rest: string) => `papers/person/${String(p.n).padStart(4, '0')}/${rest}`

/** The screening companies the firms order from: the same four the simulation orders from. */
export const PROVIDERS = ['Sterling', 'HireRight', 'First Advantage', 'Checkr'] as const

/** What a screening company writes, copied as written. The simulation's own words. */
export const PROVIDER_SAYS: Record<'CLEAR' | 'CONDITIONAL' | 'FLAGGED', string> = {
  CLEAR: 'County criminal, federal criminal and national sex offender registry searches complete. No records found.',
  CONDITIONAL: 'Searches complete. Employment verification for one prior employer could not be completed; all other components clear.',
  FLAGGED: 'County criminal search returned one record requiring review. A copy of the record is included with this report.',
}

/** Invented insurers. A real carrier's name on a seeded certificate reads as a claim about that carrier. */
const INSURERS = ['Granite Mutual Insurance', 'Lakeshore Casualty', 'Pinecrest Indemnity', 'Harborline Assurance', 'Copperfield Underwriters']

/** The state a firm's good standing comes from: where the generated firms are registered. */
const STANDING_ISSUERS = ['Delaware Division of Corporations', 'Texas Secretary of State', 'Illinois Secretary of State', 'New Jersey Division of Revenue']

/** Two letters for a US place, and a fallback for "Remote". */
const STATES = ['TX', 'IL', 'OH', 'NC', 'GA', 'WA', 'KS', 'NJ', 'CA', 'NY', 'MN', 'CO']
function stateOf(location: string, r: () => number): string {
  const m = /,\s*([A-Z]{2})\b/.exec(location)
  return m ? m[1] : pick(r, STATES)
}

// ── What the plan returns ─────────────────────────────────────────────

export type VerificationRow = WithId<Prisma.VerificationCreateManyInput>
export type BackingRow = WithId<Prisma.DocumentBackingCreateManyInput>
export type PetitionRow = WithId<Prisma.VisaPetitionCreateManyInput>
export type VisaEventRow = WithId<Prisma.VisaEventCreateManyInput>
export type VisaDocumentRow = WithId<Prisma.VisaDocumentCreateManyInput>
export type ExemptRow = WithId<Prisma.ExemptAssertionCreateManyInput>

/** A state a paper is in, as the counts and the sentences name it. */
export type PaperState =
  | 'CURRENT' | 'EXPIRING' | 'LAPSED' | 'NOT_STARTED' | 'NO_EXPIRY' | 'ORDERED' | 'CONDITIONAL' | 'FLAGGED'
  /** An I-9 on an edition already retired the day it was completed, or with no edition recorded. */
  | 'RETIRED_EDITION' | 'NO_EDITION'

export interface PaperPlan {
  /** Every person's paper, and the documents behind each I-9. */
  person: VerificationRow[]
  /** The documents the I-9s were completed from; written before the backings. */
  evidence: VerificationRow[]
  backings: BackingRow[]
  petitions: PetitionRow[]
  visaEvents: VisaEventRow[]
  visaDocuments: VisaDocumentRow[]
  exempt: ExemptRow[]
  /** Every supplier's cover, recorded by a firm that buys from it. */
  cover: VerificationRow[]
  /** The rung-0 sell lines whose background check the client waived, and the person on each. */
  waived: { sellId: string; orderId: string; personId: string; clientId: string; waivedById: string; reason: string; on: Date }[]
  /** For the counts: each row's kind and state, by id. */
  states: Map<string, { kind: string; state: PaperState }>
  /** People on a live line with no background check, and why: waived on the line, or simply not on file. */
  missingBackground: { personId: string; waived: boolean }[]
  /** Suppliers with a kind of cover nobody has on file. */
  missingCover: { companyId: string; kind: string }[]
  /** Who was placed, as the I-9 sentence reads it. */
  placedUs: string[]
}

// ── Who records ───────────────────────────────────────────────────────

/** The seat that keeps a firm's people's papers: compliance, then HR, then payroll, then the owner. */
export function papersSeat(firm: ScaleFirm): { personId: string; name: string } {
  const s = firm.seat('compliance') ?? firm.seat('hr') ?? firm.seat('payroll') ?? firm.seats[0]
  return { personId: s.personId, name: s.name }
}

/** The seat that records a supplier's certificate at the firm buying from it. */
function coverSeat(firm: ScaleFirm): { personId: string; name: string } {
  const s = firm.seat('compliance') ?? firm.seat('procurement') ?? firm.seat('contracts') ?? firm.seats[0]
  return { personId: s.personId, name: s.name }
}

// ── The edition an I-9 was completed on ──────────────────────────────

/** The edition in force on a day, the newest first where two were accepted at once. */
export function editionOn(on: Date): string {
  const list = PUBLISHED_EDITIONS.I9_EVERIFY
  const open = list.filter((e) => e.effectiveFrom.getTime() <= on.getTime() && (!e.retiredAt || e.retiredAt.getTime() > on.getTime()))
  return (open[open.length - 1] ?? list[list.length - 1]).edition
}

/** An edition already retired on that day, for the audit finding. */
export function retiredOn(on: Date): string | null {
  return PUBLISHED_EDITIONS.I9_EVERIFY.find((e) => e.retiredAt && e.retiredAt.getTime() <= on.getTime())?.edition ?? null
}

// ── A row from the one rule that records a check ──────────────────────

/**
 * The row `checkToRecord` would write, as a create-many row. The seed
 * records nothing the route would refuse: a verdict with no provider, an
 * I-9 with nothing behind it, a paper of a kind that runs out with no
 * date. The one exception is named where it is made (an old I-9 with no
 * edition, which is the finding, not the rule).
 */
function rowFrom(
  id: string,
  row: CheckRow,
  subject: { personId: string } | { companyId: string },
  by: string,
  orderedBy: string | null,
): VerificationRow {
  return {
    id,
    ...subject,
    type: row.type as never,
    status: row.status as never,
    provider: row.provider,
    referenceId: row.referenceId,
    issuedAt: row.issuedAt,
    validFrom: row.validFrom,
    expiresAt: row.expiresAt,
    formEdition: row.formEdition,
    result: (row.result ?? undefined) as Prisma.InputJsonValue | undefined,
    orderedByCompanyId: row.ordered ? orderedBy : null,
    orderedAt: row.orderedAt,
    uploadedById: by,
    verifiedById: by,
    verifiedAt: row.verifiedAt,
    createdAt: row.verifiedAt,
  }
}

function record(input: Parameters<typeof checkToRecord>[0], on: Date): CheckRow {
  const v = checkToRecord(input, on)
  if (!v.ok) throw new Error(`The papers seed asked for a row the rule refuses (${input.type} for ${input.subjectName}): ${v.message}`)
  return v.row
}

function stateOf2(expiresAt: Date | null | undefined, validFrom: Date | null | undefined, today: Date): PaperState {
  if (validFrom && validFrom.getTime() > today.getTime()) return 'NOT_STARTED'
  if (!expiresAt) return 'NO_EXPIRY'
  if (expiresAt.getTime() < today.getTime()) return 'LAPSED'
  if (expiresAt.getTime() - today.getTime() <= 30 * DAY) return 'EXPIRING'
  return 'CURRENT'
}

// ── The plan ──────────────────────────────────────────────────────────

const plans = new WeakMap<ScaleFrame, PaperPlan>()

/**
 * Every paper of the generated world. Pure; computed once per frame.
 * `people` is supply's two thousand, as `buildPeople(frame)` gives them;
 * the lines' rungs and rates are read from supply's own plan.
 */
export function planPapers(frame: ScaleFrame, people?: readonly PersonFacts[]): PaperPlan {
  const have = plans.get(frame)
  if (have) return have
  const wanted = people ? new Set(people.map((p) => p.id)) : null
  const plan = new Planner(frame, planPeople(frame).filter((p) => !wanted || wanted.has(p.facts.id))).run()
  plans.set(frame, plan)
  return plan
}

/** A live line's bottom rung: the employer, and whether it is a W2 line the employer runs payroll on. */
function bottomOf(l: LinePlan): { employerId: string; rung: number; w2: boolean } {
  const rung = l.chain.length - 1
  return { employerId: l.chain[rung], rung, w2: !l.ownCompany }
}

class Planner {
  private out: PaperPlan = {
    person: [], evidence: [], backings: [], petitions: [], visaEvents: [], visaDocuments: [], exempt: [], cover: [],
    waived: [], states: new Map(), missingBackground: [], missingCover: [], placedUs: [],
  }
  private today = day(0)

  constructor(private frame: ScaleFrame, private people: PersonPlan[]) {}

  run(): PaperPlan {
    const waivedPeople = this.planWaivers()
    for (const p of this.people) {
      const visaEnds = this.planPetition(p)
      this.planI9s(p, visaEnds)
      this.planRightToWork(p)
      this.planScreening(p, waivedPeople)
      this.planLicense(p)
      this.planExempt(p)
    }
    this.planCover()
    return this.out
  }

  private note(id: string, kind: string, state: PaperState) {
    this.out.states.set(id, { kind, state })
  }

  private firm(id: string): ScaleFirm | null {
    return this.frame.byId.get(id) ?? null
  }

  private live(p: PersonPlan): LinePlan | null {
    return p.lines.find((l) => l.live) ?? null
  }

  /** The most recent ended line, for a person not on a live one. */
  private latestEnded(p: PersonPlan): LinePlan | null {
    return [...p.lines].filter((l) => !l.live).sort((a, b) => b.end.getTime() - a.end.getTime())[0] ?? null
  }

  // ── Waivers on the line, decided first so the person carries no report ──

  private planWaivers(): Set<string> {
    const out = new Set<string>()
    for (const p of this.people) {
      const l = this.live(p)
      if (!l || l.ownCompany) continue
      const r = keyed(pkey(p, 'waiver'))
      if (r() >= 1 / 30) continue
      const client = this.firm(l.clientId)
      if (!client) continue
      const officer = papersSeat(client)
      const on = plus(l.start, -between(r, 3, 12))
      this.out.waived.push({
        sellId: rungIds(p, l, 0).sell,
        orderId: idFor(`order/${l.clientId}/${l.chain[0]}`),
        personId: p.facts.id,
        clientId: l.clientId,
        waivedById: officer.personId,
        reason: pick(r, [
          'The site runs its own screening on every badge holder before a card is issued, and this person’s is on file with site security.',
          'Screened by this client under its own program within the last six months; the result is held by the client’s security office.',
          'A returning contractor cleared on the client’s own screening last year; the client accepts that clearance for this line.',
        ]),
        on,
      })
      out.add(p.facts.id)
    }
    return out
  }

  // ── The visa petition, for every H-1B person ──────────────────────

  /** Returns the day the visa runs out where one is active, which is the day the I-9 is completed again. */
  private planPetition(p: PersonPlan): Date | null {
    if (p.facts.workAuth !== 'H1B') return null
    const r = keyed(pkey(p, 'petition'))
    const live = this.live(p)
    const id = idFor(pkey(p, 'petition'))
    let status: PetitionStatus
    let expires: Date | null
    if (live) {
      // On a live line the petition is working: most well in date, some
      // running out inside ninety days, a few inside thirty.
      const roll = r()
      const left = roll < 1 / 12 ? between(r, 6, 29) : roll < 0.2 ? between(r, 31, 89) : between(r, 120, 1000)
      expires = day(left)
      status = left <= 90 ? 'EXPIRING' : 'ACTIVE'
    } else {
      const roll = r()
      status = roll < 0.5 ? 'ACTIVE' : roll < 0.62 ? 'FILED' : roll < 0.72 ? 'RFE' : roll < 0.82 ? 'APPROVED' : roll < 0.9 ? 'STAMPED' : roll < 0.95 ? 'EXPIRED' : 'DENIED'
      expires =
        status === 'EXPIRED' ? day(-between(r, 5, 120))
          : status === 'FILED' || status === 'RFE' || status === 'DENIED' ? null
            : day(between(r, 120, 1000))
    }
    // An approval runs three years: the petition was filed about five months before the three years began.
    // One still pending was filed months ago, so every step on its trail is in the past.
    const left = expires ? Math.round((expires.getTime() - this.today.getTime()) / DAY) : 0
    const filed = expires ? day(Math.min(-200, left - 1095 - 150)) : day(-between(r, 120, 200))
    const rfe = status === 'RFE' || (status !== 'FILED' && r() < 1 / 3)
    const trail: { type: string; on: Date; notes: string }[] = [
      { type: 'FILED', on: filed, notes: 'Filed with premium processing.' },
      { type: 'RECEIVED', on: plus(filed, 3), notes: 'Receipt notice issued.' },
    ]
    // Each step through the one rule a person's move goes through, so the trail is one the screen could have walked.
    let at: PetitionStatus = 'FILED'
    const step = (move: Parameters<typeof applyMove>[1], on: Date, notes: string) => {
      const v = applyMove(at, move, { personName: p.facts.name, type: 'H1B', expiresAt: expires ?? on })
      if (!v.ok) throw new Error(`${p.facts.name}'s petition cannot move ${move} from ${at}: ${v.message}`)
      at = v.status
      trail.push({ type: EVENT_FOR[move], on, notes })
    }
    if (rfe) {
      step('RFE', plus(filed, 45), 'Evidence requested on the specialty occupation.')
      if (status !== 'RFE') step('RFE_ANSWERED', plus(filed, 68), 'Client letter and degree evaluation sent.')
    }
    if (status === 'DENIED') step('DENIED', plus(filed, rfe ? 110 : 90), 'Denied: the role was not shown to need a specialty degree.')
    const approved = plus(filed, 120)
    if (['APPROVED', 'STAMPED', 'ACTIVE', 'EXPIRING', 'EXPIRED'].includes(status)) step('APPROVED', approved, 'Approved to the date on the I-797.')
    if (['STAMPED', 'ACTIVE', 'EXPIRING', 'EXPIRED'].includes(status)) step('STAMPED', plus(filed, 165), 'Stamped at the consulate.')
    if (['ACTIVE', 'EXPIRING', 'EXPIRED'].includes(status)) step('ACTIVE', plus(filed, 180), 'Working on it.')
    if (status === 'EXPIRING') trail.push({ type: 'EXPIRING', on: plus(expires!, -90), notes: 'Inside ninety days of the date on the I-797.' })
    if (status === 'EXPIRED') trail.push({ type: 'EXPIRED', on: expires!, notes: 'Ran out on the date on the I-797.' })

    const where = live ? this.firm(live.clientId) : null
    this.out.petitions.push({
      id, personId: p.facts.id, type: 'H1B', country: 'US', status,
      filedAt: filed, approvedAt: ['APPROVED', 'STAMPED', 'ACTIVE', 'EXPIRING', 'EXPIRED'].includes(status) ? approved : null,
      expiresAt: expires,
      worksiteAddress: where ? (where.sites.find((s) => s.primary)?.city ?? null) : null,
      transferOk: status === 'ACTIVE' || status === 'EXPIRING',
    })
    trail.forEach((e, i) => this.out.visaEvents.push({
      id: idFor(`${pkey(p, 'petition')}/event/${i}`), petitionId: id, eventType: e.type, occurredAt: e.on, notes: e.notes, createdAt: e.on,
    }))
    const docs: { docType: string; file: string; on: Date }[] = [{ docType: 'LCA', file: 'lca-certified.pdf', on: plus(filed, -20) }]
    if (['APPROVED', 'STAMPED', 'ACTIVE', 'EXPIRING', 'EXPIRED'].includes(status)) docs.push({ docType: 'I797', file: 'i797-approval-notice.pdf', on: approved })
    if (['STAMPED', 'ACTIVE', 'EXPIRING', 'EXPIRED'].includes(status)) docs.push({ docType: 'VISA_STAMP', file: 'visa-stamp.pdf', on: plus(filed, 165) })
    docs.forEach((d) => this.out.visaDocuments.push({
      id: idFor(`${pkey(p, 'petition')}/doc/${d.docType}`), petitionId: id, docType: d.docType, fileName: d.file,
      fileUrl: `/files/visas/${id}/${d.file}`, expiresAt: d.docType === 'LCA' ? null : expires, uploadedAt: d.on,
    }))
    return ['ACTIVE', 'EXPIRING'].includes(status) || (!live && ['APPROVED', 'STAMPED'].includes(status)) ? expires : null
  }

  // ── The I-9, from a named document ────────────────────────────────

  private planI9s(p: PersonPlan, visaEnds: Date | null): void {
    if (p.facts.country !== 'US') return
    const live = this.live(p)
    if (live) {
      const b = bottomOf(live)
      if (b.w2) {
        this.i9(p, live, b.employerId, visaEnds, 'live')
        this.out.placedUs.push(p.facts.id)
      }
    }
    // The I-9 a past employer still keeps: three years from the hire or a year after the work ended, whichever is later.
    const ended = this.latestEnded(p)
    if (ended && !ended.ownCompany) {
      const b = bottomOf(ended)
      if (!live || bottomOf(live).employerId !== b.employerId) this.i9(p, ended, b.employerId, visaEnds, 'old')
    }
  }

  private i9(p: PersonPlan, l: LinePlan, employerId: string, visaEnds: Date | null, which: 'live' | 'old'): void {
    const employer = this.firm(employerId)
    if (!employer) return
    const r = keyed(pkey(p, `i9/${which}`))
    const seat = papersSeat(employer)
    const completed = earliest(plus(l.start, -between(r, 1, 3)), day(-1))
    // The document shown, by the person's authorization, always in date on the day it was shown.
    const auth = p.facts.workAuth
    const evidenceType = auth === 'GREEN_CARD' ? 'GREEN_CARD' : auth === 'OPT' ? 'WORK_PERMIT' : auth === 'H1B' || auth === 'TN' ? 'VISA' : 'PASSPORT'
    const issuer = { GREEN_CARD: 'US Citizenship and Immigration Services', WORK_PERMIT: 'US Citizenship and Immigration Services', VISA: 'US Department of State', PASSPORT: 'US Department of State' }[evidenceType]
    let evidenceEnds: Date
    if (evidenceType === 'VISA' && visaEnds && visaEnds.getTime() > completed.getTime()) evidenceEnds = visaEnds
    else if (evidenceType === 'WORK_PERMIT') evidenceEnds = plus(completed, between(r, 200, 700))
    else if (evidenceType === 'VISA') evidenceEnds = plus(completed, between(r, 300, 1000))
    else evidenceEnds = plus(completed, between(r, 900, 3400))
    // Somebody working today on time-limited papers had them renewed and the I-9 completed again: never lapsed under them.
    if (which === 'live' && (evidenceType === 'VISA' || evidenceType === 'WORK_PERMIT') && evidenceEnds.getTime() < day(5).getTime()) {
      evidenceEnds = day(between(r, 5, 400))
    }
    // An old I-9 whose document has since run out was still good the day it was shown, and is judged on that day.
    const edition = editionOn(completed)
    const retired = which === 'live' && r() < 1 / 25 ? retiredOn(completed) : null
    const row = record({
      about: 'PERSON', type: 'I9_EVERIFY', subjectName: p.facts.name, recordedBy: seat.name,
      issuedOn: completed, formEdition: retired ?? edition,
      evidence: [{ type: evidenceType, issuer, reference: `${evidenceType.slice(0, 2)}-${between(r, 100000, 999999)}`, expiresAt: evidenceEnds }],
    }, completed)
    const id = idFor(pkey(p, `i9/${which}/${employerId}`))
    // A few old rows were completed on paper before anybody recorded which edition: the finding, kept.
    const noEdition = which === 'old' && r() < 1 / 40
    const form = rowFrom(id, { ...row, formEdition: noEdition ? null : row.formEdition }, { personId: p.facts.id }, seat.personId, null)
    this.out.person.push(form)
    this.note(id, 'I9_EVERIFY', noEdition ? 'NO_EDITION' : retired ? 'RETIRED_EDITION' : stateOf2(row.expiresAt, null, this.today))
    row.evidence.forEach((e, i) => {
      const evId = idFor(pkey(p, `i9/${which}/${employerId}/evidence/${i}`))
      this.out.evidence.push({
        id: evId, personId: p.facts.id, type: e.type as never, status: 'CLEAR', provider: e.provider, referenceId: e.referenceId,
        expiresAt: e.expiresAt, uploadedById: seat.personId, verifiedById: seat.personId, verifiedAt: completed, createdAt: completed,
      })
      this.note(evId, e.type, stateOf2(e.expiresAt, null, this.today))
      this.out.backings.push({
        id: idFor(pkey(p, `i9/${which}/${employerId}/backing/${i}`)), formId: id, evidenceId: evId, satisfiedKey: e.type,
        recordedById: seat.personId, recordedAt: completed,
      })
    })
  }

  // ── A UK site's right-to-work check ───────────────────────────────

  private planRightToWork(p: PersonPlan): void {
    const live = this.live(p)
    if (!live || p.facts.country !== 'GB' || live.ownCompany) return
    const employer = this.firm(bottomOf(live).employerId)
    if (!employer) return
    const r = keyed(pkey(p, 'rtw'))
    const seat = papersSeat(employer)
    const on = earliest(plus(live.start, -between(r, 1, 5)), day(-1))
    const ends = r() < 0.1 ? day(between(r, 5, 29)) : day(between(r, 200, 1100))
    const row = record({
      about: 'PERSON', type: 'RIGHT_TO_WORK', subjectName: p.facts.name, recordedBy: seat.name,
      issuer: 'Home Office online check', issuedOn: on, expiresAt: ends, reference: `W${between(r, 10000000, 99999999)}`,
    }, on)
    const id = idFor(pkey(p, 'rtw'))
    this.out.person.push(rowFrom(id, row, { personId: p.facts.id }, seat.personId, null))
    this.note(id, 'RIGHT_TO_WORK', stateOf2(row.expiresAt, null, this.today))
  }

  // ── The screening company's verdicts ──────────────────────────────

  private planScreening(p: PersonPlan, waived: Set<string>): void {
    const live = this.live(p)
    const line = live ?? this.latestEnded(p)
    const r = keyed(pkey(p, 'screening'))
    if (!line) {
      // Nobody has placed them yet. A few have a check out with their bench firm, ordered and not back.
      const firm = this.firm(p.facts.firmId)
      if (firm && p.facts.country === 'US' && r() < 1 / 25) this.ordered(p, firm, r)
      return
    }
    // The firm that employs them on the line orders it; on their own company's line, the firm that places them.
    const orderer = this.firm(line.ownCompany ? line.chain[0] : bottomOf(line).employerId)
    if (!orderer) return
    if (live && (waived.has(p.facts.id) || r() < 1 / 50)) {
      this.out.missingBackground.push({ personId: p.facts.id, waived: waived.has(p.facts.id) })
    } else {
      const seat = papersSeat(orderer)
      const provider = pick(r, PROVIDERS)
      const roll = r()
      const outcome: 'CLEAR' | 'CONDITIONAL' | 'FLAGGED' = live
        ? roll < 0.03 ? 'FLAGGED' : roll < 0.08 ? 'CONDITIONAL' : 'CLEAR'
        : roll < 0.025 ? 'FLAGGED' : 'CLEAR'
      const rendered = earliest(plus(line.start, -between(r, 4, 14)), day(-2))
      this.verdict(p, 'BACKGROUND_CHECK', 'first', orderer, seat, provider, outcome, rendered, r, live !== null)
      // A twelve-month report on somebody still on site is run again, mostly; a few have aged out and are chased.
      if (live && addMonths(rendered, 12).getTime() < plus(this.today, 30).getTime() && r() < 0.85) {
        const again = day(-between(r, 10, 300))
        if (again.getTime() > rendered.getTime()) {
          this.verdict(p, 'BACKGROUND_CHECK', 'again', orderer, seat, pick(r, PROVIDERS), 'CLEAR', again, r, true)
        }
      }
    }
    // A drug screen where the work is clinical or on a plant floor; an education evaluation behind every H-1B.
    if (live && (live.industry === 'HEALTHCARE' || live.industry === 'MANUFACTURING') && !live.ownCompany) {
      const seat = papersSeat(orderer)
      const rendered = earliest(plus(live.start, -between(r, 3, 10)), day(-2))
      const fresh = addMonths(rendered, 12).getTime() < this.today.getTime() ? day(-between(r, 20, 200)) : rendered
      this.verdict(p, 'DRUG_SCREENING', 'first', orderer, seat, 'Quest', 'CLEAR', fresh, r, true, 'Ten-panel screen negative.')
    }
    if (p.facts.workAuth === 'H1B' || p.facts.country === 'IN') {
      // An evaluation a credential service issued about a degree, examined by the firm: a document, not a verdict, and it never runs out.
      const seat = papersSeat(orderer)
      const on = earliest(plus(line.start, -between(r, 20, 60)), day(-2))
      const row = record({
        about: 'PERSON', type: 'EDUCATION_EVALUATION', subjectName: p.facts.name, recordedBy: seat.name,
        issuer: 'WES', issuedOn: plus(on, -between(r, 5, 30)), reference: `WES-${between(r, 1000000, 9999999)}`,
      }, on)
      const id = idFor(pkey(p, `EDUCATION_EVALUATION/first/${orderer.id}`))
      this.out.person.push(rowFrom(id, row, { personId: p.facts.id }, seat.personId, null))
      this.note(id, 'EDUCATION_EVALUATION', stateOf2(row.expiresAt, null, this.today))
    }
  }

  private ordered(p: PersonPlan, firm: ScaleFirm, r: () => number): void {
    const seat = papersSeat(firm)
    const provider = pick(r, PROVIDERS)
    const on = day(-between(r, 1, 6))
    const row = record({
      about: 'PERSON', type: 'BACKGROUND_CHECK', subjectName: p.facts.name, recordedBy: seat.name,
      provider, reference: refFor(provider, r), renderedOn: on, outcome: 'ORDERED', consentOn: plus(on, -1),
    }, on)
    const id = idFor(pkey(p, `BACKGROUND_CHECK/ordered/${firm.id}`))
    this.out.person.push(rowFrom(id, row, { personId: p.facts.id }, seat.personId, firm.id))
    this.note(id, 'BACKGROUND_CHECK', 'ORDERED')
  }

  private verdict(
    p: PersonPlan, type: string, which: string, orderer: ScaleFirm, seat: { personId: string; name: string },
    provider: string, outcome: 'CLEAR' | 'CONDITIONAL' | 'FLAGGED', rendered: Date, r: () => number, working: boolean, says?: string,
  ): void {
    const row = record({
      about: 'PERSON', type, subjectName: p.facts.name, recordedBy: seat.name,
      provider, reference: refFor(provider, r), renderedOn: rendered, outcome,
      providerSays: says ?? PROVIDER_SAYS[outcome], consentOn: plus(rendered, -between(r, 2, 6)),
    }, plus(rendered, 1))
    if (outcome === 'FLAGGED') {
      // The steps after an unfavorable report are the firm's, and they are
      // written beside the report, never over it. Somebody on site today was
      // gone ahead with: the firm decided the record does not change the
      // decision, and why. Nobody here is shown a pre-adverse notice, because
      // a notice is a paper with the copy of the report on it, and the
      // generated world writes no files; the simulation walks that step
      // through the route.
      row.result = {
        ...(row.result ?? {}),
        ...(working
          ? {
              adverse: {
                decision: 'NOT_TAKEN',
                decisionReason: pick(r, [
                  'The record is more than seven years old and unrelated to the duties of the job.',
                  'The record was dismissed; the court disposition was provided and matches.',
                  'A minor traffic matter with no bearing on the work.',
                ]),
                decidedBy: seat.name,
              },
            }
          : {}),
      }
    }
    const id = idFor(pkey(p, `${type}/${which}/${orderer.id}`))
    this.out.person.push(rowFrom(id, row, { personId: p.facts.id }, seat.personId, orderer.id))
    this.note(id, type, outcome === 'FLAGGED' ? 'FLAGGED' : outcome === 'CONDITIONAL' ? 'CONDITIONAL' : stateOf2(row.expiresAt, null, this.today))
  }

  // ── A professional license ────────────────────────────────────────

  private planLicense(p: PersonPlan): void {
    if (p.facts.country !== 'US') return
    const title = p.facts.role.title.toLowerCase()
    const cpa = p.facts.industry === 'FINANCE' && /accountant|controller/.test(title)
    if (!p.facts.role.licensed && !cpa) return
    const r = keyed(pkey(p, 'license'))
    if (cpa && r() < 0.5) return
    const live = this.live(p)
    const employer = this.firm(live && !live.ownCompany ? bottomOf(live).employerId : p.facts.firmId)
    if (!employer) return
    const seat = papersSeat(employer)
    const st = stateOf(p.location, r)
    const board = cpa ? 'Board of Accountancy'
      : /nurse|nursing/.test(title) ? 'Board of Nursing'
        : /physical therapist/.test(title) ? 'Board of Physical Therapy'
          : /respiratory/.test(title) ? 'Respiratory Care Board'
            : /pharmacist/.test(title) ? 'Board of Pharmacy'
              : /electrician/.test(title) ? 'Electrical Licensing Board'
                : 'Licensing Board'
    const prefix = cpa ? 'CPA' : /practitioner/.test(title) ? 'APRN' : /assistant/.test(title) ? 'CNA' : /nurse/.test(title) ? 'RN' : /electrician/.test(title) ? 'EL' : 'LIC'
    // In date for anybody working; running out inside thirty days for some of them; lapsed only on somebody not working now.
    const roll = r()
    const ends = live
      ? roll < 0.1 ? day(between(r, 4, 29)) : day(between(r, 60, 700))
      : roll < 0.15 ? day(-between(r, 5, 200)) : day(between(r, 40, 700))
    const issued = addMonths(ends, -24)
    const on = plus(issued, between(r, 1, 20))
    const row = record({
      about: 'PERSON', type: 'PROFESSIONAL_LICENSE', subjectName: p.facts.name, recordedBy: seat.name,
      issuer: `${st} ${board}`, issuedOn: issued, expiresAt: ends,
      licenseNumber: `${prefix} ${between(r, 100000, 999999)}`, licenseState: st,
    }, on)
    const id = idFor(pkey(p, 'license'))
    this.out.person.push(rowFrom(id, row, { personId: p.facts.id }, seat.personId, null))
    this.note(id, 'PROFESSIONAL_LICENSE', stateOf2(row.expiresAt, null, this.today))
  }

  // ── The employer's position on overtime ───────────────────────────

  private planExempt(p: PersonPlan): void {
    const live = this.live(p)
    if (!live || p.facts.country !== 'US') return
    const b = bottomOf(live)
    if (!b.w2) return
    const employer = this.firm(b.employerId)
    if (!employer) return
    const r = keyed(pkey(p, 'exempt'))
    const payCents = live.rates[b.rung].payCents
    const screen = screenExemption({ payModel: 'FIXED_HOURLY', payRateCents: payCents, paidOnSalaryBasis: false, weeklySalaryCents: null }, 'US_FLSA')
    const it = live.industry === 'IT' && employer.position === 'GSI'
    const exempt = it && !screen.rulesOut.includes('COMPUTER') && r() < 0.35
    const assertedAt = plus(live.start, -between(r, 2, 9))
    const note = exempt
      ? 'Designs and builds software systems to the client’s specifications as the primary duty, paid by the hour above the computer employee floor.'
      : null
    const verdict = checkAssertion({
      status: exempt ? 'EXEMPT' : 'NONEXEMPT', basis: exempt ? 'COMPUTER' : null, screen, note,
      assertedByCompanyId: employer.id, employerCompanyId: employer.id, assertedByCompanyName: employer.name, assertedAt, reviewBy: null,
    })
    if (!verdict.ok) throw new Error(`${employer.name}'s position on ${p.facts.name} is refused: ${verdict.says}`)
    const seat = employer.seat('payroll') ?? employer.seat('hr') ?? employer.seats[0]
    this.out.exempt.push({
      id: idFor(pkey(p, `exempt/${live.key}`)), buyContractId: rungIds(p, live, b.rung).buy, personId: p.facts.id,
      assertedByCompanyId: employer.id, assertedById: seat.personId,
      status: exempt ? 'EXEMPT' : 'NONEXEMPT', basis: exempt ? 'COMPUTER' : null, wageRule: 'US_FLSA',
      screenOutcome: screen.outcome, screenRulesOut: screen.rulesOut, screenSays: screen.says,
      note, assertedAt, reviewBy: verdict.reviewBy,
    })
  }

  // ── A supplier's cover ────────────────────────────────────────────

  private planCover(): void {
    const suppliers = this.frame.firms.filter((f) => ['PRIME', 'SUB_VENDOR', 'BENCH', 'GSI'].includes(f.position))
    // Who employs somebody on a live line: a lapse there stops a start and is chased tonight.
    const employing = new Set<string>()
    for (const p of this.people) for (const l of p.lines) if (l.live && !l.ownCompany) employing.add(bottomOf(l).employerId)
    const lapseable = suppliers.filter((f) => (f.position === 'SUB_VENDOR' || f.position === 'BENCH') && employing.has(f.id))
    const quiet = suppliers.filter((f) => (f.position === 'SUB_VENDOR' || f.position === 'BENCH') && !employing.has(f.id))
    // A handful lapsed, named: general liability on four, good standing on two, workers' compensation on one.
    const lapsed = new Map<string, string[]>()
    const take = (list: ScaleFirm[], n: number, offset: number, kind: string) => {
      for (let i = 0; i < n && i < list.length; i++) {
        const f = list[(offset + i * 7) % list.length]
        lapsed.set(f.id, [...(lapsed.get(f.id) ?? []), kind])
      }
    }
    take(lapseable, 4, 0, 'INSURANCE_GL')
    take(lapseable, 2, 3, 'GOOD_STANDING')
    take(lapseable, 1, 5, 'INSURANCE_WC')
    // And two with no workers' compensation on file at all, among firms with nobody working: missing, not lapsed.
    const missing = new Set(quiet.filter((_, i) => i % Math.max(1, Math.floor(quiet.length / 2)) === 0).slice(0, 2).map((f) => f.id))

    for (const f of suppliers) {
      const buyerId = this.frame.trades
        .filter((t) => t.seller === f.id && t.relationship !== 'RUNS')
        .map((t) => t.buyer)
        .sort()[0]
      const buyer = buyerId ? this.firm(buyerId) : null
      if (!buyer) continue
      const seat = coverSeat(buyer)
      const kinds = ['INSURANCE_GL', 'INSURANCE_WC', 'GOOD_STANDING']
      if (f.position === 'PRIME' || f.position === 'GSI' || f.industries.includes('IT')) kinds.push('INSURANCE_EO')
      if (f.position === 'GSI') kinds.push('INSURANCE_CYBER')
      for (const kind of kinds) {
        if (kind === 'INSURANCE_WC' && missing.has(f.id)) {
          this.out.missingCover.push({ companyId: f.id, kind })
          continue
        }
        const r = keyed(`papers/cover/${f.id}/${kind}`)
        const issuer = kind === 'GOOD_STANDING' ? pick(r, STANDING_ISSUERS) : pick(r, INSURERS)
        const roll = r()
        let from: Date
        let renewal = false
        if (lapsed.get(f.id)?.includes(kind)) {
          from = addMonths(day(-between(r, 3, 40)), -12)
        } else if (roll < 0.1) {
          // Running out inside thirty days; most of these have the renewal on file already, starting the day the old one runs out.
          from = addMonths(day(between(r, 4, 29)), -12)
          renewal = r() < 0.7
        } else {
          from = day(-between(r, 20, 330))
        }
        this.cert(f, buyer, seat, kind, issuer, from, 'current', r)
        if (renewal) this.cert(f, buyer, seat, kind, issuer, addMonths(from, 12), 'renewal', r)
      }
    }
  }

  private cert(f: ScaleFirm, buyer: ScaleFirm, seat: { personId: string; name: string }, kind: string, issuer: string, from: Date, which: string, r: () => number): void {
    // Recorded when it came in: a renewal a few weeks before it starts, a current one a few days after.
    const on = which === 'renewal' ? plus(from, -between(r, 5, 20)) : plus(from, between(r, 1, 10))
    const row = record({
      about: 'FIRM', type: kind, subjectName: f.name, recordedBy: seat.name, issuer,
      validFrom: from, issuedOn: plus(from, -between(r, 3, 15)), reference: `${kind === 'GOOD_STANDING' ? 'GS' : 'POL'}-${between(r, 1000000, 9999999)}`,
    }, on)
    const id = idFor(`papers/cover/${f.id}/${kind}/${which}`)
    this.out.cover.push(rowFrom(id, row, { companyId: f.id }, seat.personId, null))
    this.note(id, kind, stateOf2(row.expiresAt, row.validFrom, this.today))
    void buyer
  }
}

function refFor(provider: string, r: () => number): string {
  return `${provider.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase()}-${between(r, 100000, 999999)}`
}

// ── What each order asks for (written after money writes the orders) ──

type Owed = 'WORKER' | 'SUPPLIER' | 'CUSTOMER' | 'US'

/** What a client asks of every supplier on every order: the base world's set (lib/seed-document-requirements). */
export const CLIENT_ASKS: { key: string; owedBy: Owed }[] = [
  { key: 'I9_EVERIFY', owedBy: 'WORKER' },
  // The screening company posts its report to whoever ordered it, so the order owes it, never the worker.
  { key: 'BACKGROUND_CHECK', owedBy: 'US' },
  { key: 'INSURANCE_GL', owedBy: 'SUPPLIER' },
  { key: 'INSURANCE_WC', owedBy: 'SUPPLIER' },
  { key: 'GOOD_STANDING', owedBy: 'SUPPLIER' },
  { key: 'MSA', owedBy: 'SUPPLIER' },
]

/** What a firm asks of the firm below it: the cover, the standing and the agreement; the person's file stays with their employer. */
export const CHAIN_ASKS: { key: string; owedBy: Owed }[] = [
  { key: 'INSURANCE_GL', owedBy: 'SUPPLIER' },
  { key: 'INSURANCE_WC', owedBy: 'SUPPLIER' },
  { key: 'GOOD_STANDING', owedBy: 'SUPPLIER' },
  { key: 'MSA', owedBy: 'SUPPLIER' },
]

export const askIdFor = (orderId: string, key: string) => idFor(`papers/ask/${orderId}/${key}`)
export const waiverIdFor = (sellId: string, key: string) => idFor(`papers/ask/line/${sellId}/${key}`)

/** The order rows for the orders money wrote: the client's set on a client's order, the chain's on a firm's. */
export function asksFor(
  orders: { id: string; issuedById: string; startDate: Date | null }[],
  frame: ScaleFrame,
): WithId<Prisma.DocumentRequirementCreateManyInput>[] {
  const out: WithId<Prisma.DocumentRequirementCreateManyInput>[] = []
  for (const o of orders) {
    const issuer = frame.byId.get(o.issuedById)
    if (!issuer) continue
    const asks = issuer.position === 'CLIENT' ? CLIENT_ASKS : CHAIN_ASKS
    for (const a of asks) {
      out.push({
        id: askIdFor(o.id, a.key), workOrderId: o.id, documentTypeKey: a.key, required: true, owedBy: a.owedBy,
        blocks: null, note: null, createdAt: o.startDate ?? undefined,
      })
    }
  }
  return out
}

/** The line rows that waive the background check, each beside the order's own row it overrides. */
export function waiversFor(plan: PaperPlan, orderIds: Set<string>, lineOrder: Map<string, string | null>): WithId<Prisma.DocumentRequirementCreateManyInput>[] {
  const out: WithId<Prisma.DocumentRequirementCreateManyInput>[] = []
  for (const w of plan.waived) {
    const orderId = lineOrder.get(w.sellId) ?? null
    if (!orderId || !orderIds.has(orderId)) continue
    out.push({
      id: waiverIdFor(w.sellId, 'BACKGROUND_CHECK'), sellContractId: w.sellId, documentTypeKey: 'BACKGROUND_CHECK',
      required: true, owedBy: 'US', inheritedFromId: askIdFor(orderId, 'BACKGROUND_CHECK'),
      waivedReason: w.reason, waivedById: w.waivedById, waivedAt: w.on, createdAt: w.on,
    })
  }
  return out
}

/** Counts by kind and state, for the report and the sentences. */
export function paperCounts(plan: PaperPlan): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {}
  for (const { kind, state } of plan.states.values()) {
    out[kind] ??= {}
    out[kind][state] = (out[kind][state] ?? 0) + 1
  }
  out.VISA_PETITION = {}
  for (const p of plan.petitions) out.VISA_PETITION[p.status] = (out.VISA_PETITION[p.status] ?? 0) + 1
  out.EXEMPT_ASSERTION = {}
  for (const e of plan.exempt) out.EXEMPT_ASSERTION[e.status] = (out.EXEMPT_ASSERTION[e.status] ?? 0) + 1
  out.MISSING = {
    BACKGROUND_CHECK_WAIVED: plan.missingBackground.filter((m) => m.waived).length,
    BACKGROUND_CHECK_NOT_ON_FILE: plan.missingBackground.filter((m) => !m.waived).length,
    COVER: plan.missingCover.length,
  }
  return out
}
