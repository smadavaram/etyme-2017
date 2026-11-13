/**
 * Corvane Packaging, worked out without a database: the drawing as data,
 * every contractor on the plan, and the facts the home page's demo reads.
 *
 * Split from `lib/seed-corvane` on 2026-11-13 so a page the browser loads
 * may read Corvane's names and figures without pulling the database client
 * in with them. Nothing here imports `@/lib/db`, `lib/seed-days` (which
 * reaches it through `lib/days-off`) or anything that does: every figure is
 * a day count from the world's day, never a date. `lib/seed-corvane`
 * re-exports all of it, so every reader that imported it there still does.
 *
 * ── Specialists, at specialist rates (founder, 2026-11-13) ───────────
 *
 * "We are talking about companies spending 40-50 million a year; make the
 * numbers realistic." Corvane's 359 contractors were priced as plant
 * labor, $28 an hour in the US and three to five dollars in Vietnam and
 * India: $704,227.20 a month, about $8.5 million a year, which tells a
 * buyer spending $45 million that the product is for small firms. So the
 * same 359 people, at the same 31 sites through the same 25 suppliers, are
 * the specialists a packaging company actually buys from outside: controls
 * engineers, maintenance planners, quality engineers, automation
 * technicians, ERP analysts and process engineers, at specialist rates in
 * each site's own currency. At the shipped sample exchange rates and 160
 * hours a month that is about $3.6 million a month, about $43 million a
 * year (`__tests__/invariants/seed-corvane.test.ts` computes it through
 * the product's own functions).
 */

import { daysFor, monthsOf } from '@/lib/tenure-days'
import { fromDecimal } from '@/lib/money'

// ── The drawing, as data ─────────────────────────────────────────────

/** The slug after the world's prefix: the company is `world-corvane`. */
export const CORVANE_SLUG = 'corvane'
export const CORVANE_NAME = 'Corvane Packaging'
/** Every Corvane seat and worker's address starts with this. */
export const CORVANE_EMAIL_PREFIX = 'world-corvane-'
/** The client's time limit, across every supplier. */
export const CORVANE_TIME_LIMIT_MONTHS = 18

export type RegionKey = 'us' | 'latam' | 'vn' | 'in' | 'be' | 'ni'
/** The drawing's country keys. NI is Northern Ireland, a part of the UK (ISO GB). */
export type CountryKey = 'US' | 'MX' | 'BR' | 'CO' | 'VN' | 'IN' | 'BE' | 'NI'

/** The six regions, with their labels (the sites' `region`) and their leads. */
export const CORVANE_REGIONS: readonly { key: RegionKey; label: string; lead: string }[] = [
  { key: 'us', label: 'United States', lead: 'Dana Whitcombe' },
  { key: 'latam', label: 'Latin America', lead: 'Valeria Montes' },
  { key: 'vn', label: 'Vietnam', lead: 'Trần Minh Khoa' },
  { key: 'in', label: 'India', lead: 'Kavita Raghunathan' },
  { key: 'be', label: 'Belgium', lead: 'Pieter Vandamme' },
  { key: 'ni', label: 'Northern Ireland', lead: 'Siobhán McAleese' },
]

/**
 * Each country's currency and the hourly bill rate for a specialist there,
 * in whole units of that currency (founder, 2026-11-13).
 */
export const CORVANE_COUNTRIES: Readonly<Record<CountryKey, { iso: string; currency: string; rate: number }>> = {
  US: { iso: 'US', currency: 'USD', rate: 120 },
  MX: { iso: 'MX', currency: 'MXN', rate: 900 },
  BR: { iso: 'BR', currency: 'BRL', rate: 260 },
  CO: { iso: 'CO', currency: 'COP', rate: 180000 },
  VN: { iso: 'VN', currency: 'VND', rate: 950000 },
  IN: { iso: 'IN', currency: 'INR', rate: 3200 },
  BE: { iso: 'BE', currency: 'EUR', rate: 95 },
  NI: { iso: 'GB', currency: 'GBP', rate: 72 },
}

export interface CorvanePlant {
  /** An address-safe key: `dayton`, `binh-duong`. */
  key: string
  region: RegionKey
  cc: CountryKey
  /** The drawing's name for it, which is the site's name. */
  plant: string
  city: string
  state: string | null
  timeZone: string
  manager: string
  contractors: number
  openJobs: number
  weeksToSign: number
  /** Days until the plant's nearest contractor reaches the time limit. */
  nearestLimitDays: number
  suppliers: number
}

/** The drawing's HM array, row for row, with the city, province and zone a site needs. */
export const CORVANE_PLANTS: readonly CorvanePlant[] = [
  { key: 'dayton', region: 'us', cc: 'US', plant: 'Dayton, Ohio', city: 'Dayton', state: 'Ohio', timeZone: 'America/New_York', manager: 'Marcus Hollins', contractors: 14, openJobs: 2, weeksToSign: 3, nearestLimitDays: 41, suppliers: 3 },
  { key: 'greenville', region: 'us', cc: 'US', plant: 'Greenville, South Carolina', city: 'Greenville', state: 'South Carolina', timeZone: 'America/New_York', manager: 'Renée Dupuis', contractors: 9, openJobs: 1, weeksToSign: 0, nearestLimitDays: 120, suppliers: 2 },
  { key: 'fresno', region: 'us', cc: 'US', plant: 'Fresno, California', city: 'Fresno', state: 'California', timeZone: 'America/Los_Angeles', manager: 'Gabriel Ortiz', contractors: 11, openJobs: 3, weeksToSign: 5, nearestLimitDays: 18, suppliers: 3 },
  { key: 'joliet', region: 'us', cc: 'US', plant: 'Joliet, Illinois', city: 'Joliet', state: 'Illinois', timeZone: 'America/Chicago', manager: 'Patricia Kowalczyk', contractors: 7, openJobs: 0, weeksToSign: 1, nearestLimitDays: 210, suppliers: 2 },
  { key: 'el-paso', region: 'us', cc: 'US', plant: 'El Paso, Texas', city: 'El Paso', state: 'Texas', timeZone: 'America/Denver', manager: 'Luis Carrasco', contractors: 12, openJobs: 2, weeksToSign: 2, nearestLimitDays: 75, suppliers: 4 },
  { key: 'allentown', region: 'us', cc: 'US', plant: 'Allentown, Pennsylvania', city: 'Allentown', state: 'Pennsylvania', timeZone: 'America/New_York', manager: 'Janet Albrecht', contractors: 6, openJobs: 1, weeksToSign: 0, nearestLimitDays: 300, suppliers: 2 },
  { key: 'monterrey', region: 'latam', cc: 'MX', plant: 'Monterrey, Mexico', city: 'Monterrey', state: 'Nuevo León', timeZone: 'America/Monterrey', manager: 'Ana Lucía Garza', contractors: 18, openJobs: 3, weeksToSign: 4, nearestLimitDays: 52, suppliers: 3 },
  { key: 'queretaro', region: 'latam', cc: 'MX', plant: 'Querétaro, Mexico', city: 'Querétaro', state: 'Querétaro', timeZone: 'America/Mexico_City', manager: 'Héctor Villaseñor', contractors: 10, openJobs: 1, weeksToSign: 1, nearestLimitDays: 140, suppliers: 2 },
  { key: 'campinas', region: 'latam', cc: 'BR', plant: 'Campinas, Brazil', city: 'Campinas', state: 'São Paulo', timeZone: 'America/Sao_Paulo', manager: 'Fernanda Albuquerque', contractors: 15, openJobs: 2, weeksToSign: 2, nearestLimitDays: 22, suppliers: 3 },
  { key: 'joinville', region: 'latam', cc: 'BR', plant: 'Joinville, Brazil', city: 'Joinville', state: 'Santa Catarina', timeZone: 'America/Sao_Paulo', manager: 'Rodrigo Teixeira', contractors: 8, openJobs: 1, weeksToSign: 0, nearestLimitDays: 95, suppliers: 2 },
  { key: 'medellin', region: 'latam', cc: 'CO', plant: 'Medellín, Colombia', city: 'Medellín', state: 'Antioquia', timeZone: 'America/Bogota', manager: 'Camila Restrepo', contractors: 11, openJobs: 2, weeksToSign: 3, nearestLimitDays: 30, suppliers: 2 },
  { key: 'barranquilla', region: 'latam', cc: 'CO', plant: 'Barranquilla, Colombia', city: 'Barranquilla', state: 'Atlántico', timeZone: 'America/Bogota', manager: 'Andrés Pacheco', contractors: 6, openJobs: 0, weeksToSign: 1, nearestLimitDays: 160, suppliers: 1 },
  { key: 'binh-duong', region: 'vn', cc: 'VN', plant: 'Bình Dương', city: 'Bình Dương', state: null, timeZone: 'Asia/Ho_Chi_Minh', manager: 'Nguyễn Thị Lan', contractors: 22, openJobs: 3, weeksToSign: 4, nearestLimitDays: 28, suppliers: 3 },
  { key: 'dong-nai', region: 'vn', cc: 'VN', plant: 'Đồng Nai', city: 'Đồng Nai', state: null, timeZone: 'Asia/Ho_Chi_Minh', manager: 'Phạm Quốc Bảo', contractors: 16, openJobs: 2, weeksToSign: 1, nearestLimitDays: 64, suppliers: 2 },
  { key: 'hai-phong', region: 'vn', cc: 'VN', plant: 'Hải Phòng', city: 'Hải Phòng', state: null, timeZone: 'Asia/Ho_Chi_Minh', manager: 'Lê Thu Hà', contractors: 13, openJobs: 1, weeksToSign: 0, nearestLimitDays: 190, suppliers: 2 },
  { key: 'bac-ninh', region: 'vn', cc: 'VN', plant: 'Bắc Ninh', city: 'Bắc Ninh', state: null, timeZone: 'Asia/Ho_Chi_Minh', manager: 'Đỗ Văn Hùng', contractors: 19, openJobs: 4, weeksToSign: 2, nearestLimitDays: 45, suppliers: 3 },
  { key: 'da-nang', region: 'vn', cc: 'VN', plant: 'Đà Nẵng', city: 'Đà Nẵng', state: null, timeZone: 'Asia/Ho_Chi_Minh', manager: 'Võ Thị Mai', contractors: 7, openJobs: 0, weeksToSign: 0, nearestLimitDays: 230, suppliers: 1 },
  { key: 'pune', region: 'in', cc: 'IN', plant: 'Pune, Maharashtra', city: 'Pune', state: 'Maharashtra', timeZone: 'Asia/Kolkata', manager: 'Aditya Kulkarni', contractors: 24, openJobs: 3, weeksToSign: 3, nearestLimitDays: 58, suppliers: 4 },
  { key: 'sriperumbudur', region: 'in', cc: 'IN', plant: 'Sriperumbudur, Tamil Nadu', city: 'Sriperumbudur', state: 'Tamil Nadu', timeZone: 'Asia/Kolkata', manager: 'Lakshmi Narayanan', contractors: 20, openJobs: 2, weeksToSign: 5, nearestLimitDays: 19, suppliers: 3 },
  { key: 'sanand', region: 'in', cc: 'IN', plant: 'Sanand, Gujarat', city: 'Sanand', state: 'Gujarat', timeZone: 'Asia/Kolkata', manager: 'Hardik Patel', contractors: 12, openJobs: 1, weeksToSign: 1, nearestLimitDays: 130, suppliers: 2 },
  { key: 'hosur', region: 'in', cc: 'IN', plant: 'Hosur, Tamil Nadu', city: 'Hosur', state: 'Tamil Nadu', timeZone: 'Asia/Kolkata', manager: 'Divya Srinivasan', contractors: 15, openJobs: 2, weeksToSign: 0, nearestLimitDays: 88, suppliers: 3 },
  { key: 'manesar', region: 'in', cc: 'IN', plant: 'Manesar, Haryana', city: 'Manesar', state: 'Haryana', timeZone: 'Asia/Kolkata', manager: 'Rohit Yadav', contractors: 17, openJobs: 3, weeksToSign: 2, nearestLimitDays: 36, suppliers: 3 },
  { key: 'vadodara', region: 'in', cc: 'IN', plant: 'Vadodara, Gujarat', city: 'Vadodara', state: 'Gujarat', timeZone: 'Asia/Kolkata', manager: 'Neha Desai', contractors: 9, openJobs: 1, weeksToSign: 1, nearestLimitDays: 175, suppliers: 2 },
  { key: 'ghent', region: 'be', cc: 'BE', plant: 'Ghent', city: 'Ghent', state: 'East Flanders', timeZone: 'Europe/Brussels', manager: 'Lotte Verhaegen', contractors: 8, openJobs: 1, weeksToSign: 2, nearestLimitDays: 60, suppliers: 2 },
  { key: 'antwerp', region: 'be', cc: 'BE', plant: 'Antwerp', city: 'Antwerp', state: 'Antwerp', timeZone: 'Europe/Brussels', manager: 'Joris De Smet', contractors: 11, openJobs: 2, weeksToSign: 1, nearestLimitDays: 33, suppliers: 3 },
  { key: 'liege', region: 'be', cc: 'BE', plant: 'Liège', city: 'Liège', state: 'Liège', timeZone: 'Europe/Brussels', manager: 'Céline Dubois', contractors: 6, openJobs: 0, weeksToSign: 0, nearestLimitDays: 150, suppliers: 1 },
  { key: 'genk', region: 'be', cc: 'BE', plant: 'Genk', city: 'Genk', state: 'Limburg', timeZone: 'Europe/Brussels', manager: 'Bram Peeters', contractors: 5, openJobs: 1, weeksToSign: 1, nearestLimitDays: 210, suppliers: 2 },
  { key: 'belfast', region: 'ni', cc: 'NI', plant: 'Belfast', city: 'Belfast', state: 'Northern Ireland', timeZone: 'Europe/London', manager: "Ciarán O'Neill", contractors: 10, openJobs: 2, weeksToSign: 2, nearestLimitDays: 14, suppliers: 3 },
  { key: 'craigavon', region: 'ni', cc: 'NI', plant: 'Craigavon', city: 'Craigavon', state: 'Northern Ireland', timeZone: 'Europe/London', manager: 'Gemma Watterson', contractors: 7, openJobs: 1, weeksToSign: 0, nearestLimitDays: 70, suppliers: 2 },
  { key: 'newry', region: 'ni', cc: 'NI', plant: 'Newry', city: 'Newry', state: 'Northern Ireland', timeZone: 'Europe/London', manager: 'Declan Murtagh', contractors: 5, openJobs: 0, weeksToSign: 1, nearestLimitDays: 110, suppliers: 1 },
  { key: 'antrim', region: 'ni', cc: 'NI', plant: 'Antrim', city: 'Antrim', state: 'Northern Ireland', timeZone: 'Europe/London', manager: 'Rachel Gilmore', contractors: 6, openJobs: 1, weeksToSign: 0, nearestLimitDays: 200, suppliers: 2 },
]

/** The suppliers per country (the drawing's SUP), each with the person seated as its owner. */
export const CORVANE_SUPPLIERS: Readonly<Record<CountryKey, readonly { name: string; owner: string }[]>> = {
  US: [
    { name: 'Ridgeline Staffing', owner: 'Carla Benning' },
    { name: 'Harbor Industrial Labor', owner: 'Owen Pruitt' },
    { name: 'Keystone Crew Partners', owner: 'Denise Marlow' },
    { name: 'Lakemont Workforce', owner: 'Trevor Haskins' },
  ],
  MX: [
    { name: 'Grupo Talenta Norte', owner: 'Mariana Treviño' },
    { name: 'Servicios Especializados Ríos', owner: 'Ernesto Ríos' },
    { name: 'Plantel Industrial', owner: 'Gabriela Salinas' },
  ],
  BR: [
    { name: 'Apoio Temporários', owner: 'Renata Moura' },
    { name: 'Força Industrial Sul', owner: 'Gustavo Becker' },
    { name: 'Pessoal Campinas', owner: 'Patrícia Lopes' },
  ],
  CO: [
    { name: 'Andina Temporales', owner: 'Carolina Vélez' },
    { name: 'Talento Caribe', owner: 'Jaime Barros' },
  ],
  VN: [
    { name: 'Sao Mai Nhân Lực', owner: 'Trịnh Văn Quân' },
    { name: 'Việt Tâm Workforce', owner: 'Đinh Thị Hằng' },
    { name: 'Phương Nam Outsourcing', owner: 'Lý Minh Khang' },
  ],
  IN: [
    { name: 'Deccan Manpower Services', owner: 'Sanjay Deshpande' },
    { name: 'Shakti Contract Labour Co.', owner: 'Meenakshi Pillai' },
    { name: 'Kaveri Industrial Staffing', owner: 'Prakash Gowda' },
    { name: 'Sabarmati Workforce', owner: 'Bhavna Shah' },
  ],
  BE: [
    { name: 'Interim Vlaanderen', owner: 'Katrien Dewulf' },
    { name: 'Meuse Intérim', owner: 'Julien Renard' },
    { name: 'Kempen Uitzend', owner: 'Stijn Vermeulen' },
  ],
  NI: [
    { name: 'Lagan Recruitment', owner: 'Fiona Mulholland' },
    { name: 'Mourne Industrial Staff', owner: 'Eamon Magee' },
    { name: 'Bann Valley Agency', owner: 'Shauna Devlin' },
  ],
}

/** A country's name as a person reads it. */
export const COUNTRY_NAMES: Readonly<Record<CountryKey, string>> = {
  US: 'United States', MX: 'Mexico', BR: 'Brazil', CO: 'Colombia', VN: 'Vietnam', IN: 'India', BE: 'Belgium', NI: 'Northern Ireland',
}

/**
 * The jobs Corvane buys from outside: specialist work a packaging company
 * does not keep on its own payroll (founder, 2026-11-13). Plant work, not
 * IT ("horizontal, never vertical"), at a specialist's rate.
 */
export const CORVANE_JOBS = ['Controls engineer', 'Maintenance planner', 'Quality engineer', 'Automation technician', 'ERP analyst', 'Process engineer'] as const
export type CorvaneJob = (typeof CORVANE_JOBS)[number]

/** What the matcher reads for each job: the title's own skill first, then two a specialist holds. */
export const CORVANE_JOB_SKILLS: Readonly<Record<CorvaneJob, readonly string[]>> = {
  'Controls engineer': ['Controls engineering', 'PLC programming', 'SCADA'],
  'Maintenance planner': ['Maintenance planning', 'Reliability engineering', 'Work order scheduling'],
  'Quality engineer': ['Quality engineering', 'Root cause analysis', 'Statistical process control'],
  'Automation technician': ['Industrial automation', 'Robotics', 'PLC troubleshooting'],
  'ERP analyst': ['ERP configuration', 'Inventory planning', 'Plant reporting'],
  'Process engineer': ['Process engineering', 'Lean manufacturing', 'Line balancing'],
}

/**
 * The contractors' names per country: first and last parts, aligned so
 * that index i of each is the drawing's own name i (NAMES), and the
 * pairing below gives every contractor in a country a different name.
 * Extended past the drawing's lists where a country has more people.
 */
const NAME_PARTS: Readonly<Record<CountryKey, { first: string[]; last: string[] }>> = {
  US: { first: ['Tyler', 'Keisha', 'Brandon', 'Maria', 'Jordan', 'Ashley', 'Derek', 'Tanya'], last: ['Brooks', 'Monroe', 'Lee', 'Delgado', 'Price', 'Nguyen', 'Shaw', 'Ruiz'] },
  MX: { first: ['José', 'Lucía', 'Diego', 'Paola', 'Jorge', 'Karla'], last: ['Hernández', 'Morales', 'Ramírez', 'Cruz', 'Mendoza', 'Ibarra'] },
  BR: { first: ['Thiago', 'Juliana', 'Bruno', 'Larissa', 'Felipe', 'Camila'], last: ['Souza', 'Lima', 'Carvalho', 'Rocha', 'Araújo', 'Pires'] },
  CO: { first: ['Santiago', 'Valentina', 'Mateo', 'Laura', 'Sebastián'], last: ['Gómez', 'Ríos', 'Castaño', 'Ospina', 'Mejía'] },
  // Family name first, then the given names, the way the drawing writes them.
  VN: { first: ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Bùi', 'Đặng', 'Vũ', 'Ngô', 'Dương'], last: ['Văn An', 'Thị Hoa', 'Minh Tuấn', 'Thị Ngọc', 'Đức Long', 'Thị Thảo', 'Quang Huy', 'Thị Lan Anh', 'Văn Hải', 'Thị Thu'] },
  IN: { first: ['Suresh', 'Priya', 'Manoj', 'Anjali', 'Ravi', 'Pooja', 'Arun', 'Kavya', 'Vikas', 'Sneha', 'Rahul', 'Deepa'], last: ['Kumar', 'Iyer', 'Sharma', 'Verma', 'Shankar', 'Nair', 'Reddy', 'Joshi', 'Patil', 'Menon', 'Gupta', 'Rao'] },
  BE: { first: ['Wouter', 'Elise', 'Nathan', 'Sofie', 'Hugo', 'Lien', 'Thomas'], last: ['Janssens', 'Lambert', 'Claes', 'Wouters', 'Lemaire', 'Maes', 'Goossens'] },
  NI: { first: ['Conor', 'Aoife', 'Jamie', 'Niamh', 'Ryan', 'Ciara', 'Sean'], last: ['Quinn', 'Kelly', 'Patterson', 'Doherty', 'McCann', 'Hughes', 'Burns'] },
}

/**
 * The i-th contractor's name in a country. Index i below the list length
 * is the drawing's own name i; after that, first name i mod n with a last
 * name moved along by one each lap, so no two in a country repeat while
 * i < n × n.
 */
export function contractorName(cc: CountryKey, i: number): string {
  const { first, last } = NAME_PARTS[cc]
  const n = first.length
  if (i >= n * n) throw new Error(`${cc} has names for ${n * n} contractors; asked for number ${i + 1}.`)
  const a = i % n
  const lap = Math.floor(i / n)
  return `${first[a]} ${last[(a + lap) % n]}`
}

// ── Names a person never reads ───────────────────────────────────────

/** A name as an address-safe key: lower case, no accents, hyphens between words. */
export const addressSafe = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/** A supplier's slug after the world's prefix: `cv-ridgeline-staffing`. */
export function supplierSlug(name: string): string {
  return `cv-${addressSafe(name)}`
}

/** Every supplier's slug after the world's prefix, for the roster. */
export const CORVANE_SUPPLIER_SLUGS: readonly string[] = Object.values(CORVANE_SUPPLIERS).flatMap((l) => l.map((s) => supplierSlug(s.name)))

/** A seat's address at Corvane, by desk; the demo door reads them by role. */
export function corvaneSeatEmail(desk: string, domain: string): string {
  return desk === 'owner' ? `world-${CORVANE_SLUG}@${domain}` : `${CORVANE_EMAIL_PREFIX}${desk}@${domain}`
}

/** The five seats over the whole program, by desk key and role. */
export const CORVANE_PEOPLE = [
  { desk: 'owner', name: 'Graham Ellery', role: 'Owner' },
  // Not Ingrid: Teleworld's delivery manager is Ingrid Solberg and Northbend's held start is Ingrid Sørensen.
  { desk: 'operations', name: 'Astrid Berge', role: 'Head of Operations' },
  { desk: 'cfo', name: 'Margaret Osei', role: 'Chief Financial Officer' },
  { desk: 'ap', name: 'Lucas Fairbairn', role: 'AP Clerk' },
  { desk: 'compliance', name: 'Yvette Marchetti', role: 'Compliance Officer' },
] as const

/**
 * The three departments on Corvane's team structure (founder, 2026-11-09):
 * each with the desk that leads it and the desks that sit on it. Operations
 * holds the six regions. A department is a DEPARTMENT box, which narrows
 * nobody's reads, so the CFO and the head of operations keep reading the
 * whole program from it.
 */
export const CORVANE_OPERATIONS_UNIT = 'cv_unit_dept_operations'

/** A plant's place in its region, 1 first, in the order CORVANE_PLANTS lists them. */
export function plantPlace(p: Pick<CorvanePlant, 'key' | 'region'>): number {
  return CORVANE_PLANTS.filter((x) => x.region === p.region).findIndex((x) => x.key === p.key) + 1
}
export const CORVANE_DEPARTMENTS: readonly { unit: string; name: string; lead: string; members: readonly string[] }[] = [
  { unit: CORVANE_OPERATIONS_UNIT, name: 'Operations', lead: 'operations', members: [] },
  { unit: 'cv_unit_dept_finance', name: 'Finance', lead: 'cfo', members: ['ap'] },
  { unit: 'cv_unit_dept_compliance', name: 'Compliance', lead: 'compliance', members: [] },
]

// ── The plan: every contractor, worked out without a database ────────

/**
 * An earlier line for the same person at the same plant, through another
 * supplier, ending the day before the current line starts: no break, so
 * the time limit counts both as one stretch at Corvane.
 */
export interface EarlierLine {
  supplier: string
  /** Days from the world's day back to the earlier line's last day; the current line starts the day after. */
  endedDaysAgo: number
}

export interface PlannedContractor {
  /** `dayton_3`: the plant and the place in its list. */
  key: string
  plant: CorvanePlant
  index: number
  name: string
  job: CorvaneJob
  /** The supplier that employs them now. */
  supplier: string
  /** Days from the world's day back to their first day at Corvane, across every supplier. */
  startedDaysAgo: number
  /** Days from the world's day to the line's last day. */
  endsInDays: number
  state: 'IN_PROGRESS' | 'DRAFT'
  /** The one at this plant nearest the time limit. */
  nearest: boolean
  /** Where their time at Corvane began through another supplier; null for most. */
  earlier: EarlierLine | null
}

/** Days on site at which a person reaches the time limit (the block's own count). */
export const LIMIT_DAYS = daysFor(CORVANE_TIME_LIMIT_MONTHS)

/** The plant's suppliers: as many as the drawing says, turned by the plant's place in its country. */
export function plantSuppliers(plant: CorvanePlant): string[] {
  const list = CORVANE_SUPPLIERS[plant.cc].map((s) => s.name)
  const inCountry = CORVANE_PLANTS.filter((p) => p.cc === plant.cc).indexOf(plant)
  return Array.from({ length: plant.suppliers }, (_, j) => list[(inCountry + j) % list.length])
}

/**
 * Aoife Kelly at Belfast, the nearest anybody is to the time limit: her
 * time at Corvane began through another Belfast supplier, which her
 * current one took over with no day between them. This is how tenure
 * really runs past a limit unnoticed: each supplier's own count is short,
 * and only the client's count across both is the truth. Her earlier line
 * ended this many days before the world's day.
 */
export const BELFAST_HANDOVER_DAYS_AGO = 200

/**
 * Every contractor on site at every plant, the count the drawing gives,
 * and the one start on hold at Dayton.
 *
 * The second on each plant's list (`nearest`) started so that the limit
 * falls exactly `nearestLimitDays` from the world's day, and their line
 * ends that day. Everyone else started later, so their limit is at least
 * a month further off, and their line ends before it.
 */
export function corvaneContractors(): { onSite: PlannedContractor[]; onHold: PlannedContractor } {
  const used: Partial<Record<CountryKey, number>> = {}
  const onSite: PlannedContractor[] = []
  CORVANE_PLANTS.forEach((plant, p) => {
    const sups = plantSuppliers(plant)
    for (let i = 0; i < plant.contractors; i++) {
      const n = used[plant.cc] ?? 0
      used[plant.cc] = n + 1
      const nearest = i === 1
      const span = Math.max(30, LIMIT_DAYS - 1 - plant.nearestLimitDays - 60)
      const startedDaysAgo = nearest ? LIMIT_DAYS - 1 - plant.nearestLimitDays : 30 + ((i * 47 + p * 13) % span)
      const toOwnLimit = LIMIT_DAYS - 1 - startedDaysAgo
      const supplier = sups[i % sups.length]
      const handedOver = plant.key === 'belfast' && nearest
      onSite.push({
        key: `${plant.key}_${i}`, plant, index: i, name: contractorName(plant.cc, n),
        job: CORVANE_JOBS[(p + i) % CORVANE_JOBS.length], supplier,
        startedDaysAgo,
        endsInDays: nearest ? plant.nearestLimitDays : Math.min(toOwnLimit, 90 + ((i * 31 + p * 7) % 240)),
        state: 'IN_PROGRESS', nearest,
        earlier: handedOver ? { supplier: sups.find((s) => s !== supplier)!, endedDaysAgo: BELFAST_HANDOVER_DAYS_AGO } : null,
      })
    }
  })
  const dayton = CORVANE_PLANTS[0]
  const onHold: PlannedContractor = {
    key: `${dayton.key}_hold`, plant: dayton, index: dayton.contractors, name: contractorName('US', used.US ?? 0),
    job: 'Controls engineer', supplier: plantSuppliers(dayton)[0],
    startedDaysAgo: -5, endsInDays: 180, state: 'DRAFT', nearest: false, earlier: null,
  }
  return { onSite, onHold }
}

/** The worker's address: never read by a person, unique per plant and place. */
export function workerEmail(c: Pick<PlannedContractor, 'key'>, domain: string): string {
  return `${CORVANE_EMAIL_PREFIX}w-${c.key}@${domain}`
}

/**
 * A sell line's id. Its last six characters are `cv` and its place in the
 * plan, so no two lines share the tail an invoice number is cut from
 * (`sharedTails` in lib/seed-scale/kit). A world seeded before this
 * (2026-10-27, `cv_sell_<key>`) keeps the id it has; see the region step.
 */
export function corvaneSellId(c: Pick<PlannedContractor, 'key'>, place: number): string {
  return `cv_sell_${c.key}_cv${String(place).padStart(4, '0')}`
}

/** Every planned line in order, on site then on hold: a line's place is its index here. */
export function corvanePlaces(): PlannedContractor[] {
  const { onSite, onHold } = corvaneContractors()
  return [...onSite, onHold]
}

/**
 * The earlier lines' sell ids, placed after every current line so their
 * tails never meet one (`cv0360` and on).
 */
export function corvaneEarlierSellIds(): Map<string, string> {
  const places = corvanePlaces()
  const earlier = places.filter((c) => c.earlier)
  return new Map(earlier.map((c, i) => [c.key, corvaneSellId({ key: `${c.key}_before` }, places.length + i)]))
}

/** The hourly bill rate, in the site currency's minor units. */
export function billRateMinor(cc: CountryKey): number {
  const c = CORVANE_COUNTRIES[cc]
  return fromDecimal(c.rate, c.currency).minor
}
/** What the supplier pays its worker: four fifths of the bill rate, rounded to a minor unit. */
export function payRateMinor(cc: CountryKey): number {
  return Math.round(billRateMinor(cc) * 0.8)
}

/**
 * The rate band on a job, in minor units: ten dollars either side of the
 * specialist rate. US sites only, because a job request carries no
 * currency of its own and reads its band in the client's currency, which
 * is Corvane's dollars (`jobCurrencyOf` in app/api/requisitions); a band in
 * pesos or rupees stored there would read as dollars.
 */
export function jobBand(cc: CountryKey): { billMin: number; billMax: number } | null {
  if (cc !== 'US') return null
  const half = fromDecimal(10, CORVANE_COUNTRIES.US.currency).minor
  return { billMin: billRateMinor('US') - half, billMax: billRateMinor('US') + half }
}

/** How long an open job runs, and a filled one. */
export const OPEN_JOB_MONTHS = 6
export const FILLED_JOB_MONTHS = 12

/** A plant's open jobs, in the order they are seeded: `cv_req_open_<plant>_<j>`. */
export function plantOpenJobs(plant: CorvanePlant): { id: string; title: CorvaneJob; months: number }[] {
  const pi = CORVANE_PLANTS.filter((p) => p.region === plant.region).indexOf(plant)
  return Array.from({ length: plant.openJobs }, (_, j) => ({
    id: `cv_req_open_${plant.key}_${j}`,
    title: CORVANE_JOBS[(pi + j + 3) % CORVANE_JOBS.length],
    months: OPEN_JOB_MONTHS,
  }))
}

/**
 * The invoice receipts: one clean at the first plant of every region, and
 * at Dayton a second, billed 41.5 hours against 40 accepted, which the
 * three-way check holds. The weeks are the first contractor's two weeks
 * before last, signed by the plant's hiring manager. A receipt's total is
 * read by its currency's own minor unit (money, 53597f3f3): the dong has
 * none, so the Vietnamese receipt's total is 40 × the dong rate exactly.
 */
export const CORVANE_RECEIPTS: readonly { plant: string; week: number; billed: number; accepted: number; held: boolean }[] = [
  ...CORVANE_REGIONS
    .map((r) => ({ plant: CORVANE_PLANTS.find((p) => p.region === r.key)!.key, week: 3, billed: 40, accepted: 40, held: false })),
  { plant: 'dayton', week: 2, billed: 41.5, accepted: 40, held: true },
]

// ── What the home page's demo reads (2026-11-13) ─────────────────────

/** A contractor on site, as the demo's table shows one. */
export interface DemoContractor {
  name: string
  /** The site's name: "Dayton, Ohio", "Antwerp", "Belfast". */
  site: string
  city: string
  job: CorvaneJob
  supplier: string
  /** The hourly bill rate, in `currency`'s minor units. */
  rateMinor: number
  currency: string
  /** Whole months at Corvane across every supplier, never rounded up. */
  months: number
  /** Days until they reach the time limit. */
  daysToLimit: number
}

export interface CorvaneDemoFacts {
  company: string
  contractors: number
  suppliers: number
  sites: number
  countries: number
  limitMonths: number
  /** Three on site: one at Dayton, one at Antwerp, and Aoife Kelly at Belfast. */
  onSite: DemoContractor[]
  /** Aoife Kelly, the nearest anybody is to the time limit, and the two suppliers her time ran through. */
  nearest: DemoContractor & {
    /** Her time at Corvane in order, earliest first: supplier and days, with no day between them. */
    periods: { supplier: string; days: number }[]
  }
  /** One open job at Dayton, and how many approved suppliers the site sends it to. */
  openJob: {
    title: CorvaneJob
    site: string
    months: number
    band: { minMinor: number; maxMinor: number; currency: string } | null
    sentTo: number
    suppliers: string[]
  }
}

const daysToLimitOf = (c: PlannedContractor) => LIMIT_DAYS - 1 - c.startedDaysAgo

function demoRow(c: PlannedContractor): DemoContractor {
  return {
    name: c.name, site: c.plant.plant, city: c.plant.city, job: c.job, supplier: c.supplier,
    rateMinor: billRateMinor(c.plant.cc), currency: CORVANE_COUNTRIES[c.plant.cc].currency,
    // Days on site so far include today: the block reaches the limit on the LIMIT_DAYS-th.
    months: monthsOf(c.startedDaysAgo + 1), daysToLimit: daysToLimitOf(c),
  }
}

/**
 * Everything the home page's Ask Etyme demo shows about Corvane, read from
 * the plan the seed writes. Pure: no database, no dates, so a browser page
 * may import it. Every figure is a count from the world's day.
 */
export function corvaneDemoFacts(): CorvaneDemoFacts {
  const { onSite } = corvaneContractors()
  const at = (key: string, index: number) => onSite.find((c) => c.plant.key === key && c.index === index)!
  const aoife = onSite.find((c) => c.plant.key === 'belfast' && c.nearest)!
  const dayton = CORVANE_PLANTS[0]
  const job = plantOpenJobs(dayton)[0]
  const band = jobBand(dayton.cc)
  const total = aoife.startedDaysAgo + 1
  const before = aoife.earlier ? aoife.startedDaysAgo - aoife.earlier.endedDaysAgo + 1 : 0
  return {
    company: CORVANE_NAME,
    contractors: onSite.length,
    suppliers: Object.values(CORVANE_SUPPLIERS).reduce((n, l) => n + l.length, 0),
    sites: CORVANE_PLANTS.length,
    countries: new Set(CORVANE_PLANTS.map((p) => p.cc)).size,
    limitMonths: CORVANE_TIME_LIMIT_MONTHS,
    onSite: [demoRow(at('dayton', 0)), demoRow(at('antwerp', 0)), demoRow(aoife)],
    nearest: {
      ...demoRow(aoife),
      periods: aoife.earlier
        ? [{ supplier: aoife.earlier.supplier, days: before }, { supplier: aoife.supplier, days: total - before }]
        : [{ supplier: aoife.supplier, days: total }],
    },
    openJob: {
      title: job.title, site: dayton.plant, months: job.months,
      band: band ? { minMinor: band.billMin, maxMinor: band.billMax, currency: CORVANE_COUNTRIES[dayton.cc].currency } : null,
      sentTo: plantSuppliers(dayton).length, suppliers: plantSuppliers(dayton),
    },
  }
}
