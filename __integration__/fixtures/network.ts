/**
 * A real five-party supply chain, from a real calling list.
 *
 * The names, addresses and domains come from a sample American client
 * calling list a recruiter actually worked. Using it rather than
 * invented data matters for one reason: the domains are corporate, so
 * every one of these people is a *business user* under CLAUDE.md — the
 * population that signs in through a work tenant and is reached on
 * Teams. Seeding the simulation with gmail addresses would have tested
 * the wrong auth path for every actor in it.
 *
 * Four of the nine share one domain, which is what makes this list
 * useful: Addendum E says governance is table stakes for any client
 * with more than one hiring manager, and a single-manager fixture can
 * never exercise an approval chain.
 *
 * The chain, top to bottom — every hop is a real relationship in this
 * industry and each one has a different view of the same worker:
 *
 *   CLIENT       buys, and never learns who the sub-vendor is
 *   MSP          runs the programme, is invoiced, never touches a CV
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
    name: 'Oxford Corp',
    domain: 'oxfordcorp.com',
    // Four hiring managers, which is the whole reason this firm is the
    // client: one manager cannot produce a rate variance or a
    // segregation-of-duties problem, and four can.
    people: [
      { name: 'Doug Kampert', email: 'doug_kampert@oxfordcorp.com' },
      { name: 'Bradley Carlson', email: 'bradley_carlson@oxfordcorp.com' },
      { name: 'Patrick Melton', email: 'patrick_melton@oxfordcorp.com' },
      { name: 'Tj Whitley', email: 'tj_whitley@oxfordcorp.com' },
    ],
  },
  {
    party: 'MSP',
    kind: 'MSP',
    name: 'Yoh Services',
    domain: 'yoh.com',
    people: [{ name: 'Marcus Thomas', email: 'marcus.thomas@yoh.com' }],
  },
  {
    party: 'GSI',
    kind: 'GSI',
    name: 'Teleworld Solutions',
    domain: 'teleworldsolutions.com',
    people: [{ name: 'Kelly Friend', email: 'kelly.friend@teleworldsolutions.com' }],
  },
  {
    party: 'SUB_VENDOR',
    kind: 'VENDOR',
    name: 'Insight Global',
    domain: 'insightglobal.net',
    people: [{ name: 'Steve Resnik', email: 'steve.resnik@insightglobal.net' }],
  },
  {
    party: 'BENCH_VENDOR',
    kind: 'VENDOR',
    name: 'Consultis',
    domain: 'consultis.com',
    people: [{ name: 'Starr Elliott', email: 'starre@consultis.com' }],
  },
  {
    party: 'BENCH_VENDOR',
    kind: 'VENDOR',
    name: 'Techni Power',
    domain: 'technipower.com',
    // A second bench vendor, so the same consultant can sit on two
    // benches. Cross-vendor tenure is the product's sharpest claim and
    // one bench vendor cannot test it.
    people: [{ name: 'Nicole Winecoff', email: 'nicole.winecoff@technipower.com' }],
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
