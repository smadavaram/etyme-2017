/**
 * A five-party supply chain, in the shape of a recruiter's calling list.
 *
 * Every firm, person, address and domain here is invented (2026-11-22).
 * The list once held the names a real calling list held, and a real
 * person's name does not belong in a fixture. The shape is kept for one
 * reason: the domains are corporate, so every one of these people is a
 * *business user* under CLAUDE.md — the population that signs in
 * through a work tenant and is reached on Teams. Seeding the simulation
 * with consumer addresses would have tested the wrong auth path for
 * every actor in it.
 *
 * Four of the nine share one domain, which is what makes this list
 * useful: Addendum E says governance is table stakes for any client
 * with more than one hiring manager, and a single-manager fixture can
 * never exercise an approval chain.
 *
 * The chain, top to bottom — every hop is a relationship this
 * industry has and each one has a different view of the same worker:
 *
 *   CLIENT       buys, and never learns who the sub-vendor is
 *   MSP          runs the program, is invoiced, never touches a CV
 *   GSI          delivers a project with its own people and bought ones
 *   SUB_VENDOR   holds the paper on a person it did not source
 *   BENCH_VENDOR sourced them, and is furthest from the money
 */

export type Party = 'CLIENT' | 'MSP' | 'GSI' | 'SUB_VENDOR' | 'BENCH_VENDOR'

export interface Actor {
  name: string
  email: string
}

export interface Firm {
  /** What they are to the chain, not what they are on the register. */
  party: Party
  /** What `POST /api/companies` will accept. */
  kind: 'CLIENT' | 'MSP' | 'GSI' | 'VENDOR'
  name: string
  domain: string
  people: Actor[]
}

export const NETWORK: Firm[] = [
  {
    party: 'CLIENT',
    kind: 'CLIENT',
    name: 'Orlestone Corp',
    domain: 'orlestonecorp.example',
    // Four hiring managers, which is the whole reason this firm is the
    // client: one manager cannot produce a rate variance or a
    // segregation-of-duties problem, and four can.
    people: [
      { name: 'Dale Kirkham', email: 'dale_kirkham@orlestonecorp.example' },
      { name: 'Brandon Calloway', email: 'brandon_calloway@orlestonecorp.example' },
      { name: 'Paul Merrin', email: 'paul_merrin@orlestonecorp.example' },
      { name: 'Tess Wharton', email: 'tess_wharton@orlestonecorp.example' },
    ],
  },
  {
    party: 'MSP',
    kind: 'MSP',
    name: 'Yarrow Services',
    domain: 'yarrowservices.example',
    people: [{ name: 'Milan Thackeray', email: 'milan.thackeray@yarrowservices.example' }],
  },
  {
    party: 'GSI',
    kind: 'GSI',
    name: 'Tellisford Solutions',
    domain: 'tellisfordsolutions.example',
    people: [{ name: 'Kira Fenn', email: 'kira.fenn@tellisfordsolutions.example' }],
  },
  {
    party: 'SUB_VENDOR',
    kind: 'VENDOR',
    name: 'Ingleby Global',
    domain: 'inglebyglobal.example',
    people: [{ name: 'Stefan Rowe', email: 'stefan.rowe@inglebyglobal.example' }],
  },
  {
    party: 'BENCH_VENDOR',
    kind: 'VENDOR',
    name: 'Conisby',
    domain: 'conisby.example',
    people: [{ name: 'Sunniva Ellis', email: 'sunnivae@conisby.example' }],
  },
  {
    party: 'BENCH_VENDOR',
    kind: 'VENDOR',
    name: 'Tarnhow Power',
    domain: 'tarnhowpower.example',
    // A second bench vendor, so the same consultant can sit on two
    // benches. Cross-vendor tenure is the product's sharpest claim and
    // one bench vendor cannot test it.
    people: [{ name: 'Nadine Wickham', email: 'nadine.wickham@tarnhowpower.example' }],
  },
]

export const firm = (p: Party): Firm => NETWORK.find((f) => f.party === p)!
export const benchVendors = (): Firm[] => NETWORK.filter((f) => f.party === 'BENCH_VENDOR')

/** Skills with real depth in the sourced pool, so niches are not invented. */
export const SKILLS = [
  ['Java', 'Spring', 'AWS'],
  ['.NET', 'C#', 'SQL Server'],
  ['Oracle DBA', 'PL/SQL'],
  ['Active Directory', 'Identity Access Manager'],
  ['Business Analyst', 'Requirements'],
  ['UI Developer', 'React', 'TypeScript'],
  ['Mobile Tester', 'Appium'],
  ['Project Manager', 'Agile'],
]

export const CITIES = [
  'San Jose, California', 'Dallas, Texas', 'Chicago, Illinois',
  'Atlanta, Georgia', 'New York, New York', 'Houston, Texas',
]
