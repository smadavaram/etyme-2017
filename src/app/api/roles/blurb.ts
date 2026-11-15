import { rolesFor } from '@/lib/company-defaults'
import { roleCanDo } from '@/lib/company-roles'
import type { CompanyKind } from '@prisma/client'

/**
 * The one line a role carries in the invite picker (fix list 2026-11-14,
 * A3): the line the company's default roles already say, never a new
 * description of a role.
 *
 * Only where the role still holds exactly what the shipped role of that
 * name holds. A role somebody at the company wrote, or changed, gets no
 * line here, because the shipped line may no longer be true of it; the
 * picker says how much it can do instead. An Admin matches the shipped
 * Admin, the narrowed Admin or the founding Admin, whichever it holds.
 */
export function shippedLineFor(
  kind: CompanyKind | string | null | undefined,
  role: { name: string; permissions: readonly string[] },
): string | null {
  if (!kind) return null
  const k = kind as CompanyKind
  const seeds = [...rolesFor(k), ...rolesFor(k, { narrowAdmin: true }), ...rolesFor(k, { foundingAdmin: true })]
  const held = sameSet(role.permissions)
  const seed = seeds.find((s) => s.name === role.name && sameSet(s.permissions) === held)
  return seed?.blurb ?? null
}

/** Read the way Settings → Roles counts (`roleCanDo`): "*" is the whole catalog. */
function sameSet(ps: readonly string[]): string {
  return roleCanDo({ permissions: ps }).list.join(' ')
}
