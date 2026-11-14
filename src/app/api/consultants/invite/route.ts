import { NextRequest, NextResponse } from 'next/server'
import { reportError } from '@/lib/alerts'
import { getCallerContext } from '@/lib/api-context'
import { notAtACompany } from '@/lib/bench-filter'
import { askOntoBench } from '@/lib/consultant-portfolio/bench-ask'
import { mayAddConsultant, whoAddsSays } from '@/lib/consultant-portfolio/who-adds'
import {
  parseInviteList, nameFor, inviteLineSays, inviteSummarySays, tooManyInvitesSays,
  MAX_INVITES_AT_ONCE, NO_ADDRESSES_SAYS, type InviteLine,
} from '@/lib/consultant-portfolio/bench-invites'
import { mailLeaves } from '@/lib/notify/mail-leaves'

/**
 * POST /api/consultants/invite   { list }
 *
 * Invite candidates, several at once (Tapin's first week, 2026-11-14).
 * The box holds addresses, one per line or separated by commas, each with
 * an optional name beside it (`parseInviteList`).
 *
 * Each address goes through `askOntoBench`, the one door Add consultant
 * and the public page's Join the bench call, one after another, so every
 * rule holds exactly as it does for a single add: never a second record,
 * a live ask or a yes is not asked again, a no stands, and nobody is
 * seated at the firm before her own yes. A refusal on one address never
 * stops the rest. No link is returned: where no email can leave, the
 * link is kept on the notice for staff, as a single add keeps it.
 *
 * Asks for what Add consultant asks for (`mayAddConsultant`).
 */
export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  if (!mayAddConsultant(caller.permissions)) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: whoAddsSays({ kind: caller.company?.kind ?? null, companyName: caller.company?.name ?? null }) } },
      { status: 403 }
    )
  }
  const companyId = caller.company?.id
  if (!companyId) {
    return NextResponse.json(
      { error: { code: 'NO_COMPANY', message: notAtACompany('list of consultants') } },
      { status: 403 }
    )
  }

  const body = await request.json().catch(() => ({}) as Record<string, unknown>)
  const items = parseInviteList(typeof body?.list === 'string' ? body.list : '')
  const emails = items.filter((i) => i.kind === 'EMAIL')
  if (items.length === 0) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: NO_ADDRESSES_SAYS, field: 'list' } }, { status: 422 })
  }
  if (emails.length > MAX_INVITES_AT_ONCE) {
    return NextResponse.json({ error: { code: 'TOO_MANY', message: tooManyInvitesSays(emails.length), field: 'list' } }, { status: 422 })
  }

  const firm = { id: companyId, name: caller.company!.name }
  const lines: InviteLine[] = []
  // One at a time, in the order typed: two asks for one person never race.
  for (const item of items) {
    if (item.kind === 'NOT_AN_EMAIL') {
      lines.push({ email: item.raw, asked: false, state: 'NOT_AN_EMAIL', says: inviteLineSays({ state: 'NOT_AN_EMAIL', raw: item.raw }) })
      continue
    }
    try {
      const out = await askOntoBench({
        firm,
        name: nameFor(item),
        email: item.email,
        by: { personId: caller.person.id },
        tier: 'MARKETING',
      })
      if (out.kind === 'ASKED') {
        const state = out.path === 'NEW' ? 'ASKED' : out.path === 'ASK_AGAIN' ? 'ASKED_AGAIN' : 'ASKED_ON_OWN_RECORD'
        lines.push({ email: item.email, asked: true, state, says: inviteLineSays({ state, mail: out.mail }) })
      } else if (out.kind === 'NOTHING') {
        lines.push({ email: item.email, asked: false, state: out.path, says: inviteLineSays({ state: out.path }) })
      } else if (out.kind === 'REFUSED') {
        lines.push({ email: item.email, asked: false, state: 'REFUSED', says: inviteLineSays({ state: 'REFUSED', refusal: out.says }) })
      } else {
        lines.push({ email: item.email, asked: false, state: 'RACED', says: inviteLineSays({ state: 'RACED' }) })
      }
    } catch (err) {
      reportError('Inviting a candidate onto the bench failed:', err)
      lines.push({ email: item.email, asked: false, state: 'FAILED', says: inviteLineSays({ state: 'FAILED' }) })
    }
  }

  const leaves = mailLeaves()
  return NextResponse.json({ data: { results: lines, says: inviteSummarySays(lines, leaves), mailLeaves: leaves } })
}
