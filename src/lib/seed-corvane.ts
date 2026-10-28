/**
 * Corvane Packaging: the fourth client program, a plant company in eight
 * countries.
 *
 * ── Why it exists ────────────────────────────────────────────────────
 *
 * The founder, 2026-10-27, "go ahead and build this", on the region map
 * (https://claude.ai/artifact/52bAUEWcdtehZHJw2r8kmo): the only picture
 * of the whole product at once is a company's every contractor and
 * supplier across every country, read by three seats at three altitudes
 * (CFO, regional manager, hiring manager). The three programs seeded so
 * far are one site each. So this one is the drawing, as data: 31 plants
 * in the US, Mexico, Brazil, Colombia, Vietnam, India, Belgium and
 * Northern Ireland, grouped in six regions, with the drawing's own names
 * and counts (`CORVANE_PLANTS` is its HM array, row for row).
 *
 * ── What is seeded, and what is not ──────────────────────────────────
 *
 * Seeded: the plants as sites with country, time zone and region; a
 * REGION org unit per region with a SITE unit per plant under it; the
 * owner, head of operations, CFO, AP clerk, compliance officer, six
 * regional managers (each seated on their region's unit, so each reads
 * only that region: lib/region-scope) and 31 hiring managers (one per
 * plant); 25 suppliers with an agreement and an order header each; every
 * plant's contractors on site at the drawing's count, at the site's own
 * rate in the site's own currency; the drawing's open jobs and weeks to
 * sign; the nearest time limit at each plant, against an 18-month limit;
 * seven invoice receipts, one held over the hours at Dayton; one start
 * on hold for papers at Dayton.
 *
 * Not seeded, on purpose: matches, interviews and hires (the drawing
 * derives them; nothing here would stand behind them), due-date cycles,
 * and any paper or rule outside the US. A country's rule is regulatory's
 * and shown only once confirmed (lib/document-stages/countries); India's
 * is unconfirmed, so nothing here claims an Indian paper or rule. US
 * workers have an I-9 backed by a passport and a background check,
 * because nobody starts without one.
 *
 * ── Currency ─────────────────────────────────────────────────────────
 *
 * Every rate and receipt is in the site's own currency, in its minor
 * units by ISO 4217 (`fromDecimal` in lib/money: a dong has none). Nothing
 * is converted: one currency for the rollup is money's to compute.
 *
 * ── Fitting the steps ────────────────────────────────────────────────
 *
 * Three hundred and seventy people, written one row at a time, would be
 * thousands of queries; a step may make 350. So every row here has an id
 * of its own made from what it is (`cv_buy_dayton_3`), is written by
 * `createMany` with duplicates skipped, and a second seeding writes
 * nothing. People are read back by address, because a person is the one
 * row another seed could have made first.
 *
 * Corvane's slugs are on the world's roster for the rebuild and the
 * sweep (`WORLD_SLUGS`) and off the roster the base steps walk, so a
 * re-seed of those steps never sweeps these rows into their stories.
 */

import { prisma as db } from '@/lib/db'
import { day, seedWeek, signingDays } from '@/lib/seed-days'
import { daysFor } from '@/lib/tenure-days'
import { fromDecimal, minorPerUnit } from '@/lib/money'
import { rolesFor } from '@/lib/company-defaults'
import { ownSeatGrantReason } from '@/lib/own-seat'
import { orderNumbers, orderNumberAttempt, headerWindow, ORDER_RHYTHM } from '@/lib/award'
import { REGION_UNIT_KIND, SITE_UNIT_KIND } from '@/lib/region-scope'
import { periodFor } from '@/lib/periods'
import { ORDER_HEADER_SELECT, periodTermsFor, termsFor } from '@/lib/money/order-terms'
import { dueOn } from '@/lib/billing-cascade'
import { postAssertion } from '@/lib/order-postings'
import { bookPostings } from '@/lib/seed-order-to-cash'
import { planCyclesFor, DEMO_MONTHLY_PAY } from '@/lib/contract-cycles'
import { policyFrom } from '@/lib/cycle-shift'

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

/** Each country's currency and the hourly rate the drawing bills at, in whole units. */
export const CORVANE_COUNTRIES: Readonly<Record<CountryKey, { iso: string; currency: string; rate: number }>> = {
  US: { iso: 'US', currency: 'USD', rate: 28 },
  MX: { iso: 'MX', currency: 'MXN', rate: 95 },
  BR: { iso: 'BR', currency: 'BRL', rate: 42 },
  CO: { iso: 'CO', currency: 'COP', rate: 32000 },
  VN: { iso: 'VN', currency: 'VND', rate: 75000 },
  IN: { iso: 'IN', currency: 'INR', rate: 420 },
  BE: { iso: 'BE', currency: 'EUR', rate: 31 },
  NI: { iso: 'GB', currency: 'GBP', rate: 16 },
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

/** The drawing's JOBS: plant work, not IT ("horizontal, never vertical"). */
export const CORVANE_JOBS = ['Line operator', 'Forklift driver', 'Maintenance technician', 'Quality inspector', 'Packing lead', 'Machine setter'] as const

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

const ascii = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/** A supplier's slug after the world's prefix: `cv-ridgeline-staffing`. */
export function supplierSlug(name: string): string {
  return `cv-${ascii(name)}`
}

/** Every supplier's slug after the world's prefix, for the roster. */
export const CORVANE_SUPPLIER_SLUGS: readonly string[] = Object.values(CORVANE_SUPPLIERS).flatMap((l) => l.map((s) => supplierSlug(s.name)))

const regionOf = (key: RegionKey) => CORVANE_REGIONS.find((r) => r.key === key)!

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

// ── The plan: every contractor, worked out without a database ────────

export interface PlannedContractor {
  /** `dayton_3`: the plant and the place in its list. */
  key: string
  plant: CorvanePlant
  index: number
  name: string
  job: (typeof CORVANE_JOBS)[number]
  /** The supplier that employs them. */
  supplier: string
  startedDaysAgo: number
  /** Days from the world's day to the line's last day. */
  endsInDays: number
  state: 'IN_PROGRESS' | 'DRAFT'
  /** The one at this plant nearest the time limit. */
  nearest: boolean
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
      onSite.push({
        key: `${plant.key}_${i}`, plant, index: i, name: contractorName(plant.cc, n),
        job: CORVANE_JOBS[(p + i) % CORVANE_JOBS.length], supplier: sups[i % sups.length],
        startedDaysAgo,
        endsInDays: nearest ? plant.nearestLimitDays : Math.min(toOwnLimit, 90 + ((i * 31 + p * 7) % 240)),
        state: 'IN_PROGRESS', nearest,
      })
    }
  })
  const dayton = CORVANE_PLANTS[0]
  const onHold: PlannedContractor = {
    key: `${dayton.key}_hold`, plant: dayton, index: dayton.contractors, name: contractorName('US', used.US ?? 0),
    job: 'Maintenance technician', supplier: plantSuppliers(dayton)[0],
    startedDaysAgo: -5, endsInDays: 180, state: 'DRAFT', nearest: false,
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
 * The invoice receipts: one clean at the first plant of every region, and
 * at Dayton a second, billed 41.5 hours against 40 accepted, which the
 * three-way check holds. The weeks are the first contractor's two weeks
 * before last, signed by the plant's hiring manager. A receipt's total is
 * read by its currency's own minor unit (money, 53597f3f3), so the dong's
 * reads 3,000,000 on the header and on the line.
 */
export const CORVANE_RECEIPTS: readonly { plant: string; week: number; billed: number; accepted: number; held: boolean }[] = [
  ...CORVANE_REGIONS
    .map((r) => ({ plant: CORVANE_PLANTS.find((p) => p.region === r.key)!.key, week: 3, billed: 40, accepted: 40, held: false })),
  { plant: 'dayton', week: 2, billed: 41.5, accepted: 40, held: true },
]

// ── The steps ────────────────────────────────────────────────────────

/** The world steps this file runs, in order. Each fits one call. */
export function corvaneSteps(): string[] {
  return ['corvane:frame', 'corvane:suppliers', ...CORVANE_REGIONS.map((r) => `corvane:plants:${r.key}`)]
}

interface Ctx { domain: string; prefix: string }

const uniq = <T,>(xs: readonly T[]) => [...new Set(xs)]

export async function seedCorvane(ctx: Ctx, step: string): Promise<void> {
  if (step === 'corvane:frame') return frame(ctx)
  if (step === 'corvane:suppliers') return suppliers(ctx)
  const region = step.replace('corvane:plants:', '') as RegionKey
  if (!CORVANE_REGIONS.some((r) => r.key === region)) throw new Error(`No Corvane step called ${step}.`)
  return plants(ctx, region)
}

/** Corvane's company, or a sentence saying the frame has not run. */
async function corvane(ctx: Ctx) {
  const c = await db.company.findUnique({ where: { slug: ctx.prefix + CORVANE_SLUG }, select: { id: true } })
  if (!c) throw new Error('Corvane Packaging is not seeded yet: corvane:frame runs first.')
  return c
}

/** People by address, written where missing, read back by address. */
async function people(rows: { email: string; name: string }[]): Promise<Map<string, string>> {
  await db.person.createMany({ data: rows.map((r) => ({ name: r.name, primaryEmail: r.email })), skipDuplicates: true })
  const found = await db.person.findMany({ where: { primaryEmail: { in: rows.map((r) => r.email) } }, select: { id: true, primaryEmail: true } })
  return new Map(found.map((p) => [p.primaryEmail, p.id]))
}

// ── 1. The company, its rules, its regions, plants and seats ─────────

async function frame(ctx: Ctx): Promise<void> {
  const slug = ctx.prefix + CORVANE_SLUG
  const co = await db.company.upsert({
    where: { slug },
    update: { name: CORVANE_NAME, kind: 'CLIENT' },
    create: {
      slug, name: CORVANE_NAME, kind: 'CLIENT', currency: 'USD', country: 'US', defaultPaymentTerms: 45,
      // The world's day, like every other seeded firm; and held by somebody
      // from the start, so the sweep at the end has nothing to claim.
      createdAt: day(0), claimedAt: day(0), isDemo: false,
    },
    select: { id: true },
  })

  // The roles a client starts with, and three of Corvane's own.
  const base = rolesFor('CLIENT')
  const perms = (name: string) => base.find((r) => r.name === name)?.permissions ?? []
  const own: { name: string; permissions: string[] }[] = [
    // Reads the program, its rates and its receipts; every read narrowed to
    // the region the seat sits on (lib/region-scope).
    { name: 'Regional Manager', permissions: uniq([...perms('Viewer'), 'rates.read', 'invoices.read']) },
    { name: 'Head of Operations', permissions: [...perms('Program Manager')] },
    // Reads the whole program and its money; pays nothing.
    { name: 'Chief Financial Officer', permissions: uniq([...perms('Viewer'), ...perms('AP Clerk')]).filter((p) => p !== 'payments.record') },
  ]
  const roles = [...base.map((r) => ({ name: r.name, permissions: r.permissions as string[], isDefault: Boolean(r.isOwner) })), ...own.map((r) => ({ ...r, isDefault: false }))]
  const have = await db.role.findMany({ where: { companyId: co.id }, select: { id: true, name: true } })
  await db.role.createMany({
    data: roles.filter((r) => !have.some((h) => h.name === r.name)).map((r) => ({ companyId: co.id, name: r.name, permissions: r.permissions, isDefault: r.isDefault })),
  })
  const roleId = new Map((await db.role.findMany({ where: { companyId: co.id }, select: { id: true, name: true } })).map((r) => [r.name, r.id]))

  // A unit per region, and one per plant under it.
  await db.orgUnit.createMany({
    data: CORVANE_REGIONS.map((r) => ({ id: `cv_unit_region_${r.key}`, companyId: co.id, name: r.label, kind: REGION_UNIT_KIND })),
    skipDuplicates: true,
  })
  await db.orgUnit.createMany({
    data: CORVANE_PLANTS.map((p) => ({ id: `cv_unit_site_${p.key}`, companyId: co.id, name: p.plant, kind: SITE_UNIT_KIND, parentId: `cv_unit_region_${p.region}` })),
    skipDuplicates: true,
  })

  // A site per plant: its country, time zone and region.
  await db.companyLocation.createMany({
    data: CORVANE_PLANTS.map((p, i) => ({
      id: `cv_site_${p.key}`, companyId: co.id, name: p.plant, city: p.city, state: p.state,
      country: CORVANE_COUNTRIES[p.cc].iso, timeZone: p.timeZone, region: regionOf(p.region).label, isPrimary: i === 0,
      // Found in the contractor list, as the Sites screen says (2026-10-28).
      source: 'IMPORT' as const, recordedAt: day(-1),
    })),
    skipDuplicates: true,
  })
  // A world seeded before sites said where they came from.
  await db.companyLocation.updateMany({
    where: { companyId: co.id, id: { in: CORVANE_PLANTS.map((p) => `cv_site_${p.key}`) }, source: 'PERSON', recordedById: null },
    data: { source: 'IMPORT', recordedAt: day(-1) },
  })

  // The seats: five over the whole program, six over a region, one per plant.
  const seats: { email: string; name: string; role: string; unit: string | null; key: string }[] = [
    ...CORVANE_PEOPLE.map((s) => ({ email: corvaneSeatEmail(s.desk, ctx.domain), name: s.name, role: s.role, unit: null, key: s.desk })),
    ...CORVANE_REGIONS.map((r) => ({ email: corvaneSeatEmail(`region-${r.key}`, ctx.domain), name: r.lead, role: 'Regional Manager', unit: `cv_unit_region_${r.key}`, key: `region_${r.key}` })),
    ...CORVANE_PLANTS.map((p) => ({ email: corvaneSeatEmail(`hiring-${p.key}`, ctx.domain), name: p.manager, role: 'Hiring Manager', unit: `cv_unit_site_${p.key}`, key: `hiring_${p.key}` })),
  ]
  const ids = await people(seats)
  await db.context.createMany({
    data: seats.map((s) => ({
      id: `cv_ctx_${s.key}`, personId: ids.get(s.email)!, companyId: co.id, roleId: roleId.get(s.role)!,
      type: 'EMPLOYEE' as const, side: 'BUY', orgUnitId: s.unit, grantReason: `Seeded program, Corvane Packaging — ${s.role}`,
      // The owner first: the demo door with no desk asked opens the earliest seat.
      grantedAt: s.key === 'owner' ? day(-500) : day(-400),
    })),
    skipDuplicates: true,
  })

  // The time limit, across every supplier, and the break before coming back.
  const policy =
    (await db.governancePolicy.findFirst({ where: { companyId: co.id, isActive: true } })) ??
    (await db.governancePolicy.create({
      data: { companyId: co.id, name: 'Contingent workforce policy', description: 'How long a contractor may work at a Corvane plant, across every supplier.' },
    }))
  const rules = [
    { ruleType: 'TENURE_CAP', enforcementMode: 'BLOCK', parameters: { maxMonths: CORVANE_TIME_LIMIT_MONTHS },
      description: `Nobody works at a Corvane plant more than ${CORVANE_TIME_LIMIT_MONTHS} months, across every supplier.`, ownerTeam: 'HR' },
    { ruleType: 'BREAK_IN_SERVICE', enforcementMode: 'BLOCK', parameters: { breakDays: 90 },
      description: '90 days out before coming back on contract.', ownerTeam: 'HR' },
  ]
  for (const r of rules) {
    if (await db.governanceRule.findFirst({ where: { policyId: policy.id, ruleType: r.ruleType as never } })) continue
    await db.governanceRule.create({ data: { policyId: policy.id, ...r } as never })
  }
}

// ── 2. The suppliers, each with an agreement and an order ────────────

async function suppliers(ctx: Ctx): Promise<void> {
  const co = await corvane(ctx)
  const all = (Object.entries(CORVANE_SUPPLIERS) as [CountryKey, readonly { name: string; owner: string }[]][])
    .flatMap(([cc, list]) => list.map((s) => ({ ...s, cc, slug: supplierSlug(s.name) })))

  for (const s of all) {
    const c = CORVANE_COUNTRIES[s.cc]
    await db.company.upsert({
      where: { slug: ctx.prefix + s.slug },
      // Its books are kept in its own country's currency (JournalLine is in the home currency).
      update: { name: s.name, kind: 'VENDOR', homeCurrency: c.currency },
      create: {
        slug: ctx.prefix + s.slug, name: s.name, kind: 'VENDOR', currency: c.currency, homeCurrency: c.currency, country: c.iso,
        defaultPaymentTerms: 30, createdAt: day(0), claimedAt: day(0), isDemo: false,
      },
    })
  }
  const firm = new Map(
    (await db.company.findMany({ where: { slug: { in: all.map((s) => ctx.prefix + s.slug) } }, select: { id: true, slug: true } }))
      .map((c) => [c.slug.slice(ctx.prefix.length), c.id])
  )

  // An Owner at each, seated.
  await db.role.createMany({
    data: all.map((s) => ({ id: `cv_role_owner_${s.slug}`, companyId: firm.get(s.slug)!, name: 'Owner', permissions: ['*'], isDefault: true })),
    skipDuplicates: true,
  })
  const owners = await people(all.map((s) => ({ email: `${ctx.prefix}${s.slug}@${ctx.domain}`, name: s.owner })))
  const ownerOf = (slug: string) => owners.get(`${ctx.prefix}${slug}@${ctx.domain}`)!
  await db.context.createMany({
    data: all.map((s) => ({
      id: `cv_ctx_owner_${s.slug}`, personId: ownerOf(s.slug), companyId: firm.get(s.slug)!, roleId: `cv_role_owner_${s.slug}`,
      type: 'EMPLOYEE' as const, grantReason: 'Seeded world',
    })),
    skipDuplicates: true,
  })

  // Who trades with whom, both registers.
  await db.counterparty.createMany({
    data: all.flatMap((s) => [
      { companyId: co.id, otherCompanyId: firm.get(s.slug)!, relationship: 'SUPPLIER' },
      { companyId: firm.get(s.slug)!, otherCompanyId: co.id, relationship: 'CLIENT' },
    ]),
    skipDuplicates: true,
  })

  // The agreement, the engagement under it, and the order header the lines hang on.
  await db.masterAgreement.createMany({
    data: all.map((s) => ({ id: `cv_msa_${s.slug}`, vendorId: firm.get(s.slug)!, clientId: co.id, paymentTerms: 45, currency: CORVANE_COUNTRIES[s.cc].currency, signedAt: day(-600) })),
    skipDuplicates: true,
  })
  await db.engagement.createMany({
    data: all.map((s) => ({ id: `cv_eng_${s.slug}`, msaId: `cv_msa_${s.slug}`, title: `${CORVANE_NAME} — ${COUNTRY_NAMES[s.cc]} plants`, invoiceCycle: 'MONTHLY' })),
    skipDuplicates: true,
  })

  // One header per supplier, its ceiling forty hours a week over every
  // line it carries, in the supplier's currency. Numbered by the award's
  // own rule, so a number reads like any other order's.
  const { onSite, onHold } = corvaneContractors()
  const taken = new Set((await db.workOrder.findMany({ where: { issuedById: co.id }, select: { number: true } })).map((w) => w.number))
  const headers = all.flatMap((s) => {
    const lines = [...onSite, onHold].filter((c) => supplierSlug(c.supplier) === s.slug)
    if (lines.length === 0) return []
    const starts = lines.map((c) => day(-c.startedDaysAgo).getTime())
    const ends = lines.map((c) => day(c.endsInDays).getTime())
    const start = new Date(Math.min(...starts)), end = new Date(Math.max(...ends))
    const minor = lines.reduce((n, c) => n + billRateMinor(c.plant.cc) * 40 * Math.ceil((c.endsInDays + c.startedDaysAgo + 1) / 7), 0)
    const currency = CORVANE_COUNTRIES[s.cc].currency
    const base = orderNumbers({ buyerId: co.id, sellerId: firm.get(s.slug)!, on: start })
    let n = 1
    while (taken.has(orderNumberAttempt(base.number, n)) && n < 50) n++
    const number = orderNumberAttempt(base.number, n)
    taken.add(number)
    const window = headerWindow({ start, end })
    return [{
      id: `cv_wo_${s.slug}`, number, sellerNumber: base.sellerNumber, title: `Contingent staffing — ${s.name}`,
      issuedById: co.id, issuedToId: firm.get(s.slug)!, recordedById: co.id, billToId: co.id, payerId: co.id,
      amount: minor / minorPerUnit(currency), currency, billingBasis: 'TIME',
      billFrequency: ORDER_RHYTHM.billFrequency, billAnchor: ORDER_RHYTHM.billAnchor, billStraddle: ORDER_RHYTHM.billStraddle,
      paymentTerms: 45, msaId: `cv_msa_${s.slug}`, engagementId: `cv_eng_${s.slug}`, status: 'OPEN',
      startDate: window.startDate, endDate: window.endDate,
    }]
  })
  // A header already written keeps its number; only new ones are added.
  const written = new Set((await db.workOrder.findMany({ where: { id: { in: headers.map((h) => h.id) } }, select: { id: true } })).map((w) => w.id))
  await db.workOrder.createMany({ data: headers.filter((h) => !written.has(h.id)) as never, skipDuplicates: true })

  // What each order asks its supplier for (lib/document-requirements reads
  // these as the order's set). A US order asks what every client program
  // asks; an order abroad asks only the supplier's own papers, because an
  // I-9 is a US form and no country's rule abroad is seeded until
  // regulatory confirms it (lib/document-stages/countries).
  const SUPPLIER_PAPERS: { key: string; owedBy: string }[] = [
    { key: 'INSURANCE_GL', owedBy: 'SUPPLIER' }, { key: 'INSURANCE_WC', owedBy: 'SUPPLIER' },
    { key: 'GOOD_STANDING', owedBy: 'SUPPLIER' }, { key: 'MSA', owedBy: 'SUPPLIER' },
  ]
  const US_PAPERS = [{ key: 'I9_EVERIFY', owedBy: 'WORKER' }, { key: 'BACKGROUND_CHECK', owedBy: 'US' }, ...SUPPLIER_PAPERS]
  await db.documentRequirement.createMany({
    data: all.flatMap((s) => headers.some((h) => h.id === `cv_wo_${s.slug}`)
      ? (s.cc === 'US' ? US_PAPERS : SUPPLIER_PAPERS).map((a) => ({
          id: `cv_docreq_${s.slug}_${a.key.toLowerCase()}`, workOrderId: `cv_wo_${s.slug}`,
          documentTypeKey: a.key, required: true, owedBy: a.owedBy as never, createdAt: day(-600),
        }))
      : []),
    skipDuplicates: true,
  })
}

// ── 3. A region's plants: their people, jobs, weeks and receipts ─────

async function plants(ctx: Ctx, region: RegionKey): Promise<void> {
  const co = await corvane(ctx)
  const here = CORVANE_PLANTS.filter((p) => p.region === region)
  const places = corvanePlaces()
  const workers = places.filter((c) => c.plant.region === region)
  // A line's id: the one it already has where a world was seeded with the
  // first form, else the one whose tail is unique (corvaneSellId).
  const oldId = (w: PlannedContractor) => `cv_sell_${w.key}`
  const had = new Set((await db.sellContract.findMany({ where: { id: { in: workers.map(oldId) } }, select: { id: true } })).map((r) => r.id))
  const sid = (w: PlannedContractor) => (had.has(oldId(w)) ? oldId(w) : corvaneSellId(w, places.indexOf(w)))

  const supplierIds = new Map(
    (await db.company.findMany({ where: { slug: { in: uniq(workers.map((w) => ctx.prefix + supplierSlug(w.supplier))) } }, select: { id: true, slug: true } }))
      .map((c) => [c.slug.slice(ctx.prefix.length), c.id])
  )
  const seatIds = await db.person.findMany({
    where: { primaryEmail: { in: [
      ...here.map((p) => corvaneSeatEmail(`hiring-${p.key}`, ctx.domain)),
      corvaneSeatEmail('compliance', ctx.domain),
      ...uniq(workers.map((w) => `${ctx.prefix}${supplierSlug(w.supplier)}@${ctx.domain}`)),
    ] } },
    select: { id: true, primaryEmail: true },
  })
  const seat = new Map(seatIds.map((p) => [p.primaryEmail, p.id]))
  const manager = (p: CorvanePlant) => seat.get(corvaneSeatEmail(`hiring-${p.key}`, ctx.domain))!
  const ownerOf = (supplier: string) => seat.get(`${ctx.prefix}${supplierSlug(supplier)}@${ctx.domain}`)!
  const compliance = seat.get(corvaneSeatEmail('compliance', ctx.domain))!

  // The workers, each their own seat (lib/own-seat), as the sign-in door would give them.
  const ids = await people(workers.map((w) => ({ email: workerEmail(w, ctx.domain), name: w.name })))
  const who = (w: PlannedContractor) => ids.get(workerEmail(w, ctx.domain))!
  await db.context.createMany({
    data: workers.map((w) => ({ id: `cv_ctx_w_${w.key}`, personId: who(w), type: 'CONSULTANT' as const, grantReason: ownSeatGrantReason('on a placement') })),
    skipDuplicates: true,
  })

  // The job requests: one filled per job a plant has people on, and its open ones.
  const filled = uniq(workers.map((w) => `${w.plant.key}|${w.job}`))
  const band = (p: CorvanePlant) => (p.cc === 'US' ? { billMin: billRateMinor('US') - 300, billMax: billRateMinor('US') + 300 } : {})
  await db.requirement.createMany({
    data: [
      ...filled.map((k) => {
        const [key, job] = k.split('|')
        const p = here.find((x) => x.key === key)!
        return {
          id: `cv_req_${key}_${CORVANE_JOBS.indexOf(job as never)}`, companyId: co.id, title: job, skills: [job], location: p.plant, locationId: `cv_site_${key}`,
          status: 'FILLED', approvalState: 'AUTO_APPROVED', source: 'MANUAL', hoursPerWeek: 40, months: 12,
          headcount: workers.filter((w) => w.plant.key === key && w.job === job).length,
          raisedById: manager(p), ownerId: manager(p), orgUnitId: `cv_unit_site_${key}`, ...band(p),
        }
      }),
      ...here.flatMap((p, pi) => Array.from({ length: p.openJobs }, (_, j) => {
        const job = CORVANE_JOBS[(pi + j + 3) % CORVANE_JOBS.length]
        return {
          id: `cv_req_open_${p.key}_${j}`, companyId: co.id, title: job, skills: [job], location: p.plant, locationId: `cv_site_${p.key}`,
          status: 'OPEN', approvalState: 'AUTO_APPROVED', source: 'MANUAL', hoursPerWeek: 40, months: 6, headcount: 1,
          neededBy: day(21), startDate: day(21), raisedById: manager(p), ownerId: manager(p), reportsToId: manager(p),
          workMode: 'ONSITE', orgUnitId: `cv_unit_site_${p.key}`, ...band(p),
          description: `${job} at the ${p.plant} plant, on the floor, on the plant's shifts.`,
        }
      })),
    ] as never,
    skipDuplicates: true,
  })
  // A world seeded before jobs named their site (2026-10-28) gets the site
  // on its jobs here; one write per plant, and none once they carry it.
  for (const p of here) {
    await db.requirement.updateMany({
      where: { companyId: co.id, orgUnitId: `cv_unit_site_${p.key}`, locationId: null },
      data: { locationId: `cv_site_${p.key}` },
    })
  }

  // The suppliers each plant names (Settings → Sites), from the contractor
  // list like the plants themselves: the drawing's `plantSuppliers`, so
  // Dayton names Ridgeline, Harbor and Keystone and not Lakemont. Every
  // one has an agreement with Corvane, which is what approves it. The
  // plant's hiring manager is not written: the jobs they posted at the
  // site say who hires there (lib/site-rules).
  const named = uniq(here.flatMap((p) => plantSuppliers(p)))
  const firmIds = new Map(
    (await db.company.findMany({ where: { slug: { in: named.map((n) => ctx.prefix + supplierSlug(n)) } }, select: { id: true, slug: true } }))
      .map((c) => [c.slug.slice(ctx.prefix.length), c.id])
  )
  await db.siteSupplier.createMany({
    data: here.flatMap((p) => plantSuppliers(p).map((n) => ({
      id: `cv_sitesup_${p.key}_${supplierSlug(n)}`, locationId: `cv_site_${p.key}`, supplierCompanyId: firmIds.get(supplierSlug(n))!,
      source: 'IMPORT' as const, namedAt: day(-1),
    }))),
    skipDuplicates: true,
  })

  // One line each way: the supplier bills Corvane, and employs the worker.
  const lines = workers.map((w) => {
    const sup = supplierSlug(w.supplier)
    const c = CORVANE_COUNTRIES[w.plant.cc]
    return { w, sup, supplierId: supplierIds.get(sup)!, currency: c.currency, start: day(-w.startedDaysAgo), end: day(w.endsInDays) }
  })
  await db.sellContract.createMany({
    data: lines.map(({ w, sup, supplierId, currency, start, end }) => ({
      id: sid(w), companyId: supplierId, clientCompanyId: co.id, endClientCompanyId: co.id, personId: who(w),
      requirementId: `cv_req_${w.plant.key}_${CORVANE_JOBS.indexOf(w.job)}`, engagementId: `cv_eng_${sup}`, msaId: `cv_msa_${sup}`,
      workOrderId: `cv_wo_${sup}`, hiringManagerId: manager(w.plant), orgUnitId: `cv_unit_site_${w.plant.key}`,
      workLocationId: `cv_site_${w.plant.key}`, billRate: billRateMinor(w.plant.cc), billCurrency: currency,
      paymentTerms: 45, state: w.state, startDate: start, endDate: end,
    })),
    skipDuplicates: true,
  })
  await db.buyContract.createMany({
    data: lines.map(({ w, supplierId, currency, start, end }) => ({
      id: `cv_buy_${w.key}`, companyId: supplierId, vendorCompanyId: null, payCurrency: currency,
      // A W2 is a US employer's form. Elsewhere the worker is on a fixed-term
      // contract with the supplier; which kind each country's law names is
      // regulatory's, and this is the general one.
      contractType: w.plant.cc === 'US' ? 'W2' as const : 'FIXED_TERM' as const,
      state: w.state, startDate: start, endDate: end,
    })),
    skipDuplicates: true,
  })
  await db.buyContractCandidate.createMany({
    data: lines.map(({ w, currency, start, end }) => ({ id: `cv_cand_${w.key}`, buyContractId: `cv_buy_${w.key}`, personId: who(w), payRate: payRateMinor(w.plant.cc), payCurrency: currency, startDate: start, endDate: end })),
    skipDuplicates: true,
  })
  await db.contractLink.createMany({
    data: lines.map(({ w, start, end }) => ({ id: `cv_link_${w.key}`, sellContractId: sid(w), buyContractId: `cv_buy_${w.key}`, effectiveFrom: start, effectiveTo: end })),
    skipDuplicates: true,
  })

  // Due dates on both sides, through money's own planner (lib/contract-cycles),
  // as the other programs write them: the seeds' pack and the demo's monthly
  // pay, the shipped weekend rule, no company payroll. A line that already
  // has its dates is left as it is, so a second seeding writes nothing.
  //
  // Pay dates only from the world's day on. No payroll was ever run for
  // Corvane's suppliers' workers on the record, so a pay date before the
  // world was born is neither paid (nothing says it was) nor owed today
  // (seeded-worker-pay): it is not written. The base world runs real
  // payroll over its own workers' past periods (lib/seed-payroll-runs);
  // doing that for 359 lines in seven currencies is money's to price.
  // A world seeded before this rule loses its undone past pay dates here,
  // once. The bill side keeps its whole series.
  const PAY_KINDS = ['SALARY_CALCULATE', 'SALARY_PAY'] // as lib/contract-cycles names them
  const born = day(0)
  await db.cycle.deleteMany({
    where: { buyContractId: { in: workers.map((w) => `cv_buy_${w.key}`) }, kind: { in: PAY_KINDS as never }, dueOn: { lt: born }, completedAt: null },
  })
  const dated = new Set((await db.cycle.findMany({
    where: { sellContractId: { in: workers.map(sid) } }, select: { sellContractId: true }, distinct: ['sellContractId'],
  })).map((c) => c.sellContractId))
  const cycles: Awaited<ReturnType<typeof planCyclesFor>>['rows'] = []
  for (const { w, start, end } of lines) {
    if (dated.has(sid(w))) continue
    const planned = await planCyclesFor(db, {
      sell: { id: sid(w), startDate: start, endDate: end, workOrder: null },
      buy: { id: `cv_buy_${w.key}`, contractType: w.plant.cc === 'US' ? 'W2' : 'FIXED_TERM', vendorCompanyId: null },
      packId: 'US_IT', pay: DEMO_MONTHLY_PAY, policy: policyFrom(null), payroll: null,
    })
    cycles.push(...planned.rows.filter((c) => !('buyContractId' in c && PAY_KINDS.includes(c.kind) && c.dueOn < born)))
  }
  if (cycles.length) await db.cycle.createMany({ data: cycles })

  // ── Weeks: last week filed and not signed, at the drawing's count ──
  const live = workers.filter((w) => w.state === 'IN_PROGRESS')
  const toSign = here.flatMap((p) => live.filter((w) => w.plant.key === p.key).slice(0, p.weeksToSign))
  const last = seedWeek(1, 40)
  const totalOf = (d: Record<string, number>) => Object.values(d).reduce((a, b) => a + b, 0)
  // ── And signed weeks behind each receipt ──
  const receipts = CORVANE_RECEIPTS.filter((r) => here.some((p) => p.key === r.plant))
    .map((r) => ({ r, w: live.find((w) => w.plant.key === r.plant && w.index === 0)! }))
  await db.timesheet.createMany({
    data: [
      ...toSign.map((w) => ({
        id: `cv_ts_${w.key}_w1`, sellContractId: sid(w), personId: who(w),
        periodStart: last.start, periodEnd: last.end, days: last.days, totalHours: totalOf(last.days),
        status: 'SUBMITTED', submittedAt: last.end,
      })),
      ...receipts.map(({ r, w }) => {
        const wk = seedWeek(r.week, r.accepted)
        const signed = signingDays(wk.start)
        return {
          id: `cv_ts_${w.key}_w${r.week}`, sellContractId: sid(w), personId: who(w),
          periodStart: wk.start, periodEnd: wk.end, days: wk.days, totalHours: r.accepted,
          status: 'APPROVED', submittedAt: wk.end,
          approvedAt: signed.signedAt(0), approvedById: manager(w.plant),
          clientApprovedAt: signed.signedAt(0), clientApprovedById: manager(w.plant),
          employerAcceptedAt: signed.signedAt(1), employerAcceptedById: ownerOf(w.supplier),
        }
      }),
    ],
    skipDuplicates: true,
  })
  await db.workAssertion.createMany({
    data: receipts.flatMap(({ r, w }) => {
      const signed = signingDays(seedWeek(r.week, r.accepted).start)
      const ts = `cv_ts_${w.key}_w${r.week}`
      return [
        { id: `${ts}_client`, timesheetId: ts, companyId: co.id, role: 'CLIENT_APPROVAL', hours: r.accepted, rateCents: billRateMinor(w.plant.cc), state: 'LIVE', byId: manager(w.plant), at: signed.signedAt(0) },
        { id: `${ts}_employer`, timesheetId: ts, companyId: supplierIds.get(supplierSlug(w.supplier))!, role: 'EMPLOYER_ACCEPTANCE', hours: r.accepted, rateCents: payRateMinor(w.plant.cc), state: 'LIVE', byId: ownerOf(w.supplier), at: signed.signedAt(1) },
      ]
    }),
    skipDuplicates: true,
  })

  // Each signature posted to the books, through the function the route that
  // signs a week calls, so a rebuild of the postings finds nothing to change
  // (hop-ledger-books). A signature already posted is left as it is.
  for (const { r, w } of receipts) {
    const ts = `cv_ts_${w.key}_w${r.week}`
    await postAssertion(`${ts}_client`, manager(w.plant))
    await postAssertion(`${ts}_employer`, ownerOf(w.supplier))
  }
  // And booked, a balanced entry per posting in its own currency: the base
  // world's books part does not walk Corvane's firms (seed-stays-in-its-world).
  await bookPostings([co.id, ...new Set(receipts.map(({ w }) => supplierIds.get(supplierSlug(w.supplier))!))])

  // ── The receipts: what each supplier sent for those weeks ──
  // One whole billing period under the terms of the document the line is
  // on, and the due date those terms compute, the way a bill is raised
  // (POST /api/invoices/generate; the twin's own demo receipts the same).
  const initials = (name: string) => ascii(name).split('-').filter(Boolean).map((p) => p[0]).join('').toUpperCase().slice(0, 3)
  const terms = new Map(
    (await db.sellContract.findMany({
      where: { id: { in: receipts.map(({ w }) => sid(w)) } },
      select: {
        id: true, startDate: true, endDate: true, billFrequency: true, billAnchor: true, billStraddle: true,
        paymentTerms: true, paymentTermsFrom: true, workOrder: { select: ORDER_HEADER_SELECT },
      },
    })).map((c) => [c.id, c])
  )
  await db.invoice.createMany({
    data: receipts.map(({ r, w }, k) => {
      const wk = seedWeek(r.week, r.accepted)
      const line = terms.get(sid(w))!
      const firstWorked = new Date(`${Object.keys(wk.days).sort()[0]}T00:00:00Z`)
      const period = periodFor(firstWorked, periodTermsFor('SELL', line))
      const billed = termsFor('SELL', line)
      const currency = CORVANE_COUNTRIES[w.plant.cc].currency
      const amount = Math.round(r.billed * billRateMinor(w.plant.cc))
      const issuedAt = new Date(wk.end.getTime() + 2 * 86_400_000)
      const due = dueOn({
        anchor: billed.paymentTermsFrom ?? 'PERIOD_END', days: billed.paymentTermsDays ?? 30,
        periodEnd: period.end, issuedAt, receivedAt: null, approvedAt: null,
      })
      const sup = supplierSlug(w.supplier)
      return {
        id: `cv_inv_${w.key}_w${r.week}`, engagementId: `cv_eng_${sup}`, workOrderId: `cv_wo_${sup}`,
        number: `${initials(w.supplier)}-${w.plant.cc}-${day(0).getUTCFullYear()}-${String(410 + k + (r.held ? 50 : 0)).padStart(4, '0')}`,
        periodStart: period.start, periodEnd: period.end, currency, total: amount / minorPerUnit(currency), paid: 0,
        issuedAt, submittedAt: issuedAt, dueAt: due.dueAt, status: 'SUBMITTED',
        soldToId: co.id, billToId: co.id, payerId: co.id, shipToId: `cv_site_${w.plant.key}`,
      }
    }) as never,
    skipDuplicates: true,
  })
  await db.invoiceLine.createMany({
    data: receipts.map(({ r, w }) => {
      const wk = seedWeek(r.week, r.accepted)
      return {
        id: `cv_line_${w.key}_w${r.week}`, invoiceId: `cv_inv_${w.key}_w${r.week}`, timesheetId: `cv_ts_${w.key}_w${r.week}`,
        sellContractId: sid(w), personId: who(w), hours: r.billed, rateCents: billRateMinor(w.plant.cc),
        amountCents: Math.round(r.billed * billRateMinor(w.plant.cc)),
        description: `${w.name} — ${wk.start.toISOString().slice(0, 10)} to ${wk.end.toISOString().slice(0, 10)}`,
      }
    }),
    skipDuplicates: true,
  })

  // ── Papers, US only: an I-9 from a named passport, and a provider's check ──
  // The start on hold has the check and no I-9, so it cannot start.
  if (region !== 'us') return
  const us = workers
  await db.verification.createMany({
    data: us.flatMap((w) => {
      const onFile = Math.max(w.startedDaysAgo, 0) + 8
      const by = { uploadedById: ownerOf(w.supplier), verifiedById: compliance, verifiedAt: day(-onFile + 1), result: { outcome: 'CLEAR' } }
      const check = {
        id: `cv_bgc_${w.key}`, personId: who(w), type: 'BACKGROUND_CHECK' as const, status: 'CLEAR', provider: 'Sterling',
        issuedAt: day(-onFile), expiresAt: day(300), orderedByCompanyId: supplierIds.get(supplierSlug(w.supplier))!, orderedAt: day(-onFile - 4), ...by,
      }
      if (w.state !== 'IN_PROGRESS') return [check]
      return [
        check,
        { id: `cv_i9_${w.key}`, personId: who(w), type: 'I9_EVERIFY' as const, status: 'CLEAR', provider: 'E-Verify', issuedAt: day(-onFile), expiresAt: null, formEdition: '08/01/2023', ...by },
        { id: `cv_pass_${w.key}`, personId: who(w), type: 'PASSPORT' as const, status: 'CLEAR', provider: 'US Department of State', issuedAt: day(-800), expiresAt: day(900), ...by },
      ]
    }) as never,
    skipDuplicates: true,
  })
  await db.documentBacking.createMany({
    data: us.filter((w) => w.state === 'IN_PROGRESS').map((w) => ({
      id: `cv_back_${w.key}`, formId: `cv_i9_${w.key}`, evidenceId: `cv_pass_${w.key}`, satisfiedKey: 'PASSPORT',
      recordedById: compliance, recordedAt: day(-(w.startedDaysAgo + 7)),
    })),
    skipDuplicates: true,
  })
}
