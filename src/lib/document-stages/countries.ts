/**
 * Papers and pay per country, as data.
 *
 * The founder's "go ahead and build this" on the region drawing,
 * 2026-10-27, item 4: the rules the drawing shows per country are
 * research, each is confirmed with its source before it is shown, and an
 * unconfirmed one is not shown. So every row here says three things, and
 * each of the three carries its own source, the day it was read, and
 * whether it was confirmed:
 *
 *   **papers** — what a contingent worker's placement there needs before
 *   day one, as additions to the shipped sets (`lib/document-requirements`
 *   holds the US set; nothing here replaces it).
 *
 *   **pay** — the pay rhythm the setup offers there as a default. A
 *   default, never a rule: the company changes it on its settings page
 *   (`lib/payroll-settings`). What was confirmed is what the law allows;
 *   that the default is also the common practice is the drawing's claim
 *   and is not sourced, which KNOWN-LIMITS.md says.
 *
 *   **rule** — the one rule a client there is held to, said in plain
 *   words, with BLOCK or WARN per Addendum E: BLOCK where the law grounds
 *   it, WARN everywhere else.
 *
 * **Confirmed means read today.** A row is `confirmed: true` only where
 * the operative text (or a ministry's own statement of it) was read on
 * `checkedOn` and says what `says` says. Known-from-memory is not
 * confirmed. Where a source could not be reached, or the law has moved
 * under the drawing, the row is `confirmed: false` and says why. A screen
 * reads `shownAt` and nothing else, so an unconfirmed line cannot reach a
 * reader by accident.
 *
 * **A limit on time at a client** is exposed as `timeAtClient`, in the
 * units the law uses, so the time-limit rule (`lib/twin/rules/tenure`)
 * can read a per-country default later through `timeLimitAt`. It is not
 * wired this wave: the limit a client is held to today is still its own
 * TENURE_CAP and BREAK_IN_SERVICE rules.
 *
 * Attest, never declare. Nothing here says a person or a supplier is
 * cleared; it says what is asked and what the law says, with the law's
 * name beside it.
 */

import type { PayPeriod } from '@/lib/pay-dates'

/** ISO 3166 codes; Northern Ireland is the UK subdivision code. */
export type CountryCode = 'US' | 'MX' | 'BR' | 'CO' | 'VN' | 'IN' | 'BE' | 'GB-NIR'

export interface Sourced {
  /** The statute or regulation, named, and where it was read. */
  source: string
  /** The day the source was read, ISO. */
  checkedOn: string
  /** Read on that day and says what this line says. */
  confirmed: boolean
  /** Why not, in a sentence. Null when confirmed. */
  unconfirmedBecause: string | null
}

/** Who owes a paper, in `lib/document-requirements`' own party words. */
export type OwedBy = 'WORKER' | 'SUPPLIER' | 'CUSTOMER' | 'US'

export interface CountryPaper extends Sourced {
  /** Stable key, unique within the country. */
  key: string
  /** The paper's name, in the trade's words. */
  label: string
  owedBy: OwedBy
  /** The shipped document type this is, where one exists (`lib/document-type`). Null: a type a company adds. */
  builtInKey: string | null
  /** Whether it expires, so the watch can sweep it. */
  expires: boolean
  /** One plain line on why it is asked. */
  says: string
}

export interface CountryPay extends Sourced {
  /** The default the setup offers, one of the four `lib/pay-dates` already knows. */
  period: PayPeriod
  /** The default in words. */
  says: string
  /** What the law allows, which is the part that was confirmed. */
  lawSays: string
}

/** A limit on time at one client, in the law's own units. */
export interface TimeAtClient {
  /** The limit in days, where the law counts days. */
  limitDays: number | null
  /** The limit in months, where the law counts months. */
  limitMonths: number | null
  /** More time the law allows, and what it needs. Null where there is none. */
  extension: { days: number | null; months: number | null; needs: string } | null
  /** Days away before the same client may take the person again. Null where the law sets none. */
  breakDays: number | null
  /** How the days are counted and what the limit applies to, in a line. */
  counts: string
}

export interface CountryRule extends Sourced {
  says: string
  /** Addendum E: BLOCK where legally grounded, WARN and capture a reason everywhere else. */
  enforcement: 'BLOCK' | 'WARN'
  /** Set where the rule is a limit on time at a client. */
  timeAtClient: TimeAtClient | null
  /** Set where the rule changes something after a number of weeks, without ending anything. */
  afterWeeks: number | null
}

export interface CountryRow {
  country: CountryCode
  name: string
  papers: CountryPaper[]
  pay: CountryPay
  rule: CountryRule
}

const CHECKED = '2026-10-27'

const ok = { checkedOn: CHECKED, confirmed: true, unconfirmedBecause: null } as const
const notYet = (because: string) => ({ checkedOn: CHECKED, confirmed: false, unconfirmedBecause: because })

export const COUNTRY_ROWS: readonly CountryRow[] = [
  {
    country: 'US',
    name: 'United States',
    papers: [
      {
        key: 'I9', label: 'I-9 with the document it was completed from', owedBy: 'WORKER', builtInKey: 'I9_EVERIFY', expires: false,
        says: 'Section 1 at the time of hire; the employer examines the documents within three business days. Etyme refuses the start until it is on file, which is stricter than the law.',
        source: '8 U.S.C. §1324a; 8 CFR §274a.2(b)(1)(i)(A) and (ii), read on eCFR', ...ok,
      },
      {
        key: 'BACKGROUND_CHECK', label: 'Background check result', owedBy: 'SUPPLIER', builtInKey: 'BACKGROUND_CHECK', expires: true,
        says: 'In the shipped set because clients ask for it. No federal law requires it; the provider renders the verdict.',
        source: 'The shipped corp-to-corp and sub-vendor sets in lib/document-requirements, read in the code', ...ok,
      },
      {
        key: 'INSURANCE_GL', label: 'Supplier insurance certificate', owedBy: 'SUPPLIER', builtInKey: 'INSURANCE_GL', expires: true,
        says: 'In the shipped set; a lapse stops the work. Which cover is required is the client’s rule, not a statute.',
        source: 'The shipped sub-vendor set in lib/document-requirements, read in the code', ...ok,
      },
    ],
    pay: {
      period: 'BIWEEKLY', says: 'Every other week, paid on the Friday after the period’s Saturday',
      lawSays: 'No federal rule sets how often; some states require pay at least twice a month, which every other week meets in nearly every state.',
      source: 'The setup’s existing default (lib/payroll-settings, founder 2026-10-07); state rules are not a row here', ...ok,
    },
    rule: {
      says: 'Nobody starts without an I-9. The 18-month time limit is the client’s own rule, not the law’s.',
      enforcement: 'BLOCK', timeAtClient: null, afterWeeks: null,
      source: '8 CFR §274a.2(b)(1), read on eCFR; no US statute limits time at a client', ...ok,
    },
  },
  {
    country: 'MX',
    name: 'Mexico',
    papers: [
      {
        key: 'REPSE', label: 'Supplier’s specialist-services registration (REPSE)', owedBy: 'SUPPLIER', builtInKey: null, expires: true,
        says: 'A supplier must be on the labor ministry’s public register; the registration is renewed every three years.',
        source: 'Ley Federal del Trabajo arts. 13 and 15 (reformed DOF 23-04-2021; text current to DOF 14-05-2026), read on diputados.gob.mx', ...ok,
      },
      {
        key: 'SERVICES_CONTRACT', label: 'Written services contract', owedBy: 'CUSTOMER', builtInKey: 'SOW', expires: false,
        says: 'It names the specialist services and about how many workers will do them.',
        source: 'Ley Federal del Trabajo art. 14, read on diputados.gob.mx', ...ok,
      },
      {
        key: 'IMSS_NUMBER', label: 'Worker’s social security number (IMSS)', owedBy: 'SUPPLIER', builtInKey: null, expires: false,
        says: 'The employer registers the worker with the social security institute.',
        ...notYet('The Ley del Seguro Social was not read today. The registration is believed due within five working days of the start, not before day one as the drawing says, so the timing is unconfirmed.'),
        source: 'Ley del Seguro Social art. 15 (not read)',
      },
    ],
    pay: {
      period: 'WEEKLY', says: 'Weekly; every 15 days for office work',
      lawSays: 'Pay periods may never be longer than a week for manual work and 15 days for other work.',
      source: 'Ley Federal del Trabajo art. 88, read on diputados.gob.mx', ...ok,
    },
    rule: {
      says: 'Only a supplier registered for specialist services may provide workers, and never for the client’s own core business.',
      enforcement: 'BLOCK', timeAtClient: null, afterWeeks: null,
      source: 'Ley Federal del Trabajo arts. 12, 13 and 15 (reformed DOF 23-04-2021), read on diputados.gob.mx', ...ok,
    },
  },
  {
    country: 'BR',
    name: 'Brazil',
    papers: [
      {
        key: 'TEMP_AGENCY_REGISTRATION', label: 'Supplier’s temporary-work registration with the labor ministry', owedBy: 'SUPPLIER', builtInKey: null, expires: false,
        says: 'A temporary-work firm may operate only after it is registered.',
        source: 'Lei 6.019/1974 art. 4 (as amended by Lei 13.429/2017), read on camara.leg.br; the labor ministry’s Trabalho Temporário page, read on gov.br', ...ok,
      },
      {
        key: 'TEMP_CONTRACT_WITH_REASON', label: 'Temporary-work contract with its reason', owedBy: 'SUPPLIER', builtInKey: null, expires: true,
        says: 'Written, kept at the client’s site, and naming the reason for the temporary work and its term.',
        source: 'Lei 6.019/1974 art. 9, read on camara.leg.br', ...ok,
      },
    ],
    pay: {
      period: 'MONTHLY', says: 'Monthly, paid by the 5th working day of the next month',
      lawSays: 'No pay period may be longer than a month; monthly pay is due by the 5th working day of the following month.',
      source: 'CLT (Decreto-Lei 5.452/1943) art. 459 and §1, read on camara.leg.br', ...ok,
    },
    rule: {
      says: 'A temporary worker may stay at one client 180 days, plus up to 90 more if the reason still holds, and may not return to that client for 90 days after.',
      enforcement: 'BLOCK', afterWeeks: null,
      timeAtClient: {
        limitDays: 180, limitMonths: null,
        extension: { days: 90, months: null, needs: 'proof that the reason for the temporary work still holds' },
        breakDays: 90,
        counts: 'Days consecutive or not. A new contract with the same client inside the 90-day break makes the worker the client’s employee.',
      },
      source: 'Lei 6.019/1974 art. 10 §§1, 2, 5 and 6 (added by Lei 13.429/2017), read on camara.leg.br', ...ok,
    },
  },
  {
    country: 'CO',
    name: 'Colombia',
    papers: [
      {
        key: 'EST_AUTHORIZATION', label: 'Supplier’s authorization as a temporary-services firm', owedBy: 'SUPPLIER', builtInKey: null, expires: false,
        says: 'The labor ministry authorizes a temporary-services firm before it operates.',
        source: 'Ley 50 de 1990 arts. 82 and 83, read on alcaldiabogota.gov.co', ...ok,
      },
      {
        key: 'WRITTEN_CONTRACT_WITH_POLICY', label: 'Written contract with the supplier, naming its wage-guarantee policy', owedBy: 'SUPPLIER', builtInKey: null, expires: true,
        says: 'In writing, naming the insurer, policy number, term and amount that guarantee the workers’ pay.',
        source: 'Ley 50 de 1990 art. 81, read on alcaldiabogota.gov.co', ...ok,
      },
      {
        key: 'SOCIAL_SECURITY_ENROLLMENT', label: 'Worker’s social security enrollment', owedBy: 'SUPPLIER', builtInKey: null, expires: false,
        says: 'The supplier, as employer, enrolls the worker in health, pension and work-risk cover.',
        ...notYet('Ley 100 de 1993 and the work-risk rules were not read today; the Colombian government sites refused the connection.'),
        source: 'Ley 100 de 1993 (not read)',
      },
    ],
    pay: {
      period: 'SEMIMONTHLY', says: 'Every 15 days',
      lawSays: 'Pay for day wages may not run longer than a week; for salaries, not longer than a month.',
      source: 'Código Sustantivo del Trabajo art. 134, read on secretariasenado.gov.co', ...ok,
    },
    rule: {
      says: 'A temporary worker covering a rise in work may stay 6 months, renewable once for up to 6 more. Covering somebody on leave lasts as long as the leave.',
      enforcement: 'BLOCK', afterWeeks: null,
      timeAtClient: {
        limitDays: null, limitMonths: 6,
        extension: { days: null, months: 6, needs: 'a renewal, once' },
        breakDays: null,
        counts: 'Applies to the third allowed case (a rise in production, transport, sales, harvest or services); a replacement for leave or illness runs with the absence.',
      },
      source: 'Ley 50 de 1990 art. 77 num. 3, read on alcaldiabogota.gov.co', ...ok,
    },
  },
  {
    country: 'VN',
    name: 'Vietnam',
    papers: [
      {
        key: 'LABOR_LEASE_LICENSE', label: 'Supplier’s labor-lease license', owedBy: 'SUPPLIER', builtInKey: null, expires: true,
        says: 'A labor-leasing firm pays a deposit and holds a license.',
        source: 'Labor Code No. 45/2019/QH14 art. 54 (in force 1 Jan 2021), read in LuatVietnam’s English translation of the Official Gazette', ...ok,
      },
      {
        key: 'LABOR_LEASE_CONTRACT', label: 'Written labor-lease contract with the client', owedBy: 'SUPPLIER', builtInKey: null, expires: true,
        says: 'In two copies, naming the workplace, the job, the term and the start.',
        source: 'Labor Code No. 45/2019/QH14 art. 55, read in LuatVietnam’s English translation of the Official Gazette', ...ok,
      },
    ],
    pay: {
      period: 'MONTHLY', says: 'Monthly',
      lawSays: 'A worker on a monthly wage is paid once a month or every half month, on a fixed cycle.',
      source: 'Labor Code No. 45/2019/QH14 art. 97(2), read in LuatVietnam’s English translation of the Official Gazette', ...ok,
    },
    rule: {
      says: 'A leased worker may be leased for 12 months at most, and only for a sudden rise in work, to replace somebody on leave, or for high skills.',
      enforcement: 'BLOCK', afterWeeks: null,
      timeAtClient: {
        limitDays: null, limitMonths: 12, extension: null, breakDays: null,
        counts: 'The maximum period of a labor lease for one employee. The translation does not say whether a new lease with the same client restarts it.',
      },
      source: 'Labor Code No. 45/2019/QH14 art. 53(1) and (2), read in LuatVietnam’s English translation of the Official Gazette (the official text is Vietnamese; its current effect status sits behind a subscription)', ...ok,
    },
  },
  {
    country: 'IN',
    name: 'India',
    papers: [
      {
        key: 'CONTRACTOR_LICENSE', label: 'Supplier’s contractor license', owedBy: 'SUPPLIER', builtInKey: null, expires: true,
        says: 'A supplier of contract workers holds a contractor’s license.',
        ...notYet('The drawing’s per-plant license is the Contract Labour Act 1970’s, which the OSH Code 2020 replaced on 21 Nov 2025. The Code gives a five-year or a work-specific license, per PRS; its own sections, the worker threshold and the state rules under it were not read (India Code timed out).'),
        source: 'Occupational Safety, Health and Working Conditions Code, 2020 (not read); PRS summary and the government release of 21 Nov 2025, read',
      },
      {
        key: 'PF_ESI_NUMBERS', label: 'Worker’s PF (UAN) and ESI numbers', owedBy: 'SUPPLIER', builtInKey: null, expires: false,
        says: 'The supplier, as employer, enrolls the worker for provident fund and state insurance.',
        ...notYet('The Code on Social Security, 2020 was not read; when enrollment falls due relative to the first day is unconfirmed.'),
        source: 'Code on Social Security, 2020 (not read)',
      },
    ],
    pay: {
      period: 'MONTHLY', says: 'Monthly, paid by the 7th of the next month',
      lawSays: 'Monthly wages are paid by the 7th of the following month.',
      ...notYet('The Code on Wages, 2019 s.17 was not reachable (India Code timed out). The government’s release of 21 Nov 2025 says salary by the 7th under its IT and ITES heading only; the research in CLAUDE.md of 2026-09-26 (7th, 10th at 1,000 or more) was not re-read.'),
      source: 'Code on Wages, 2019 s.17 (not read); government release of 21 Nov 2025, read on pib.gov.in',
    },
    rule: {
      says: 'Each supplier of contract workers needs a contractor’s license before its people start.',
      enforcement: 'BLOCK', timeAtClient: null, afterWeeks: null,
      ...notYet('The drawing says a license for the plant. That was the Contract Labour Act 1970, replaced on 21 Nov 2025 by the OSH Code 2020, which gives a five-year or work-specific license and, per the government, a PAN-India single license. The Code’s own text and the state rules were not read.'),
      source: 'OSH Code 2020 (not read); government release on the four labor codes, 21 Nov 2025, read on pib.gov.in; PRS summary, read on prsindia.org',
    },
  },
  {
    country: 'BE',
    name: 'Belgium',
    papers: [
      {
        key: 'DIMONA', label: 'Employment declaration (Dimona IN)', owedBy: 'SUPPLIER', builtInKey: null, expires: false,
        says: 'The employer declares the employment at the latest when the worker actually starts.',
        source: 'ONSS administrative instructions 2026/3, Dimona declarations, read on socialsecurity.be', ...ok,
      },
      {
        key: 'TEMP_WORK_REASON', label: 'Reason for temporary work', owedBy: 'CUSTOMER', builtInKey: null, expires: false,
        says: 'The client names which of the allowed reasons it uses; the maximum length and the steps depend on the reason.',
        source: 'Loi du 24 juillet 1987 sur le travail temporaire et le travail intérimaire; CCT n° 108 du 16 juillet 2013; read in the federal employment ministry’s page on temporary agency work', ...ok,
      },
    ],
    pay: {
      period: 'WEEKLY', says: 'Weekly',
      lawSays: 'Pay at regular intervals, at least twice a month and no more than 16 days apart, so weekly is allowed; salaried employees at least monthly.',
      source: 'Loi du 12 avril 1965 concernant la protection de la rémunération, read in the federal employment ministry’s page “Époque et date de paiement”', ...ok,
    },
    rule: {
      says: 'A temporary worker needs an allowed reason: a replacement, a temporary rise in work, exceptional work, a trial for a permanent hire, artistic work, or an approved back-to-work route.',
      enforcement: 'BLOCK', timeAtClient: null, afterWeeks: null,
      source: 'Loi du 24 juillet 1987 sur le travail temporaire et le travail intérimaire, read in the federal employment ministry’s page on temporary agency work (six reasons)', ...ok,
    },
  },
  {
    country: 'GB-NIR',
    name: 'Northern Ireland',
    papers: [
      {
        key: 'RIGHT_TO_WORK', label: 'Right-to-work check', owedBy: 'SUPPLIER', builtInKey: 'RIGHT_TO_WORK', expires: true,
        says: 'The employer checks the original documents the way the Order sets out and keeps copies two years after the work ends; that is its defense against the penalty.',
        source: 'Immigration, Asylum and Nationality Act 2006 s.15 (extent UK); Immigration (Restrictions on Employment) Order 2007 arts. 3 and 6, read on legislation.gov.uk', ...ok,
      },
      {
        key: 'WEEK_12_DATE', label: 'Week-12 equal pay date', owedBy: 'US', builtInKey: null, expires: false,
        says: 'The date the worker completes 12 continuous weeks in the same role with the same client.',
        source: 'Agency Workers Regulations (Northern Ireland) 2011 (S.R. 2011/350) reg. 7, read on legislation.gov.uk', ...ok,
      },
    ],
    pay: {
      period: 'WEEKLY', says: 'Weekly',
      lawSays: 'No law sets how often; the minimum-wage pay reference period is a month, or the shorter period the worker is paid by.',
      source: 'National Minimum Wage Regulations 2015 reg. 6 (extent UK), read on legislation.gov.uk', ...ok,
    },
    rule: {
      says: 'After 12 weeks in the same job with the same client, an agency worker gets the same basic pay and conditions as somebody the client hired directly.',
      enforcement: 'WARN', timeAtClient: null, afterWeeks: 12,
      source: 'Agency Workers Regulations (Northern Ireland) 2011 (S.R. 2011/350) regs. 5 and 7, in force 5 Dec 2011, read on legislation.gov.uk', ...ok,
    },
  },
]

/** The row for a country, or null where the table has none. */
export function countryRow(country: string | null | undefined): CountryRow | null {
  const c = (country ?? '').trim().toUpperCase()
  const code = c === 'NIR' || c === 'GB-NIR' || c === 'NI' ? 'GB-NIR' : c
  return COUNTRY_ROWS.find((r) => r.country === code) ?? null
}

/** What a screen may show for one country: confirmed lines only. Pay and rule are null where unconfirmed. */
export interface ShownRow {
  country: CountryCode
  name: string
  papers: CountryPaper[]
  pay: CountryPay | null
  rule: CountryRule | null
}

/**
 * The one read a screen makes. Every unconfirmed paper, pay rhythm and
 * rule is left out, and a country with nothing confirmed is left out
 * whole, so a screen cannot show a line nobody has stood behind.
 */
export function shownAt(countries?: readonly string[]): ShownRow[] {
  const rows = countries ? countries.map(countryRow).filter((r): r is CountryRow => r !== null) : COUNTRY_ROWS
  return rows
    .map((r) => ({
      country: r.country,
      name: r.name,
      papers: r.papers.filter((p) => p.confirmed),
      pay: r.pay.confirmed ? r.pay : null,
      rule: r.rule.confirmed ? r.rule : null,
    }))
    .filter((r) => r.papers.length > 0 || r.pay !== null || r.rule !== null)
}

/** Every unconfirmed line, keyed `<country>.rule`, `<country>.pay` or `<country>.paper.<key>`, for KNOWN-LIMITS.md. */
export function unconfirmed(): { id: string; because: string }[] {
  const out: { id: string; because: string }[] = []
  for (const r of COUNTRY_ROWS) {
    if (!r.rule.confirmed) out.push({ id: `${r.country}.rule`, because: r.rule.unconfirmedBecause ?? '' })
    if (!r.pay.confirmed) out.push({ id: `${r.country}.pay`, because: r.pay.unconfirmedBecause ?? '' })
    for (const p of r.papers) if (!p.confirmed) out.push({ id: `${r.country}.paper.${p.key}`, because: p.unconfirmedBecause ?? '' })
  }
  return out
}

/**
 * The law's limit on time at one client for a country, for the
 * time-limit rule to read later. Null where the law sets none or the rule
 * is unconfirmed: never a guessed limit. Not wired this wave.
 */
export function timeLimitAt(country: string | null | undefined): (TimeAtClient & { source: string }) | null {
  const r = countryRow(country)
  if (!r || !r.rule.confirmed || !r.rule.timeAtClient) return null
  return { ...r.rule.timeAtClient, source: r.rule.source }
}
