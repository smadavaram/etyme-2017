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

// ── Contract types ─────────────────────────────────────────────

export interface ContractTypeDef {
  code: string
  label: string
  description: string
}

// ── Cycle definitions ──────────────────────────────────────────
//
// The nineteen kinds from 2017, grouped by what they produce.
// Five frequencies: WEEKLY, BIWEEKLY, SEMIMONTHLY, MONTHLY, ON_COMPLETION.
// Business-day shifting applied against the company's holiday calendar.

export interface CycleDefinition {
  kind: string
  label: string
  frequency: 'WEEKLY' | 'BIWEEKLY' | 'SEMIMONTHLY' | 'MONTHLY' | 'ON_COMPLETION'
  dayOfWeek?: number  // 0 = Sunday, 5 = Friday — for weekly/biweekly
  dayOfMonth?: number // 1–28 — for monthly/semimonthly (28 = last business day)
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

const COMMON_CYCLES: CycleDefinition[] = [
  { kind: 'TIMESHEET_SUBMIT', label: 'Timesheet submission', frequency: 'WEEKLY', dayOfWeek: 5 },
  { kind: 'TIMESHEET_APPROVE', label: 'Timesheet approval', frequency: 'WEEKLY', dayOfWeek: 1 },
  { kind: 'INVOICE_GENERATE', label: 'Invoice generation', frequency: 'SEMIMONTHLY', dayOfMonth: 1 },
  { kind: 'INVOICE_DUE', label: 'Invoice due', frequency: 'MONTHLY', dayOfMonth: 28 },
  { kind: 'SALARY_CALCULATE', label: 'Salary calculation', frequency: 'BIWEEKLY', dayOfWeek: 3 },
  { kind: 'SALARY_APPROVE', label: 'Salary approval', frequency: 'BIWEEKLY', dayOfWeek: 4 },
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
    { kind: 'VENDOR_BILL_GENERATE', label: 'Vendor bill generation', frequency: 'SEMIMONTHLY', dayOfMonth: 1 },
    { kind: 'VENDOR_BILL_DUE', label: 'Vendor bill due', frequency: 'MONTHLY', dayOfMonth: 15 },
    { kind: 'TAX_WITHHOLD', label: 'Tax withholding', frequency: 'BIWEEKLY', dayOfWeek: 5 },
    { kind: 'COMMISSION_CALCULATE', label: 'Commission calculation', frequency: 'MONTHLY', dayOfMonth: 1 },
    { kind: 'COMMISSION_PAY', label: 'Commission payment', frequency: 'MONTHLY', dayOfMonth: 15 },
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
    { kind: 'TIMESHEET_APPROVE', label: 'Timesheet approval', frequency: 'MONTHLY', dayOfMonth: 1 },
    { kind: 'SALARY_CALCULATE', label: 'Salary calculation', frequency: 'MONTHLY', dayOfMonth: 25 },
    { kind: 'SALARY_PAY', label: 'Salary payment', frequency: 'MONTHLY', dayOfMonth: 28 },
    { kind: 'INVOICE_GENERATE', label: 'Invoice generation', frequency: 'MONTHLY', dayOfMonth: 1 },
    { kind: 'INVOICE_DUE', label: 'Invoice due', frequency: 'MONTHLY', dayOfMonth: 28 },
    { kind: 'GST_RETURN', label: 'GST return', frequency: 'MONTHLY', dayOfMonth: 20 },
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
    { kind: 'TIMESHEET_APPROVE', label: 'Timesheet approval', frequency: 'WEEKLY', dayOfWeek: 1 },
    { kind: 'SALARY_CALCULATE', label: 'Salary calculation', frequency: 'MONTHLY', dayOfMonth: 25 },
    { kind: 'SALARY_PAY', label: 'Salary payment', frequency: 'MONTHLY', dayOfMonth: 28 },
    { kind: 'INVOICE_GENERATE', label: 'Invoice generation', frequency: 'MONTHLY', dayOfMonth: 1 },
    { kind: 'INVOICE_DUE', label: 'Invoice due', frequency: 'MONTHLY', dayOfMonth: 28 },
    { kind: 'VENDOR_BILL_GENERATE', label: 'Vendor bill generation', frequency: 'MONTHLY', dayOfMonth: 1 },
    { kind: 'VENDOR_BILL_DUE', label: 'Vendor bill due', frequency: 'MONTHLY', dayOfMonth: 15 },
    { kind: 'IR35_ASSESSMENT', label: 'IR35 status assessment', frequency: 'ON_COMPLETION' },
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
    { category: 'Consulting', skills: ['Business Analysis', 'Programme Management', 'Agile Delivery'] },
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
