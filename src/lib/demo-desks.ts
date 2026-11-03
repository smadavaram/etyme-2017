/**
 * The desks a visitor may ask for at a seeded firm, and what the door
 * says when the one asked for is not held.
 *
 * Moved out of `app/api/demo/route.ts` on 2026-09-30 so the refusal is
 * a sentence a test can read. The browser walk that moved it: asking for
 * the AP desk at Teleworld Solutions was answered "nobody is seated at
 * any desk there yet", while the owner's desk at the same firm opened.
 * Two things were wrong. The list of held desks counted only the
 * fourteen keyed desks, so a firm whose people hold other roles —
 * Owner, Delivery manager, Validation Engineer — read as empty. And "AP"
 * at a firm that sells is the AP & Payroll desk; the door looked only
 * for a client's AP Clerk.
 *
 * Pure: no database. The route reads the roles and hands them in.
 */

// The client program desks first, then the desks a supplier runs on.
export const DESKS = [
  'programme', 'hiring', 'hr', 'procurement', 'vp', 'ap', 'compliance',
  'account', 'recruiter', 'resourcing', 'contracts', 'ar', 'payroll', 'finance',
  // An integrator's delivery manager: flags who rolls off a project,
  // reserves people for another, and places them (CLAUDE.md, 2026-09-30).
  'delivery',
  // A client with plants in several regions (founder, 2026-10-27, the
  // region map): the manager who answers for one region, the head of
  // operations over every region, and the CFO. Seated at Corvane
  // Packaging (lib/seed-corvane).
  'region', 'operations', 'cfo',
] as const
export type Desk = (typeof DESKS)[number]

/**
 * Which seat a desk is, by the role it holds.
 *
 * A role is the fact; an address is a handle. Two names where one word
 * means different desks at different firms: "HR Partner" reads a role
 * at a client and "HR" keeps a supplier's own people's paperwork; "AP"
 * is the AP Clerk at a client and AP & Payroll at a firm that sells,
 * because paying the people below is the same desk as paying suppliers
 * there. No kind of firm holds both AP roles, so one list serves all.
 */
export const DESK_ROLES: Record<Desk, string[]> = {
  programme: ['Program Manager'],
  hiring: ['Hiring Manager'],
  hr: ['HR Partner', 'HR'],
  procurement: ['Procurement Lead'],
  vp: ['Approver'],
  ap: ['AP Clerk', 'AP & Payroll'],
  compliance: ['Compliance Officer'],
  account: ['Account Manager'],
  recruiter: ['Recruiter'],
  resourcing: ['Resource Manager'],
  contracts: ['Contract Manager'],
  ar: ['Accounts Receivable'],
  payroll: ['AP & Payroll'],
  finance: ['Finance'],
  delivery: ['Delivery Manager'],
  region: ['Regional Manager'],
  operations: ['Head of Operations'],
  cfo: ['Chief Financial Officer'],
}

/** A desk key from a request body, or null where it is not one of ours. */
export function deskFrom(asked: unknown): Desk | null {
  return typeof asked === 'string' && (DESKS as readonly string[]).includes(asked) ? (asked as Desk) : null
}

/**
 * What a request body asked for: a desk, nothing at all, or a word that
 * is not a desk.
 *
 * The last two are not the same request, and treating them as one was
 * the bug the chain audit found on 2026-10-05: `{"desk":"owner"}` or a
 * desk one letter wrong fell through to "the firm's first seat", which
 * is the Owner, so a visitor asking for a narrow desk was handed the
 * widest one with no word said. Asking with no desk still opens the
 * first seat — that is a request for it. Asking for a desk that does not
 * exist is refused, and the refusal names the ones that do.
 */
export function deskAsked(asked: unknown): { desk: Desk | null; unknown: string | null } {
  if (asked == null || asked === '') return { desk: null, unknown: null }
  const desk = deskFrom(asked)
  return desk ? { desk, unknown: null } : { desk: null, unknown: String(asked) }
}

/**
 * The desk's name as this kind of firm calls it — the role's own name,
 * so the sentence says "AP & Payroll" at a supplier and "AP Clerk" at a
 * client rather than a word of the door's own.
 */
export function deskName(desk: Desk, kind: string): string {
  const roles = DESK_ROLES[desk]
  if (desk === 'ap') return kind === 'CLIENT' || kind === 'MSP' ? 'AP Clerk' : 'AP & Payroll'
  if (desk === 'hr') return kind === 'CLIENT' ? 'HR Partner' : 'HR'
  return roles[0]
}

/** Every keyed desk a set of held role names opens. */
export function desksOpen(roleNames: Iterable<string>): Desk[] {
  const held = new Set(roleNames)
  return DESKS.filter((d) => DESK_ROLES[d].some((r) => held.has(r)))
}

/** "A", "A or B", "A, B or C". */
function orList(xs: string[]): string {
  return xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}`
}

export interface DeskRefusal {
  /** The sentence the visitor reads. */
  message: string
  /** The keyed desks that do open here, so a caller can retry without parsing. */
  desks: Desk[]
}

/**
 * What the door says when no seat answered.
 *
 * `heldRoles` is the role name of every live seat at the firm, oldest
 * grant first, repeats allowed — the first is the seat asking with no
 * desk opens. `company` is null where the slug is not in the world.
 */
export function deskRefusal(input: {
  asWorld: string
  company: { name: string; kind: string } | null
  desk: Desk | null
  heldRoles: string[]
  /** A desk word the visitor sent that is not a desk anywhere in the demo. */
  unknown?: string | null
}): DeskRefusal {
  const { asWorld, company, desk } = input
  if (!company) {
    return {
      message: `There is no ${asWorld} in this deployment's world. POST /api/seed-world to build it first.`,
      desks: [],
    }
  }
  const seated = Array.from(new Set(input.heldRoles.filter(Boolean)))
  const open = desksOpen(seated)
  if (seated.length === 0) {
    return {
      message: `Nobody is seated at ${company.name} yet. POST /api/seed-world to build it first.`,
      desks: [],
    }
  }
  if (input.unknown) {
    // Never the first seat in its place: that seat is the Owner, and a
    // visitor who asked for something narrower must not be handed it.
    const ways: string[] = []
    if (open.length > 0) ways.push(`At ${company.name} you can ask for ${orList(open.map((d) => `"${d}"`))} by name.`)
    ways.push(`Ask for no role to sit as the ${seated[0]}.`)
    return {
      message: `There is no "${input.unknown}" role in the demo, so no seat was taken. ${ways.join(' ')}`,
      desks: open,
    }
  }
  // Only reached with a desk: without one the firm's first seat opens,
  // and a firm with any seat has a first one.
  const asked = desk ? deskName(desk, company.kind) : 'asked-for'
  const ways: string[] = []
  if (open.length > 0) {
    ways.push(`Ask for ${orList(open.map((d) => `"${d}"`))} by name.`)
  }
  ways.push(`Ask for no role to sit as the ${seated[0]}.`)
  return {
    message:
      `Nobody holds the ${asked} role at ${company.name} in the demo; ` +
      `these roles are seated: ${seated.join(', ')}. ${ways.join(' ')}`,
    desks: open,
  }
}

/**
 * The person a visitor asked to sit as, where a desk is held by more
 * than one. A name, trimmed, or null where none was asked. Only read
 * alongside a desk: a name with no desk would be a door onto any seat
 * at the firm, the Owner's included.
 */
export function whoAsked(asked: unknown): string | null {
  if (typeof asked !== 'string') return null
  const name = asked.trim()
  return name.length > 0 && name.length <= 120 ? name : null
}

/**
 * What the door says when the desk is held, but not by the person asked
 * for. Names the people who do hold it, so the visitor can pick one.
 */
export function whoRefusal(input: {
  company: { name: string; kind: string }
  desk: Desk
  who: string
  holders: string[]
}): string {
  const desk = deskName(input.desk, input.company.kind)
  const holders = Array.from(new Set(input.holders.filter(Boolean)))
  const tail = holders.length > 0
    ? ` The ${desk} role there is held by ${orList(holders)}.`
    : ` Nobody holds the ${desk} role there.`
  return `${input.who} does not hold the ${desk} role at ${input.company.name} in the demo, so no seat was taken.${tail}`
}

// ── A worker door for every seeded person on the work ────────────────
//
// The founder's tester, on production, 2026-11-03: he placed the seeded
// Rajesh Iyer (Brightmoor Staffing → Northbend Athletic) and could not
// file a week as him. The demo page had a door for six named people and
// the world holds about four hundred on a placement or a submission;
// Rajesh's address is on a reserved demo domain, so no password can be
// made for him either, rightly. So every seeded person on the work gets
// a door, read from the world rather than typed, under the firm that
// employs or lists them. The door is the person's own seat — the one
// `lib/api-context` resolves for their address — and never a firm's.

/** What the page and the route read about one seeded person on the work. */
export interface WorkerRow {
  personId: string
  name: string
  email: string
  /** The firm that employs or lists them: their newest usable seat's company, else the firm that put them forward or sells their line. */
  firmSlug: string | null
  firmName: string | null
  /** Whether any usable seat of theirs holds a desk (a permission beyond the reads of their own work). */
  holdsADesk: boolean
  /** A seat of theirs is paused and none is usable: the door would open on a refusal. */
  paused: boolean
}

export interface WorkerDoor {
  personId: string
  name: string
  /** "Open as Rajesh Iyer, worker" — what the button says. */
  label: string
}

export interface WorkerFirm {
  slug: string
  name: string
  workers: WorkerDoor[]
}

export interface WorkerDoors {
  firms: WorkerFirm[]
  /** Seeded people on the work who get no worker door, each with why. */
  without: { name: string; because: string }[]
}

/** The words on a worker door. */
export function workerDoorLabel(name: string): string {
  return `Open as ${name}, worker`
}

/**
 * The worker doors, from the rows the world holds.
 *
 * Pure. Four people are left out, each said: one who already has a door
 * of their own on the page (Helena Marsh, Colleen Byrne and the other
 * named people), one at an address somebody could buy, one whose seat
 * holds a desk at a firm (their address would open the firm's book, so
 * their door is that role's on the firm's row), and one whose only seat
 * is paused.
 */
export function workerDoors(
  rows: readonly WorkerRow[],
  opts: { doored: Iterable<string>; reserved: (email: string) => boolean; excluded?: Iterable<string> }
): WorkerDoors {
  const doored = new Set([...opts.doored].map((e) => e.toLowerCase()))
  const excluded = new Set([...(opts.excluded ?? [])].map((e) => e.toLowerCase()))
  const firms = new Map<string, WorkerFirm>()
  const seen = new Set<string>()
  const without: WorkerDoors['without'] = []
  for (const r of rows) {
    if (seen.has(r.personId)) continue
    seen.add(r.personId)
    const email = r.email.toLowerCase()
    if (doored.has(email)) { without.push({ name: r.name, because: `${r.name} has a door of their own on the page.` }); continue }
    if (excluded.has(email)) continue
    if (!opts.reserved(r.email)) { without.push({ name: r.name, because: `${r.name}’s address is not a seeded one, so no demo door opens it.` }); continue }
    if (r.holdsADesk) {
      without.push({ name: r.name, because: `${r.name} holds a role at ${r.firmName ?? 'a firm'}, so their door is that role’s, on the firm’s row.` })
      continue
    }
    if (r.paused) { without.push({ name: r.name, because: `${r.name}’s seat is paused.` }); continue }
    if (!r.firmSlug || !r.firmName) { without.push({ name: r.name, because: `No firm employs or lists ${r.name}.` }); continue }
    const firm = firms.get(r.firmSlug) ?? { slug: r.firmSlug, name: r.firmName, workers: [] }
    firm.workers.push({ personId: r.personId, name: r.name, label: workerDoorLabel(r.name) })
    firms.set(r.firmSlug, firm)
  }
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name)
  const list = [...firms.values()].sort(byName)
  for (const f of list) f.workers.sort(byName)
  return { firms: list, without }
}
