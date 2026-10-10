import { NextResponse } from 'next/server'
import type { CallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission, askTheDesk, type Permission } from '@/lib/permissions'
import { recordRefusal } from '@/lib/access-log'

/**
 * Who may import people and contracts, and into which company.
 *
 * Sign-up walk, round five, problem 1 (2026-10-08). Every import route
 * checked only that somebody was signed in and took `companyId` from the
 * body. A Member at Northbend Athletic, with no desk, imported a person
 * into Teleworld Solutions: the person was put on Teleworld's bench
 * without consenting and given a live sell line at $150/hr. A candidate
 * with no company read another import's rows, pay and bill rates
 * included.
 *
 * So: every import route resolves its caller through `getCallerContext`
 * — the one door, which already refuses a seat with no desk — and then
 * here. An import always belongs to the caller's own company, never to a
 * company named in the request, and it is read, mapped, corrected and
 * committed only by a seat at that company holding the permission the
 * People sheet asks for (`lib/importable`), because committing one
 * writes people, bench listings and contract lines.
 */
export const IMPORTS_PEOPLE: Permission = 'consultants.write'

/** The refusal for a caller who may not import at all, or null where they may. */
export function importRefusal(caller: CallerContext): NextResponse | null {
  if (!caller.company) {
    return NextResponse.json(
      {
        error: {
          code: 'NO_COMPANY',
          message: 'An import loads people into a company, and you are not signed in at one.',
        },
      },
      { status: 403 }
    )
  }
  if (!hasPermission(caller.permissions, IMPORTS_PEOPLE)) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: askTheDesk({
            doing: 'Importing people and their contracts',
            needs: IMPORTS_PEOPLE,
            kind: caller.company.kind,
            companyName: caller.company.name,
          }),
        },
      },
      { status: 403 }
    )
  }
  return null
}

/**
 * The import by this id, if it is the caller's own company's.
 *
 * Another company's import is answered as one that does not exist —
 * confirming it exists is itself a leak — and where it was committed,
 * the people it created are each written a refused read, because its
 * rows are their details.
 */
export async function ownImport(
  caller: CallerContext,
  id: string
): Promise<
  | { import: { id: string; companyId: string; kind: string; committedAt: Date | null; rowCount: number; issueCount: number; mapping: unknown }; error: null }
  | { import: null; error: NextResponse }
> {
  const found = await prisma.import.findUnique({
    where: { id },
    select: { id: true, companyId: true, kind: true, committedAt: true, rowCount: true, issueCount: true, mapping: true },
  })
  const mine = caller.company?.id
  if (!found || found.companyId !== mine) {
    if (found) {
      const created = await prisma.importRow.findMany({
        where: { importId: id, createdId: { not: null } },
        select: { createdId: true },
      })
      await recordRefusal(created.map((r) => r.createdId!), {
        actorPersonId: caller.person.id,
        actorCompanyId: mine ?? undefined,
        action: 'PROFILE_VIEW',
        allowed: false,
        reason: 'An import belongs to the company that made it',
      })
    }
    return {
      import: null,
      error: NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `There is no import by that id at ${caller.company?.name ?? 'your company'}.` } },
        { status: 404 }
      ),
    }
  }
  return { import: found, error: null }
}
