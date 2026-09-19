import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import { hasPermission } from '@/lib/permissions'
import { endClientFilter } from '@/lib/resolve-end-client'
import { askGoesTo } from '@/lib/chain-top'
import { tellThread } from '@/lib/thread-notices'
import type { Participant } from '@/lib/threads'

/**
 * POST /api/people/[id]/ask   { requirementId, note? }
 *
 * The hiring manager wants somebody they starred for a role. Etyme never
 * places anybody, so the ask goes to a supplier and never to the
 * consultant — and to one supplier in particular: **the rung this client
 * pays.**
 *
 * It used to go to whoever held the consultant's bench listing, which on
 * a chain is the firm at the bottom. So a client buying Helena Marsh
 * from Computer Systems, who buy her from CloudEPA, pressed one button
 * and got CloudEPA named on their own page and a direct thread opened
 * with them. That is the NDA between a prime and its sub breached in
 * both directions at once: the term that stops the sub going round the
 * prime is the same term that stops the client going round the prime,
 * and a channel is as much of a breach as a name.
 *
 * So the ask goes to the prime, which is the party with the deal, and
 * reaching its own supplier is its job. Disclosure does not widen this:
 * `MasterAgreement.disclosesSubVendors` is a term about reading a name,
 * not a contract between the client and the sub, so this route never
 * reads it — and never reads a bench holder's name either, which is why
 * no name below the paid rung can reach the response, the thread title
 * or the message metadata. `lib/chain-top`'s `askGoesTo` is the rule.
 *
 * Where no supplier of this client's own holds them, the refusal is the
 * sibling of "never to the consultant": it says the client has no
 * supplier for this person yet and names which of its own could bring
 * them, without naming the firm that holds them.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const notStaff = staffOnly(caller, 'Asking for a person')
  if (notStaff) return notStaff
  if (!hasPermission(caller.permissions, 'requirements.write')) {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Asking for a person is for whoever raises requirements here.' } }, { status: 403 })
  }
  const companyId = caller.company!.id
  const now = new Date()
  const body = await request.json().catch(() => ({}))
  const requirementId = typeof body?.requirementId === 'string' ? body.requirementId : null
  const note = typeof body?.note === 'string' ? body.note.trim() : ''
  if (!requirementId) return NextResponse.json({ error: { code: 'VALIDATION', message: 'Which role? Pick a published requirement.', field: 'requirementId' } }, { status: 422 })

  // Every rung of this person's chains standing here, and the firms
  // holding their consent — both as ids only. Neither read asks a
  // selling firm for its name: the routing decision is made on ids, and
  // only the firm it lands on is looked up afterwards, by which point it
  // is a firm this client deals with.
  const [person, requirement, block, subs, listings, rungs] = await Promise.all([
    prisma.person.findUnique({ where: { id }, select: { id: true, name: true } }),
    prisma.requirement.findFirst({ where: { id: requirementId, OR: [{ companyId }, { msa: { clientId: companyId } }] }, select: { id: true, title: true, status: true } }),
    prisma.blacklist.findFirst({ where: { companyId, targetType: 'PERSON', targetId: id, liftedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, select: { reason: true } }),
    prisma.submission.findMany({ where: { toCompanyId: companyId, personId: id }, select: { fromCompanyId: true, requirementId: true }, orderBy: { submittedAt: 'desc' } }),
    prisma.benchListing.findMany({ where: { consultant: { personId: id }, state: 'GRANTED' }, select: { companyId: true } }),
    prisma.sellContract.findMany({
      where: { ...endClientFilter(companyId), personId: id },
      select: { id: true, personId: true, companyId: true, clientCompanyId: true },
    }),
  ])
  if (!person || (subs.length === 0 && listings.length === 0 && rungs.length === 0)) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That person has not been put in front of you.' } }, { status: 404 })
  }
  if (!requirement) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'That requirement is not yours.' } }, { status: 404 })
  if (requirement.status !== 'OPEN') {
    return NextResponse.json({ error: { code: 'NOT_PUBLISHED', message: `${requirement.title} is not published, so nobody can be submitted to it yet.` } }, { status: 409 })
  }
  if (block) {
    return NextResponse.json({ error: { code: 'BLOCKED', message: `${person.name} is blocked here — ${block.reason.replace(/\.$/, '')}. Lift the block first.` } }, { status: 409 })
  }
  if (subs.some((s) => s.requirementId === requirementId)) {
    return NextResponse.json({ error: { code: 'ALREADY_SUBMITTED', message: `${person.name} is already submitted to ${requirement.title}. Read them in Submissions.` } }, { status: 409 })
  }

  const route = askGoesTo({
    rungs,
    benchHolderIds: listings.map((l) => l.companyId),
    submitterIds: subs.map((s) => s.fromCompanyId),
    clientCompanyId: companyId,
  })

  // ── Nobody of this client's own holds them ─────────────────────────
  //
  // The sibling of "never to the consultant". A firm with no deal here
  // is as unreachable as the person themselves, and for the same
  // reason — so say what is missing and what to do, naming this
  // client's own suppliers on this role and never the firm holding
  // them.
  if (route.toCompanyIds.length === 0) {
    const invited = await prisma.requirementInvitation.findMany({
      where: { requirementId: requirement.id, fromCompanyId: companyId },
      select: { toCompany: { select: { name: true } } },
      take: 6,
    })
    const mine = invited.length > 0
      ? invited.map((i) => i.toCompany.name)
      : (await prisma.masterAgreement.findMany({
          where: { clientId: companyId, status: { notIn: ['TERMINATED', 'EXPIRED'] } },
          select: { vendor: { select: { name: true } } },
          take: 6,
        })).map((a) => a.vendor.name)
    const who = mine.length === 0
      ? 'a supplier of your own'
      : mine.length === 1 ? mine[0] : `${mine.slice(0, -1).join(', ')} or ${mine[mine.length - 1]}`
    return NextResponse.json({
      error: {
        code: 'NO_SUPPLIER_OF_YOUR_OWN',
        message:
          `You have no supplier for ${person.name} yet — none of the firms you buy through has put them forward here. ` +
          `Ask ${who} to bring them, and the submission comes through them.`,
      },
    }, { status: 409 })
  }

  // Only now is a firm named, and only the ones the ask lands on: each
  // is a rung this client pays or a firm that has already put this
  // person in front of it.
  const firms = await prisma.company.findMany({ where: { id: { in: route.toCompanyIds } }, select: { id: true, name: true } })

  const me = { id: companyId, name: caller.company!.name }
  const opener: Participant = { personId: caller.person.id, name: caller.person.name, companyId: me.id, joinedAt: now.toISOString() }
  // Where the ask came up the chain, the prime is told why it landed
  // with them rather than with whoever holds the listing. It says
  // nothing the prime does not already know — its own supply chain.
  const through = route.throughAPrime ? ` ${me.name} buys through you here, so the ask comes to you rather than to anyone below you.` : ''
  const text = `${me.name} would like to see ${person.name} for ${requirement.title}. Please submit them if they are available.${through}${note ? ` ${note}` : ''}`

  const asked: string[] = []
  for (const firm of firms) {
    let thread = await prisma.conversation.findFirst({ where: { companyId: me.id, withCompanyId: firm.id, topic: 'REQUIREMENT', topicId: requirement.id }, select: { id: true } })
    if (!thread) {
      thread = await prisma.conversation.create({
        data: { companyId: me.id, withCompanyId: firm.id, topic: 'REQUIREMENT', topicId: requirement.id, title: `${requirement.title} — ${firm.name}`, participants: [opener] as unknown as object },
        select: { id: true },
      })
    }
    // Typed and tagged, so the person's page and the dashboard can find
    // the ask again; and the thread rises to the top of Conversations.
    // The supplier on it is the firm the ask went to — the rung this
    // client pays — because this metadata is read straight onto the
    // client's own feed.
    await prisma.message.create({
      data: { conversationId: thread.id, authorId: caller.person.id, body: text, type: 'ASK', metadata: { personId: person.id, personName: person.name, requirementId: requirement.id, roleTitle: requirement.title, supplierId: firm.id, supplierName: firm.name } },
    })
    await prisma.conversation.update({ where: { id: thread.id }, data: { updatedAt: now } })
    void tellThread({ conversationId: thread.id, author: { personId: caller.person.id, name: caller.person.name, companyId: me.id, companyName: me.name }, body: text })
    asked.push(firm.name)
  }

  return NextResponse.json({
    data: {
      asked,
      throughAPrime: route.throughAPrime,
      says: `${asked.join(' and ')} ${asked.length === 1 ? 'has' : 'have'} been asked to put ${person.name} forward for ${requirement.title}. You will see the submission when it lands.`,
    },
  }, { status: 201 })
}
