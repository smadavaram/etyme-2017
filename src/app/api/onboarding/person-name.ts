import { renameNameSays } from '@/app/api/access/row-acts'
import { rolesFor, type CompanyKind } from '@/lib/company-defaults'

/**
 * The name a person is given the first time they sign up (fix list,
 * 2026-11-15). The sign-up form's one name box is the company's name, and
 * it was written onto the person too, so a firm's first person read as the
 * firm on Settings → Owners, and an Owner looked like a company. A typed
 * name is used only where it is a person's name by the rule Rename uses
 * (`renameNameSays`, regulatory's): never the company's own name and never
 * a role word. Otherwise the first part of the address stands in, the way
 * it always has. Pure. A person already on Etyme keeps their name: the
 * caller only names a person it creates, so no row already written moves.
 */
const KINDS: CompanyKind[] = ['VENDOR', 'CLIENT', 'MSP', 'GSI', 'CONSULTANT_CORP']
const ROLE_NAMES = [...new Set(KINDS.flatMap((k) => rolesFor(k).map((r) => r.name)))]

export function signUpPersonName(typed: unknown, email: string, companyName: string | null): string {
  const name = typeof typed === 'string' ? typed.trim().replace(/\s+/g, ' ') : ''
  if (name && renameNameSays(name, companyName, ROLE_NAMES) === null) return name
  return email.split('@')[0]
}
