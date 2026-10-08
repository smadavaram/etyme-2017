/**
 * A person's name, only where the reader's company already knows them.
 *
 * Sign-up walk, round five (2026-10-08), problem 8. Two refusals turned
 * an id into a name across tenants: Timesheets answered Karthik, at
 * Teleworld, "Helena Marsh's timesheet is not part of your seat" for a
 * Techpeple worker Teleworld has no tie to, and the terms page told Mo,
 * a Member at Northbend, who a submission was for. A refusal that names
 * is right for a colleague the reader already knows; it is a leak when
 * the name is looked up from an id the reader typed.
 *
 * "Known" is a live seat of any kind at the reader's company — an
 * employee, a consultant on its bench, an owner. Anybody else is not
 * named, and the refusal says "That …" instead.
 */
import { prisma } from '@/lib/db'

export async function nameIfKnown(
  personId: string,
  companyId: string | null | undefined
): Promise<{ exists: boolean; name: string | null }> {
  const person = await prisma.person.findUnique({ where: { id: personId }, select: { name: true } })
  if (!person) return { exists: false, name: null }
  if (!companyId) return { exists: true, name: null }
  const seat = await prisma.context.findFirst({
    where: { personId, companyId, revokedAt: null },
    select: { id: true },
  })
  return { exists: true, name: seat ? person.name : null }
}
