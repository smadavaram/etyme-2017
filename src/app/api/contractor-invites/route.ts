import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { hasPermission } from '@/lib/permissions'
import { newInviteToken, sendInvite, welcomeUrl } from '@/lib/contractor-link'
import {
  mayInvite, says, stepsOf, STATE_WORD,
  type Answer, type InviteState,
} from '@/lib/contractor-invite'

/**
 * GET  /api/contractor-invites   — who we have asked, and where it got to
 * POST /api/contractor-invites   — ask somebody we already know
 *
 * The permission is the one "Ask for them" uses: whoever raises
 * requirements here. A hiring manager knows who they want; an AP clerk
 * does not, and asking somebody onto the network is the front of the
 * same funnel as raising a role.
 */

const WHO = 'Asking somebody onto your network is for whoever raises requirements here.'

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'Reading who has been asked')
  if (notStaff) return notStaff
  const companyId = caller.company!.id

  const rows = await prisma.contractorInvitation.findMany({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
  })
  const supplierIds = rows.map((r) => r.supplierCompanyId).filter((x): x is string => !!x)
  const suppliers = supplierIds.length
    ? await prisma.company.findMany({ where: { id: { in: supplierIds } }, select: { id: true, name: true } })
    : []
  const nameOf = new Map(suppliers.map((s) => [s.id, s.name]))
  const people = await prisma.person.findMany({
    where: { id: { in: rows.map((r) => r.invitedById) } },
    select: { id: true, name: true },
  })
  const inviter = new Map(people.map((p) => [p.id, p.name]))

  // The link is a bearer credential: whoever holds it answers as the
  // person. Only whoever may act on the ask sees it, the same rule the
  // supplier link follows — everybody else is told it was sent.
  const mayAct = hasPermission(caller.permissions, 'requirements.write')

  return NextResponse.json({
    data: {
      invites: rows.map((r) => {
        const state = r.state as InviteState
        const supplierName = r.supplierCompanyId ? nameOf.get(r.supplierCompanyId) ?? null : null
        const line = says({ state, name: r.name, answer: r.answer as unknown as Answer | null, supplierName })
        return {
          id: r.id, name: r.name, email: r.email, skills: r.skills, reason: r.reason,
          state, stateWord: STATE_WORD[state], steps: stepsOf(state),
          says: line.now, next: line.next,
          supplierName,
          invitedBy: inviter.get(r.invitedById) ?? 'somebody',
          invitedAt: r.createdAt.toISOString(),
          linkSentAt: r.linkSentAt?.toISOString() ?? null,
          answeredAt: (r.answer as unknown as Answer | null)?.at ?? null,
          link: mayAct ? welcomeUrl(r.token) : null,
          mayAct,
        }
      }),
    },
  })
}

export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'Asking somebody onto your network')
  if (notStaff) return notStaff
  if (!hasPermission(caller.permissions, 'requirements.write')) {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: WHO } }, { status: 403 })
  }
  const companyId = caller.company!.id
  const now = new Date()

  const body = await request.json().catch(() => ({}))
  const name = String(body?.name ?? '').trim()
  const email = String(body?.email ?? '').trim().toLowerCase()
  const reason = String(body?.reason ?? '').trim()
  const skills = Array.isArray(body?.skills)
    ? body.skills.map((s: unknown) => String(s).trim()).filter(Boolean)
    : String(body?.skills ?? '').split(',').map((s) => s.trim()).filter(Boolean)

  if (name.length < 2) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Who is it? A name, as you know them.', field: 'name' } }, { status: 422 })
  }
  if (reason.length < 10) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Say why you want them — they read this, and so does the supplier asked to represent them.', field: 'reason' } },
      { status: 422 }
    )
  }

  // Everything the verdict needs, in one round trip each.
  const [existing, block, onRegister] = await Promise.all([
    prisma.contractorInvitation.findUnique({ where: { companyId_email: { companyId, email } }, select: { id: true, state: true } }),
    prisma.person.findFirst({ where: { primaryEmail: email }, select: { id: true } }).then(async (p) =>
      p
        ? prisma.blacklist.findFirst({
            where: { companyId, targetType: 'PERSON', targetId: p.id, liftedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
            select: { reason: true },
          })
        : null
    ),
    prisma.submission.findFirst({
      where: { toCompanyId: companyId, person: { primaryEmail: email } },
      select: { id: true },
    }),
  ])

  const verdict = mayInvite({
    email, name,
    blockedReason: block?.reason ?? null,
    alreadyOnRegister: onRegister !== null,
    openInviteState: (existing?.state as InviteState | undefined) ?? null,
  })
  if (!verdict.ok) {
    return NextResponse.json({ error: { code: verdict.code, message: verdict.message } }, { status: verdict.code === 'EMAIL' ? 422 : 409 })
  }

  const token = newInviteToken()
  const row = existing
    ? await prisma.contractorInvitation.update({
        where: { id: existing.id },
        data: { name, skills, reason, invitedById: caller.person.id, state: 'ASKED', token, answer: undefined, linkSentAt: now },
      })
    : await prisma.contractorInvitation.create({
        data: { companyId, name, email, skills, reason, invitedById: caller.person.id, token, linkSentAt: now },
      })

  // Not awaited: a slow mail provider must not hold up an ask that was
  // correctly recorded. The row carries when it was sent either way.
  const delivery = await sendInvite({
    to: email, name, clientName: caller.company!.name,
    inviterName: caller.person.name, reason, token,
  })

  return NextResponse.json(
    {
      data: {
        invite: { id: row.id, state: row.state, link: welcomeUrl(token) },
        delivery,
        says:
          `${name.split(' ')[0]} has been asked, and will hear from you by email. ` +
          `${caller.company!.name} contracts through suppliers, so when they answer you will ` +
          `either see the firm that represents them, or be asked to pick one to take them on.`,
      },
    },
    { status: 201 }
  )
}
