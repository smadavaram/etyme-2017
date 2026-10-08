/**
 * One door for a seat that holds no desk. Pure: no database in it.
 *
 * "No desk" is `isDeskless` in lib/nav-table: a seat holding nothing
 * beyond the reads of its own work (round five), not only a seat holding
 * no permission at all (round four).
 *
 * ── Why one door ─────────────────────────────────────────────────────
 *
 * Sign-up walk, round four (2026-10-08). A colleague seated as Member,
 * with no desk, saw only their own pages in the menu — and by typing an
 * address read Northbend Athletic's $118,880 month, every submission with
 * its rate, every job request with its maximum, every contractor's months
 * against the cap, and seven past contractors. Users & permissions
 * promised the owner the opposite. Round three had closed five routes
 * one at a time; the firm has dozens that "scope themselves to your
 * company", and a company-scoped read is a desk's reading, not a
 * Member's. Gating them one by one is a race the next route loses.
 *
 * So the rule lives where every dashboard route already passes,
 * `getCallerContext`, and it is the menu's own rule: a seat holding no
 * desk opens the routes behind the links its menu shows it — what is
 * addressed to it and its own pages — and the routes the menu marks as
 * answering such a seat themselves. Everything else is refused in a
 * sentence, before the route reads anything.
 *
 * ── What the allowlist is made of ────────────────────────────────────
 *
 * Read off `lib/nav-table` (`routesOpenToADesklessSeat`), never typed
 * here: a link that leaves the desk-less menu leaves the door with it.
 * The one hand-kept list is `SHELL_READS`, the routes the frame around
 * every page calls whatever page is open, and it is short on purpose.
 */
import {
  routesOpenToADesklessSeat, routeMatches, pageNameOf, isDeskless, type CompanyKind,
} from '@/lib/nav-table'
import { noDeskYet } from '@/lib/no-desk'

/**
 * The routes the frame calls on every page, whatever page is open: the
 * seat itself and its seat switcher, the bell and its live stream, the
 * setup reminder (which answers nothing to a seat that runs no setup),
 * and the demo banner.
 */
export const SHELL_READS: readonly string[] = [
  'me', 'me/context', 'notifications', 'notifications/stream', 'onboarding/setup', 'demo',
]

/**
 * Routes no menu link names, opened by id from a seat's own pages, that
 * answer a desk-less seat themselves. Hand-kept and short on purpose,
 * with the reason beside each.
 */
export const ANSWERS_BY_ID: Readonly<Record<string, string>> = {
  // Sign-up walk, round five, problem 7: a desk-less seat opens the
  // placement that names it and no other. app/api/placements/[id] tells
  // the seat a colleague's is not part of it (round six, problem 15) and
  // answers a stranger to the firm as a placement that does not exist.
  'placements/*': 'A seat with no desk reads only a placement that names it.',
  // Round six, problem 3: every week on Your work links "Open this week"
  // to /dashboard/weeks/:id, which reads this route. lib/week-approval
  // refuses a desk-less seat anybody's week but its holder's own, in the
  // door's words, and the worker may send the client's approver the link
  // or attach the approval on their own week (CLAUDE.md, 2026-09-30).
  'week-approvals': 'A seat with no desk reads and acts on the client’s approval of its own week, and no other.',
  'week-approvals/*/file': 'A seat with no desk opens the evidence of an approval on its own week, and no other.',
  // The worker's own rate conversation, opened from where they were put
  // forward on their own page; the route refuses a submission that does
  // not name its caller.
  'me/submissions/*/rate': 'A worker reads and answers the rate conversation on a submission that names them, and no other.',
}

/**
 * Lists that answer a desk-less seat with its own rows, read only. The
 * same route's writes are a desk's, so only a GET opens here.
 */
export const OWN_ROWS_ON_READ: Readonly<Record<string, string>> = {
  // Round five, problem 4 (app/api/submissions/own-only): a seat with no
  // desk reads the submissions that name its holder, with no rate, and
  // asking for anybody else's is refused. Where a worker was put forward
  // is the "You" promise; submitting anybody stays a desk's.
  submissions: 'A seat with no desk reads only the submissions that name it, with no rate on them.',
}

/**
 * Route families that answer about people. A refusal at one of them is a
 * refused read of every person the route would have named, and is
 * logged as one (CLAUDE.md: every read of another person's data writes
 * an access log, refusals included). A refusal anywhere else — a
 * setting, a bill — reads nobody and logs nothing.
 */
export const READS_PEOPLE: readonly string[] = [
  'program', 'people', 'submissions', 'requisitions', 'requirements', 'alumni', 'consultants',
  'bench', 'placements', 'interviews', 'rolloff', 'releasing-soon', 'identity', 'tenure',
  'contracts', 'timesheets', 'payroll', 'expenses', 'documents', 'compliance', 'blacklist',
  'contacts', 'texts', 'checks', 'outbound-pack', 'packets', 'training', 'invitations',
  'leads', 'rate-history', 'profitability', 'favorites', 'resumes', 'census', 'loose-ends',
  'access',
]

export interface DoorAsk {
  /** The request's path, `/api/...`. */
  path: string
  /** The request's method. Absent is read as a write, so only a GET opens a list that answers with own rows. */
  method?: string
  /** The seat's context type. A consultant's context is their own record, not a seat at a firm. */
  contextType: string
  permissions: readonly string[]
  /** A machine key; a key is a grant, never a Member. */
  isService?: boolean
  companyName: string | null
  companyKind: string | null
}

export type DoorVerdict =
  | { open: true; why: 'HOLDS_A_DESK' | 'NOT_A_SEAT' | 'ON_THE_MENU' | 'SCOPES_ITSELF' | 'SHELL' }
  | { open: false; says: string; readsPeople: boolean }

let cached: { menu: string[]; scopesItself: string[] } | null = null
function allowlist() {
  return (cached ??= routesOpenToADesklessSeat())
}

/** The allowlist, for the test that checks every entry names a route. */
export function desklessAllowlist(): { menu: string[]; scopesItself: string[]; shell: string[]; byId: string[]; ownRowsOnRead: string[] } {
  return { ...allowlist(), shell: [...SHELL_READS], byId: Object.keys(ANSWERS_BY_ID), ownRowsOnRead: Object.keys(OWN_ROWS_ON_READ) }
}

/**
 * Whether this seat may open this route, before any program-office seat
 * is looked at — the caller asks that only when the answer here is no,
 * because a firm acting in a client's seat reads under the client's role.
 */
export function desklessDoor(ask: DoorAsk): DoorVerdict {
  if (ask.isService) return { open: true, why: 'NOT_A_SEAT' }
  if (ask.contextType === 'CONSULTANT' || ask.contextType === 'STAFF') return { open: true, why: 'NOT_A_SEAT' }
  if (!isDeskless(ask.permissions)) return { open: true, why: 'HOLDS_A_DESK' }

  const path = ask.path.replace(/\/$/, '')
  if (!/^\/api(\/|$)/.test(path)) return { open: true, why: 'NOT_A_SEAT' }
  const { menu, scopesItself } = allowlist()
  if (SHELL_READS.some((r) => routeMatches(path, r))) return { open: true, why: 'SHELL' }
  if (menu.some((r) => routeMatches(path, r))) return { open: true, why: 'ON_THE_MENU' }
  if (scopesItself.some((r) => routeMatches(path, r))) return { open: true, why: 'SCOPES_ITSELF' }
  if (Object.keys(ANSWERS_BY_ID).some((r) => routeMatches(path, r))) return { open: true, why: 'SCOPES_ITSELF' }
  if ((ask.method ?? '').toUpperCase() === 'GET' && Object.keys(OWN_ROWS_ON_READ).some((r) => routeMatches(path, r))) {
    return { open: true, why: 'SCOPES_ITSELF' }
  }

  const name = pageNameOf(path, (ask.companyKind as CompanyKind | null) ?? null)
  const first = path.replace(/^\/api\/?/, '').split('/')[0]
  return {
    open: false,
    says: noDeskYet(name ?? 'What you opened', ask.companyName),
    readsPeople: READS_PEOPLE.includes(first),
  }
}
