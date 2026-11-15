import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { staffOnly } from '@/lib/seat'
import {
  problems, alreadyOnFile, sameNameOnFile, contactKindOf, KINDS, kindOfRole, writableEmail, kindsHeld, rolesOffered, mayWorkAt,
  memberElsewhereSays, contactRecordedLog, NOT_ON_YOUR_LIST_SAYS, ADD_A_COMPANY_HREF, WORKS_FOR_MISSING, NEW_COMPANY_NAME_MISSING,
  worksForFromEmail, emailDomain, ownFirmChoice, savedSays, savedWithCompanySays, type ContactKind,
} from '@/lib/contacts'
import { recordRefusal } from '@/lib/access-log'
import { worksAtBook } from './works-at'
import { dealingsWithSides } from '../companies/dealings'
import { notLinkedYet, mayRecordCompany, sameDomainRefused, sameNameRefused, readTypedDomain } from '@/lib/counterparty'
import { onEtymeAskToLinkSays } from '@/lib/supplier-list'
import { lookBeforeRecording, writeRecord, refusedFound, uniqueSlug, slugify, RESERVED_SLUGS, EITHER_SIDE, reservedNameSays, SLUG_RACE_SAYS, ownCompanySays, onYourListAlreadySays } from '../companies/record'
import { holdsNoRole } from '@/lib/access-grant'

/**
 * GET  /api/contacts — the people at the firms you trade with, filterable by company and kind
 * POST /api/contacts — add somebody by hand
 *
 * Two sources, one list. What you typed or imported — the rolodex, a
 * commercial asset walled to the owning company. And the people seated
 * at the firms you trade with, read off their seats: for a client, the
 * whole team at each of its suppliers, because a staffing firm's staff
 * are the people who work its accounts; for a supplier, only the people
 * at a client it has actually dealt with — whoever raised a role it was
 * invited to, is the hiring manager on its contract, signed its hours,
 * or wrote on a thread with it — never a client's whole staff. Nothing
 * here crosses to a firm you have no dealings with.
 */

export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Contacts')
  if (notStaff) return notStaff

  const companyId = caller.company!.id
  const url = new URL(request.url)
  const at = url.searchParams.get('at')
  const q = (url.searchParams.get('q') ?? '').trim()

  const contacts = await prisma.companyContact.findMany({
    where: {
      companyId,
      ...(at ? { atCompanyId: at } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
              { title: { contains: q, mode: 'insensitive' } },
              { atCompany: { name: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    },
    include: {
      atCompany: { select: { id: true, name: true } },
      person: { select: { id: true } },
    },
    orderBy: [{ atCompany: { name: 'asc' } }, { name: 'asc' }],
    take: 500,
  })

  const typed = contacts.map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    title: c.title,
    kind: c.kind,
    kindLabel: KINDS[c.kind as ContactKind]?.label ?? KINDS.OTHER.label,
    callAbout: KINDS[c.kind as ContactKind]?.callAbout ?? null,
    at: c.atCompany,
    // On the platform themselves now — reachable in-app, not only by phone.
    joined: c.person != null,
    notes: c.notes,
    via: null as string | null,
  }))

  // A firm on Etyme this firm only wrote on its own register is one it
  // does not work with (record 61), so its seated people are not listed.
  const { ownSideOnly } = await dealingsWithSides(caller, false)
  const seated = await peopleAtYourFirms(companyId, caller.company!.kind, at, q, ownSideOnly)
  // Somebody typed in by hand who also holds a seat is one person, not two.
  const known = new Set(typed.map((t) => t.email?.toLowerCase()).filter(Boolean))
  const merged = [...typed, ...seated.filter((p) => !p.email || !known.has(p.email.toLowerCase()))]
    .sort((a, b) => a.at.name.localeCompare(b.at.name) || a.name.localeCompare(b.name))

  return NextResponse.json({
    data: {
      // Last, after the merge above has used the address to tell one
      // person from two: an address at a domain nobody can register is
      // a sign-in handle, not somewhere mail arrives, and a rolodex row
      // that prints one is making a promise the domain cannot keep.
      contacts: merged.map((c) => ({ ...c, email: writableEmail(c.email) })),
      // Every role Add contact may offer; the form shows Team member only
      // when the firm's own name is chosen (lib/contacts rolesOffered).
      kinds: rolesOffered(true),
      // The roles somebody on this list holds, for the filter, so no chip
      // opens an empty list.
      held: kindsHeld(merged),
      // Where a contact may work, read by the same reader the POST asks,
      // so the picker and the route can never differ. Only for the
      // Contacts page; a company's drawer asks with ?at= and needs none.
      ...(at ? {} : { worksAt: await worksAtBook(caller) }),
    },
  })
}

type Row = {
  id: string; name: string; email: string | null; phone: string | null; title: string | null; kind: string; kindLabel: string
  callAbout: string | null; at: { id: string; name: string }; joined: boolean; notes: string | null; via: string | null
}

/** The people seated at the firms this company trades with. */
async function peopleAtYourFirms(companyId: string, kind: string, at: string | null, q: string, ownSideOnly: ReadonlySet<string>): Promise<Row[]> {
  const buyer = kind === 'CLIENT' || kind === 'MSP'
  const rows: Row[] = []
  const seen = new Set<string>()
  const push = (personId: string, name: string, email: string | null, roleName: string | null, company: { id: string; name: string; kind?: string | null }, via: string) => {
    const key = `${personId}:${company.id}`
    if (seen.has(key)) return
    if (at && company.id !== at) return
    if (q && ![name, email ?? '', roleName ?? '', company.name].some((x) => x.toLowerCase().includes(q.toLowerCase()))) return
    seen.add(key)
    // The chip is read off the role AND the kind of firm they hold it
    // at: "HR" at a client reads the role, "HR" at a supplier keeps its
    // own people's paperwork, and one regular expression filed both
    // under Delivery.
    const k = kindOfRole(roleName, company.kind ?? null)
    rows.push({ id: `seat:${personId}:${company.id}`, name, email, phone: null, title: roleName, kind: k, kindLabel: KINDS[k].label, callAbout: KINDS[k].callAbout, at: company, joined: true, notes: null, via })
  }

  if (buyer) {
    // Every firm you buy from: on the register, under an agreement, or on a contract.
    const [reg, agreements, contracts] = await Promise.all([
      prisma.counterparty.findMany({ where: { companyId, relationship: 'SUPPLIER' }, select: { otherCompanyId: true } }),
      prisma.masterAgreement.findMany({ where: { clientId: companyId }, select: { vendorId: true } }),
      prisma.sellContract.findMany({ where: { clientCompanyId: companyId }, select: { companyId: true }, distinct: ['companyId'] }),
    ])
    // Less a firm reached only by this firm's own writing: every firm with
    // a seat is on Etyme, so `notLinkedYet` holds for each one left out.
    const firms = [...new Set([...reg.map((r) => r.otherCompanyId), ...agreements.map((a) => a.vendorId), ...contracts.map((c) => c.companyId)])]
      .filter((id) => id !== companyId && !notLinkedYet({ ownSideOnly: ownSideOnly.has(id), onEtyme: true, mine: false }))
    if (firms.length === 0) return rows
    const seats = await prisma.context.findMany({
      where: { companyId: { in: firms }, revokedAt: null, NOT: { roleId: null }, type: { in: ['EMPLOYEE', 'PARTNER'] } },
      select: { personId: true, person: { select: { name: true, primaryEmail: true } }, role: { select: { name: true } }, company: { select: { id: true, name: true, kind: true } } },
      orderBy: { grantedAt: 'asc' },
    })
    // The Member role holds nothing, so it is no title: such a person reads
    // as staff, as a seat with no role does (batch four walk, 2026-11-15).
    for (const s of seats) {
      if (!s.company) continue
      const title = holdsNoRole(s.role?.name) ? null : s.role!.name
      push(s.personId, s.person.name, s.person.primaryEmail, title, s.company, `${title ?? 'Staff'} at ${s.company.name}`)
    }
    return rows
  }

  // A supplier sees the people at a client it has dealt with, and nobody else there.
  const [invited, sold, signed, threads] = await Promise.all([
    prisma.requirementInvitation.findMany({ where: { toCompanyId: companyId }, select: { requirement: { select: { raisedById: true, ownerId: true, title: true, company: { select: { id: true, name: true, kind: true } } } } }, take: 500 }),
    prisma.sellContract.findMany({ where: { companyId, hiringManagerId: { not: null } }, select: { hiringManagerId: true, clientCompany: { select: { id: true, name: true } }, person: { select: { name: true } } }, take: 500 }),
    prisma.timesheet.findMany({ where: { sellContract: { companyId }, clientApprovedById: { not: null } }, select: { clientApprovedById: true, sellContract: { select: { clientCompany: { select: { id: true, name: true } } } } }, take: 500 }),
    prisma.conversation.findMany({ where: { OR: [{ companyId }, { withCompanyId: companyId }], NOT: { withCompanyId: null } }, select: { companyId: true, withCompanyId: true, messages: { select: { authorId: true }, take: 50 } }, take: 200 }),
  ])
  const wanted = new Map<string, { firmId: string; via: string }>()
  const want = (personId: string | null | undefined, firmId: string, via: string) => { if (personId && !wanted.has(`${personId}:${firmId}`)) wanted.set(`${personId}:${firmId}`, { firmId, via }) }
  for (const i of invited) { want(i.requirement.raisedById, i.requirement.company.id, `Raised ${i.requirement.title}`); want(i.requirement.ownerId, i.requirement.company.id, `Owns ${i.requirement.title}`) }
  for (const c of sold) want(c.hiringManagerId, c.clientCompany.id, `Hiring manager for ${c.person.name}`)
  for (const t of signed) want(t.clientApprovedById, t.sellContract.clientCompany.id, 'Signs your hours')
  for (const th of threads) { const other = th.companyId === companyId ? th.withCompanyId! : th.companyId; for (const m of th.messages) want(m.authorId, other, 'On a thread with you') }
  if (wanted.size === 0) return rows
  const seats = await prisma.context.findMany({
    where: { OR: [...wanted.keys()].map((k) => { const [personId, firmId] = k.split(':'); return { personId, companyId: firmId } }), revokedAt: null },
    select: { personId: true, person: { select: { name: true, primaryEmail: true } }, role: { select: { name: true } }, company: { select: { id: true, name: true, kind: true } } },
  })
  for (const s of seats) if (s.company) push(s.personId, s.person.name, s.person.primaryEmail, s.role?.name ?? null, s.company, wanted.get(`${s.personId}:${s.company.id}`)?.via ?? '')
  return rows
}

export async function POST(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error

  const notStaff = staffOnly(caller, 'Contacts')
  if (notStaff) return notStaff

  const companyId = caller.company!.id
  const body = await request.json().catch(() => ({}))

  // A company not on the list yet, named by the contact's own work email
  // and added in the same save (fix list of 2026-11-14, A2).
  const adding = body?.newCompany != null && typeof body.newCompany === 'object'
  const atCompanyIdTyped = String(body?.atCompanyId ?? '')
  if (!adding && !atCompanyIdTyped) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: WORKS_FOR_MISSING, field: 'atCompanyId' } },
      { status: 422 }
    )
  }

  // The firm's own name, or any company on its Companies list, read
  // through the list's own reader (founder, 2026-11-12; fix list of
  // 2026-11-14, H1 and A2). A contact is a row in this firm's own address
  // book: saving one sends nothing to anybody, and no firm is told.
  const book = await worksAtBook(caller)
  if (!adding && !mayWorkAt(book, atCompanyIdTyped)) {
    const says = NOT_ON_YOUR_LIST_SAYS
    await recordRefusal([{ companyId: companyId }], {
      actorPersonId: caller.isService ? undefined : caller.person.id,
      actorCompanyId: companyId,
      // No access-log name for a refused contact exists yet (etyme-regulatory's
      // list); the reason says plainly what was refused.
      action: 'CONTRACT_VIEW',
      reason: `Refused adding a contact at a company that is not on ${caller.company!.name}'s Companies list: ${says}`,
    })
    return NextResponse.json(
      { error: { code: 'NOT_ON_YOUR_BOOK', message: says, field: 'atCompanyId', href: ADD_A_COMPANY_HREF, hrefLabel: 'Add a company' } },
      { status: 403 }
    )
  }

  const found = problems({
    name: String(body?.name ?? ''),
    email: body?.email ?? null,
    phone: body?.phone ?? null,
    kind: body?.kind ?? null,
  })
  if (found.length > 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: found[0].says, field: found[0].field } },
      { status: 422 }
    )
  }
  // A new company: the same look and the same gates Add a company asks,
  // before anything is written (`lookBeforeRecording`).
  const newName = adding ? String(body.newCompany?.name ?? '').trim() : ''
  if (adding) {
    const refused = await mayAddWithContact(caller, book, newName, body?.email)
    if (refused) return refused
  }
  const atCompanyId = adding ? '' : atCompanyIdTyped
  const atOwnFirm = !adding && atCompanyId === book.own.id
  const atName = adding ? newName : atOwnFirm ? book.own.name : book.companies.find((c) => c.id === atCompanyId)!.name

  // Team member is a colleague at the firm's own firm, never somebody at
  // another company (fix list of 2026-11-14, B4).
  if (contactKindOf(body?.kind) === 'MEMBER' && !atOwnFirm) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: memberElsewhereSays(atName), field: 'kind' } },
      { status: 422 }
    )
  }

  // Refused as a duplicate rather than quietly creating a twin. Two
  // records for one human is how somebody gets emailed at an address
  // they left.
  // A company added in this save has nobody on file yet.
  const existing = adding ? [] : await prisma.companyContact.findMany({
    where: { companyId, atCompanyId },
    select: { id: true, name: true, email: true, phone: true, atCompanyId: true },
  })
  const dup = alreadyOnFile(
    { name: body.name, email: body?.email, phone: body?.phone, atCompanyId },
    existing
  )
  if (dup.duplicate) {
    return NextResponse.json(
      { error: { code: 'DUPLICATE', message: dup.says, existingId: dup.of!.id } },
      { status: 409 }
    )
  }
  // The same name at the same company with no email or phone in common is
  // asked about, never refused and never merged: two people may share a
  // name, so the screen offers one press that saves anyway (2026-11-15).
  const namesake = body?.addAnyway === true ? null : sameNameOnFile({ name: String(body.name), atCompanyId }, existing)
  if (namesake) {
    return NextResponse.json(
      { error: { code: 'SAME_NAME', message: namesake.says, field: 'name', existingId: namesake.of.id } },
      { status: 409 }
    )
  }

  // The contact and its activity-log row are one write: a person's own
  // act, attributed by rule, and honest that it cannot be undone because
  // no remove exists (fix list of 2026-11-14, B6). Read only by this firm.
  const name = String(body.name).trim()
  const log = contactRecordedLog({ byName: caller.person.name, name, atName, ownFirm: atOwnFirm })
  // A new company's address is made before the write, as Add a company makes it.
  const slug = adding ? await uniqueSlug(slugify(newName) || 'company') : ''
  try {
    const { contact, company } = await prisma.$transaction(async (tx) => {
      // The company first, by the one writer Add a company runs, then the
      // contact at it: one transaction, so a failure writes neither.
      // Stored under the domain somebody registered, by the rule the
      // domain box on Add a company reads (fix list A2).
      const box = adding ? readTypedDomain(emailDomain(body?.email)) : null
      const company = adding
        ? (await writeRecord(tx, caller, { name: newName, slug, domain: box?.ok ? box.domain : null })).company
        : null
      const at = company ? company.id : atCompanyId
      const made = await tx.companyContact.create({
        data: {
          companyId,
          atCompanyId: at,
          name,
          email: body?.email ? String(body.email).trim().toLowerCase() : null,
          phone: body?.phone ? String(body.phone).trim() : null,
          title: body?.title ? String(body.title).trim() : null,
          // No role, or a blank one, is saved as Other: the role is optional.
          kind: (() => { const k = contactKindOf(body?.kind); return k && Object.hasOwn(KINDS, k) ? k : 'OTHER' })(),
          notes: body?.notes ? String(body.notes).trim() : null,
          createdById: caller.person.id,
        },
        include: { atCompany: { select: { id: true, name: true } } },
      })
      await tx.automationLog.create({
        data: {
          companyId,
          action: 'CONTACT_RECORDED',
          summary: log.summary,
          reason: log.reason,
          payload: { contactId: made.id, otherCompanyId: at, ownFirm: atOwnFirm, byName: caller.person.name, personId: caller.person.id, ...(company ? { companyAdded: true } : {}) },
          reversible: log.reversible,
        },
      })
      return { contact: made, company }
    }, { timeout: 20_000 })

    return NextResponse.json({
      data: {
        contact,
        ...(company ? { company: { id: company.id, name: company.name } } : {}),
        // Both facts, where the save added the company too (fix list A2).
        says: company ? savedWithCompanySays(name, company.name) : savedSays(name, atName),
      },
    }, { status: 201 })
  } catch (err: any) {
    if (adding && err?.code === 'P2002') {
      return NextResponse.json({ error: { code: 'SLUG_TAKEN', message: SLUG_RACE_SAYS, field: 'newCompanyName' } }, { status: 409 })
    }
    throw err
  }
}

/**
 * Whether a company not on the list yet may be added with this contact,
 * by the gates Add a company asks, in its words. Null where it may. Every
 * refusal about another firm is logged before it is sent.
 */
async function mayAddWithContact(
  caller: import('@/lib/api-context').CallerContext,
  book: Awaited<ReturnType<typeof worksAtBook>>,
  newName: string,
  email: unknown,
): Promise<NextResponse | null> {
  const me = caller.company!
  const may = mayRecordCompany({ seatedAt: { id: me.id, name: me.name }, permissions: caller.permissions })
  if (!may.ok) {
    await recordRefusal([{ companyId: me.id }], {
      actorPersonId: caller.isService ? undefined : caller.person.id,
      actorCompanyId: me.id,
      action: 'CONTRACT_VIEW',
      reason: `Refused: adding ${newName || 'a company'} to the Companies list with a contact, which is for whoever manages who the firm trades with.`,
    })
    return NextResponse.json({ error: { code: 'NOT_YOURS_TO_ADD', message: book.whoRecords ?? may.says, field: 'atCompanyId' } }, { status: 403 })
  }
  if (newName.length < 2) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: NEW_COMPANY_NAME_MISSING, field: 'newCompanyName' } }, { status: 422 })
  }
  // Only a work email names a company. A personal mailbox, Etyme's own
  // address or no email at all says nothing about where somebody works.
  const read = worksForFromEmail(typeof email === 'string' ? email : null, book)
  if (read.read !== 'NEW') {
    const says = read.read === 'NOTHING' || read.read === 'NOT_A_COMPANY'
      ? 'A new company is added from a work email at its domain. Choose the company they work for, or add it on Companies first.'
      : read.read === 'OWN'
        ? `${read.domain} is your own firm's domain. Choose ${ownFirmChoice(book.own.name)} under Works for.`
        : `A company on your list already uses ${read.domain}. Choose it under Works for.`
    return NextResponse.json({ error: { code: 'VALIDATION', message: says, field: 'atCompanyId', ...(read.read === 'ONE' ? { companyId: read.company.id } : {}) } }, { status: 422 })
  }
  if (RESERVED_SLUGS.has(slugify(newName))) {
    return NextResponse.json({ error: { code: 'SLUG_RESERVED', message: reservedNameSays(newName), field: 'newCompanyName' } }, { status: 422 })
  }
  const look = await lookBeforeRecording(caller, { name: newName, domain: read.domain })
  switch (look.found) {
    case 'NOTHING':
      return null
    case 'TWIN': {
      const byDomain = look.by === 'DOMAIN'
      await refusedFound(caller, look.twin.id, `${look.twin.name} is on the caller's own Companies list already${byDomain ? ` on ${look.twin.domain}` : ''}`)
      return NextResponse.json({
        error: {
          code: byDomain ? 'SAME_DOMAIN_ON_YOUR_LIST' : 'SAME_NAME_ON_YOUR_LIST',
          field: 'atCompanyId',
          message: byDomain ? sameDomainRefused(look.twin) : sameNameRefused(look.twin),
          companyId: look.twin.id,
        },
      }, { status: 409 })
    }
    case 'OWN_FIRM':
      return NextResponse.json({ error: { code: 'OWN_COMPANY', message: ownCompanySays(look.firm.name, ''), field: 'atCompanyId', companyId: me.id } }, { status: 422 })
    case 'ON_ETYME': {
      if (look.together) {
        // On the list already through the work between them: chosen there, never copied.
        return NextResponse.json({ error: { code: 'ON_YOUR_LIST', message: onYourListAlreadySays(look.firm.name), field: 'atCompanyId', ...(mayWorkAt(book, look.firm.id) ? { companyId: look.firm.id } : {}) } }, { status: 409 })
      }
      // Add a company's own answer for this domain, in its words, and
      // nothing more: no id, name or address of a firm she does not work with.
      const says = onEtymeAskToLinkSays(EITHER_SIDE)
      await refusedFound(caller, look.firm.id, says)
      return NextResponse.json({ error: { code: 'ALREADY_ON_ETYME', message: says, relationship: null } }, { status: 409 })
    }
    case 'SAME_NAME_ON_ETYME':
      // Never reached: a new company here always carries the email's domain.
      return null
  }
}
