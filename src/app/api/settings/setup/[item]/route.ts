import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { prisma } from '@/lib/db'
import { setupDoor, refused } from '../door'
import { readSetup } from '../read'
import { txt } from './dns'
import { recordItem, recordAnswers, type AnswerToRecord } from '@/lib/setup-checklist-state'
import {
  ENTITY_TYPES, DUTIES, plainYear, plainWebsite, plainEin, plainEmail, lastFour, checkItemAnswer,
  type ItemKey, type AnswerSource, type Duty,
} from '@/lib/setup-checklist'
import { knownCurrency } from '@/lib/setup-steps'
import { defaultRequiredSets, PARTIES_OF } from '@/lib/document-stages/required-sets'
import { CANNOT_BE_WAIVED, mayWaive, owedByFor, PARTY_OF_SHAPE, type LineShape } from '@/lib/document-requirements'
import { builtInType } from '@/lib/document-type'
import { canClaim } from '@/lib/company-domains'
import { verificationRecord } from '@/lib/domains-owned'
import { checkTeamsLink } from '@/lib/notify/teams-link'

/**
 * PUT /api/settings/setup/<item> — "Save and continue" on one checklist
 * item: its answers written where they live, where each came from
 * recorded with who and when, and the item recorded done.
 *
 * Every answer is the company's own: nothing here reads another company,
 * and nothing is fetched from outside but the one DNS record a company
 * publishes to prove its domain. A value read from a paper arrives here
 * only on a person's press of Save, with the words it was read from; the
 * reader (`/api/settings/setup/read-paper`) never writes.
 */

const ITEM_OF_PATH: Record<string, ItemKey> = {
  company: 'COMPANY',
  addresses: 'ADDRESSES',
  'people-in-charge': 'PEOPLE_IN_CHARGE',
  papers: 'PAPERS',
  bank: 'BANK',
  domain: 'DOMAIN',
  integrations: 'INTEGRATIONS',
}

const SOURCES: readonly AnswerSource[] = ['DOMAIN', 'PAPER', 'IMPORT', 'PERSON']
const str = (v: unknown, max = 200) => String(v ?? '').trim().slice(0, max)

/** Where the screen says an answer came from; anything else is a person's. */
function sourceOf(body: any, field: string): AnswerToRecord {
  const s = body?.sources?.[field]
  const source: AnswerSource = SOURCES.includes(s?.source) ? s.source : 'PERSON'
  return { field, source, quote: source === 'PERSON' ? null : str(s?.quote, 300) || null }
}

export async function PUT(request: NextRequest, { params }: { params: { item: string } }) {
  const door = await setupDoor(request, 'Answering the setup checklist')
  if (door.error) return door.error
  const item = ITEM_OF_PATH[params.item]
  const company = door.caller.company
  if (!item) return refused('That is not one of the setup items.', 404)
  const allowed = checkItemAnswer(company.kind, item, 'DONE')
  if (!allowed.ok) return refused(allowed.says)
  const body = await request.json().catch(() => ({}))
  const said = await SAVE[item]!(company, door.personId, body)
  if (!said.ok) return refused(said.says)
  if (said.done !== false) await recordItem(company.id, door.personId, item, 'DONE')
  if (said.answers?.length) await recordAnswers(company.id, door.personId, said.answers)
  const data = await readSetup(company.id, { personId: door.personId, email: door.caller.person.primaryEmail })
  return NextResponse.json({ data: { ...data, says: said.says ?? null } })
}

type Saved = { ok: true; answers?: AnswerToRecord[]; says?: string; done?: boolean } | { ok: false; says: string }
type Co = { id: string; name: string; kind: string }

const SAVE: Partial<Record<ItemKey, (c: Co, by: string, body: any) => Promise<Saved>>> = {
  // ── Your company ───────────────────────────────────────────────────
  async COMPANY(c, by, body) {
    const legalName = str(body.legalName)
    if (!legalName) return { ok: false, says: 'Type the legal name, the one on your tax registration, or press Skip for now.' }
    const entityType = str(body.entityType)
    if (entityType && !ENTITY_TYPES.includes(entityType)) return { ok: false, says: `Choose the kind of company from the list: ${ENTITY_TYPES.join(', ')}.` }
    const year = str(body.establishedYear) ? plainYear(body.establishedYear) : null
    if (str(body.establishedYear) && !year) return { ok: false, says: 'Type the year the company was established, as four digits.' }
    const website = str(body.website) ? plainWebsite(body.website) : null
    if (str(body.website) && !website) return { ok: false, says: 'Type the website as an address, like tapin.com.' }
    const taxId = str(body.taxId) ? (plainEin(body.taxId) ?? str(body.taxId, 40)) : null
    const currency = str(body.currency) ? knownCurrency(body.currency) : null
    if (str(body.currency) && !currency) return { ok: false, says: 'Type the currency as three letters, like USD.' }
    await prisma.company.update({
      where: { id: c.id },
      data: {
        legalName, dba: str(body.dba) || null, entityType: entityType || null, establishedYear: year,
        website, phone: str(body.phone, 40) || null, taxId, ...(currency ? { currency } : {}),
      },
    })
    const tz = str(body.timeZone, 60)
    if (tz) {
      const primary = await prisma.companyLocation.findFirst({ where: { companyId: c.id, isPrimary: true }, select: { id: true } })
      if (primary) await prisma.companyLocation.update({ where: { id: primary.id }, data: { timeZone: tz } })
    }
    const fields = ['legalName', 'dba', 'entityType', 'establishedYear', 'website', 'phone', 'taxId', 'currency', 'timeZone']
      .filter((f) => str(body[f]))
    return { ok: true, answers: fields.map((f) => sourceOf(body, f)) }
  },

  // ── Addresses ──────────────────────────────────────────────────────
  async ADDRESSES(c, by, body) {
    const legal = address(body.legal)
    if (!legal.street || !legal.city) return { ok: false, says: 'Type the street and the city of your legal address, or press Skip for now.' }
    const same = body.billingSameAsLegal !== false
    const billing = address(body.billing)
    if (!same && (!billing.street || !billing.city)) return { ok: false, says: 'Type the street and the city of your billing address, or tick “Same as the legal address”.' }
    const at = new Date()
    await prisma.companyAddress.upsert({
      where: { companyId_kind: { companyId: c.id, kind: 'LEGAL' } },
      create: { companyId: c.id, kind: 'LEGAL', ...legal, recordedById: by, recordedAt: at },
      update: { ...legal, recordedById: by, recordedAt: at },
    })
    if (!same) {
      await prisma.companyAddress.upsert({
        where: { companyId_kind: { companyId: c.id, kind: 'BILLING' } },
        create: { companyId: c.id, kind: 'BILLING', ...billing, recordedById: by, recordedAt: at },
        update: { ...billing, recordedById: by, recordedAt: at },
      })
    }
    await prisma.company.update({ where: { id: c.id }, data: { billingSameAsLegal: same } })
    const fields = ['legal.street', 'legal.city', 'legal.state', 'legal.postalCode']
    return { ok: true, answers: fields.filter((f) => str(body.legal?.[f.split('.')[1]])).map((f) => sourceOf(body, f)) }
  },

  // ── The people in charge ───────────────────────────────────────────
  async PEOPLE_IN_CHARGE(c, by, body) {
    const seats = await prisma.context.findMany({
      where: { companyId: c.id, type: 'EMPLOYEE', revokedAt: null },
      select: { personId: true, person: { select: { name: true, primaryEmail: true } } },
    })
    const rows: { duty: Duty; personId: string | null; name: string | null; email: string | null; invitedAt: Date | null }[] = []
    for (const d of Array.isArray(body.duties) ? body.duties : []) {
      if (!DUTIES.includes(d?.duty)) continue
      const personId = str(d.personId)
      if (personId) {
        const seat = seats.find((s) => s.personId === personId)
        if (!seat) return { ok: false, says: 'Pick somebody seated at this company, or type a name and an email to invite them.' }
        rows.push({ duty: d.duty, personId, name: seat.person.name, email: seat.person.primaryEmail, invitedAt: null })
        continue
      }
      const name = str(d.name)
      const email = str(d.email) ? plainEmail(d.email) : null
      if (!name && !str(d.email)) continue
      if (!name || !email) return { ok: false, says: `Type both a name and a work email for the ${d.duty === 'HR' ? 'HR' : d.duty === 'OWNER' ? 'owner' : 'billing contact'}.` }
      // Invited from this screen through Users & permissions' own door: the
      // seat it made is the proof, never the screen's word for it.
      const invited = seats.find((s) => s.person.primaryEmail.toLowerCase() === email)
      rows.push({ duty: d.duty, personId: invited?.personId ?? null, name, email, invitedAt: invited ? new Date() : null })
    }
    const accounts = str(body.accountsEmail) ? plainEmail(body.accountsEmail) : null
    if (str(body.accountsEmail) && !accounts) return { ok: false, says: 'Type the accounts email as an address, like accounts@tapin.com.' }
    const at = new Date()
    for (const r of rows) {
      await prisma.companyInCharge.upsert({
        where: { companyId_duty: { companyId: c.id, duty: r.duty } },
        create: { companyId: c.id, ...r, recordedById: by, recordedAt: at },
        update: { ...r, recordedById: by, recordedAt: at },
      })
    }
    await prisma.company.update({ where: { id: c.id }, data: { accountsEmail: accounts } })
    return { ok: true, answers: accounts ? [sourceOf(body, 'accountsEmail')] : [] }
  },

  // ── Papers you require ─────────────────────────────────────────────
  async PAPERS(c, by, body) {
    const parties = PARTIES_OF[c.kind] ?? PARTIES_OF.VENDOR
    const defaults = defaultRequiredSets(c.kind)
    const sets = Array.isArray(body.sets) ? body.sets : []
    if (sets.length === 0) return { ok: false, says: 'Confirm at least one party’s papers, or press Skip for now.' }
    const writes: { party: string; rows: any[] }[] = []
    for (const s of sets) {
      if (!parties.includes(s?.party)) return { ok: false, says: 'That party is not one this company asks papers of.' }
      const shipped = defaults.find((d) => d.party === s.party)!
      const shape = (Object.entries(PARTY_OF_SHAPE).find(([, p]) => p === s.party)![0]) as LineShape
      const rows: any[] = []
      for (const i of Array.isArray(s.items) ? s.items : []) {
        const key = str(i?.key, 60)
        const known = shipped.items.find((x) => x.key === key)
        const type = builtInType(key)
        if (!known && !type) return { ok: false, says: `${key || 'That paper'} is not a paper Etyme knows. Add it under Settings, Documents, first.` }
        const reason = str(i?.waivedReason, 300)
        if (reason || i?.waived === true) {
          const v = mayWaive(key, reason, (k) => builtInType(k)?.label ?? k)
          if (!v.ok) return { ok: false, says: v.says }
        }
        const floor = CANNOT_BE_WAIVED.includes(key)
        rows.push({
          companyId: c.id,
          party: s.party,
          documentTypeKey: key,
          required: floor ? true : i?.required !== false,
          owedBy: known?.owedBy ?? owedByFor(type!, shape),
          ...(reason ? { waivedReason: reason, waivedById: by, waivedAt: new Date() } : {}),
        })
      }
      // A confirmed set always holds the floor nobody may drop.
      for (const key of CANNOT_BE_WAIVED) {
        const k = shipped.items.find((x) => x.key === key)
        if (k && !rows.some((r) => r.documentTypeKey === key)) {
          rows.push({ companyId: c.id, party: s.party, documentTypeKey: key, required: true, owedBy: k.owedBy })
        }
      }
      writes.push({ party: s.party, rows })
    }
    await prisma.$transaction(async (tx) => {
      for (const w of writes) {
        await tx.documentRequirement.deleteMany({ where: { companyId: c.id, party: w.party as any } })
        if (w.rows.length) await tx.documentRequirement.createMany({ data: w.rows })
      }
    })
    const confirmed = await prisma.documentRequirement.findMany({ where: { companyId: c.id, party: { not: null } }, select: { party: true }, distinct: ['party'] })
    const all = parties.every((p) => confirmed.some((x) => x.party === p))
    return { ok: true, done: all, says: all ? undefined : 'Saved. Confirm the other parties’ papers to finish this item.' }
  },

  // ── Bank details ───────────────────────────────────────────────────
  async BANK(c, by, body) {
    const bankName = str(body.bankName, 120)
    const accountName = str(body.accountName, 200)
    const last4 = lastFour(body.accountNumber ?? body.last4)
    const routing4 = str(body.routingNumber ?? body.routingLast4) ? lastFour(body.routingNumber ?? body.routingLast4) : null
    if (!bankName || !accountName || !last4) {
      return { ok: false, says: 'Type the bank, the name on the account and at least the last four digits of the account, or press Skip for now.' }
    }
    const [co, legal, existing] = await Promise.all([
      prisma.company.findUniqueOrThrow({ where: { id: c.id }, select: { name: true, legalName: true, country: true, taxId: true } }),
      prisma.companyAddress.findUnique({ where: { companyId_kind: { companyId: c.id, kind: 'LEGAL' } } }),
      prisma.remitTo.findFirst({ where: { companyId: c.id }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] }),
    ])
    const changed = !existing || existing.bankName !== bankName || existing.accountLast4 !== last4 || (routing4 && existing.routingLast4 !== routing4)
    const data = {
      bankName, accountName, accountLast4: last4, ...(routing4 ? { routingLast4: routing4 } : {}),
      enteredById: by, enteredAt: new Date(),
      // A change to where the money goes is checked again before anybody pays.
      ...(changed ? { verifiedAt: null, verifiedById: null, verifiedByCompanyId: null } : {}),
    }
    if (existing) {
      await prisma.remitTo.update({ where: { id: existing.id }, data })
    } else {
      await prisma.remitTo.create({
        data: {
          companyId: c.id, legalName: co.legalName ?? co.name, isDefault: true, country: legal?.country ?? co.country ?? 'US',
          addressLines: legal ? [legal.street, [legal.city, legal.state, legal.postalCode].filter(Boolean).join(', ')].filter((x): x is string => !!x) : [],
          taxId: co.taxId, ...data,
        },
      })
    }
    return { ok: true, answers: [{ field: 'bank', source: 'PERSON' }] }
  },

  // ── Your domain ────────────────────────────────────────────────────
  async DOMAIN(c, by, body) {
    if (body.action === 'CHECK') {
      const claim = await prisma.companyDomain.findFirst({ where: { id: str(body.id, 60), companyId: c.id } })
      if (!claim || !claim.proofToken) return { ok: false, says: 'There is no domain waiting for a check here.' }
      if (claim.verifiedAt) return { ok: true, says: `${claim.domain} is verified.` }
      const record = verificationRecord(claim.domain, claim.proofToken)
      let found = false
      try {
        found = (await txt.resolve(record.name)).map((ch) => ch.join('')).includes(record.value)
      } catch {
        found = false
      }
      if (!found) return { ok: true, done: false, says: `Not yet. Nothing matching is published at ${record.name}. DNS usually takes a few minutes, sometimes an hour.` }
      await prisma.companyDomain.update({ where: { id: claim.id }, data: { verifiedAt: new Date(), verifiedVia: 'DNS_TXT' } })
      const co = await prisma.company.findUniqueOrThrow({ where: { id: c.id }, select: { domain: true } })
      if (!co.domain) await prisma.company.update({ where: { id: c.id }, data: { domain: claim.domain, domainVerified: true } })
      return { ok: true, says: `${claim.domain} is verified. Colleagues on ${claim.domain} now join by signing in.` }
    }
    const domain = str(body.domain, 120).toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    const elsewhere = await prisma.companyDomain.findUnique({ where: { domain }, select: { companyId: true, company: { select: { name: true } }, verifiedAt: true, joinPolicy: true } })
    if (elsewhere?.companyId === c.id) return { ok: true, done: false, says: `${domain} is already claimed here. Publish the record, then check.` }
    const verdict = canClaim(domain, elsewhere ? { domain, companyId: elsewhere.companyId, companyName: elsewhere.company.name, verified: !!elsewhere.verifiedAt, joinPolicy: elsewhere.joinPolicy as any } : undefined, false)
    if (!verdict.ok) return { ok: false, says: verdict.reason }
    await prisma.companyDomain.create({
      data: { companyId: c.id, domain, proofToken: randomBytes(18).toString('base64url'), joinPolicy: 'REQUEST', addedById: by },
    })
    return { ok: true, done: false, says: verdict.reason }
  },

  // ── Integrations ───────────────────────────────────────────────────
  async INTEGRATIONS(c, by, body) {
    const check = checkTeamsLink(body.teamsWebhookUrl ?? null)
    if (!check.ok) return { ok: false, says: check.message }
    await prisma.company.update({ where: { id: c.id }, data: { teamsWebhookUrl: check.url } })
    return { ok: true }
  },
}

function address(a: any) {
  return {
    street: str(a?.street) || null,
    city: str(a?.city, 120) || null,
    state: str(a?.state, 60) || null,
    postalCode: str(a?.postalCode, 20) || null,
    country: (str(a?.country, 2) || 'US').toUpperCase(),
  }
}
