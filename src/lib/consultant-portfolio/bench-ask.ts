/**
 * The bench ask, one function for every door (2026-10-29).
 *
 * A firm asks a person onto its bench from two places: a recruiter's
 * "Add consultant" (`POST /api/consultants`) and the person's own "Join
 * the bench" on the firm's public page (`POST /api/site/:slug/join`).
 * Market built the second by repeating thirty lines of the first, and two
 * copies of a consent rule are one wrong record waiting. So both doors
 * call `askOntoBench`, and a person asked from the page and a person
 * asked by a recruiter get the same record, the same rule and the same
 * log line.
 *
 * ── The rule (`addPath` in lib/consultant-portfolio) ─────────────────
 *
 *  - NEW           nobody by that address has a profile: one is made, on
 *                  the person by that address where there is one, else
 *                  on a new person. Never a second person.
 *  - ASK_EXISTING  she has a profile: the invitation only, on her record,
 *                  her own name kept.
 *  - ASK_AGAIN     she took a listing here back: asked afresh, never
 *                  restored.
 *  - ALREADY_ASKED, ALREADY_ON, SAID_NO: nothing is written and nothing
 *                  is sent. A no stands from either door.
 *
 * Every listing is born INVITED (`invitation`) and only the person's own
 * yes from the letter moves it. Nobody is seated at the firm before that
 * yes, from either door: the recruiter's door used to write a CONSULTANT
 * seat at the firm for a new person and the page's never did, which was
 * the one place the two records differed. The listing is what makes the
 * firm know her (`/api/consultants` lists her by it); a seat waits for
 * her answer.
 *
 * ── The log ──────────────────────────────────────────────────────────
 *
 * One automation row, BENCH_LISTING_REQUESTED, with the same payload from
 * both doors, and after it a CONSULTANT_CREATED row wherever a consultant
 * record was made for an address that had none (the ladder names it): `requestedBy` is the recruiter, or null from the page, which
 * is what `tellTheFirm` reads to know who hears the answer; `door` says
 * which; `fromPublicPage` stays because the page's hourly cap counts it.
 *
 * And one access row whenever the address belongs to somebody already on
 * Etyme, because looking her up by address reads her record: CLAUDE.md,
 * every read of another person's data is logged. From the page the
 * caller is nobody and learns nothing, so the row is refusal-shaped
 * (`allowed: false`, no actor person, no actor company: the visitor is
 * not the firm) and written before the reply goes out (`recordRefusal`).
 * From a recruiter it is an allowed read by that person at that firm.
 */

import { prisma } from '@/lib/db'
import { invitation } from '@/lib/bench-consent'
import { inviteUrl, inviteText } from '@/lib/bench-invite'
import { listingTermsFrom, termsShown, INVITE_LINK_KEPT_SAYS, type InviteMail, type TermsShown } from '@/lib/bench-filter'
import { mailLeaves } from '@/lib/notify/mail-leaves'
import { addPath, type AddPath } from '@/lib/consultant-portfolio'
import { logAccess, recordRefusal } from '@/lib/access-log'
import { askByEmail } from '@/app/api/consultants/ask-by-email'
import { firmViewOf, firmTypedAnything, type FirmView } from './firm-view'

export type BenchAskDoor = 'ADD_CONSULTANT' | 'PUBLIC_PAGE'

export interface BenchAskInput {
  /** The firm asking; its currency is read here where a caller does not pass it. */
  firm: { id: string; name: string; homeCurrency?: string | null }
  /**
   * The name typed. A new person is made with it; an existing one keeps
   * hers, and the firm still reads the name it typed (`firmReadsName`).
   */
  name: string
  email: string
  /** The recruiter asking, or null where the person asked from the firm's page. */
  by: { personId: string } | null
  tier?: 'RETAINED' | 'MARKETING'
  rateMin?: number | null
  rateMax?: number | null
  /** What the firm says it would pay. Only a recruiter states terms; the page never does. */
  statedTerms?: { engagementType: unknown; payRateCents: unknown; payCurrency?: unknown } | null
  /**
   * What a recruiter typed about the person. Where nobody by that address
   * has a profile it becomes theirs; either way the headline, skills and
   * place are kept as the firm's own view on its listing, with `notes`,
   * and never written onto a profile somebody already has (`firm-view`).
   */
  newProfile?: {
    headline?: string | null
    skills?: string[]
    location?: string | null
    workAuth?: string | null
    rateFloor?: number | null
    availableFrom?: Date | null
  }
  /** The firm's own note on the person, kept on its listing only. */
  notes?: string | null
  /** A line put above the firm's letter, e.g. why it came when the person asked from the page. */
  letterLead?: string
}

export interface AskedPerson {
  id: string
  name: string
  primaryEmail: string | null
}

export type BenchAskOutcome =
  | {
      kind: 'ASKED'
      path: 'NEW' | 'ASK_EXISTING' | 'ASK_AGAIN'
      person: AskedPerson
      /**
       * The name the asking firm reads in every sentence (`firmReadsName`):
       * the one it typed, unless the firm listed her before.
       */
      named: string
      /**
       * What the asking firm may read back about her. On her own record
       * (ASK_EXISTING) it is only what the firm typed, never her own words.
       */
      profile: {
        id: string
        headline: string | null
        skills: string[]
        location: string | null
        workAuth: string | null
        availableFrom: Date | null
        visibility: string | null
      }
      listing: {
        id: string
        tier: 'RETAINED' | 'MARKETING'
        rateMin: number | null
        rateMax: number | null
        state: string
        termsEngagementType: string | null
        termsPayRateCents: number | null
        termsPayCurrency?: string | null
        termsStatedAt: Date | null
      } & FirmView
      /** Whether the firm typed anything about the person, kept on its listing. */
      typed: boolean
      terms: TermsShown | null
      /** The sentence the terms check gave, where terms were stated. */
      termsSays: string | null
      mail: InviteMail
    }
  /** Nothing written and nothing sent: already on, already asked, or said no. */
  | {
      kind: 'NOTHING'
      path: 'ALREADY_ON' | 'ALREADY_ASKED' | 'SAID_NO'
      person: AskedPerson
      /**
       * The name the firm reads in the sentence: hers once she said yes,
       * otherwise the one it typed (`nothingNamed`).
       */
      named: string
    }
  /** Refused before anything was written, in a sentence for the recruiter. */
  | { kind: 'REFUSED'; code: string; says: string; field: string }
  /** Two asks for one address in the same moment: the first stands. */
  | { kind: 'RACED' }

/**
 * The name a firm reads back after asking somebody (fix list A4,
 * 2026-11-15). "The page never says whether an address has an account":
 * where the address belongs to somebody the firm has never listed, every
 * sentence the firm reads uses the name it typed, never her own. Only a
 * firm that listed her before (ASK_AGAIN) already knows her name.
 */
export function firmReadsName(o: { path: 'NEW' | 'ASK_EXISTING' | 'ASK_AGAIN'; typed: string; own: string | null }): string {
  return o.path === 'ASK_AGAIN' && o.own ? o.own : o.typed
}

/**
 * The terms sentence with her own company's name taken out, where the
 * firm has never listed her: it names "their own company" and nothing
 * the firm did not type.
 */
export function termsSaysForFirm(says: string | null, ownCompanyName: string | null | undefined): string | null {
  if (!says || !ownCompanyName) return says
  return says.split(`${ownCompanyName}, `).join('').split(ownCompanyName).join('their own company')
}

/**
 * The name in the sentence where nothing was asked: an ask still waiting,
 * or a no, has no yes behind it, so the firm reads the name it typed on
 * its listing, or the one it typed now. Only a yes shows her own name.
 */
export function nothingNamed(o: { path: 'ALREADY_ON' | 'ALREADY_ASKED' | 'SAID_NO'; own: string; listed: string | null; typed: string }): string {
  if (o.path === 'ALREADY_ON') return o.own
  return o.listed?.trim() || o.typed
}

/** What each door is called in the log's words. */
export function doorOf(by: BenchAskInput['by']): BenchAskDoor {
  return by ? 'ADD_CONSULTANT' : 'PUBLIC_PAGE'
}

/** The reason on the access row for looking somebody up by address. */
export function lookupReason(o: { door: BenchAskDoor; firm: string; path: AddPath }): string {
  const what =
    o.path === 'ASK_EXISTING' || o.path === 'ASK_AGAIN'
      ? 'asked onto the bench on their own record'
      : 'nothing written and nothing sent'
  return o.door === 'PUBLIC_PAGE'
    ? `Looked up by email address from ${o.firm}’s public page (Join the bench); the visitor was told nothing about this person; ${what}.`
    : `Looked up by email address to ask onto ${o.firm}’s bench (Add consultant); ${what}.`
}

/**
 * The automation row's summary, the same shape from both doors.
 *
 * It promises a letter only where one can leave (`mailLeaves` in
 * lib/notify/mail-leaves, the same answer the send reads through
 * `configured`). Where none can, the ask is waiting and its link is kept
 * on the notice for staff, in the bench invitation's own words
 * (`INVITE_LINK_KEPT_SAYS`), never "from the letter" (2026-11-01).
 */
export function askSummary(o: { door: BenchAskDoor; personName: string; firm: string; path: AddPath; tier: string; mailOn: boolean }): string {
  // The firm reads its own activity log, so a first ask on somebody's own
  // record reads like any first ask (fix list A4). Only a listing taken
  // back and asked again says it was there before.
  const who = o.path === 'ASK_AGAIN' ? `"${o.personName}", who already has a record,` : `"${o.personName}"`
  const where = o.door === 'PUBLIC_PAGE' ? ` from ${o.firm}’s public page` : ''
  const again = o.path === 'ASK_AGAIN' ? ' again' : ''
  const waits = o.mailOn ? 'Pending their yes from the letter.' : `Waiting on their yes. ${INVITE_LINK_KEPT_SAYS}`
  return `${who} asked${again} onto ${o.firm}’s bench (${o.tier})${where}. ${waits}`
}

function isUniqueClash(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === 'P2002'
}

/**
 * The firm's own currency, as passed or read once. A read that fails reads
 * as dollars, the old behavior, rather than failing an ask that was rightly
 * recorded.
 */
async function firmCurrencyOf(firm: { id: string; homeCurrency?: string | null }): Promise<string> {
  if (firm.homeCurrency) return firm.homeCurrency
  try {
    return (await prisma.company.findUnique({ where: { id: firm.id }, select: { homeCurrency: true } }))?.homeCurrency ?? 'USD'
  } catch {
    return 'USD'
  }
}

export async function askOntoBench(o: BenchAskInput): Promise<BenchAskOutcome> {
  const email = o.email.toLowerCase().trim()
  const name = o.name.trim()
  const tier = o.tier ?? 'MARKETING'
  const door = doorOf(o.by)
  const firm = o.firm

  const existing = await prisma.person.findUnique({
    where: { primaryEmail: email },
    select: {
      id: true,
      name: true,
      primaryEmail: true,
      consultant: {
        select: {
          id: true,
          headline: true,
          skills: true,
          location: true,
          workAuth: true,
          availableFrom: true,
          visibility: true,
          rateFloor: true,
          ownCompany: { select: { id: true, name: true } },
          listings: { where: { companyId: firm.id }, select: { id: true, state: true, revokedAt: true, firmName: true } },
        },
      },
    },
  })
  const profile = existing?.consultant ?? null
  const listing = profile?.listings?.[0] ?? null
  const path = addPath({ profileExists: Boolean(profile), listing })
  // The name the firm reads in every sentence from here on.
  const named =
    path === 'NEW' || path === 'ASK_EXISTING' || path === 'ASK_AGAIN'
      ? firmReadsName({ path, typed: name, own: existing?.name ?? null })
      : name
  const firstAskOnHerRecord = path === 'ASK_EXISTING' || (path === 'NEW' && Boolean(existing))

  // Her record was read by her address: logged before anything is said.
  if (existing) {
    const reason = lookupReason({ door, firm: firm.name, path })
    if (o.by) {
      logAccess({ subjectId: existing.id, actorPersonId: o.by.personId, actorCompanyId: firm.id, action: 'MARKETING_REQUEST', reason })
    } else {
      await recordRefusal([existing.id], { action: 'PUBLIC_PAGE_ADDRESS_LOOKUP', allowed: false, reason })
    }
  }

  if (path === 'ALREADY_ON' || path === 'ALREADY_ASKED' || path === 'SAID_NO') {
    return {
      kind: 'NOTHING',
      path,
      person: { id: existing!.id, name: existing!.name, primaryEmail: existing!.primaryEmail },
      named: nothingNamed({ path, own: existing!.name, listed: listing?.firmName ?? null, typed: name }),
    }
  }

  // The floor is the person's own; no ask goes out below it.
  const min = o.rateMin ?? null
  const max = o.rateMax ?? null
  if (profile?.rateFloor != null && max != null && max < profile.rateFloor) {
    return {
      kind: 'REFUSED',
      code: 'BELOW_RATE_FLOOR',
      says: `The top of that range is below the lowest rate ${named} has said they will take.`,
      field: 'rateMax',
    }
  }

  // Terms are stated only by a recruiter, checked against the person's own
  // company where she has one; the page states none.
  const personName = named
  // Nothing typed writes all five terms columns as null, which is also
  // what clears an old agreement on a listing asked again.
  const terms = listingTermsFrom(
    o.by && o.statedTerms ? o.statedTerms : { engagementType: null, payRateCents: null },
    {
      personName,
      firmName: firm.name,
      ownCompany: profile?.ownCompany ?? null,
      statedById: o.by?.personId ?? '',
      now: new Date(),
      // The firm's own currency is the one offered where the stater named none.
      firmCurrency: o.by && o.statedTerms ? await firmCurrencyOf(firm) : null,
    }
  )
  if (!terms.ok) return { kind: 'REFUSED', code: terms.code, says: terms.says, field: terms.field }

  const view = firmViewOf({ ...o.newProfile, notes: o.notes })

  let asked
  try {
    asked = await prisma.$transaction(async (tx) => {
      // Never a second person: the one by that address, or a new one.
      const person =
        existing ??
        (await tx.person.findUnique({ where: { primaryEmail: email }, select: { id: true, name: true, primaryEmail: true } })) ??
        (await tx.person.create({ data: { name, primaryEmail: email }, select: { id: true, name: true, primaryEmail: true } }))

      const p = o.newProfile
      const prof = profile
        ? { ...profile, skills: profile.skills ?? [] }
        : await tx.consultantProfile.create({
            data: {
              personId: person.id,
              headline: p?.headline?.trim() || null,
              skills: (p?.skills ?? []).map((s) => s.trim()).filter(Boolean),
              location: p?.location?.trim() || null,
              workAuth: p?.workAuth || null,
              rateFloor: p?.rateFloor ?? null,
              availableFrom: p?.availableFrom ?? null,
              visibility: 'INTERNAL',
            },
          })

      // The firm's own view goes on its listing, never on her profile. Only
      // a recruiter states one; the page leaves whatever the firm said.
      // The name typed is the firm's at every ask, from either door, so it
      // reads it until she says yes (`firmReadsAt`, ./before-her-yes).
      const data = { tier, rateMin: min, rateMax: max, ...invitation(new Date()), ...terms.fields, ...(o.by ? view : {}), firmName: name || null }
      const row =
        path === 'ASK_AGAIN'
          ? await tx.benchListing.update({
              where: { id: listing!.id },
              // Asked again, never restored: revoking is never a suggestion.
              data: { ...data, revokedAt: null, declinedNote: null },
            })
          : await tx.benchListing.create({ data: { consultantId: prof.id, companyId: firm.id, ...data } })

      await tx.automationLog.create({
        data: {
          companyId: firm.id,
          action: 'BENCH_LISTING_REQUESTED',
          summary: askSummary({ door, personName: named, firm: firm.name, path, tier, mailOn: mailLeaves() }),
          reason:
            door === 'PUBLIC_PAGE'
              ? 'Join the bench on the public page: the bench’s own invitation, sent to the address the person gave, answered only from its link.'
              : 'Add consultant: the bench’s own invitation, on the record the address already has where there is one, answered only from its link.',
          payload: {
            listingId: row.id,
            consultantId: prof.id,
            personId: person.id,
            requestedBy: o.by?.personId ?? null,
            tier,
            door,
            path,
            profileCreated: !profile,
            firmViewKept: o.by ? firmTypedAnything(view) : false,
            fromPublicPage: door === 'PUBLIC_PAGE',
            termsEngagementType: terms.fields.termsEngagementType,
            termsPayRateCents: terms.fields.termsPayRateCents,
            termsPayCurrency: terms.fields.termsPayCurrency,
          },
          reversible: true,
        },
      })
      // A profile made where none existed is a record the system wrote
      // for somebody who has not said yes yet: its own row, from both doors.
      if (!profile) {
        await tx.automationLog.create({
          data: {
            companyId: firm.id,
            action: 'CONSULTANT_CREATED',
            summary: `A consultant record was made for "${named}" so ${firm.name} could ask them onto its bench. Nothing reaches past the firm until they say yes.`,
            reason:
              door === 'PUBLIC_PAGE'
                ? 'Join the bench on the public page, for an address with no consultant record on Etyme.'
                : 'Add consultant, for an address with no consultant record on Etyme.',
            payload: {
              personId: person.id,
              profileId: prof.id,
              listingId: row.id,
              createdBy: o.by?.personId ?? null,
              door,
              personCreated: !existing,
            },
            reversible: true,
          },
        })
      }

      return { person, prof, row }
    })
  } catch (err) {
    if (isUniqueClash(err)) return { kind: 'RACED' }
    throw err
  }

  // Outside the transaction: a slow mail provider never rolls back an ask
  // that was rightly recorded, and it can be sent again from Bench.
  // The terms are said in the firm's own currency, read once where the
  // caller did not hand it over (the public page's door does not).
  const homeCurrency = await firmCurrencyOf(firm)
  const shown = termsShown(asked.row, { name: firm.name, homeCurrency })
  const url = inviteUrl(asked.row.id)
  const msg = inviteText({ personName: asked.person.name, vendorName: firm.name, url, terms: shown })
  const mail = await askByEmail({
    companyId: firm.id,
    personId: asked.person.id,
    to: asked.person.primaryEmail,
    url,
    subject: msg.subject,
    body: (o.letterLead ?? '') + msg.body,
    listingId: asked.row.id,
  })

  return {
    kind: 'ASKED',
    path,
    person: asked.person,
    named,
    // On her own record the firm reads back only what it typed.
    profile: firstAskOnHerRecord
      ? {
          id: asked.prof.id,
          headline: asked.row.firmHeadline,
          skills: asked.row.firmSkills,
          location: asked.row.firmLocation,
          workAuth: null,
          availableFrom: null,
          visibility: null,
        }
      : {
          id: asked.prof.id,
          headline: asked.prof.headline,
          skills: asked.prof.skills,
          location: asked.prof.location,
          workAuth: asked.prof.workAuth,
          availableFrom: asked.prof.availableFrom,
          visibility: asked.prof.visibility,
        },
    listing: {
      id: asked.row.id,
      tier: asked.row.tier,
      rateMin: asked.row.rateMin,
      rateMax: asked.row.rateMax,
      state: asked.row.state,
      termsEngagementType: asked.row.termsEngagementType,
      termsPayRateCents: asked.row.termsPayRateCents,
      termsPayCurrency: asked.row.termsPayCurrency,
      termsStatedAt: asked.row.termsStatedAt,
      firmHeadline: asked.row.firmHeadline,
      firmSkills: asked.row.firmSkills,
      firmLocation: asked.row.firmLocation,
      firmNotes: asked.row.firmNotes,
    },
    typed: o.by ? firmTypedAnything(view) : false,
    terms: shown,
    termsSays: firstAskOnHerRecord ? termsSaysForFirm(terms.says, profile?.ownCompany?.name) : terms.says,
    mail,
  }
}
