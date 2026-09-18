import { hasAnyPermission, type Permission } from '@/lib/permissions'

/**
 * Who may read the do-not-return list, who may add to it, and the
 * sentence said to whoever may not.
 *
 * ── Why this file exists ─────────────────────────────────────────────
 *
 * `GET /api/blacklist` gated a READ on `consultants.write` and refused
 * with the string "Requires consultants.write permission". Two faults in
 * one line, and both are named in CLAUDE.md.
 *
 * The first is the shape `etyme-money` found across nine AR and AP
 * routes: a read gated harder than the write beside it is a copy-paste,
 * not a decision. Here the read and the write were gated on the SAME
 * permission, which is the same mistake standing still — a list exists
 * to be read by more people than may change it. The consequence was that
 * a Compliance Officer at a vendor, a client and an MSP — whose blurb in
 * `lib/company-defaults` is "Checks documents and work authorization",
 * who holds `consultants.read` and deliberately holds no write at all —
 * was refused by the one screen that is most obviously theirs. So was
 * every client Program Manager for the write, who holds `governance.write`
 * and no `consultants.write`: at a CLIENT only the account Owner could
 * write the company's own do-not-return list.
 *
 * The second is that the refusal handed a person a permission code.
 * "Requires consultants.write permission" tells a compliance officer
 * nothing they can act on and names a permission they should not have to
 * know exists.
 *
 * ── Why reading and writing differ ───────────────────────────────────
 *
 * Reading is what stops the wrong thing happening. A recruiter about to
 * put somebody forward, an account manager answering a client, a
 * compliance officer auditing a site — each needs to know that this firm
 * has already decided not to work with that person or that firm again.
 * A list nobody may open is a list nobody consults, and the bar it
 * carries is then discovered after the submission rather than before.
 * So reading opens for any desk that deals with the people or the firms
 * this company trades with: `consultants.read`, `vendors.read` or
 * `governance.read`. It stays shut to the money desks and to a Viewer,
 * who do neither.
 *
 * Writing is a compliance record with a consequence for a named person —
 * somebody is kept off a client's site — and it divides in two, because
 * the two halves of the list are different decisions taken at different
 * desks:
 *
 *   A PERSON is barred by the desk that owns who gets put forward —
 *   a recruiter, a resource manager, HR at a supplier; the program
 *   manager at a client.
 *
 *   A FIRM is barred by the desk that owns the supplier panel — the
 *   program manager, a procurement lead, a supplier manager. Taking a
 *   whole company off the panel was never a recruiter's act, and
 *   `consultants.write` let every recruiter do exactly that.
 *
 * A Compliance Officer reads both halves and writes neither, which is
 * what their own permissions already say: every Compliance Officer in
 * `lib/company-defaults` is a read-only desk, on purpose.
 *
 * ── Why a table and not four `if`s ───────────────────────────────────
 *
 * Because the bug was invisible until somebody sat in the seat. The
 * table lets a test walk every default role of every kind of company
 * through every gate, which is the only check that catches a desk being
 * locked out of the page it is named for — on the commit that does it,
 * rather than on the day somebody telephones.
 */

// ── Reading ──────────────────────────────────────────────────────────

/** Holding any ONE of these opens the list. */
export const MAY_READ: readonly Permission[] = [
  'consultants.read',
  'vendors.read',
  'governance.read',
]

export function mayRead(permissions: readonly string[]): boolean {
  return hasAnyPermission(permissions, MAY_READ)
}

/**
 * The default roles whose own job description is this list, by name in
 * `lib/company-defaults`. Every one of them can open it, and a test
 * says so.
 */
export const READING_DESKS: readonly string[] = [
  'Compliance Officer',
  'Recruiter',
  'Account Manager',
  'HR',
  'Program Manager',
  'Hiring Manager',
  'Procurement Lead',
  'Supplier Manager',
  'Owner',
  'Admin',
]

export const CANNOT_READ =
  'The do-not-return list names the people and the firms this company has decided not to ' +
  'work with again, and it is meant to be read before somebody is put forward. Reading it ' +
  'belongs to a desk that deals with people or with suppliers here — a recruiter, an ' +
  'account manager, HR, the program office, or the compliance officer who owns it. Ask ' +
  'whoever manages roles at your company to seat you there.'

// ── Writing ──────────────────────────────────────────────────────────

export type Target = 'PERSON' | 'COMPANY'

/** Barring a person: the desk that owns who gets put forward. */
export const MAY_BAR_A_PERSON: readonly Permission[] = [
  'consultants.write',
  'governance.write',
]

/** Barring a firm: the desk that owns the supplier panel. */
export const MAY_BAR_A_FIRM: readonly Permission[] = [
  'vendors.manage',
  'governance.write',
]

export function mayBar(permissions: readonly string[], target: Target): boolean {
  return hasAnyPermission(
    permissions,
    target === 'PERSON' ? MAY_BAR_A_PERSON : MAY_BAR_A_FIRM
  )
}

/** The desks that may write each half, by name in `lib/company-defaults`. */
export const BARRING_DESKS: Record<Target, readonly string[]> = {
  PERSON: ['Recruiter', 'Resource Manager', 'HR', 'Program Manager', 'Owner', 'Admin'],
  COMPANY: ['Program Manager', 'Procurement Lead', 'Supplier Manager', 'Owner', 'Admin'],
}

/** What is missing and what to do about it. Never a permission code. */
export function cannotBar(target: Target): string {
  return target === 'PERSON'
    ? 'Keeping somebody off this company’s work is a compliance record with a real consequence for ' +
      'that person, so writing it belongs to the desk that decides who gets put forward — a ' +
      'recruiter or resource manager at a supplier, HR, or the program manager at a client. You ' +
      'can read the list. Ask whoever manages roles at your company to seat you where it is ' +
      'written.'
    : 'Barring a whole firm takes it off this company’s supplier panel, so it belongs to the desk ' +
      'that owns suppliers — the program manager, a procurement lead, or a supplier manager — ' +
      'rather than to the desk that puts people forward. You can read the list. Ask whoever ' +
      'manages roles at your company to seat you where it is written.'
}

/** Lifting a bar lets somebody back, so it is the same desk in reverse. */
export function cannotLift(target: Target): string {
  return target === 'PERSON'
    ? 'Lifting a bar lets this person be put forward here again, which is the same decision as ' +
      'placing it, made in reverse. It belongs to the desk that decides who gets put forward — a ' +
      'recruiter or resource manager at a supplier, HR, or the program manager at a client. Ask ' +
      'whoever manages roles at your company to seat you there.'
    : 'Lifting a bar puts this firm back on the supplier panel, which is the same decision as ' +
      'placing it, made in reverse. It belongs to the desk that owns suppliers — the program ' +
      'manager, a procurement lead, or a supplier manager. Ask whoever manages roles at your ' +
      'company to seat you there.'
}

// ── One company's own list, and nobody else's ────────────────────────

/**
 * A do-not-return list is the company's own and is never read across
 * companies.
 *
 * This was assumed rather than enforced. `GET` filtered on
 * `companyId: caller.company?.id`, and `company` is typed nullable on
 * `CallerContext` for good reason — a machine key, a context whose
 * company did not resolve. Prisma drops an `undefined` from a `where`
 * instead of matching nothing, so a caller with no company would have
 * been handed EVERY company's do-not-return list in one response. The
 * only thing standing in front of it was a permission check, and a
 * caller with no company holds no permissions today — which is a fact
 * about seeding, not a wall. It is a refusal in words now.
 */
export const NO_COMPANY =
  'A do-not-return list belongs to one company and is never read across companies. Your ' +
  'sign-in is not attached to a company here, so there is no list to show you. Whoever ' +
  'invited you can seat you at theirs.'

// ── Whether a bar still stands ───────────────────────────────────────

export interface Bar {
  liftedAt: Date | null
  expiresAt: Date | null
}

/**
 * Lifted is over, and a date that has passed is over.
 *
 * The same arithmetic the query does, kept here as a pure function so
 * the rows a reader is shown and the flag beside each of them cannot
 * disagree — and so a bar that ran out this morning is inert the moment
 * somebody asks, whether or not anything has swept it.
 */
export function stillStands(bar: Bar, now: Date): boolean {
  if (bar.liftedAt !== null) return false
  return bar.expiresAt === null || bar.expiresAt > now
}
