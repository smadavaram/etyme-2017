import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'
import { staffOnly } from '@/lib/seat'
import { notify } from '@/lib/notify'
import { findFirm, workTogether } from '@/lib/company-create'
import { formatDay } from '@/lib/format-date'
import { mayAskToLink, askerReads, readerReads, mirrorOf, wordFor } from '@/lib/trade-link'
import type { Relationship } from '@/lib/counterparty'

/**
 * GET  /api/trade-links — the asks this company made and the open asks made of it
 * POST /api/trade-links — ask a firm already on Etyme to link
 *   { companyId } | { name, domain?, address? }, relationship, note?
 *   relationship: what THEY are to you — CLIENT · SUPPLIER · PRIME · MSP
 *
 * Coordinator's call, 2026-10-27: two firms already on Etyme link by one
 * ask and one yes (`lib/trade-link`). Nothing is on either register until
 * the yes (`POST /api/trade-links/:id`). One open ask per pair, either way.
 * Asking and answering are for whoever keeps the firm's list of companies
 * (`vendors.manage`), the same permission "Add company" asks for.
 */

const ASKS = 'vendors.manage'

/** Who at a firm hears an ask: whoever may answer it. */
async function answerersAt(companyId: string): Promise<string[]> {
  const seats = await prisma.context.findMany({
    where: { companyId, revokedAt: null, roleId: { not: null } },
    select: { personId: true, role: { select: { permissions: true } } },
  })
  return [...new Set(seats.filter((s) => hasPermission((s.role?.permissions ?? []) as string[], ASKS)).map((s) => s.personId))]
}

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'Link requests')
  if (notStaff) return notStaff
  const me = caller.company
  if (!me) return NextResponse.json({ data: { made: [], received: [] } })

  const pick = { id: true, name: true, slug: true, kind: true } as const
  const [made, received] = await Promise.all([
    prisma.tradeLinkRequest.findMany({
      where: { fromCompanyId: me.id }, orderBy: { createdAt: 'desc' }, take: 20,
      select: { id: true, relationship: true, createdAt: true, answer: true, answeredAt: true, toCompany: { select: pick } },
    }),
    prisma.tradeLinkRequest.findMany({
      where: { toCompanyId: me.id, answeredAt: null }, orderBy: { createdAt: 'asc' },
      select: { id: true, relationship: true, createdAt: true, note: true, fromCompany: { select: pick }, askedBy: { select: { name: true } } },
    }),
  ])
  return NextResponse.json({
    data: {
      made: made.map((r) => ({
        id: r.id,
        company: r.toCompany,
        relationship: r.relationship,
        state: r.answer ?? 'WAITING',
        says: r.answer === 'ACCEPTED'
          ? `${r.toCompany.name} said yes on ${formatDay(r.answeredAt!)}. You are linked.`
          : r.answer === 'NOT_NOW'
            ? `${r.toCompany.name} answered Not now on ${formatDay(r.answeredAt!)}.`
            : `Asked ${r.toCompany.name} on ${formatDay(r.createdAt)} to link as your ${wordFor(r.relationship as Relationship, me.kind)}. Waiting on them.`,
      })),
      received: received.map((r) => {
        const theirs = mirrorOf(r.relationship as Relationship, r.fromCompany.kind)
        return {
          id: r.id,
          company: r.fromCompany,
          // What the asker is to the reader, in the reader's own register words.
          relationship: theirs,
          note: r.note,
          says: `${r.askedBy.name} at ${r.fromCompany.name} asks to link as your ${wordFor(theirs, me.kind)} (asked ${formatDay(r.createdAt)}).`,
        }
      }),
    },
  })
}

export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'Asking a firm to link')
  if (notStaff) return notStaff
  const me = caller.company
  if (!me) return NextResponse.json({ error: { code: 'NO_COMPANY', message: 'Sign in at your company to ask another firm to link.' } }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const relationship = String(body.relationship ?? '')
  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 300) : null

  // The firm, by its id where "Add company" just found it, else by the facts.
  const other = typeof body.companyId === 'string' && body.companyId
    ? await prisma.company.findFirst({
        where: { id: body.companyId, claimedAt: { not: null }, isDemo: me.isDemo === true },
        select: { id: true, name: true, kind: true },
      })
    : await findFirm({
        emailDomain: body.domain ? String(body.domain) : null,
        etymeAddress: body.address ? String(body.address) : null,
        name: body.name ? String(body.name) : null,
        isDemo: me.isDemo === true,
      }).then((f) => (f ? { id: f.id, name: f.name, kind: f.kind as string } : null))

  const open = other
    ? await prisma.tradeLinkRequest.findFirst({
        where: {
          answeredAt: null,
          OR: [{ fromCompanyId: me.id, toCompanyId: other.id }, { fromCompanyId: other.id, toCompanyId: me.id }],
        },
        select: { fromCompanyId: true },
      })
    : null

  const verdict = mayAskToLink({
    asker: { id: me.id, kind: me.kind, name: me.name },
    other,
    relationship,
    mayManage: hasPermission(caller.permissions, ASKS),
    linked: other ? await workTogether(me.id, other.id) : false,
    open,
  })
  if (!verdict.ok) return NextResponse.json({ error: { code: verdict.code, message: verdict.says } }, { status: verdict.status })

  const row = await prisma.tradeLinkRequest.create({
    data: { fromCompanyId: me.id, toCompanyId: other!.id, relationship, askedById: caller.person.id, note },
    select: { id: true },
  })
  const sides = { asker: { name: me.name, kind: me.kind }, other: { name: other!.name, kind: other!.kind }, relationship: relationship as Relationship }
  const words = readerReads({ ...sides, askedBy: caller.person.name })
  for (const personId of await answerersAt(other!.id)) {
    void notify({
      personId, companyId: other!.id, type: 'SYSTEM', channel: 'EMAIL', entityId: row.id,
      title: words.title, body: words.body, data: { href: '/dashboard/companies', tradeLinkId: row.id },
    })
  }
  return NextResponse.json({ data: { id: row.id, says: askerReads(sides) } }, { status: 201 })
}
