import type { Permission } from '@/lib/permissions'

/**
 * Every permission in the words the Owner reads when giving it (founder,
 * 2026-11-08: "pick the permission in plain words"). Pure, so the "Give
 * access" dialog may import it.
 *
 * Each label completes "Let them …", lower case, no full stop. A Record
 * over every permission, so a permission added to lib/permissions without
 * a label here fails the type check rather than reaching the dialog as a
 * key.
 */
export const GRANT_LABELS: Record<Permission, string> = {
  'consultants.read': 'see the people this firm has on its books',
  'consultants.write': 'add and edit those people',
  'consultants.cost': 'see what each person costs',
  'requirements.read': 'read open jobs',
  'requirements.write': 'write and change job requests',
  'requirements.distribute': 'choose which suppliers see a job',
  'submissions.read': 'read who was put forward',
  'submissions.create': 'put somebody forward',
  'submissions.rate': 'set the rate somebody is put forward at',
  'assignments.read': 'read contracts',
  'assignments.write': 'write and extend contracts',
  'assignments.terminate': 'end a contract',
  'timesheets.read': 'read timesheets',
  'timesheets.approve': 'approve timesheets',
  'invoices.read': 'read bills and what came in',
  'invoices.issue': 'send a bill to a customer',
  'orders.raise': 'raise an order to a supplier',
  'rates.read': 'read agreed rates',
  'rates.write': 'set and change agreed rates',
  'payments.record': 'record money received',
  'payroll.read': 'read payroll',
  'payroll.run': 'run payroll',
  'payroll.approve': 'approve a payroll run',
  'vendors.read': 'see the suppliers this firm uses',
  'vendors.manage': 'add and remove suppliers',
  'network.read': 'look outside the firm at the wider market',
  'utilization.read': 'see how fully people are booked',
  'margin.read': 'read what placements make',
  'pnl.read': 'read the firm’s profit and loss',
  'team.manage': 'invite colleagues and change roles',
  'settings.manage': 'change company settings',
  'governance.read': 'read the approval rules and who holds what',
  'governance.write': 'change the approval rules',
  'privacy.manage': 'act on somebody else’s data rights',
}

/** The right to give access, which only the Owner gives, to a person by name. */
export const GRANT_RIGHT_LABEL = 'give access to others, never beyond their own'

/** How far a grant reaches, as the dialog says it. */
export const SCOPE_LABELS = {
  COMPANY: 'The whole company',
  UNIT: 'One team and every team under it',
  PERSON: 'Only their own work',
} as const
