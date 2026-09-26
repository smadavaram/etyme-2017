/**
 * Template packs — BUILD.md §4.A.
 *
 * POST /api/companies/:id/template-pack { pack }
 *   → contract types, Cycle definitions, DocTemplates, skill graph seeds
 *
 * Four packs cover the onboarding variations:
 *   US_IT    — US IT staffing vendor (W2, C2C, 1099)
 *   US_SAP   — US SAP/ERP staffing (W2, C2C, corp-to-corp sub-vendors)
 *   IN_DELIVERY — Indian delivery center (CDD, fixed-term)
 *   UK       — UK staffing (limited company, umbrella, IR35)
 */

import type { CycleDefinition as GeneratedDefinition } from '@/lib/cycle-generator'

// ── Contract types ─────────────────────────────────────────────

export interface ContractTypeDef {
  code: string
  label: string
  description: string
}

// ── Cycle definitions ──────────────────────────────────────────
//
// Money only. The 2017 engine had nineteen kinds because it filed
// reminders (a visa expiring, a GST return owed) in the same table as
// payments. Reminders live with the watch cron now; an IR35
// determination is a document in docTemplates below. What is left is
// the six kinds something actually reads — see lib/cycle-kinds.
// Five frequencies: WEEKLY, BIWEEKLY, SEMIMONTHLY, MONTHLY, ON_COMPLETION.
// Business-day shifting applied against the company's holiday calendar.

/**
 * The generator's definition plus a label for the screen. One type, not
 * two: this used to be a second, structurally similar interface, and the
 * callers "converted" between them by dropping the day fields — which is
 * how every pack's Monday became the generator's Friday.
 */
export interface CycleDefinition extends GeneratedDefinition {
  label: string
}

// ── Doc templates ──────────────────────────────────────────────

export interface DocTemplateDef {
  name: string
  audience: 'CANDIDATE' | 'VENDOR' | 'CLIENT' | 'EMPLOYEE' | 'GENERAL'
  needsSignature: boolean
}

// ── Skill seeds ────────────────────────────────────────────────

export interface SkillSeed {
  category: string
  skills: string[]
}

// ── Pack shape ─────────────────────────────────────────────────

export interface TemplatePack {
  id: string
  label: string
  country: string
  contractTypes: ContractTypeDef[]
  cycleDefinitions: CycleDefinition[]
  docTemplates: DocTemplateDef[]
  skillSeeds: SkillSeed[]
}

// ── Pack definitions ───────────────────────────────────────────

// ── Two dates the packs asked for and nobody meant ────────────────────
//
// Both found on the release agent's third walk and measured by
// `etyme-money` against the calendar and the seeded world, with the
// arithmetic written out beside the code that produces it in
// `lib/cycle-generator`. Changed here on 2026-09-22.
//
// **An approval is not a rhythm of its own.** It is "three days after
// the hours are due". Asking for a second weekly series on a Monday
// anchored it separately at the contract start, so a contract starting
// Saturday, Sunday or Monday — and Monday is the commonest start in
// staffing, six of the thirty-two seeded placements — got an approval
// date four days BEFORE its first submission. Not cosmetic: `pickCycle`
// matches the first approval to the week ending that Friday, so the
// spurious head is never claimed and the placement timeline calls it
// overdue for the life of the contract. `offsetDays` off the submission
// day says the same thing and cannot drift: every approval from the
// second onward lands on the identical day, the head disappears, and
// the last week of a contract gains the approval date a Monday-anchored
// series stopped short of.
//
// **A semimonthly cut on the 1st is a typo for the 15th.** A cycle date
// is a period END, and `lib/periods`' `semiMonth` defines a semimonthly
// contract's periods as the 1st to the 15th and the 16th to the last.
// Month-end matches; the 1st matches no period end at all — it asks for
// an invoice on the first day of the period it would bill, fourteen days
// before those hours exist, and the 1st-to-15th period is never closed.
// On the calendar: 20 dates a year with gaps of 1, 3 and 32 days, where
// 15 gives 24 with gaps of 14 to 18. It is also
// `DEFAULT_SEMIMONTHLY_CUT` in the generator and CLAUDE.md's stated
// default, "Friday weeks, the 15th and month-end".
//
// ── And two monthly ones, four days later ─────────────────────────────
//
// Changed 2026-09-26, the same defect one frequency up: the two packs
// that bill monthly — IN_DELIVERY and UK — asked for a date on the 1st,
// and the 1st is the first day of the month it would close rather than
// the end of it. Measured against `lib/periods`' `calendarMonth`, which
// is what a MONTHLY contract actually bills, not asserted.
//
// **Monthly invoicing on the 1st is a coherent intent said the wrong
// way.** "Bill on the 1st for last month" is what a pack author meant,
// and `dayOfMonth: 1` says "close the period containing the 1st" — so
// every date fell inside the month it would bill, thirty days early. On
// a twelve-month contract through 2026: twelve dates, **none** of them
// at or after the end of the month it was paired with, the first one
// (1 January) billing nothing at all, and December never closed by a
// cycle. The repair keeps the intent rather than moving the dates:
// month-end is the period end, `offsetDays: 1` is the 1st of the month
// after. Every date is identical from the second onward — 2 February, 2
// March, 1 April … — the spurious head disappears and the tail appears,
// which is the same shape as the weekly `offsetDays: 3` fix above whose
// last date also lands past the contract's final day.
//
// **The vendor side was worse, because a PAY kind shifts backward.**
// `VENDOR_BILL_GENERATE` is PAY in `lib/cycle-kinds`, so `cycle-shift`
// moves it to the working day *before* a weekend. The UK pack's shipped
// series over two years put **six of twenty-four** dates in the month
// before the work: 30 January 2026 for a February that had not begun,
// then 27 February, 31 July, 30 October, 30 April 2027, 30 July 2027.
// Month-end plus one cures it — 0 of 24 — because the period it closes
// is now the month behind the date rather than the month in front of it.
// The backward shift still applies, so a January bill can read 30
// January when 1 February is a Sunday: one day inside the month of the
// work rather than a month ahead of it, which is the company's own
// weekend policy doing what it was asked.
//
// **A monthly approval bit on exactly one start day in twenty-eight.**
// `dayOfMonth: 28` is month-end (`MEANS_MONTH_END`), so the relayed
// claim that IN_DELIVERY approved a month twenty-seven days before it
// was filed was wrong and is worth recording as wrong: the submission
// lands on the 30th or 31st and an approval on the 1st is nought to
// three days after it. What is real is narrow — a contract starting on
// the **1st** of a month, which is the natural start for a monthly India
// or UK engagement, got all 24 approvals before their paired submission,
// the head inverted, and a last month with no approval date at all.
// Measured over 24 months from every start day of the month, 672
// submissions: shipped `dayOfMonth: 1` gave 24 approvals before their
// hours, 1 start day in 28 with an inverted head, 1 in 28 with an
// unapprovable last month and 216 same-day collisions (32%); month-end
// `offsetDays: 1` gave 0, 0, 0 and 224 (33%); month-end `offsetDays: 3`
// gave 0, 0, 0 and **0**.
//
// **The three is the founder's answer, decided 2026-09-26.** Asked
// whether a client should sign a month off the next day or three days
// later like the weekly packs, he chose three days later, and the reason
// he was shown is the one to record: it is the only variant where an
// approval never falls on the same calendar day the hours are due. Under
// the shipped dates that happened a third of the time — 216 of 672 — and
// a same-day pair asks a client to sign work that has only just landed.
// Month-end plus one is no better on this (224 of 672); plus three has
// none.
//
// Cycles are generated once — at award, convert, replace, extend and
// seed — so nothing already written is rewritten, and a demo moves when
// it is re-seeded.
const COMMON_CYCLES: CycleDefinition[] = [
  { kind: 'TIMESHEET_SUBMIT', label: 'Timesheet submission', frequency: 'WEEKLY', dayOfWeek: 5 },
  { kind: 'TIMESHEET_APPROVE', label: 'Timesheet approval', frequency: 'WEEKLY', dayOfWeek: 5, offsetDays: 3 },
  { kind: 'INVOICE_GENERATE', label: 'Invoice generation', frequency: 'SEMIMONTHLY', dayOfMonth: 15 },
  { kind: 'SALARY_CALCULATE', label: 'Salary calculation', frequency: 'BIWEEKLY', dayOfWeek: 3 },
  { kind: 'SALARY_PAY', label: 'Salary payment', frequency: 'BIWEEKLY', dayOfWeek: 5 },
]

const US_IT: TemplatePack = {
  id: 'US_IT',
  label: 'US IT Staffing',
  country: 'US',
  contractTypes: [
    { code: 'W2', label: 'W-2 Employee', description: 'Standard employment, employer pays FICA/FUTA/SUTA' },
    { code: 'C2C', label: 'Corp-to-Corp', description: 'Contractor via their own entity or sub-vendor' },
    { code: '1099', label: '1099 Independent', description: 'Independent contractor, rare in staffing' },
    { code: 'C2H_W2', label: 'Contract-to-Hire W-2', description: 'W-2 with conversion clause' },
  ],
  cycleDefinitions: [
    ...COMMON_CYCLES,
    { kind: 'VENDOR_BILL_GENERATE', label: 'Vendor bill generation', frequency: 'SEMIMONTHLY', dayOfMonth: 15 },
  ],
  docTemplates: [
    { name: 'Employment Agreement (W-2)', audience: 'CANDIDATE', needsSignature: true },
    { name: 'Contractor Agreement (C2C)', audience: 'VENDOR', needsSignature: true },
    { name: 'NDA', audience: 'CANDIDATE', needsSignature: true },
    { name: 'Right to Represent', audience: 'CANDIDATE', needsSignature: true },
    { name: 'Client MSA', audience: 'CLIENT', needsSignature: true },
    { name: 'Statement of Work', audience: 'CLIENT', needsSignature: true },
    { name: 'I-9 Employment Verification', audience: 'EMPLOYEE', needsSignature: false },
    { name: 'W-4 Tax Withholding', audience: 'EMPLOYEE', needsSignature: false },
    { name: 'Timesheet Policy', audience: 'GENERAL', needsSignature: false },
  ],
  skillSeeds: [
    { category: 'Languages', skills: ['Java', 'Python', 'JavaScript', 'TypeScript', 'C#', 'Go', 'Rust', 'SQL'] },
    { category: 'Cloud', skills: ['AWS', 'Azure', 'GCP', 'Kubernetes', 'Docker', 'Terraform'] },
    { category: 'Data', skills: ['Snowflake', 'Databricks', 'Spark', 'Kafka', 'PostgreSQL', 'MongoDB'] },
    { category: 'AI/ML', skills: ['PyTorch', 'TensorFlow', 'LLM', 'Computer Vision', 'NLP', 'MLOps'] },
    { category: 'DevOps', skills: ['CI/CD', 'Jenkins', 'GitHub Actions', 'ArgoCD', 'Ansible'] },
  ],
}

const US_SAP: TemplatePack = {
  id: 'US_SAP',
  label: 'US SAP/ERP Staffing',
  country: 'US',
  contractTypes: [
    ...US_IT.contractTypes,
  ],
  cycleDefinitions: [
    ...US_IT.cycleDefinitions,
  ],
  docTemplates: [
    ...US_IT.docTemplates,
  ],
  skillSeeds: [
    { category: 'SAP Functional', skills: ['SAP FI/CO', 'SAP MM', 'SAP SD', 'SAP PP', 'SAP WM/EWM', 'SAP HCM', 'SAP SuccessFactors', 'SAP Ariba'] },
    { category: 'SAP Technical', skills: ['ABAP', 'SAP HANA', 'SAP BTP', 'SAP Fiori', 'SAP UI5', 'SAP Integration Suite', 'SAP CPI'] },
    { category: 'SAP S/4HANA', skills: ['S/4HANA Migration', 'S/4HANA Finance', 'S/4HANA Sourcing', 'S/4HANA Manufacturing', 'Brownfield', 'Greenfield'] },
    { category: 'ERP', skills: ['Oracle EBS', 'Oracle Cloud', 'Workday', 'ServiceNow', 'Salesforce'] },
    { category: 'Consulting', skills: ['Business Analysis', 'Change Management', 'Project Management', 'Solution Architecture', 'Data Migration'] },
  ],
}

const IN_DELIVERY: TemplatePack = {
  id: 'IN_DELIVERY',
  label: 'India Delivery Center',
  country: 'IN',
  contractTypes: [
    { code: 'CDD', label: 'Contract of Definite Duration', description: 'Fixed-term contract under Indian labor law' },
    { code: 'FIXED_TERM', label: 'Fixed-Term Employment', description: 'Employment for a specified period, renewals per Industrial Employment (Standing Orders) Act' },
  ],
  cycleDefinitions: [
    { kind: 'TIMESHEET_SUBMIT', label: 'Timesheet submission', frequency: 'MONTHLY', dayOfMonth: 28 },
    // Month-end plus three, for the reason the weekly pair above carries
    // it: an approval is not a rhythm of its own. The three is the
    // founder's own answer, 2026-09-26 — see the monthly note above
    // COMMON_CYCLES.
    { kind: 'TIMESHEET_APPROVE', label: 'Timesheet approval', frequency: 'MONTHLY', dayOfMonth: 28, offsetDays: 3 },
    { kind: 'SALARY_CALCULATE', label: 'Salary calculation', frequency: 'MONTHLY', dayOfMonth: 25 },
    { kind: 'SALARY_PAY', label: 'Salary payment', frequency: 'MONTHLY', dayOfMonth: 28 },
    // Still the 1st, and now the 1st AFTER the month it closes rather
    // than the 1st inside it. See the monthly note above COMMON_CYCLES.
    { kind: 'INVOICE_GENERATE', label: 'Invoice generation', frequency: 'MONTHLY', dayOfMonth: 28, offsetDays: 1 },
  ],
  docTemplates: [
    { name: 'Appointment Letter', audience: 'CANDIDATE', needsSignature: true },
    { name: 'NDA', audience: 'CANDIDATE', needsSignature: true },
    { name: 'Client SOW', audience: 'CLIENT', needsSignature: true },
    { name: 'Gratuity Nomination', audience: 'EMPLOYEE', needsSignature: true },
  ],
  skillSeeds: US_SAP.skillSeeds, // same tech stack, different delivery model
}

const UK: TemplatePack = {
  id: 'UK',
  label: 'UK Staffing',
  country: 'GB',
  contractTypes: [
    { code: 'LIMITED_COMPANY', label: 'Limited Company', description: 'Contractor via their own Ltd' },
    { code: 'UMBRELLA', label: 'Umbrella Company', description: 'Contractor employed through an umbrella' },
    { code: 'PAYE', label: 'PAYE Temp', description: 'Temporary employee on agency payroll' },
  ],
  cycleDefinitions: [
    { kind: 'TIMESHEET_SUBMIT', label: 'Timesheet submission', frequency: 'WEEKLY', dayOfWeek: 5 },
    // The same pair, and the same defect, as the note on COMMON_CYCLES
    // above: a weekly approval anchored on its own Monday. A UK
    // placement starting on a Monday had it too, and a fix that leaves
    // the identical line in the next pack down is half a fix.
    { kind: 'TIMESHEET_APPROVE', label: 'Timesheet approval', frequency: 'WEEKLY', dayOfWeek: 5, offsetDays: 3 },
    { kind: 'SALARY_CALCULATE', label: 'Salary calculation', frequency: 'MONTHLY', dayOfMonth: 25 },
    { kind: 'SALARY_PAY', label: 'Salary payment', frequency: 'MONTHLY', dayOfMonth: 28 },
    // Both still land on the 1st, and it is now the 1st after the month
    // they close. The vendor side was the worse of the two because a PAY
    // kind shifts BACKWARD off a weekend — see the monthly note above
    // COMMON_CYCLES.
    { kind: 'INVOICE_GENERATE', label: 'Invoice generation', frequency: 'MONTHLY', dayOfMonth: 28, offsetDays: 1 },
    { kind: 'VENDOR_BILL_GENERATE', label: 'Vendor bill generation', frequency: 'MONTHLY', dayOfMonth: 28, offsetDays: 1 },
  ],
  docTemplates: [
    { name: 'Contract for Services (Ltd)', audience: 'VENDOR', needsSignature: true },
    { name: 'Umbrella Assignment Schedule', audience: 'CANDIDATE', needsSignature: true },
    { name: 'PAYE Contract', audience: 'CANDIDATE', needsSignature: true },
    { name: 'IR35 Status Determination Statement', audience: 'CANDIDATE', needsSignature: false },
    { name: 'Client Terms of Business', audience: 'CLIENT', needsSignature: true },
    { name: 'Key Information Document', audience: 'CANDIDATE', needsSignature: false },
    { name: 'Opt-Out Declaration', audience: 'CANDIDATE', needsSignature: true },
  ],
  skillSeeds: [
    { category: 'Languages', skills: ['Java', 'Python', 'JavaScript', 'TypeScript', 'C#', '.NET', 'Go'] },
    { category: 'Cloud', skills: ['AWS', 'Azure', 'GCP', 'Kubernetes', 'Docker'] },
    { category: 'Finance', skills: ['Murex', 'Calypso', 'FIX Protocol', 'Risk Management'] },
    { category: 'Consulting', skills: ['Business Analysis', 'Program Management', 'Agile Delivery'] },
  ],
}

// ── Registry ───────────────────────────────────────────────────

export const TEMPLATE_PACKS: Record<string, TemplatePack> = {
  US_IT,
  US_SAP,
  IN_DELIVERY,
  UK,
}

export const TEMPLATE_PACK_IDS = Object.keys(TEMPLATE_PACKS) as readonly string[]

export function getTemplatePack(id: string): TemplatePack | null {
  return TEMPLATE_PACKS[id] ?? null
}

/**
 * Validate a template pack — every cycle kind is unique,
 * every doc template has a valid audience, etc.
 */
export function validatePack(pack: TemplatePack): string[] {
  const errors: string[] = []

  if (!pack.id || !pack.label) {
    errors.push('Pack must have an id and label')
  }

  // Cycle kinds must be unique within a pack
  const cycleKinds = new Set<string>()
  for (const c of pack.cycleDefinitions) {
    if (cycleKinds.has(c.kind)) {
      errors.push(`Duplicate cycle kind: ${c.kind}`)
    }
    cycleKinds.add(c.kind)
  }

  // Contract types must have unique codes
  const contractCodes = new Set<string>()
  for (const ct of pack.contractTypes) {
    if (contractCodes.has(ct.code)) {
      errors.push(`Duplicate contract type code: ${ct.code}`)
    }
    contractCodes.add(ct.code)
  }

  // Doc templates must have valid audiences
  const validAudiences = new Set(['CANDIDATE', 'VENDOR', 'CLIENT', 'EMPLOYEE', 'GENERAL'])
  for (const dt of pack.docTemplates) {
    if (!validAudiences.has(dt.audience)) {
      errors.push(`Invalid doc template audience: ${dt.audience} on ${dt.name}`)
    }
  }

  // Skill seeds must be non-empty
  for (const seed of pack.skillSeeds) {
    if (seed.skills.length === 0) {
      errors.push(`Empty skill seed: ${seed.category}`)
    }
  }

  return errors
}
