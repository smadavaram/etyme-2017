/**
 * What the doors' maps read that the seed does not export yet.
 *
 * The home page's map reads Corvane Packaging from `lib/seed-corvane`,
 * which exports every row it writes. The three doors' maps read firms
 * seeded before that habit: Teleworld Solutions' two projects
 * (`lib/seed-internal-moves`, its `LINES`), Brightmoor's and Techpeple's
 * seated people and Teleworld's own staff (`lib/seed-world`, inside
 * `seedWorld`), Karthik Menon's and Colleen Byrne's lines and the two
 * bills from below (`lib/seed-doors`, as arguments inside `seedDoors`).
 * Those files are the architect's and supply's, so market cannot export
 * from them.
 *
 * So every fact here is the seed's own value, copied once, and
 * `__tests__/invariants/door-maps.test.ts` reads each one back out of the
 * seed file it names and fails the build the commit either side moves.
 * This file is the only place a door map holds a value the seed wrote;
 * `./door-maps` holds none. When the owners export these, this file is
 * deleted and the imports move to the seed — asked for in the hand-back
 * of 2026-10-28.
 *
 * Everything the seed already exports is not here: Northbend Athletic's
 * placements and open job (`PROGRAMMES`), the bench offer (`OFFERED`),
 * Rosa Delgado's rates and dates (`seed-rate-change`), the delivery
 * managers (`MOVE_DESKS`), the clients' names (`WORLD_CLIENTS`), Karthik
 * Menon's months (`karthikWindow`) and the nurse's week (`nurseWeek`).
 *
 * Days are counted from the world's own day, as the seed counts them:
 * `end: 18` is `day(18)`, eighteen days after the day the world was born.
 */

/** A firm's name as the seed writes it (`FIRMS` in lib/seed-world), by slug. */
export const FIRM_NAMES = {
  teleworld: 'Teleworld Solutions',
  brightmoor: 'Brightmoor Staffing',
  techpeple: 'Techpeple',
  'computer-systems': 'Computer Systems Inc',
  nimbus: 'Nimbus Talent',
  halcyon: 'Halcyon Talent',
  aptiva: 'Aptiva Workforce',
  'vertex-global': 'Vertex Global',
  arcadia: 'Arcadia Tech Group',
  wrenfield: 'Wrenfield Technical',
} as const

/** The person in each firm's first seat (`FIRMS[].who` in lib/seed-world): its owner. */
export const FIRST_SEAT = {
  teleworld: 'Sunil Raghavan',
  brightmoor: 'Jenna Okafor',
  techpeple: 'Bhavesh Nair',
  aptiva: 'Rashida Coleman',
} as const

/** Brightmoor's seated people the map names (`SUPPLIER_TEAM` in lib/seed-world). */
export const BRIGHTMOOR_TEAM = {
  account: 'Marisa Delacroix',
  ar: 'Imelda Santoro',
  payroll: 'Desmond Achebe',
  finance: 'Rosalind Tay',
} as const

/** Techpeple's recruiter (`BENCH_FIRM_TEAM` in lib/seed-world). */
export const TECHPEPLE_RECRUITER = 'Linnea Qadri'

/**
 * Aptiva Workforce's three people beside its program manager
 * (`APTIVA_TEAM` in lib/seed-world, 2026-10-28), by the demo desk key the
 * seed's address carries: `world-aptiva-<desk>@`.
 */
export const APTIVA_TEAM = {
  suppliers: 'Delphine Castellanos',
  coordinator: 'Tomasz Wierzbicki',
  ap: 'Hollis Banerjee',
} as const

/** Teleworld's AP & Payroll clerk (`MIDDLE_FIRM_AP` in lib/seed-world). */
export const TELEWORLD_PAYROLL = 'Ravi Kalathil'

/** Teleworld's own employees, in the seed's order (`PAYROLL` in lib/seed-world). */
export const TELEWORLD_STAFF = ['Karthik Menon', 'Amara Nwosu', 'Felix Brenner', 'Deepa Varma'] as const

/** One of Teleworld's running lines on its two projects (`LINES` in lib/seed-internal-moves). */
export interface TeleworldLine {
  person: string
  /** The client's slug, read through `WORLD_CLIENTS` for its name. */
  client: string
  city: string
  job: string
  /** Bill and pay, cents an hour. */
  bill: number
  pay: number
  /** Days from the world's day: the line's first and last day. */
  start: number
  end: number
  /** Flagged to come off: `keepUntil` null is free when the line ends; a number is kept until that day. */
  release?: { keepUntil: number | null }
}

export const TELEWORLD_LINES: readonly TeleworldLine[] = [
  { person: 'Felix Brenner', client: 'nike', city: 'Tualatin', job: 'Retail finance systems consultant', bill: 13_200, pay: 8_600, start: -120, end: 18, release: { keepUntil: null } },
  { person: 'Amara Nwosu', client: 'nike', city: 'Tualatin', job: 'Retail data engineer', bill: 12_400, pay: 8_100, start: -90, end: 25, release: { keepUntil: 45 } },
  { person: 'Deepa Varma', client: 'harlow-health', city: 'San Jose', job: 'ERP finance migration — integration architect', bill: 14_800, pay: 9_700, start: -60, end: 240 },
]

/** Karthik Menon's ended line at Corveldt Aerospace (`place` in lib/seed-doors); its months are `karthikWindow`. */
export const KARTHIK_LINE = {
  person: 'Karthik Menon',
  client: 'corveldt',
  job: 'Avionics software assurance engineer',
  skills: ['DO-178C', 'LDRA', 'Embedded C'],
  bill: 13_600,
} as const

/** Corveldt Aerospace's open job, as its invitation to Teleworld states it (`payroll-invitations` in lib/seed-world). */
export const CORVELDT_JOB = {
  title: 'DO-178C verification engineer',
  client: 'corveldt',
  city: 'Wichita',
  payMin: 13_000,
  payMax: 14_500,
} as const

/** The candidate Teleworld has in for that job, from Nimbus Talent's bench (`LIVE` in lib/seed-world). */
export const MEERA = {
  name: 'Meera Balakrishnan',
  bench: 'nimbus',
  round: 2,
  inDays: 2,
} as const

/** Ifeoma Balogun, Techpeple's, put forward to Computer Systems Inc (`LIVE` in lib/seed-world; the I-9 ask in lib/seed-doors). */
export const IFEOMA = {
  name: 'Ifeoma Balogun',
  job: 'Epic Beaker analyst',
  prime: 'computer-systems',
  screenInDays: 3,
  i9AskedDaysAgo: 6,
} as const

/** Rosa Delgado's job (`ROLE` in lib/seed-rate-change). Her rates and dates are exported there. */
export const ROSA_JOB = 'Warehouse systems analyst'

/** Marisol Quintero, asked onto Brightmoor's bench a day before the world's day, no answer yet (lib/seed-doors). */
export const MARISOL = { name: 'Marisol Quintero', invitedDaysAgo: 1 } as const

/** Colleen Byrne's line and license (lib/seed-doors). */
export const BYRNE = {
  person: 'Colleen Byrne',
  corp: 'Byrne Critical Care LLC',
  above: 'halcyon',
  client: 'harlow-health',
  city: 'Madison',
  job: 'ICU travel nurse — 13 weeks',
  /** What Byrne Critical Care bills Halcyon Talent, cents an hour. */
  bill: 9_200,
  start: -42,
  end: 49,
  license: { number: 'RN 154-882', state: 'Wisconsin', endsIn: 24 },
  /** Her four seeded weeks, newest last: three signed and accepted, the newest signed by the client only. */
  weeksBack: [4, 3, 2, 1],
} as const

/** The two invoices from below the doors read (`billFromBelow` in lib/seed-doors): who received it, from whom, its number, due in days. */
export const BILLS_FROM_BELOW = {
  nimbus: { payer: 'teleworld', vendor: 'nimbus', number: 'NT-2026-1190', dueIn: 25 },
  techpeple: { payer: 'computer-systems', vendor: 'techpeple', number: 'CE-2026-0418', dueIn: 25 },
} as const
