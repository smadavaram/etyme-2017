import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { toExport, type Entry, type ErpSystem } from '@/lib/gl'

/**
 * GET  /api/integrations/export — what is waiting to go to their books
 * POST /api/integrations/export — export it, once, stamped as sent
 *
 * Export once is the whole contract: a journal entry re-exported into
 * somebody's real ledger is a double posting their auditor finds and we
 * caused. So the stamp and the file are one transaction, and an entry
 * with exportedAt set never goes again.
 *
 * Refuses on an unmapped account rather than substituting a suspense
 * line — a suspense line is a line somebody chases in a month, in our
 * direction.
 */

const SYSTEMS = ['SAP', 'ORACLE', 'WORKDAY', 'NETSUITE', 'QUICKBOOKS', 'XERO', 'CSV']

async function mapFor(companyId: string, system: string) {
  const rows = await prisma.erpAccountMap.findMany({
    where: { companyId, system: system as any },
    include: { account: { select: { code: true } } },
  })
  const map: Record<string, { account: string; costObject?: string }> = {}
  for (const r of rows) {
    map[r.account.code] = {
      account: r.theirAccount,
      ...(r.theirCostObject ? { costObject: r.theirCostObject } : {}),
    }
  }
  return map
}

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'Integrations')
  if (notStaff) return notStaff

  const companyId = caller.company!.id
  const [pending, sent, maps] = await Promise.all([
    prisma.journalEntry.count({ where: { companyId, exportedAt: null } }),
    prisma.journalEntry.count({ where: { companyId, exportedAt: { not: null } } }),
    prisma.erpAccountMap.groupBy({ by: ['system'], where: { companyId }, _count: true }),
  ])

  return NextResponse.json({
    data: {
      pending,
      sent,
      systems: SYSTEMS.map((s) => ({
        system: s,
        mappedAccounts: maps.find((m) => m.system === s)?._count ?? 0,
      })),
    },
  })
}

export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'Integrations')
  if (notStaff) return notStaff

  const companyId = caller.company!.id
  const body = await request.json().catch(() => ({}))
  const system = String(body?.system ?? '')
  if (!SYSTEMS.includes(system)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: `Say which system: ${SYSTEMS.join(', ')}.`, field: 'system' } },
      { status: 422 }
    )
  }

  const map = await mapFor(companyId, system)

  const entries = await prisma.journalEntry.findMany({
    where: { companyId, exportedAt: null },
    include: { lines: { include: { account: { select: { code: true } } } } },
    orderBy: { postedAt: 'asc' },
    take: 1000,
  })

  if (entries.length === 0) {
    return NextResponse.json({
      data: { rows: 0, csv: null, says: 'Nothing waiting. Everything already went.' },
    })
  }

  const allRows: string[] = ['account,debit,credit,currency,date,memo,cost_object,reference']
  const unmappedAll = new Set<string>()

  for (const e of entries) {
    const entry: Entry = {
      postedAt: e.postedAt,
      memo: e.memo,
      lines: e.lines.map((l) => ({
        accountCode: l.account.code,
        debitCents: l.debitCents,
        creditCents: l.creditCents,
        memo: l.memo ?? undefined,
      })),
    }
    const out = toExport(entry, system as ErpSystem, map, e.lines[0]?.currency ?? 'USD', e.id)
    if (out.unmapped.length > 0) {
      out.unmapped.forEach((u) => unmappedAll.add(u))
      continue
    }
    for (const r of out.rows) {
      allRows.push(
        [r.account, r.debit, r.credit, r.currency, r.date,
          `"${(r.memo ?? '').replace(/"/g, '""')}"`, r.costObject ?? '', r.reference ?? ''].join(',')
      )
    }
  }

  if (unmappedAll.size > 0) {
    return NextResponse.json(
      {
        error: {
          code: 'UNMAPPED_ACCOUNTS',
          message:
            `${unmappedAll.size} account${unmappedAll.size === 1 ? ' has' : 's have'} no ` +
            `${system} mapping: ${[...unmappedAll].sort().join(', ')}. Map them first — ` +
            `a suspense line is a line somebody chases in a month, in our direction.`,
        },
      },
      { status: 422 }
    )
  }

  // The stamp and the file are one act. A crash between them must not
  // leave an entry both sent and resendable.
  const now = new Date()
  await prisma.journalEntry.updateMany({
    where: { id: { in: entries.map((e) => e.id) } },
    data: { exportedAt: now, exportedTo: system },
  })

  return NextResponse.json({
    data: {
      rows: entries.length,
      csv: allRows.join('\n'),
      says: `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} exported to ${system} and stamped. They will not go again.`,
    },
  })
}
