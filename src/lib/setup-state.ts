/**
 * Where a company is in its five setup steps, read off its own rows.
 *
 * The rules are lib/setup-steps; this adds the database: the record on
 * the company, and the two facts that finish a step done some other way —
 * an import committed from the Import page, a teammate invited from Users
 * and permissions.
 */

import { prisma } from '@/lib/db'
import {
  readRecord, recordStep, outstanding, showsSteps, nextStep, claimedSentence,
  countryGuessSentence, packSentence, countryName,
  type SetupRecord, type SetupFacts, type SetupStep, type Reminder,
} from '@/lib/setup-steps'
import { countryFromDomain } from '@/lib/company-defaults'
import { skipStops, confirmAllWords } from '@/lib/site-rules'
import { setupReminderFor } from '@/lib/setup-checklist-state'

async function checklistReminder(companyId: string): Promise<(Reminder & { link: string }) | null> {
  const r = await setupReminderFor(companyId, { mayRun: true })
  return r ? { says: r.says, href: r.href, link: r.link } : null
}

export interface SetupState {
  startedAt: Date | null
  finishedAt: Date | null
  record: SetupRecord
  facts: SetupFacts
  owed: SetupStep[]
  next: SetupStep | null
  /** Whether /start shows the steps to this reader. */
  shows: boolean
  /**
   * The dashboard's one line, for a reader who may finish it: the setup
   * checklist's (`setupReminderFor` in lib/setup-checklist-state), with
   * the link's words.
   */
  reminder: (Reminder & { link: string }) | null
  /**
   * For a supplier that took its record from a client's invitation: the
   * line over "How you work" naming the client and the next step.
   */
  claimedSays: string | null
  /**
   * The Sites step (2026-10-28): how many sites the company has, the
   * primary one, the button's words and the one thing skipping stops.
   */
  sites: { count: number; primary: string | null; names: string[]; confirmSays: string; skipSays: string }
  company: {
    id: string
    name: string
    kind: string
    domain: string | null
    country: string
    countryName: string
    currency: string
    templatePack: string | null
    /** Said as a guess where the country is still the one guessed from the domain. */
    countrySays: string | null
    packSays: string | null
  }
}

export async function setupFactsFor(companyId: string): Promise<SetupFacts> {
  const [imported, seats] = await Promise.all([
    prisma.import.count({ where: { companyId, committedAt: { not: null } } }),
    prisma.context.count({ where: { companyId, type: 'EMPLOYEE', revokedAt: null } }),
  ])
  // The founder holds one seat; anybody else is a teammate.
  return { peopleImported: imported > 0, teammates: Math.max(0, seats - 1) }
}

export async function setupStateFor(
  companyId: string,
  reader: { mayRun: boolean; followedLinkBack?: boolean },
): Promise<SetupState | null> {
  const c = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      id: true, name: true, kind: true, domain: true, country: true, currency: true, templatePack: true,
      setupStartedAt: true, setupFinishedAt: true, setupSteps: true, claimedAt: true,
    },
  })
  if (!c) return null
  const [claimedFrom, siteRows] = await Promise.all([
    c.claimedAt ? clientThatInvited(c.id) : Promise.resolve(null),
    prisma.companyLocation.findMany({
      where: { companyId },
      orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }],
      select: { name: true, isPrimary: true },
    }),
  ])
  const primary = siteRows.find((r) => r.isPrimary)?.name ?? null
  const record = readRecord(c.setupSteps)
  const facts = await setupFactsFor(companyId)
  const owed = outstanding(record, facts, c.kind)
  const country = c.country ?? countryFromDomain(c.domain)
  const guessed = countryFromDomain(c.domain)
  return {
    startedAt: c.setupStartedAt,
    finishedAt: c.setupFinishedAt,
    record,
    facts,
    owed,
    next: nextStep(record, c.kind),
    shows: showsSteps({
      startedAt: c.setupStartedAt,
      finishedAt: c.setupFinishedAt,
      mayRun: reader.mayRun,
      followedLinkBack: reader.followedLinkBack === true,
      owed: owed.length,
    }),
    // The one line that comes back is the checklist's since 2026-10-28: every
    // item still owed, in the checklist's order, linking to it.
    reminder: reader.mayRun ? await checklistReminder(companyId) : null,
    claimedSays: claimedFrom ? claimedSentence(claimedFrom) : null,
    sites: {
      count: siteRows.length,
      primary,
      names: siteRows.slice(0, 12).map((r) => r.name),
      confirmSays: confirmAllWords(siteRows.length),
      skipSays: skipStops(primary),
    },
    company: {
      id: c.id,
      name: c.name,
      kind: c.kind,
      domain: c.domain,
      country,
      countryName: countryName(country),
      currency: c.currency,
      templatePack: c.templatePack,
      countrySays: country === guessed ? countryGuessSentence(country, c.domain) : null,
      packSays: c.templatePack ? packSentence(c.templatePack, c.kind) : null,
    },
  }
}

/**
 * Record one step's answer with who and when, and close setup once every
 * step has one. Refuses in a sentence and writes nothing on a refusal.
 */
export async function answerStep(
  companyId: string,
  byId: string,
  step: unknown,
  outcome: unknown,
): Promise<{ ok: true; finished: boolean } | { ok: false; message: string }> {
  const c = await prisma.company.findUnique({
    where: { id: companyId },
    select: { kind: true, setupStartedAt: true, setupFinishedAt: true, setupSteps: true },
  })
  if (!c) return { ok: false, message: 'There is no company here to set up.' }
  if (!c.setupStartedAt) {
    return { ok: false, message: 'This company was set up before the five steps existed. Its settings page has everything they ask.' }
  }
  const now = new Date()
  const v = recordStep(readRecord(c.setupSteps), step, outcome, byId, now, c.kind)
  if (!v.ok) return v
  await prisma.company.update({
    where: { id: companyId },
    data: {
      setupSteps: v.record as any,
      ...(v.finished && !c.setupFinishedAt ? { setupFinishedAt: now } : {}),
    },
  })
  return { ok: true, finished: v.finished }
}

/** The client whose invitation a supplier took its record from, by name. */
async function clientThatInvited(companyId: string): Promise<string | null> {
  const invite = await prisma.supplierInvite.findFirst({
    where: { companyId, state: 'ACCEPTED' },
    orderBy: { acceptedAt: 'desc' },
    select: { by: { select: { name: true } } },
  })
  return invite?.by.name ?? null
}

/**
 * A supplier that took its record from a client's invitation begins setup
 * after "Your company" (sign-up walk, round two, item 29): at Sites since
 * 2026-10-28, then "How you work".
 *
 * The record already holds its name and its client, so "Your company" is
 * recorded as done by the person who claimed it, and the next thing it
 * sees is its week and payroll rather than "All clear" and no next step.
 * Only a real company that took an invitation and never began setup;
 * written once, with an automation log saying why, and undone by
 * answering the steps or by nothing at all — it only opens the steps.
 */
export async function beginClaimedSetup(companyId: string, personId: string, now: Date = new Date()): Promise<boolean> {
  const c = await prisma.company.findUnique({
    where: { id: companyId },
    select: { claimedAt: true, setupStartedAt: true, isDemo: true, setupSteps: true },
  })
  if (!c || !c.claimedAt || c.setupStartedAt || c.isDemo) return false
  const v = recordStep(readRecord(c.setupSteps), 'COMPANY', 'DONE', personId, now)
  if (!v.ok) return false
  const began = await prisma.company.updateMany({
    where: { id: companyId, setupStartedAt: null },
    data: { setupStartedAt: now, setupSteps: v.record as any },
  })
  if (began.count === 0) return false
  await prisma.automationLog.create({
    data: {
      companyId, action: 'SETUP_STARTED',
      // Plain words about the reader's own firm, not a log line about it in
      // the third person (sign-up walk, round four, item 18).
      summary: "Setup opened at Sites; the company step was filled from the client's invitation",
      reason: "Your client's invitation already gave your company's name and your client, so the next things to answer are your sites, then your week and payroll.",
      payload: { personId, from: 'CLAIM', recorded: ['COMPANY'] },
      reversible: true,
    },
  })
  return true
}
