/**
 * The generated world's closed vocabulary: per industry, the roles (a
 * title, its skills, a seniority, whether the work is licensed), the
 * places, the stems firm names are built from, and the niches a bench
 * firm trains people for.
 *
 * Closed on purpose (docs/seed-scale-brief.md, section 3.3). Skills are
 * free text on a profile and on a job, and three matchers read them: the
 * rules sift matches a substring either way, the score an exact or a
 * substring, and the simulation's fit an exact string. So every skill is
 * a canonical string used verbatim by people and jobs, at least four
 * letters long, and none is a piece of another ("Java" beside
 * "JavaScript" would match both). Seniority is in the title and the
 * rate, never in a skill.
 *
 * No product or vendor names: a skill chip on a seeded screen that names
 * a product reads as a claim (`__tests__/invariants/demo-names.test.ts`),
 * so every skill says the work, not the tool's brand.
 *
 * Licensed titles carry the occupation word ("nurse", "therapist",
 * "pharmacist", "electrician") so `licensedOccupation` picks the licensed
 * packet and asks for a professional license. Firm stems are invented and
 * checked against real company names (`lib/positioning`).
 */

import type { Industry, IndustryKey, Niche, RoleTemplate, Seniority } from './types'

const role = (title: string, skills: string[], seniority: Seniority, licensed = false): RoleTemplate => ({ title, skills, seniority, licensed })
const niche = (key: string, label: string, skills: string[], course: string, hours: number, priceCents: number): Niche => ({
  key, label, skills, course: { title: course, hours, priceCents },
})

export const INDUSTRIES: readonly Industry[] = [
  {
    key: 'IT',
    roles: [
      role('Java microservices engineer', ['Java', 'Spring Boot', 'Kubernetes'], 'SENIOR'),
      role('Data engineer', ['Python', 'Cloud data warehousing', 'Airflow'], 'MID'),
      role('Machine learning engineer', ['PyTorch', 'MLOps', 'Feature stores'], 'SENIOR'),
      role('CRM developer', ['CRM customization', 'Workflow automation', 'Customer portals'], 'MID'),
      role('QA automation engineer', ['Selenium', 'Playwright', 'Regression suites'], 'MID'),
      role('Cybersecurity analyst', ['Log analytics', 'Incident response', 'Threat hunting'], 'MID'),
      role('HR systems integrations lead', ['HR system integrations', 'Payroll interfaces'], 'SENIOR'),
      role('Network engineer', ['Enterprise routing', 'SD-WAN', 'Firewall policy'], 'MID'),
      role('Cloud infrastructure engineer', ['Infrastructure as code', 'Cloud landing zones', 'Container platforms'], 'SENIOR'),
      role('ERP finance consultant', ['ERP finance configuration', 'ERP cutover', 'Month-end close'], 'SENIOR'),
      role('Scrum master', ['Scrum', 'Backlog management', 'Facilitation'], 'MID'),
      role('Junior software developer', ['TypeScript', 'React', 'REST APIs'], 'JUNIOR'),
      // The trade's own titles, as a buyer says them (and money's band sentences read them).
      role('Java developer', ['Java', 'REST APIs', 'Unit testing'], 'MID'),
      role('Junior QA analyst', ['Manual test execution', 'Defect tracking'], 'JUNIOR'),
      role('Cloud solutions architect', ['Solution design', 'Cloud landing zones', 'Infrastructure as code'], 'SENIOR'),
    ],
    places: ['Dallas, TX', 'Charlotte, NC', 'San Jose, CA', 'Austin, TX', 'Raleigh, NC', 'Columbus, OH', 'Remote'],
    firmStems: ['Corvana', 'Brightwell', 'Quillon', 'Tessaract', 'Halverd', 'Nimbrel', 'Orvanta', 'Straylight', 'Velquist', 'Arden Loop'],
    niches: [
      niche('crm', 'CRM developers', ['CRM customization', 'Workflow automation', 'Customer portals'], 'CRM developer bootcamp', 160, 250_000),
      niche('cloud', 'Cloud engineers', ['Infrastructure as code', 'Cloud landing zones', 'Container platforms'], 'Cloud infrastructure program', 200, 300_000),
      niche('testing', 'Test automation', ['Selenium', 'Playwright', 'Regression suites'], 'Test automation course', 120, 180_000),
      niche('data', 'Data engineers', ['Python', 'Cloud data warehousing', 'Airflow'], 'Data engineering track', 180, 280_000),
    ],
  },
  {
    key: 'HEALTHCARE',
    roles: [
      role('ICU travel nurse', ['Critical care', 'Ventilator management', 'ACLS certification'], 'SENIOR', true),
      role('Emergency room nurse', ['Emergency triage', 'Trauma care', 'Patient assessment'], 'MID', true),
      role('Physical therapist', ['Orthopedic rehabilitation', 'Gait training', 'Manual therapy'], 'MID', true),
      role('Respiratory therapist', ['Airway management', 'Pulmonary function testing', 'Oxygen therapy'], 'MID', true),
      role('Clinical pharmacist', ['Medication reconciliation', 'Sterile compounding', 'Formulary review'], 'SENIOR', true),
      role('EHR ambulatory analyst', ['EHR ambulatory workflows', 'Clinical workflow design', 'Go-live support'], 'MID'),
      role('Clinical research coordinator', ['Good Clinical Practice', 'Case report forms', 'Site monitoring'], 'MID'),
      role('Medical coder', ['ICD-10 coding', 'CPT coding', 'Charge capture'], 'JUNIOR'),
      role('Health informatics analyst', ['HL7 interfaces', 'FHIR resources', 'Clinical data quality'], 'MID'),
      role('Travel nurse', ['Critical care', 'Patient assessment', 'Medication administration'], 'MID', true),
      role('Certified nursing assistant', ['Patient mobility', 'Vital signs monitoring'], 'JUNIOR', true),
      role('Nurse practitioner', ['Diagnostic assessment', 'Prescriptive authority'], 'SENIOR', true),
    ],
    places: ['Madison, WI', 'Minneapolis, MN', 'Atlanta, GA', 'Phoenix, AZ', 'Denver, CO', 'Chicago, IL'],
    firmStems: ['Larkmead', 'Corwen', 'Halloway', 'Maribel', 'Penhurst', 'Sedgemoor', 'Tallis', 'Wrenfield'],
    niches: [
      niche('nursing', 'Critical care nurses', ['Critical care', 'Ventilator management', 'ACLS certification'], 'Critical care refresher', 80, 150_000),
      niche('coding', 'Medical coders', ['ICD-10 coding', 'CPT coding', 'Charge capture'], 'Medical coding certificate', 140, 120_000),
      niche('informatics', 'Health informatics', ['HL7 interfaces', 'FHIR resources', 'Clinical data quality'], 'Health interfaces course', 100, 160_000),
    ],
  },
  {
    key: 'MANUFACTURING',
    roles: [
      role('Validation engineer', ['Computer system validation', 'GAMP 5', 'Protocol execution'], 'MID'),
      role('Avionics test engineer', ['DO-178C', 'Embedded firmware', 'Hardware-in-the-loop'], 'SENIOR'),
      role('PLM systems engineer', ['PLM configuration', 'Engineering change control', 'CAD integration'], 'SENIOR'),
      role('Mechanical design engineer', ['3D CAD modeling', 'Tolerance analysis', 'Design for manufacture'], 'MID'),
      role('Quality engineer', ['Root cause analysis', 'Statistical process control', 'Supplier audits'], 'MID'),
      role('Industrial electrician', ['Motor controls', 'Programmable logic controllers', 'Panel wiring'], 'MID', true),
      role('Manufacturing technician', ['Line changeovers', 'Preventive maintenance', 'Work instructions'], 'JUNIOR'),
      role('Supply chain planner', ['Demand planning', 'Material requirements planning', 'Inventory optimization'], 'MID'),
      role('Machine operator', ['Machine setup', 'Lean production'], 'JUNIOR'),
      role('CNC programmer', ['CNC programming', 'CAM toolpaths', 'Blueprint reading'], 'MID'),
    ],
    places: ['Wichita, KS', 'Everett, WA', 'Columbus, OH', 'Chicago, IL', 'Dallas, TX'],
    firmStems: ['Ironvale', 'Kestwick', 'Marlstone', 'Northgauge', 'Rivetline', 'Tallgate', 'Whitmore Works'],
    niches: [
      niche('validation', 'Validation engineers', ['Computer system validation', 'GAMP 5', 'Protocol execution'], 'Validation engineering course', 120, 200_000),
      niche('controls', 'Controls technicians', ['Motor controls', 'Programmable logic controllers', 'Panel wiring'], 'Industrial controls program', 160, 170_000),
    ],
  },
  {
    key: 'FINANCE',
    roles: [
      role('Trading platform support analyst', ['Trading platform support', 'FX options', 'Trade lifecycle'], 'SENIOR'),
      role('Market risk analyst', ['Value at risk', 'Stress testing', 'Risk reporting'], 'SENIOR'),
      role('ERP financials consultant', ['ERP financials', 'General ledger', 'Accounts payable'], 'SENIOR'),
      role('Business analyst', ['Requirements elicitation', 'Process mapping', 'User acceptance testing'], 'MID'),
      role('Financial reporting accountant', ['Consolidation', 'Revenue recognition', 'Audit support'], 'MID'),
      role('KYC analyst', ['Customer due diligence', 'Sanctions screening', 'Onboarding reviews'], 'JUNIOR'),
      role('Treasury systems analyst', ['Cash management', 'Bank connectivity', 'Payment formats'], 'MID'),
      role('Accounts payable clerk', ['Invoice processing', 'Vendor reconciliation'], 'JUNIOR'),
      role('Treasury analyst', ['Cash forecasting', 'Liquidity reporting', 'Bank connectivity'], 'MID'),
      role('Controller', ['Consolidation', 'Internal controls', 'Month-end close'], 'SENIOR'),
    ],
    places: ['Jersey City, NJ', 'Charlotte, NC', 'Chicago, IL', 'Atlanta, GA', 'Remote'],
    firmStems: ['Ashcombe', 'Belvane', 'Calloway', 'Dunmore', 'Fairlight', 'Graystone', 'Harcourt Lane'],
    niches: [
      niche('kyc', 'KYC analysts', ['Customer due diligence', 'Sanctions screening', 'Onboarding reviews'], 'KYC analyst program', 100, 140_000),
      niche('finsys', 'Finance systems', ['ERP financials', 'General ledger', 'Accounts payable'], 'ERP financials course', 150, 220_000),
    ],
  },
]

/**
 * Stems for every firm that is not a client: an integrator, an MSP, a
 * prime, a sub-vendor or a bench firm takes one each, so no two firms in
 * the generated world share a word and a client never shares its stem
 * with the MSP that runs it or a supplier on its panel. Invented, and
 * checked against real company names (`lib/positioning`).
 */
export const SUPPLIER_STEMS: readonly string[] = [
  'Abbotsley', 'Acresford', 'Albrook', 'Alderwick', 'Amberlane', 'Anstey', 'Arcwell', 'Ardley', 'Ashgrove', 'Aspenvale',
  'Avonleigh', 'Baywick', 'Beckford', 'Bellhaven', 'Birchmont', 'Blackthorn', 'Bramblewood', 'Brayfield', 'Bridgecombe', 'Brookhollow',
  'Burnside', 'Calderbrook', 'Carronvale', 'Cedarholm', 'Chalkbury', 'Charnwood', 'Cloverdale', 'Colbrook', 'Coppergate', 'Cranleigh',
  'Crestmoor', 'Dalebrook', 'Deepwell', 'Dovecote', 'Driftwood', 'Dunhallow', 'Eastwold', 'Eldermere', 'Elmscott', 'Emberley',
  'Fairbourne', 'Farrowdale', 'Fernhill', 'Fieldcrest', 'Flintridge', 'Foxbury', 'Galeford', 'Glenhaven', 'Goldmere', 'Granitefall',
  'Greywater', 'Hallbrook', 'Harrowfield', 'Hawksmere', 'Hazelbury', 'Heathcote', 'Highmoor', 'Hollybank', 'Ivydale', 'Juniper Hill',
  'Keldmoor', 'Kingsmere', 'Lakemont', 'Larchfield', 'Lindenmoor', 'Longbarrow', 'Lowerbrook', 'Maplecroft', 'Marshbrook', 'Meadowvale',
  'Millbrook', 'Moorcroft', 'Netherby', 'Northcote', 'Oakmere', 'Orchardleigh', 'Pebblebrook', 'Pinehollow', 'Quarrybank', 'Ravenhill',
  'Redbrook', 'Ridgewell', 'Rookwood', 'Rosebrook', 'Rushmere', 'Saltmarsh', 'Sandhurst', 'Silverdale', 'Southmere', 'Stonebridge',
  'Summerfield', 'Swallowdale', 'Thornbury', 'Trentham', 'Underwood', 'Valebridge', 'Westerholme', 'Whitbrook', 'Wildmere', 'Willowbank',
  'Windrush', 'Wolfscote', 'Woodbridge', 'Yarrowdale', 'Ashbury', 'Briarcliff', 'Copperfield', 'Elderwood', 'Thistledown', 'Larkhollow',
  'Mossbank', 'Fallowmere', 'Sedgebrook', 'Hollowmere', 'Kestermoor', 'Brackenridge', 'Wyvernhall',
]

/** One industry by key. */
export function industry(key: IndustryKey): Industry {
  const found = INDUSTRIES.find((i) => i.key === key)
  if (!found) throw new Error(`No industry ${key} in the generated world's vocabulary.`)
  return found
}

/** Every skill an industry's roles use: the list a job or a person draws from. */
export function skillsOf(key: IndustryKey): string[] {
  return [...new Set(industry(key).roles.flatMap((r) => r.skills))]
}

/** A skill as the matchers compare it: lower case, only letters, digits and `+#/.`. */
export function normalSkill(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9+#/.]/g, '')
}

/** Skills shorter than four characters, or one inside another, across the whole vocabulary. Empty is the rule. */
export function vocabularyFaults(): string[] {
  const all = [...new Set(INDUSTRIES.flatMap((i) => [...i.roles.flatMap((r) => r.skills), ...i.niches.flatMap((n) => n.skills)]))]
  const out: string[] = []
  for (const s of all) if (normalSkill(s).length < 4) out.push(`"${s}" is shorter than four characters`)
  for (const a of all) {
    for (const b of all) {
      if (a === b) continue
      const x = normalSkill(a), y = normalSkill(b)
      if (x !== y && y.includes(x)) out.push(`"${a}" is inside "${b}"`)
    }
  }
  for (const i of INDUSTRIES) {
    const known = new Set(skillsOf(i.key))
    for (const n of i.niches) for (const s of n.skills) if (!known.has(s)) out.push(`niche ${n.key} trains "${s}", which no ${i.key} role asks for`)
  }
  return out
}
