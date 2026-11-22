import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import type { CallerContext } from '@/lib/api-context'
import { directoryScope } from '@/lib/directory-scope'
import {
  groupsOf, groupTotals, groupsAddUpSays, sellsToSomebody, isMine, notLinkedYet, END_CLIENT_ROW,
  type GroupsRead, type GroupTotals, type OnContracts,
} from '@/lib/counterparty'
import { companiesOnList } from './dealings'
import { positionsFor, type PositionsRead } from './positions'

/**
 * Customers, clients and suppliers, read in one place (record 110, A1).
 *
 * For one firm and the companies on its list: what its own contract
 * lines say (who is billed, where the person works, who supplies), and
 * what a person said on its own register, kept apart. The Companies
 * list, its tabs, the Classify page and the two pickers all read this,
 * so they cannot disagree. It reads the caller's own lines and its own
 * register rows only, and writes nothing.
 */

type Db = Prisma.TransactionClient | typeof prisma

export interface GroupsRow extends GroupsRead {
  contracts: OnContracts
  /** When a person last said what it is, and who. Null where nobody has. */
  classifiedAt: string | null
  classifiedByName: string | null
}

type ListCompany = { id: string; kind: string; claimedAt: Date | null; listedById: string | null }

export async function groupsFor(
  me: { id: string; kind: string | null },
  companies: readonly ListCompany[],
  at: ReadonlyMap<string, Pick<PositionsRead, 'positions' | 'notClassified'>>,
  notLinked: ReadonlySet<string> = new Set(),
  db: Db = prisma,
): Promise<Map<string, GroupsRow>> {
  const out = new Map<string, GroupsRow>()
  if (companies.length === 0) return out
  const ids = companies.map((c) => c.id)
  const sells = sellsToSomebody(me.kind)
  const [said, sellLines, buyLines] = await Promise.all([
    db.counterparty.findMany({
      where: { companyId: me.id, otherCompanyId: { in: ids }, relationship: { in: ['CLIENT', END_CLIENT_ROW] } },
      select: { otherCompanyId: true, relationship: true, classifiedAt: true, classifiedById: true },
    }),
    sells
      ? db.sellContract.findMany({
          where: { companyId: me.id, OR: [{ clientCompanyId: { in: ids } }, { endClientCompanyId: { in: ids } }] },
          select: { clientCompanyId: true, endClientCompanyId: true },
        })
      : Promise.resolve([]),
    db.buyContract.findMany({ where: { companyId: me.id, vendorCompanyId: { in: ids } }, select: { vendorCompanyId: true } }),
  ])
  const on = new Map<string, OnContracts>()
  const of = (id: string) => {
    let c = on.get(id)
    if (!c) on.set(id, (c = { billedOn: 0, worksiteOn: 0, worksiteNamedOn: 0, suppliesOn: 0 }))
    return c
  }
  for (const l of sellLines) {
    of(l.clientCompanyId).billedOn++
    // Empty means the same company: the one billed is where she works.
    of(l.endClientCompanyId ?? l.clientCompanyId).worksiteOn++
    if (l.endClientCompanyId) of(l.endClientCompanyId).worksiteNamedOn++
  }
  for (const l of buyLines) if (l.vendorCompanyId) of(l.vendorCompanyId).suppliesOn++

  const byIds = [...new Set(said.map((s) => s.classifiedById).filter((x): x is string => !!x))]
  const names = new Map(
    byIds.length > 0 ? (await db.person.findMany({ where: { id: { in: byIds } }, select: { id: true, name: true } })).map((p) => [p.id, p.name]) : [],
  )
  for (const c of companies) {
    const rows = said.filter((s) => s.otherCompanyId === c.id && s.classifiedAt != null)
    const customer = rows.find((s) => s.relationship === 'CLIENT')
    const client = rows.find((s) => s.relationship === END_CLIENT_ROW)
    const last = [customer, client].filter((s): s is NonNullable<typeof s> => !!s).sort((a, b) => b.classifiedAt!.getTime() - a.classifiedAt!.getTime())[0]
    const contracts = on.get(c.id) ?? { billedOn: 0, worksiteOn: 0, worksiteNamedOn: 0, suppliesOn: 0 }
    const read = groupsOf({
      kind: c.kind,
      positions: at.get(c.id)?.positions ?? [],
      notClassified: at.get(c.id)?.notClassified ?? false,
      notLinked: notLinked.has(c.id),
      own: c.id === me.id,
      saidCustomerAt: customer?.classifiedAt ?? null,
      saidClientAt: client?.classifiedAt ?? null,
      onContracts: contracts,
    }, sells)
    out.set(c.id, {
      ...read,
      contracts,
      classifiedAt: last?.classifiedAt?.toISOString() ?? null,
      classifiedByName: last?.classifiedById ? names.get(last.classifiedById) ?? null : null,
    })
  }
  return out
}

/** The counts over a list already read, and the line that says how they add up. */
export function totalsOver(rows: Iterable<GroupsRead>, tenantKind: string | null): { totals: GroupTotals; says: string } {
  const totals = groupTotals([...rows], sellsToSomebody(tenantKind))
  return { totals, says: groupsAddUpSays(totals) }
}

export interface ListedRow { id: string; name: string; onEtyme: boolean; read: GroupsRow }

/**
 * The caller's whole Companies list with its groups: the same companies
 * `GET /api/companies?records=1` draws, read through the same readers
 * (`companiesOnList`, `positionsFor`, `notLinkedYet`). For a seat at a
 * company only.
 */
export async function listWithGroups(caller: CallerContext): Promise<{ rows: ListedRow[]; totals: GroupTotals; says: string }> {
  const me = caller.company!
  const verdict = directoryScope({ as: 'COMPANY', kind: me.kind as any, isDemo: Boolean(me.isDemo) })
  const sides = await companiesOnList(caller, verdict.includesOwn, true)
  const companies = await prisma.company.findMany({
    where: { id: { in: [...sides.ids] } },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, kind: true, claimedAt: true, listedById: true, _count: { select: { contexts: { where: { roleId: { not: null } } } } } },
  })
  const at = await positionsFor(me.id, companies)
  const notLinked = new Set(
    companies
      .filter((c) => notLinkedYet({ ownSideOnly: sides.ownSideOnly.has(c.id), onEtyme: c.claimedAt != null || c._count.contexts > 0, mine: isMine(c, me.id) }))
      .map((c) => c.id),
  )
  const groups = await groupsFor(me, companies, at, notLinked)
  const rows = companies.map((c) => ({ id: c.id, name: c.name, onEtyme: c.claimedAt != null || c._count.contexts > 0, read: groups.get(c.id)! }))
  return { rows, ...totalsOver(rows.map((r) => r.read), me.kind) }
}
