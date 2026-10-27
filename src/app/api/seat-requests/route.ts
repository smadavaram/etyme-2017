import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { staffOnly } from '@/lib/seat'
import { notify } from '@/lib/notify'
import { findFirmByWord } from '@/lib/company-create'
import { formatDay } from '@/lib/format-date'
import { liveSeatWhere, mayAskForSeat, askedSentence, askNotice } from '@/lib/program-seat'

/**
 * GET  /api/seat-requests — the asks this company made, or the open asks
 *                           made of it
 * POST /api/seat-requests — an MSP asks a client for a seat
 *   { client: "Northbend Athletic" | "northbend", note? }
 *
 * The onboarding walk of 2026-10-27: an MSP that signed up was told to
 * "ask an owner or the program manager at that client" and had nowhere to
 * ask. The ask is a row the client reads on its MSPs page and a notice to
 * whoever there may grant a seat — the holders of `governance.write`, the
 * same desks `mayGrantSeat` lets grant one. An ask grants nothing; the
 * seat is still the client's to give, through `POST /api/program/seats`.
 * An ask is answered by a grant (a live seat made after it) or by "Not
 * now" (`/api/seat-requests/:id`); nothing else closes it.
 */

/** Who at a client may grant a seat: the people it would notify. */
async function grantersAt(clientCompanyId: string): Promise<string[]> {
  const seats = await prisma.context.findMany({
    where: { companyId: clientCompanyId, revokedAt: null, roleId: { not: null } },
    select: { personId: true, role: { select: { permissions: true } } },
  })
  return [...new Set(seats.filter((s) => hasPermission((s.role?.permissions ?? []) as string[], 'governance.write')).map((s) => s.personId))]
}

/** Open: not closed, and no live seat granted to that office since it was asked. */
async function stillOpen(row: { officeCompanyId: string; clientCompanyId: string; createdAt: Date; closedAt: Date | null }): Promise<boolean> {
  if (row.closedAt) return false
  const granted = await prisma.programSeat.count({
    where: { officeCompanyId: row.officeCompanyId, clientCompanyId: row.clientCompanyId, grantedAt: { gte: row.createdAt }, ...liveSeatWhere() },
  })
  return granted === 0
}

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'Seat requests')
  if (notStaff) return notStaff
  const company = caller.company!

  if (company.kind === 'CLIENT') {
    // What the grant form opens on. Read by whoever may grant, and by
    // whoever reads the rules, the way the MSPs page itself is read.
    if (!hasPermission(caller.permissions, 'governance.read') && !hasPermission(caller.permissions, 'governance.write')) {
      return NextResponse.json({ data: { side: 'CLIENT', asks: [] } })
    }
    const rows = await prisma.programSeatRequest.findMany({
      where: { clientCompanyId: company.id, closedAt: null },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, note: true, createdAt: true, closedAt: true, officeCompanyId: true, clientCompanyId: true,
        officeCompany: { select: { id: true, name: true, slug: true } },
        askedBy: { select: { name: true } },
      },
    })
    const open = []
    for (const r of rows) if (await stillOpen(r)) open.push(r)
    return NextResponse.json({
      data: {
        side: 'CLIENT',
        asks: open.map((r) => ({
          id: r.id,
          office: r.officeCompany,
          askedBy: r.askedBy.name,
          askedOn: formatDay(r.createdAt),
          note: r.note,
          says: `${r.askedBy.name} at ${r.officeCompany.name} asked for a seat on ${formatDay(r.createdAt)}${r.note ? `: “${r.note}”` : ''}.`,
        })),
      },
    })
  }

  const rows = await prisma.programSeatRequest.findMany({
    where: { officeCompanyId: company.id },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true, createdAt: true, closedAt: true, officeCompanyId: true, clientCompanyId: true,
      clientCompany: { select: { name: true } },
    },
  })
  const asks = []
  for (const r of rows) {
    const open = await stillOpen(r)
    asks.push({
      id: r.id,
      client: r.clientCompany.name,
      askedOn: formatDay(r.createdAt),
      state: r.closedAt ? 'NOT_NOW' : open ? 'WAITING' : 'GRANTED',
      says: r.closedAt
        ? `${r.clientCompany.name} answered Not now on ${formatDay(r.closedAt)}.`
        : open
          ? `Asked ${r.clientCompany.name} on ${formatDay(r.createdAt)}. Waiting on their owner or program manager.`
          : `${r.clientCompany.name} granted a seat.`,
    })
  }
  return NextResponse.json({ data: { side: 'OFFICE', asks } })
}

export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'Asking for a seat')
  if (notStaff) return notStaff
  const office = caller.company!

  const body = await request.json().catch(() => ({}))
  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 300) : null
  const word = String(body.client ?? '')

  // Found among clients first; a firm of another kind by that name is
  // named so the refusal can say why rather than "not found".
  const found = await findFirmByWord(word, { kinds: ['CLIENT'], kindWord: 'client', isDemo: office.isDemo === true })
  const other = found.ok
    ? null
    : await findFirmByWord(word, { kinds: ['VENDOR', 'GSI', 'MSP', 'CONSULTANT_CORP'], kindWord: 'company', isDemo: office.isDemo === true })
  const client = found.ok ? found.firm : other?.ok ? other.firm : null

  const seated = client
    ? (await prisma.programSeat.count({ where: { officeCompanyId: office.id, clientCompanyId: client.id, ...liveSeatWhere() } })) > 0
    : false
  const openAsk = client
    ? await prisma.programSeatRequest.findFirst({
        where: { officeCompanyId: office.id, clientCompanyId: client.id, closedAt: null },
        orderBy: { createdAt: 'desc' },
        select: { id: true, createdAt: true, officeCompanyId: true, clientCompanyId: true, closedAt: true },
      })
    : null
  const pending = openAsk && (await stillOpen(openAsk)) ? openAsk : null

  const verdict = mayAskForSeat({
    office: { id: office.id, kind: office.kind, name: office.name },
    client: client ? { id: client.id, kind: client.kind, name: client.name } : null,
    seated,
    openAsk: pending,
  })
  if (!verdict.ok) {
    const says = verdict.code === 'NO_SUCH_CLIENT' && !found.ok ? found.says : verdict.says
    const status = verdict.code === 'NO_SUCH_CLIENT' ? 404 : verdict.code === 'A_CLIENT' ? 403 : 422
    return NextResponse.json({ error: { code: verdict.code, message: says } }, { status })
  }

  // Asking twice is one ask: the second says when the first went.
  if (pending) {
    return NextResponse.json({
      data: { id: pending.id, again: true, says: askedSentence({ client: client!.name, office: office.name, again: true, on: formatDay(pending.createdAt) }) },
    })
  }

  const row = await prisma.programSeatRequest.create({
    data: { officeCompanyId: office.id, clientCompanyId: client!.id, askedById: caller.person.id, note },
    select: { id: true },
  })
  const words = askNotice({ office: office.name, asker: caller.person.name, note })
  for (const personId of await grantersAt(client!.id)) {
    void notify({
      personId, companyId: client!.id, type: 'SYSTEM', channel: 'EMAIL', entityId: row.id,
      title: words.title, body: words.body,
      data: { href: '/dashboard/program/seats', seatRequestId: row.id },
    })
  }
  return NextResponse.json(
    { data: { id: row.id, again: false, says: askedSentence({ client: client!.name, office: office.name, again: false, on: formatDay(new Date()) }) } },
    { status: 201 }
  )
}
