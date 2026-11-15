import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { hasPermission, askTheDesk } from '@/lib/permissions'
import { toExport, type Entry } from '@/lib/gl'
import { journalWords, JOURNAL_FILE, NO_CODES_HERE } from './words'

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
 *
 * One generic file (fix list of 2026-11-14, E6): Etyme is connected to no
 * accounting system, and no layout is named after a product, so the
 * export is always the one file (`JOURNAL_FILE`) and the screen offers no
 * product to pick. What the page says is `journalWords`.
 */

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

  // The company's journal to its own books is money, read by the desks
  // that read money — not by everybody on staff.
  if (!hasPermission(caller.permissions, 'invoices.read')) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: askTheDesk({
            doing: 'Reading what is waiting to go to the company\u2019s books',
            needs: 'invoices.read',
            kind: caller.company?.kind,
            companyName: caller.company?.name,
          }),
        },
      },
      { status: 403 }
    )
  }

  const companyId = caller.company!.id
  const [pending, sent, mappedAccounts] = await Promise.all([
    prisma.journalEntry.count({ where: { companyId, exportedAt: null } }),
    prisma.journalEntry.count({ where: { companyId, exportedAt: { not: null } } }),
    prisma.erpAccountMap.count({ where: { companyId, system: JOURNAL_FILE } }),
  ])
  // Export is drawn only for a seat the POST below takes (invoices.issue);
  // a reader is told who exports instead of shown a button it is refused.
  const mayExport = hasPermission(caller.permissions, 'invoices.issue')
  const whoExports = askTheDesk({
    doing: 'Sending the journal to the company\u2019s books',
    needs: 'invoices.issue',
    kind: caller.company?.kind,
    companyName: caller.company?.name,
  })
  const words = journalWords({ pending, sent, mappedAccounts, mayExport, whoExports })

  return NextResponse.json({
    data: { pending, sent, mappedAccounts, mayExport, says: words.says, showExport: words.showExport },
  })
}

export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'Integrations')
  if (notStaff) return notStaff

  // Export once, into somebody's real ledger, and never again. That is
  // the desk that bills, not anybody who can sign in — which is what
  // this door was until 2026-09-30.
  if (!hasPermission(caller.permissions, 'invoices.issue')) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: askTheDesk({
            doing: 'Sending the journal to the company\u2019s books',
            needs: 'invoices.issue',
            kind: caller.company?.kind,
            companyName: caller.company?.name,
          }),
        },
      },
      { status: 403 }
    )
  }

  const companyId = caller.company!.id
  // One file, whatever a caller names: no product's layout (E6).
  const system = JOURNAL_FILE

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
    const out = toExport(entry, system, map, e.lines[0]?.currency ?? 'USD', e.id)
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
            `${unmappedAll.size} Etyme account${unmappedAll.size === 1 ? ' has' : 's have'} no account code of your own yet: ` +
            `${[...unmappedAll].sort().join(', ')}. Nothing was exported. ${NO_CODES_HERE}`,
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
      says: `${entries.length} entr${entries.length === 1 ? 'y is' : 'ies are'} in the file and stamped as sent. They will not go again.`,
    },
  })
}
