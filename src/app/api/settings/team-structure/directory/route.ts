import { NextRequest, NextResponse } from 'next/server'
import { recordAccess, recordRefusal } from '@/lib/access-log'
import { reportError } from '@/lib/alerts'
import { prisma } from '@/lib/db'
import { appUrl } from '@/lib/app-url'
import { isConsumerDomain, isPlatformDomain } from '@/lib/company-domains'
import { readDirectoryCsv, type DirectoryPerson } from '@/lib/team-structure/directory/csv'
import { directorySources, entraToken, readEntra, readGoogle, type GoogleConnectionView } from '@/lib/team-structure/directory/providers'
import { accessTokenFrom, consentUrl, exchangeCode, googleReadiness, GoogleSays, proveDomain, revoke } from '@/lib/team-structure/directory/google'
import { readState, seal, signState, unseal } from '@/lib/team-structure/directory/sealed'
import type { GoogleOutcome, EntraOutcome } from '@/lib/team-structure/directory/outcome'
import { adminConsentUrl, entraReadiness, EntraSays, isTenantId, onlyDomain, tenantForDomain, ENTRA_PERMISSION } from '@/lib/team-structure/directory/entra'
import { applyTicked, planFor } from '@/lib/team-structure/directory/apply'
import { hasPermission } from '@/lib/permissions'
import type { Writer } from '@/lib/team-structure/write'
import { treeCaller, refusedTree, writerFor, refuse } from '../door'

/**
 * GET  /api/settings/team-structure/directory   the three sources and whether each is connected
 * GET  …?code=&state=  (or ?error=&state=)      Google sending the Workspace administrator back
 * POST /api/settings/team-structure/directory   { source: 'CSV', csv }               a preview of every change
 *                                               { source: 'CSV', csv, apply: [] }    make the ticked changes
 *                                               { source: 'GOOGLE' }                 a preview, read from Google
 *                                               { source: 'GOOGLE', apply: [] }      make the ticked changes
 *                                               { source: 'GOOGLE', connect: true, domain? }  the consent screen's address
 *                                               { source: 'GOOGLE', disconnect: true }        delete the stored access
 *                                               { source: 'ENTRA' } / { source: 'ENTRA', apply: [] }   the same, read from Microsoft Graph
 *                                               { source: 'ENTRA', connect: true, domain? }   the admin-consent screen's address
 *                                               { source: 'ENTRA', disconnect: true }         forget the tenant
 * GET  …?admin_consent=&tenant=&state=           Microsoft sending the IT admin back
 *
 * The directory is read, never written (founder, 2026-11-09). The Owner or
 * the Admin reads a preview and ticks what is made; the plan is worked out
 * again from the same source when they say yes, and each change goes
 * through the tree's own acts, recorded as from the directory. Every read
 * of a directory is written to the access log as the company's before the
 * answer goes out, and every refusal before it is sent.
 *
 * Google Workspace (founder, 2026-11-11, "Yes"): one consent per company,
 * given by its Workspace administrator, kept as a DirectoryConnection with
 * the refresh token sealed. The token is never returned, never logged and
 * never put in a sentence. Google sends the administrator back to this
 * same address, so the callback is this route's GET with `state`; the
 * state is signed and bound to the seat and the company that pressed
 * Connect, and the redirect afterwards is always this app's own Team
 * structure page with a short code, never an address from the request.
 *
 * Microsoft Entra ID (2026-11-12): the client's IT admin grants Etyme's
 * multitenant app User.Read.All with admin consent on Microsoft's screen,
 * opened in the tenant that holds the company's verified domain. The
 * connection keeps only the tenant id (in `customerId`) and the domain;
 * nothing secret is kept per company. Each read asks Microsoft for an
 * app-only token for that tenant and reads only the domain's people.
 *
 * Each read is filed as DIRECTORY_READ, with the reason saying which
 * directory and how many people.
 */

const MAX_BYTES = 5 * 1024 * 1024
const DOING = 'Importing the team structure from a directory'

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams
  if (q.has('admin_consent') || q.has('tenant') || readState(q.get('state') ?? '')?.provider === 'ENTRA') return entraCallback(request)
  if (q.has('state') || q.has('code') || q.has('error')) return googleCallback(request)

  const { caller, error } = await treeCaller(request)
  if (error) return error
  if (!hasPermission(caller.permissions, 'settings.manage')) return refusedTree(caller, DOING)
  const writer = await writerFor(caller)
  if (!writer) return refusedTree(caller, DOING)
  return NextResponse.json({ data: { sources: directorySources(process.env, await connectionView(writer.companyId), await connectionView(writer.companyId, 'ENTRA')) } })
}

export async function POST(request: NextRequest) {
  const { caller, error } = await treeCaller(request)
  if (error) return error
  if (!hasPermission(caller.permissions, 'settings.manage')) return refusedTree(caller, DOING)
  const writer = await writerFor(caller)
  if (!writer) return refusedTree(caller, DOING)
  const body = await request.json().catch(() => null)
  const source = typeof body?.source === 'string' ? body.source.toUpperCase() : ''

  if (source === 'GOOGLE' && body?.disconnect === true) return disconnectGoogle(writer)
  if (source === 'GOOGLE' && body?.connect === true) return connectGoogle(writer, typeof body?.domain === 'string' ? body.domain : null)
  if (source === 'ENTRA' && body?.disconnect === true) return disconnectEntra(writer)
  if (source === 'ENTRA' && body?.connect === true) return connectEntra(writer, typeof body?.domain === 'string' ? body.domain : null)

  const state = directorySources(
    process.env,
    source === 'GOOGLE' ? await connectionView(writer.companyId) : null,
    source === 'ENTRA' ? await connectionView(writer.companyId, 'ENTRA') : null,
  ).find((s) => s.key === source)
  if (!state) return refuse('Choose where the directory comes from: Microsoft Entra ID, Google Workspace, or a file from Active Directory.', 422, 'source')
  if (!state.connected) {
    const says = `${state.label} is not connected for ${writer.companyName}. ${state.adminApproves ?? ''} Meanwhile, a file exported from Active Directory works today.`.replace(/\s+/g, ' ').trim()
    if (source === 'GOOGLE') return refusedGoogle(writer, 'Google Workspace is not connected.', says, 409, 'source')
    if (source === 'ENTRA') return refusedEntra(writer, 'Microsoft Entra ID is not connected.', says, 409, 'source')
    return refuse(says, 409, 'source')
  }

  let people: DirectoryPerson[]
  let skipped: string[] = []
  if (source === 'GOOGLE') {
    const read = await readFromGoogle(writer)
    if ('response' in read) return read.response
    people = read.people
  } else if (source === 'ENTRA') {
    const read = await readFromEntra(writer)
    if ('response' in read) return read.response
    people = read.people
  } else {
    const csv = typeof body?.csv === 'string' ? body.csv : ''
    if (csv.length > MAX_BYTES) return refuse('The file is over 5 MB. Export only the columns the import reads: name, email, department, manager, office, country and job title.', 422, 'csv')
    const read = readDirectoryCsv(csv)
    if (!read.ok) return refuse(read.says, 422, 'csv')
    people = read.people
    skipped = read.skipped
  }

  try {
    await recordAccess([{ companyId: writer.companyId }], {
      actorPersonId: writer.personId,
      actorCompanyId: writer.companyId,
      action: 'DIRECTORY_READ',
      reason: `Read ${writer.companyName}'s directory from ${state.label.toLowerCase()}: ${people.length} people, for the team structure${Array.isArray(body?.apply) ? ', and made the ticked changes' : ', as a preview'}.`,
    })
    if (source === 'GOOGLE' || source === 'ENTRA') {
      await prisma.directoryConnection.update({ where: { companyId_provider: { companyId: writer.companyId, provider: source } }, data: { lastReadAt: new Date(), lastReadCount: people.length } })
    }
    const plan = await planFor(writer.companyId, writer.companyName, people)
    if (Array.isArray(body?.apply)) {
      const ticked = body.apply.filter((k: unknown): k is string => typeof k === 'string')
      const done = await applyTicked(writer, plan, ticked)
      const says = done.made.length
        ? `${done.made.length} ${done.made.length === 1 ? 'change' : 'changes'} made from the directory, each kept with your name.${done.refused.length ? ` ${done.refused.length} not made; the reasons are listed.` : ''}`
        : 'Nothing was made.'
      return NextResponse.json({ data: { says, ...done } })
    }
    return NextResponse.json({ data: { people: people.length, skipped, ...plan, changes: plan.changes.map(({ op: _op, ...c }) => c) } })
  } catch (e) {
    await reportError('settings/team-structure/directory', e, { personId: writer.personId, companyId: writer.companyId })
    return refuse('The directory could not be read. Nothing was changed; try again.', 500)
  }
}

// ── Google Workspace ──────────────────────────────────────────────────

/** The card's view of the company's connection. The sealed token is never selected. */
async function connectionView(companyId: string, provider: 'GOOGLE' | 'ENTRA' = 'GOOGLE'): Promise<GoogleConnectionView | null> {
  const c = await prisma.directoryConnection.findUnique({
    where: { companyId_provider: { companyId, provider } },
    select: { domain: true, connectedAt: true, lastReadAt: true, lastReadCount: true, connectedBy: { select: { name: true } } },
  })
  if (!c) return null
  return { domain: c.domain, connectedBy: c.connectedBy?.name ?? null, connectedAt: c.connectedAt.toISOString(), lastReadAt: c.lastReadAt?.toISOString() ?? null, lastReadCount: c.lastReadCount }
}

/** The company's verified domains that may stand for it: never a consumer domain, never Etyme's own. */
async function verifiedDomains(companyId: string): Promise<string[]> {
  const rows = await prisma.companyDomain.findMany({ where: { companyId, verifiedAt: { not: null } }, select: { domain: true }, orderBy: { verifiedAt: 'asc' } })
  return rows.map((r) => r.domain.toLowerCase()).filter((d) => !isConsumerDomain(d) && !isPlatformDomain(d))
}

/** A refusal about the Google directory, written to the access log before it is sent. */
async function refusedGoogle(writer: Writer, why: string, says: string, status: number, field?: string | null): Promise<NextResponse> {
  await recordRefusal([{ companyId: writer.companyId }], {
    actorPersonId: writer.personId,
    actorCompanyId: writer.companyId,
    action: 'DIRECTORY_READ',
    reason: `Refused: reading ${writer.companyName}'s directory from Google Workspace. ${why}`,
  })
  return refuse(says, status, field)
}

async function connectGoogle(writer: Writer, asked: string | null): Promise<NextResponse> {
  const ready = googleReadiness()
  if (!ready.ready) {
    return refusedGoogle(writer, 'The deployment is not set up for it.', `Google Workspace cannot be connected on this deployment yet: ${ready.missing.join('; ')}. Nothing was kept. Meanwhile, a file exported from Active Directory works today.`, 409, 'source')
  }
  const domains = await verifiedDomains(writer.companyId)
  const want = asked ? asked.trim().toLowerCase() : domains[0] ?? null
  if (!want || !domains.includes(want)) {
    const named = asked ? `${asked.trim()} is not a domain ${writer.companyName} has verified.` : `${writer.companyName} has no verified domain.`
    const consumer = want && (isConsumerDomain(want) || isPlatformDomain(want)) ? ` ${want} is a personal or Etyme address and can never stand for a company.` : ''
    return refusedGoogle(writer, `The domain ${want ?? '(none)'} is not verified for the company.`, `${named}${consumer} Etyme reads only a directory on a domain your company has proved it holds. Verify your domain under Settings → Setup, then connect.`, 422, 'domain')
  }
  const state = signState({ companyId: writer.companyId, personId: writer.personId, domain: want })
  return NextResponse.json({ data: { url: consentUrl({ clientId: process.env.ETYME_DIRECTORY_GOOGLE_CLIENT_ID!, origin: appUrl(), state, domain: want }), domain: want } })
}

async function disconnectGoogle(writer: Writer): Promise<NextResponse> {
  const row = await prisma.directoryConnection.findUnique({ where: { companyId_provider: { companyId: writer.companyId, provider: 'GOOGLE' } }, select: { id: true, domain: true, tokenSealed: true } })
  if (!row) return refuse(`Google Workspace is not connected for ${writer.companyName}, so there is nothing to disconnect.`, 404, 'source')
  const plain = unseal(row.tokenSealed)
  await prisma.directoryConnection.delete({ where: { id: row.id } })
  const forgot = plain ? await revoke(plain) : false
  return NextResponse.json({
    data: {
      says: `Google Workspace is disconnected for ${row.domain}. The stored access was deleted${forgot ? ' and Google was asked to forget it' : ''}. Your team structure stays as it is.`,
    },
  })
}

async function readFromGoogle(writer: Writer): Promise<{ people: DirectoryPerson[] } | { response: NextResponse }> {
  const row = await prisma.directoryConnection.findUnique({ where: { companyId_provider: { companyId: writer.companyId, provider: 'GOOGLE' } }, select: { domain: true, tokenSealed: true } })
  if (!row) return { response: await refusedGoogle(writer, 'Google Workspace is not connected.', `Google Workspace is not connected for ${writer.companyName}.`, 409, 'source') }
  if (!(await verifiedDomains(writer.companyId)).includes(row.domain)) {
    return { response: await refusedGoogle(writer, `${row.domain} is no longer verified for the company.`, `${row.domain} is no longer verified for ${writer.companyName}, so its directory is not read. Verify it under Settings → Setup, or disconnect.`, 409, 'domain') }
  }
  const refreshToken = unseal(row.tokenSealed)
  if (!refreshToken) {
    return { response: await refusedGoogle(writer, 'The stored access could not be opened.', 'The stored access to Google can no longer be opened on this deployment. Disconnect, then connect again.', 409, 'source') }
  }
  try {
    const token = await accessTokenFrom({ refreshToken, clientId: process.env.ETYME_DIRECTORY_GOOGLE_CLIENT_ID!, clientSecret: process.env.ETYME_DIRECTORY_GOOGLE_CLIENT_SECRET! })
    return { people: await readGoogle(token, fetch, 50, row.domain) }
  } catch (e) {
    const says = e instanceof Error && /^Google /.test(e.message) ? e.message : 'Google could not be read. Nothing was changed; try again.'
    return { response: await refusedGoogle(writer, 'Google refused the read.', says, 502, 'source') }
  }
}

/** Google sending the administrator back. Always a redirect to this app's own Team structure page. */
async function googleCallback(request: NextRequest): Promise<NextResponse> {
  const back = (code: GoogleOutcome) => NextResponse.redirect(`${appUrl()}/dashboard/settings/team-structure?google=${code}`, 303)
  const q = request.nextUrl.searchParams
  const { caller, error } = await treeCaller(request)
  if (error) return back('signin')
  if (!hasPermission(caller.permissions, 'settings.manage')) { await refusedTree(caller, DOING); return back('not-yours') }
  const writer = await writerFor(caller)
  if (!writer) { await refusedTree(caller, DOING); return back('not-yours') }

  if (!googleReadiness().ready) { await refusedGoogle(writer, 'The deployment is not set up for it.', '', 409); return back('off') }
  const state = readState(q.get('state') ?? '')
  if (!state) { await refusedGoogle(writer, 'The consent came back with a state this deployment did not sign, or too late.', '', 403); return back('expired') }
  if (state.companyId !== writer.companyId || state.personId !== writer.personId) {
    await refusedGoogle(writer, 'The consent was started by another seat or for another company.', '', 403)
    return back('not-yours')
  }
  if (q.get('error') || !q.get('code')) return back('declined')
  if (!(await verifiedDomains(writer.companyId)).includes(state.domain)) {
    await refusedGoogle(writer, `${state.domain} is not verified for the company.`, '', 422)
    return back('domain')
  }

  const clientId = process.env.ETYME_DIRECTORY_GOOGLE_CLIENT_ID!
  const clientSecret = process.env.ETYME_DIRECTORY_GOOGLE_CLIENT_SECRET!
  let got: { accessToken: string; refreshToken: string; scope: string }
  try {
    got = await exchangeCode({ code: q.get('code')!, clientId, clientSecret, origin: appUrl() })
  } catch (e) {
    await refusedGoogle(writer, 'Google did not give the one read-only scope with lasting access.', '', 502)
    return back(e instanceof GoogleSays ? e.code : 'exchange')
  }
  try {
    const { customerId } = await proveDomain(got.accessToken, state.domain)
    await recordAccess([{ companyId: writer.companyId }], {
      actorPersonId: writer.personId,
      actorCompanyId: writer.companyId,
      action: 'DIRECTORY_READ',
      reason: `Connected ${writer.companyName}'s Google Workspace directory for ${state.domain}, read only: read one user's customer id to prove the Workspace holds the domain.`,
    })
    const sealed = seal(got.refreshToken)
    const before = await prisma.directoryConnection.findUnique({ where: { companyId_provider: { companyId: writer.companyId, provider: 'GOOGLE' } }, select: { tokenSealed: true } })
    await prisma.directoryConnection.upsert({
      where: { companyId_provider: { companyId: writer.companyId, provider: 'GOOGLE' } },
      create: { companyId: writer.companyId, provider: 'GOOGLE', domain: state.domain, customerId, scope: got.scope, tokenSealed: sealed, connectedById: writer.personId },
      update: { domain: state.domain, customerId, scope: got.scope, tokenSealed: sealed, connectedById: writer.personId, connectedAt: new Date(), lastReadAt: null, lastReadCount: null },
    })
    const old = before ? unseal(before.tokenSealed) : null
    if (old && old !== got.refreshToken) await revoke(old)
    return back('connected')
  } catch (e) {
    await revoke(got.refreshToken)
    if (e instanceof GoogleSays) {
      await refusedGoogle(writer, `Google said the Workspace cannot read users in ${state.domain}.`, '', 403)
      return back(e.code)
    }
    await reportError('settings/team-structure/directory', new Error('The Google Workspace connection could not be kept.'), { personId: writer.personId, companyId: writer.companyId })
    return back('failed')
  }
}

// ── Microsoft Entra ID ────────────────────────────────────────────────

/** A refusal about the Entra directory, written to the access log before it is sent. */
async function refusedEntra(writer: Writer, why: string, says: string, status: number, field?: string | null): Promise<NextResponse> {
  await recordRefusal([{ companyId: writer.companyId }], {
    actorPersonId: writer.personId,
    actorCompanyId: writer.companyId,
    action: 'DIRECTORY_READ',
    reason: `Refused: reading ${writer.companyName}'s directory from Microsoft Entra ID. ${why}`,
  })
  return refuse(says, status, field)
}

async function connectEntra(writer: Writer, asked: string | null): Promise<NextResponse> {
  const ready = entraReadiness()
  if (!ready.ready) {
    return refusedEntra(writer, 'The deployment is not set up for it.', `Microsoft Entra ID cannot be connected on this deployment yet: ${ready.missing.join('; ')}. Nothing was kept. Meanwhile, a file exported from Active Directory works today.`, 409, 'source')
  }
  const domains = await verifiedDomains(writer.companyId)
  const want = asked ? asked.trim().toLowerCase() : domains[0] ?? null
  if (!want || !domains.includes(want)) {
    const named = asked ? `${asked.trim()} is not a domain ${writer.companyName} has verified.` : `${writer.companyName} has no verified domain.`
    const consumer = want && (isConsumerDomain(want) || isPlatformDomain(want)) ? ` ${want} is a personal or Etyme address and can never stand for a company.` : ''
    return refusedEntra(writer, `The domain ${want ?? '(none)'} is not verified for the company.`, `${named}${consumer} Etyme reads only a directory on a domain your company has proved it holds. Verify your domain under Settings → Your domain, then connect.`, 422, 'domain')
  }
  const state = signState({ companyId: writer.companyId, personId: writer.personId, domain: want, provider: 'ENTRA' })
  return NextResponse.json({ data: { url: adminConsentUrl({ clientId: process.env.ETYME_DIRECTORY_ENTRA_CLIENT_ID!, origin: appUrl(), state, domain: want }), domain: want } })
}

async function disconnectEntra(writer: Writer): Promise<NextResponse> {
  const row = await prisma.directoryConnection.findUnique({ where: { companyId_provider: { companyId: writer.companyId, provider: 'ENTRA' } }, select: { id: true, domain: true } })
  if (!row) return refuse(`Microsoft Entra ID is not connected for ${writer.companyName}, so there is nothing to disconnect.`, 404, 'source')
  await prisma.directoryConnection.delete({ where: { id: row.id } })
  return NextResponse.json({
    data: {
      says: `Microsoft Entra ID is disconnected for ${row.domain}. Etyme no longer reads it. To take back the consent itself, your Microsoft 365 admin removes Etyme under Enterprise applications. Your team structure stays as it is.`,
    },
  })
}

async function readFromEntra(writer: Writer): Promise<{ people: DirectoryPerson[] } | { response: NextResponse }> {
  const row = await prisma.directoryConnection.findUnique({ where: { companyId_provider: { companyId: writer.companyId, provider: 'ENTRA' } }, select: { domain: true, customerId: true } })
  if (!row || !isTenantId(row.customerId)) return { response: await refusedEntra(writer, 'Microsoft Entra ID is not connected.', `Microsoft Entra ID is not connected for ${writer.companyName}.`, 409, 'source') }
  if (!(await verifiedDomains(writer.companyId)).includes(row.domain)) {
    return { response: await refusedEntra(writer, `${row.domain} is no longer verified for the company.`, `${row.domain} is no longer verified for ${writer.companyName}, so its directory is not read. Verify it under Settings → Your domain, or disconnect.`, 409, 'domain') }
  }
  try {
    const token = await entraToken({ tenantId: row.customerId, clientId: process.env.ETYME_DIRECTORY_ENTRA_CLIENT_ID!, clientSecret: process.env.ETYME_DIRECTORY_ENTRA_CLIENT_SECRET! })
    return { people: onlyDomain(await readEntra(token), row.domain) }
  } catch (e) {
    const says = e instanceof Error && /^Microsoft /.test(e.message) ? e.message : 'Microsoft could not be read. Nothing was changed; try again.'
    return { response: await refusedEntra(writer, 'Microsoft refused the read.', says, 502, 'source') }
  }
}

/**
 * Microsoft sending the IT admin back from its admin-consent screen, with
 * `admin_consent=True&tenant=<id>&state=`, or `error=&state=`. Always a
 * redirect to this app's own Team structure page with a short code.
 */
async function entraCallback(request: NextRequest): Promise<NextResponse> {
  const back = (code: EntraOutcome) => NextResponse.redirect(`${appUrl()}/dashboard/settings/team-structure?entra=${code}`, 303)
  const q = request.nextUrl.searchParams
  const { caller, error } = await treeCaller(request)
  if (error) return back('signin')
  if (!hasPermission(caller.permissions, 'settings.manage')) { await refusedTree(caller, DOING); return back('not-yours') }
  const writer = await writerFor(caller)
  if (!writer) { await refusedTree(caller, DOING); return back('not-yours') }

  if (!entraReadiness().ready) { await refusedEntra(writer, 'The deployment is not set up for it.', '', 409); return back('off') }
  const state = readState(q.get('state') ?? '')
  if (!state || state.provider !== 'ENTRA') { await refusedEntra(writer, 'The consent came back with a state this deployment did not sign, or too late.', '', 403); return back('expired') }
  if (state.companyId !== writer.companyId || state.personId !== writer.personId) {
    await refusedEntra(writer, 'The consent was started by another seat or for another company.', '', 403)
    return back('not-yours')
  }
  const tenant = q.get('tenant')
  if (q.get('error') || String(q.get('admin_consent') ?? '').toLowerCase() !== 'true' || !isTenantId(tenant)) return back('declined')
  if (!(await verifiedDomains(writer.companyId)).includes(state.domain)) {
    await refusedEntra(writer, `${state.domain} is not verified for the company.`, '', 422)
    return back('domain')
  }

  try {
    // The tenant that consented must be the tenant that holds the domain.
    const holder = await tenantForDomain(state.domain)
    if (holder !== tenant.toLowerCase()) {
      await refusedEntra(writer, `The organization that granted access (${tenant}) does not hold ${state.domain} in Microsoft.`, '', 403)
      return back('tenant')
    }
    // One read proves the grant works; nothing from it is kept.
    try {
      const token = await entraToken({ tenantId: holder, clientId: process.env.ETYME_DIRECTORY_ENTRA_CLIENT_ID!, clientSecret: process.env.ETYME_DIRECTORY_ENTRA_CLIENT_SECRET! })
      await readEntra(token, fetch, 1)
    } catch {
      await refusedEntra(writer, 'Microsoft did not let Etyme read the users after the consent.', '', 502)
      return back('read')
    }
    await recordAccess([{ companyId: writer.companyId }], {
      actorPersonId: writer.personId,
      actorCompanyId: writer.companyId,
      action: 'DIRECTORY_READ',
      reason: `Connected ${writer.companyName}'s Microsoft Entra ID directory for ${state.domain}, read only: read one page of users to prove the consent for ${ENTRA_PERMISSION} works.`,
    })
    await prisma.directoryConnection.upsert({
      where: { companyId_provider: { companyId: writer.companyId, provider: 'ENTRA' } },
      create: { companyId: writer.companyId, provider: 'ENTRA', domain: state.domain, customerId: holder, scope: ENTRA_PERMISSION, tokenSealed: '', connectedById: writer.personId },
      update: { domain: state.domain, customerId: holder, scope: ENTRA_PERMISSION, tokenSealed: '', connectedById: writer.personId, connectedAt: new Date(), lastReadAt: null, lastReadCount: null },
    })
    return back('connected')
  } catch (e) {
    if (e instanceof EntraSays) {
      await refusedEntra(writer, e.message, '', 403)
      return back(e.code)
    }
    await reportError('settings/team-structure/directory', new Error('The Microsoft Entra ID connection could not be kept.'), { personId: writer.personId, companyId: writer.companyId })
    return back('failed')
  }
}
