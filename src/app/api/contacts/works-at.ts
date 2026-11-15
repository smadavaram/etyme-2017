import { prisma } from '@/lib/db'
import type { CallerContext } from '@/lib/api-context'
import { isMine } from '@/lib/counterparty'
import type { WorksAtBook } from '@/lib/contacts'
import { companiesOnList } from '../companies/dealings'
import { ownDomainsFor } from '../companies/twins'

/**
 * Where a contact may work, for one caller: its own firm, and every
 * company on its Companies list, read through the list's own reader
 * (`companiesOnList`), so Add contact offers exactly what the route takes
 * and what the Companies page draws (fix list of 2026-11-14, item A2).
 *
 * A sub-vendor whose name is the prime's to keep is not on the list, so
 * it is not here either (`namesForClient`, inside the reader). A domain
 * is read only where the Companies list would print it: the reader's own
 * note on a company it recorded, or the domain a firm it works with
 * proved. A firm on Etyme it reached only by its own writing gives its
 * name and nothing more, as on the list (record 61).
 */
export async function worksAtBook(caller: CallerContext): Promise<WorksAtBook> {
  const me = caller.company!
  const sides = await companiesOnList(caller, false, true)
  sides.ids.delete(me.id)
  const rows = sides.ids.size === 0 ? [] : await prisma.company.findMany({
    where: { id: { in: [...sides.ids] } },
    select: { id: true, name: true, domain: true, website: true, claimedAt: true, listedById: true },
  })
  const noted = await ownDomainsFor(me.id, rows)
  return {
    own: { id: me.id, name: me.name },
    companies: rows.map((r) => {
      const nameOnly = sides.ownSideOnly.has(r.id) && !isMine(r, me.id)
      return { id: r.id, name: r.name, domain: nameOnly ? null : r.domain ?? noted.get(r.id)?.domain ?? null }
    }),
  }
}
