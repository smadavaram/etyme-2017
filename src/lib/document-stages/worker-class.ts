/**
 * What a start of US work needs, by the kind of worker somebody is.
 *
 * The founder, 2026-11-08: *"Include all types of workers: students,
 * international students, visa workers, employment authorization,
 * permanent residents and citizens."* Each class meets the rule that
 * governs it at the start, and each rule is confirmed with its source
 * before it is enforced. A rule whose source is not confirmed WARNS and
 * records why; it never blocks (Addendum E: BLOCK where legally grounded,
 * WARN, capture a reason, proceed everywhere else).
 *
 * Four things this file does not do, on purpose:
 *
 *  - It never refuses a person at screening or at interview. Status is a
 *    question asked in words at screening (the 2026-11-03 rule); the start
 *    is where the law bites. `mayInterview` says so and answers yes for
 *    every class.
 *  - It never replaces the I-9. The I-9 gate in lib/contract-clearance
 *    still refuses any US start with no I-9, for every class. What is here
 *    is what the I-9 alone does not see: a student with no permit at all,
 *    a CPT for another employer, a card that ran out, a petition filed by
 *    a different firm.
 *  - It asks nothing of work done outside the US (`lib/work-country`):
 *    an offshore line meets its own country's set, never these rules.
 *  - It renders no verdict on a person. Each sentence says what the record
 *    shows against the rule, and who fixes it.
 *
 * Rules live in data: `WORKER_CLASS_RULES` is the table, one line per
 * rule, each with its source and whether that source was confirmed. A
 * change of law is a change of a line.
 *
 * Owned by regulatory. Pure: the reader that gathers the facts is
 * `workerClassFactsFor` in lib/contract-clearance.
 */

import { formatDayLong } from '@/lib/format-date'

// ── The classes ───────────────────────────────────────────────────────

/** The classes, in the names the generated world uses (supply's `WorkAuth`). */
export const WORKER_CLASSES = [
  'CITIZEN', 'GREEN_CARD', 'H1B', 'TN', 'EAD', 'OPT', 'F1_CPT', 'STUDENT_DOMESTIC', 'F1_NO_PERMIT',
] as const
export type WorkerClass = (typeof WORKER_CLASSES)[number]

/**
 * The class a `ConsultantProfile.workAuth` value reads as. The profile
 * column is free text written by several doors over the years, so the
 * older spellings are read too. Anything else is null: no class rule
 * applies and the I-9 alone decides, which is how every start was judged
 * before this file.
 */
export function classOfWorkAuth(value: string | null | undefined): WorkerClass | null {
  const v = (value ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_')
  switch (v) {
    case 'US_CITIZEN': case 'USC': case 'CITIZEN': return 'CITIZEN'
    case 'GC': case 'GREEN_CARD': case 'LPR': case 'PERMANENT_RESIDENT': return 'GREEN_CARD'
    case 'H1B': case 'H_1B': return 'H1B'
    case 'TN': return 'TN'
    case 'EAD': return 'EAD'
    case 'OPT': case 'F1_OPT': case 'STEM_OPT': return 'OPT'
    case 'CPT': case 'F1_CPT': return 'F1_CPT'
    case 'STUDENT': case 'STUDENT_DOMESTIC': return 'STUDENT_DOMESTIC'
    case 'F1_NO_PERMIT': case 'F1': return 'F1_NO_PERMIT'
    default: return null
  }
}

// ── What each class holds ─────────────────────────────────────────────

/**
 * The papers a person of each class holds, as the generated world gives
 * them (lib/seed-scale/papers) and as a firm should expect to see them.
 * Words, for the report and the tests; the rows are the seed's.
 */
export const CLASS_PAPERS: Readonly<Record<WorkerClass, readonly string[]>> = {
  CITIZEN: ['an I-9 list document (a US passport, or a license with a Social Security card)'],
  GREEN_CARD: ['a permanent resident card (Form I-551), shown for the I-9'],
  STUDENT_DOMESTIC: ['an I-9 list document; no permit, because a citizen or resident needs none'],
  H1B: ['the approval notice (Form I-797) naming the petitioning employer', 'a passport with the H-1B visa'],
  TN: ['the arrival record (Form I-94) admitting the person in TN status, with its admit-until date', 'a passport'],
  OPT: ['an employment authorization card (Form I-766) with its dates and category, STEM where the field allows', 'the Form I-20'],
  F1_CPT: ['the Form I-20 with the CPT page: the employer named and the school’s authorization dates', 'a passport'],
  EAD: ['an employment authorization card (Form I-766) with its end date and category'],
  F1_NO_PERMIT: ['a passport', 'the Form I-20', 'no permit to work off campus'],
}

// ── The rules, as data ────────────────────────────────────────────────

export type RuleKey =
  | 'I9_ONLY'
  | 'F1_NO_PERMIT'
  | 'CPT_NONE'
  | 'CPT_OTHER_EMPLOYER'
  | 'CPT_OUTSIDE_DATES'
  | 'PERMIT_NONE'
  | 'PERMIT_LAPSED'
  | 'PERMIT_NOT_BEGUN'
  | 'PERMIT_RENEWAL_PENDING'
  | 'OPT_UNEMPLOYMENT'
  | 'STEM_OPT_PLAN'
  | 'H1B_PETITIONER_UNKNOWN'
  | 'H1B_OTHER_PETITIONER'
  | 'TN_LAPSED'
  | 'TN_OTHER_EMPLOYER'

export interface ClassRule {
  key: RuleKey
  /** What the rule says, in a line. */
  rule: string
  /** The regulation or statute it stands on. */
  source: string
  /**
   * True only where the source was read and the rule follows from it
   * directly. False means it warns, never blocks, whatever `stops` says.
   */
  confirmed: boolean
  /**
   * What the rule does at the start once confirmed: BLOCK where the law
   * itself bars the work, WARN where it is a matter to be looked at,
   * NOTE where it is said and does not move the verdict (a fact the
   * record cannot hold yet, which would otherwise fire on every row).
   */
  stops: 'BLOCK' | 'WARN' | 'NOTE'
}

/**
 * Every rule, with its source. Confirmed 2026-11-08 against the text of
 * 8 CFR and the INA as published in the eCFR; the paragraph cited is the
 * one the rule reads.
 */
export const WORKER_CLASS_RULES: Readonly<Record<RuleKey, ClassRule>> = {
  I9_ONLY: {
    key: 'I9_ONLY',
    rule: 'A citizen, a permanent resident or a domestic student needs only the I-9, completed from a list document. A permanent resident card is never reverified.',
    source: '8 CFR 274a.2(b)(1)(v) (the lists of acceptable documents); 8 CFR 274a.2(b)(1)(vii) (no reverification of a US passport or a permanent resident card); 8 CFR 274a.12(a)(1) (a permanent resident is authorized incident to status)',
    confirmed: true,
    stops: 'NOTE',
  },
  F1_NO_PERMIT: {
    key: 'F1_NO_PERMIT',
    rule: 'An F-1 student may work off campus only on practical training the school or USCIS authorized (CPT or OPT). With neither, US work may not start.',
    source: '8 CFR 214.2(f)(9) (on-campus employment only) and 214.2(f)(10) (practical training must be authorized); 8 CFR 214.1(e) (unauthorized employment is a failure to maintain status); 8 CFR 274a.12(b)(6) (an F-1 student is authorized only within those)',
    confirmed: true,
    stops: 'BLOCK',
  },
  CPT_NONE: {
    key: 'CPT_NONE',
    rule: 'A student on CPT may start only once the school’s designated official has endorsed the I-20 for this training.',
    source: '8 CFR 214.2(f)(10)(i) (curricular practical training, authorized by the DSO and endorsed on the Form I-20); USCIS Handbook for Employers M-274, section 6.3 (the endorsed I-20 with the passport and I-94 is the List A document)',
    confirmed: true,
    stops: 'BLOCK',
  },
  CPT_OTHER_EMPLOYER: {
    key: 'CPT_OTHER_EMPLOYER',
    rule: 'CPT is authorized for the employer the I-20 names. Work for any other employer is not authorized.',
    source: '8 CFR 214.2(f)(10)(i); M-274 section 6.3 (the CPT endorsement names the employer and the dates)',
    confirmed: true,
    stops: 'BLOCK',
  },
  CPT_OUTSIDE_DATES: {
    key: 'CPT_OUTSIDE_DATES',
    rule: 'CPT is authorized between the dates the school wrote on the I-20. A start outside them is not authorized.',
    source: '8 CFR 214.2(f)(10)(i); M-274 section 6.3',
    confirmed: true,
    stops: 'BLOCK',
  },
  PERMIT_NONE: {
    key: 'PERMIT_NONE',
    rule: 'A worker on OPT or an EAD shows the card for the I-9. Where no card is on the record, the I-9 gate decides.',
    source: '8 CFR 274a.12(c) (categories that must apply for a card); 8 CFR 274a.12(c)(3)(i)(B)–(C) (OPT); 8 CFR 274a.2(b)(1)(v)(A)(4) (the Form I-766 is a List A document)',
    confirmed: true,
    stops: 'NOTE',
  },
  PERMIT_LAPSED: {
    key: 'PERMIT_LAPSED',
    rule: 'An employment authorization card is good only to the end date printed on it. With every card on the record past its end, the start is refused until a current card is shown.',
    source: '8 CFR 274a.12(c) and 274a.14(a)(1) (authorization ends on the card’s expiration date); 8 CFR 274a.2(b)(1)(vii) (reverification on or before the day it runs out); 8 CFR 214.2(f)(11) (OPT work only within the card’s validity)',
    confirmed: true,
    stops: 'BLOCK',
  },
  PERMIT_NOT_BEGUN: {
    key: 'PERMIT_NOT_BEGUN',
    rule: 'Work on an employment authorization card may not begin before the start date printed on it.',
    source: '8 CFR 214.2(f)(11)(i) (OPT may not begin before the EAD’s start date); 8 CFR 274a.12(c)',
    confirmed: true,
    stops: 'BLOCK',
  },
  PERMIT_RENEWAL_PENDING: {
    key: 'PERMIT_RENEWAL_PENDING',
    rule: 'A card that ran out may be extended automatically while a renewal filed on time is pending, but only for some categories, and the receipt notice is what shows it.',
    source: '8 CFR 274a.13(d) (automatic extension of some categories); 8 CFR 214.2(f)(11)(i)(C) (180 days for a STEM OPT extension filed on time). Which categories qualify changes by rule; not read category by category here',
    confirmed: false,
    stops: 'WARN',
  },
  OPT_UNEMPLOYMENT: {
    key: 'OPT_UNEMPLOYMENT',
    rule: 'A student on post-completion OPT may be unemployed for at most 90 days in all, 150 with the STEM extension. It is the student’s status, reported by the school; a card that is in date is still a valid document.',
    source: '8 CFR 214.2(f)(10)(ii)(E) (90 days, and 60 more during a STEM extension)',
    confirmed: true,
    stops: 'WARN',
  },
  STEM_OPT_PLAN: {
    key: 'STEM_OPT_PLAN',
    rule: 'A STEM OPT extension needs an employer enrolled in E-Verify and a training plan (Form I-983) signed by the employer. Neither is held on the record yet.',
    source: '8 CFR 214.2(f)(10)(ii)(C)(2) and (C)(5)',
    confirmed: true,
    stops: 'WARN',
  },
  H1B_PETITIONER_UNKNOWN: {
    key: 'H1B_PETITIONER_UNKNOWN',
    rule: 'An H-1B is tied to the employer that petitioned. Where the record does not say which firm petitioned, it is said and does not move the start.',
    source: '8 CFR 214.2(h)(2)(i)(D) (a change of employer needs a new petition)',
    confirmed: true,
    stops: 'NOTE',
  },
  H1B_OTHER_PETITIONER: {
    key: 'H1B_OTHER_PETITIONER',
    rule: 'An H-1B is tied to the employer that petitioned. A different employer may start the person once its own petition is filed (portability); until a filing receipt is recorded, it warns.',
    source: '8 CFR 214.2(h)(2)(i)(D) (a change of employer needs a new petition); INA 214(n), 8 U.S.C. 1184(n), and 8 CFR 214.2(h)(2)(i)(H) (portability: work may begin once the new petition is filed). Warns rather than blocks by the founder’s instruction of 2026-11-08, because the petitioner on the record is typed, not read off the I-797',
    confirmed: true,
    stops: 'WARN',
  },
  TN_LAPSED: {
    key: 'TN_LAPSED',
    rule: 'TN status authorizes work until the admit-until date on the I-94. Past it, the start is refused until a new admission or an extension is shown.',
    source: '8 CFR 214.6 (TN admission and its period); 8 CFR 274a.12(b) (authorization incident to status ends with the period of admission); 8 CFR 274a.2(b)(1)(vii) (reverification)',
    confirmed: true,
    stops: 'BLOCK',
  },
  TN_OTHER_EMPLOYER: {
    key: 'TN_OTHER_EMPLOYER',
    rule: 'TN status is for the employer named at admission. Work for another employer needs a new TN.',
    source: '8 CFR 274a.12(b) (employment incident to status with a specific employer); 8 CFR 214.6. The paragraph naming the change of employer was not confirmed here, so it warns',
    confirmed: false,
    stops: 'WARN',
  },
}

/** How a rule acts today: an unconfirmed rule warns, whatever it would do once confirmed. */
export function enforcedAs(rule: ClassRule): 'BLOCK' | 'WARN' | 'NOTE' {
  if (!rule.confirmed && rule.stops === 'BLOCK') return 'WARN'
  return rule.stops
}

// ── The facts a start is read against ─────────────────────────────────

export interface PermitFact {
  validFrom?: Date | null
  expiresAt: Date | null
  /** The category printed on the card (C03B, C03C, C09 …), where recorded. */
  category?: string | null
  stem?: boolean
  /** The day a renewal was filed, where a receipt is on the record. */
  renewalFiledOn?: Date | null
}

export interface CptFact {
  /** The employer the I-20's CPT page names, as the school wrote it. */
  employerNamed: string | null
  from: Date | null
  to: Date | null
}

export interface PetitionFact {
  /** The firm that filed it, as recorded; null where nobody recorded it. */
  petitionerName: string | null
  status: string
  filedAt: Date | null
  expiresAt?: Date | null
}

export interface I94Fact {
  admitUntil: Date | null
  classOfAdmission?: string | null
  employerNamed?: string | null
}

export interface WorkerClassFacts {
  personName: string
  cls: WorkerClass | null
  /** Where the work is done; null reads as the US, the clearance's own default. */
  workCountry: { country: string; offshore: boolean } | null
  on: Date
  /** The firm that pays the person (the payroll line's firm), where known. */
  employerName: string | null
  permits?: PermitFact[]
  cpt?: CptFact[]
  petitions?: PetitionFact[]
  i94?: I94Fact[]
  /** Days unemployed on OPT so far, where anybody recorded them. */
  unemployedDays?: number | null
}

export interface WorkerClassDecision {
  cls: WorkerClass | null
  /** PASS moves nothing; NOTE is said and moves nothing; WARN warns; BLOCK refuses the start. */
  verdict: 'PASS' | 'NOTE' | 'WARN' | 'BLOCK'
  rule: RuleKey | null
  says: string
  source: string | null
  /** Every rule that spoke, the strongest first. */
  findings: { rule: RuleKey; verdict: 'NOTE' | 'WARN' | 'BLOCK'; says: string }[]
}

// ── The names on two papers, compared ─────────────────────────────────

const SUFFIXES = new Set(['inc', 'incorporated', 'llc', 'llp', 'lp', 'ltd', 'limited', 'corp', 'corporation', 'co', 'company', 'plc', 'pvt', 'private', 'the', 'pllc', 'pc'])

/** A firm's name with its legal suffix and punctuation gone. Pure. */
export function firmKey(name: string | null | undefined): string {
  return (name ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w && !SUFFIXES.has(w))
    .join(' ')
}

/** Whether two names are one firm: equal once the suffixes are gone. Never a guess on a part of a name. */
export function sameFirm(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = firmKey(a)
  return x.length > 0 && x === firmKey(b)
}

/**
 * The employer a paper names, written into the petition's FILED event
 * by one helper so the writer and the reader cannot drift. Interim: the
 * firm belongs in a column (`VisaPetition.petitionerCompanyId`, asked of
 * the architect), and until it exists the name is kept in these words.
 */
export function employerNamedNote(name: string, rest?: string | null): string {
  return [`Employer named: ${name.trim()}.`, rest?.trim()].filter(Boolean).join(' ')
}

/** The employer a FILED event names, or null. */
export function employerNamedIn(notes: string | null | undefined): string | null {
  const m = /Employer named: (.+?)\.(?:\s|$)/.exec(notes ?? '')
  return m ? m[1].trim() : null
}

// ── The rule ──────────────────────────────────────────────────────────

const DAY = 86_400_000
const dayOf = (d: Date) => d.toISOString().slice(0, 10)
function longDate(d: Date): string {
  return formatDayLong(d)
}

/** An interview is never refused over status. The screening questions are asked in words, and the start is where the law applies. */
export function mayInterview(cls: WorkerClass | null): { may: true; says: string } {
  void cls
  return { may: true, says: 'Status is never a reason to refuse an interview. It is read at the start of US work.' }
}

/**
 * What the start of this person's work needs, by class, today.
 *
 * Offshore work, and work in any country but the US, asks none of this.
 * A person whose class is unknown is read by the I-9 alone.
 */
export function workerClassStart(f: WorkerClassFacts): WorkerClassDecision {
  const pass = (says: string, rule: RuleKey | null = null): WorkerClassDecision => ({
    cls: f.cls, verdict: 'PASS', rule, says, source: rule ? WORKER_CLASS_RULES[rule].source : null, findings: [],
  })
  const country = (f.workCountry?.country ?? 'US').toUpperCase()
  if (country !== 'US') return pass(`The work is done in ${country}, so no US status is asked.`)
  if (!f.cls) return pass('')

  const findings: WorkerClassDecision['findings'] = []
  const say = (rule: RuleKey, says: string) => findings.push({ rule, verdict: enforcedAs(WORKER_CLASS_RULES[rule]), says })
  const who = f.personName
  const employer = f.employerName ?? 'the employer'
  const on = f.on.getTime()

  switch (f.cls) {
    case 'CITIZEN':
    case 'GREEN_CARD':
    case 'STUDENT_DOMESTIC':
      return pass('', 'I9_ONLY')

    case 'F1_NO_PERMIT':
      say('F1_NO_PERMIT', `${who} is an international student with no CPT or OPT, so may not start US work. Interviewing was fine; the start needs CPT from the school or an OPT card.`)
      break

    case 'F1_CPT': {
      const cpts = f.cpt ?? []
      if (cpts.length === 0) {
        say('CPT_NONE', `${who} is on CPT, and no I-20 with a CPT page is on the record. Record the page the school endorsed, naming ${employer}, before the start.`)
        break
      }
      const forUs = cpts.filter((c) => sameFirm(c.employerNamed, f.employerName))
      if (forUs.length === 0) {
        const named = cpts.map((c) => c.employerNamed).filter(Boolean)
        say('CPT_OTHER_EMPLOYER', `${who}’s CPT names ${named.length ? named.join(' and ') : 'no employer'}, not ${employer}, so it does not cover this work. The school must endorse CPT for ${employer} first.`)
        break
      }
      const inDates = forUs.some((c) => (!c.from || c.from.getTime() <= on) && (!c.to || c.to.getTime() >= on))
      if (!inDates) {
        const c = forUs[0]
        say('CPT_OUTSIDE_DATES', `${who}’s CPT for ${employer} runs ${c.from ? longDate(c.from) : 'from an unrecorded day'} to ${c.to ? longDate(c.to) : 'an unrecorded day'}, and today is outside it. The school must endorse new dates first.`)
      }
      break
    }

    case 'OPT':
    case 'EAD': {
      const cards = f.permits ?? []
      const word = f.cls === 'OPT' ? 'OPT card' : 'work permit (EAD)'
      if (cards.length === 0) {
        say('PERMIT_NONE', `No ${word} for ${who} is on the record; the I-9 decides, from the card shown for it.`)
        break
      }
      const current = cards.filter((c) => (!c.validFrom || c.validFrom.getTime() <= on) && (!c.expiresAt || c.expiresAt.getTime() >= on))
      if (current.length === 0) {
        const notBegun = cards.find((c) => c.validFrom && c.validFrom.getTime() > on)
        if (notBegun?.validFrom) {
          say('PERMIT_NOT_BEGUN', `${who}’s ${word} starts on ${longDate(notBegun.validFrom)}, so the work cannot start before then.`)
          break
        }
        const last = [...cards].sort((a, b) => (b.expiresAt?.getTime() ?? 0) - (a.expiresAt?.getTime() ?? 0))[0]
        const pending = cards.find((c) => c.renewalFiledOn)
        if (pending?.renewalFiledOn) {
          say('PERMIT_RENEWAL_PENDING', `${who}’s ${word} ran out${last.expiresAt ? ` on ${longDate(last.expiresAt)}` : ''}; a renewal was filed ${longDate(pending.renewalFiledOn)}. Check the receipt notice shows an automatic extension for this category before the start.`)
          break
        }
        say('PERMIT_LAPSED', `${who}’s ${word} ran out${last.expiresAt ? ` on ${longDate(last.expiresAt)}` : ''}, so the work cannot start. Record a current card first.`)
        break
      }
      if (f.cls === 'OPT') {
        const stem = current.some((c) => c.stem || /C03C/i.test(c.category ?? ''))
        const limit = stem ? 150 : 90
        if (typeof f.unemployedDays === 'number' && f.unemployedDays > limit) {
          say('OPT_UNEMPLOYMENT', `${who} has been unemployed on OPT for ${f.unemployedDays} days, past the ${limit}-day limit. The card is in date; ask ${who} to confirm with the school that the status still stands.`)
        }
        if (stem) say('STEM_OPT_PLAN', `${who} is on the STEM extension: ${employer} must be enrolled in E-Verify and sign the training plan (Form I-983). Neither is on the record.`)
      }
      break
    }

    case 'H1B': {
      const petitions = (f.petitions ?? []).filter((p) => !['DENIED', 'EXPIRED'].includes(p.status.toUpperCase()))
      const named = petitions.filter((p) => p.petitionerName)
      if (named.length === 0) {
        say('H1B_PETITIONER_UNKNOWN', `The record does not say which firm petitioned for ${who}’s H-1B. Check the I-797 names ${employer}.`)
        break
      }
      if (!f.employerName || named.some((p) => sameFirm(p.petitionerName, f.employerName))) break
      const by = [...new Set(named.map((p) => p.petitionerName!))]
      say('H1B_OTHER_PETITIONER', `${who}’s H-1B was filed by ${by.join(' and ')}, not ${employer}. ${employer} may start ${who} once its own petition is filed: record the filing receipt.`)
      break
    }

    case 'TN': {
      const tn = (f.i94 ?? []).filter((i) => !i.classOfAdmission || /^TN$/i.test(i.classOfAdmission))
      if (tn.length === 0) break
      const current = tn.filter((i) => !i.admitUntil || i.admitUntil.getTime() >= on)
      if (current.length === 0) {
        const last = [...tn].sort((a, b) => (b.admitUntil?.getTime() ?? 0) - (a.admitUntil?.getTime() ?? 0))[0]
        say('TN_LAPSED', `${who}’s TN admission ran out on ${longDate(last.admitUntil!)}, so the work cannot start. Record a new I-94 or the extension first.`)
        break
      }
      if (f.employerName && current.every((i) => i.employerNamed && !sameFirm(i.employerNamed, f.employerName))) {
        say('TN_OTHER_EMPLOYER', `${who}’s TN was granted for ${current[0].employerNamed}, not ${employer}. A new TN for ${employer} is needed; check it before the start.`)
      }
      break
    }
  }

  if (findings.length === 0) return pass('')
  const rank = { BLOCK: 3, WARN: 2, NOTE: 1 } as const
  findings.sort((a, b) => rank[b.verdict] - rank[a.verdict])
  const top = findings[0]
  return {
    cls: f.cls,
    verdict: top.verdict,
    rule: top.rule,
    says: findings.map((x) => x.says).join(' '),
    source: WORKER_CLASS_RULES[top.rule].source,
    findings,
  }
}

/** The words a refusal carries that tell the station it is a class rule, not the I-9. Pure. */
export const CLASS_REFUSAL_PHRASE = /may not start US work|CPT|ran out.*so the work cannot start|cannot start before then|TN admission ran out/

/** The dates a card covers, as a sentence. Pure; for a station's log. */
export function cardSays(c: PermitFact): string {
  return `${c.category ?? 'card'} ${c.validFrom ? dayOf(c.validFrom) : '?'} to ${c.expiresAt ? dayOf(c.expiresAt) : '?'}`
}

/** Days between two days, whole. Pure. */
export function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / DAY)
}
