/**
 * Who on a firm's payroll is somebody it puts forward, and who runs the firm.
 *
 * The integrator tester opened Submit as a delivery manager and was
 * offered HR (Farah Haddad), both delivery managers and the owner as if
 * they were billable consultants. Every one of them holds an EMPLOYEE
 * seat, which is all the picker read — and a client receiving the owner
 * of its supplier as a candidate is the kind of mistake nobody makes
 * twice, because they stop using the screen.
 *
 * Two facts decide it, both already on the record:
 *
 *   - **The work.** Somebody who has been on a contract line, been put
 *     forward, or keeps a consultant profile is somebody this firm
 *     staffs. That is the same reading `ownPage` uses to decide a person
 *     is a worker, and it wins over the seat: a delivery lead who also
 *     bills a client is offered.
 *   - **The seat.** A seat that only reads its own assignments and files
 *     its own hours is a worker's seat. A seat that holds any desk
 *     permission — the owner's everything, HR's paperwork, a manager's
 *     demand — runs the firm, and is not offered unless the work says
 *     otherwise.
 *
 * The submit route still accepts any employee, because the consent rule
 * is about employment and not about job titles; this narrows what the
 * picker offers, never what the door allows.
 */

/** What a worker's own seat may do: see their work, file their own hours and claims. */
const SELF_SERVICE = new Set([
  'assignments.read',
  'timesheets.read',
  'timesheets.write',
  'expenses.read',
  'expenses.write',
  'documents.read',
  'profile.write',
])

export function seatRunsTheFirm(permissions: string[]): boolean {
  return permissions.some((p) => !SELF_SERVICE.has(p))
}

export function offeredForWork(f: { permissions: string[]; worksHere: boolean }): boolean {
  return f.worksHere || !seatRunsTheFirm(f.permissions)
}
