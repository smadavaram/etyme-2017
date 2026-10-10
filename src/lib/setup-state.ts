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
  readRecord, recordStep, outstanding, reminderFor, showsSteps, nextStep, claimedSentence,
  countryGuessSentence, packSentence, countryName,
  type SetupRecord, type SetupFacts, type SetupStep, type Reminder,
} from '@/lib/setup-steps'
import { countryFromDomain } from '@/lib/company-defaults'

export interface SetupState {
  startedAt: Date | null
  finishedAt: Date | null
  record: SetupRecord
  facts: SetupFacts
  owed: SetupStep[]
  next: SetupStep | null
  /** Whether /start shows the steps to this reader. */
  shows: boolean
  /** The dashboard's one line, for a reader who may finish it. */
  reminder: Reminder | null
  /**
   * For a supplier that took its record from a client's invitation: the
   * line over "How you work" naming the client and the next step.
   */
  claimedSays: string | null
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
  const claimedFrom = c.claimedAt ? await clientThatInvited(c.id) : null
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
    reminder: reader.mayRun ? reminderFor({ startedAt: c.setupStartedAt, record, facts, kind: c.kind }) : null,
    claimedSays: claimedFrom ? claimedSentence(claimedFrom) : null,
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
 * at "How you work" (sign-up walk, round two, item 29).
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
      summary: "Setup opened at How you work; the company step was filled from the client's invitation",
      reason: "Your client's invitation already gave your company's name and your client, so the next thing to answer is your week and payroll.",
      payload: { personId, from: 'CLAIM', recorded: ['COMPANY'] },
      reversible: true,
    },
  })
  return true
}
