/**
 * Where a company is in its setup checklist, read off its own rows, and
 * the one door every answer is recorded through.
 *
 * The rules and words are `lib/setup-checklist`; this adds the database:
 * each item's outcome (`SetupItem`), where each answer came from
 * (`SetupAnswer`), and the facts that finish an item done some other way
 * — an address saved, a site confirmed at first sign-in, a teammate
 * invited, a domain verified.
 *
 * `setupReminderFor` is the one line Today and the Ask Etyme greeting say
 * until the list is empty. The greeting is conversation's to draw; this is
 * the sentence it draws.
 */

import { prisma } from '@/lib/db'
import {
  checklistFor, checkItemAnswer, reminderSentence, CHECKLIST_HREF, COMPLETE_SETUP, itemsFor,
  type Checklist, type ChecklistFacts, type ChecklistRecord, type ItemKey, type ItemOutcome, type AnswerSource,
} from '@/lib/setup-checklist'
import { readRecord } from '@/lib/setup-steps'
import { PARTIES_OF } from '@/lib/document-stages/required-sets'

type Db = typeof prisma

// ── Reading ──────────────────────────────────────────────────────────

/** The company's own rows that finish an item another way. */
export async function checklistFactsFor(companyId: string, db: Db = prisma): Promise<ChecklistFacts & { kind: string }> {
  const c = await db.company.findUniqueOrThrow({
    where: { id: companyId },
    select: {
      kind: true, legalName: true, billingSameAsLegal: true, accountsEmail: true, teamsWebhookUrl: true,
      domain: true, domainVerified: true, setupSteps: true, weekSettingsSetAt: true, paySettingsSetAt: true,
    },
  })
  const [addresses, inCharge, papers, bank, counterparties, contracts, seats, domains] = await Promise.all([
    db.companyAddress.findMany({ where: { companyId }, select: { kind: true, street: true, city: true } }),
    db.companyInCharge.count({ where: { companyId, duty: { in: ['HR', 'BILLING_CONTACT'] } } }),
    db.documentRequirement.findMany({ where: { companyId, party: { not: null } }, select: { party: true }, distinct: ['party'] }),
    db.remitTo.count({ where: { companyId, bankName: { not: null }, accountLast4: { not: null } } }),
    db.counterparty.count({ where: { companyId } }),
    db.sellContract.count({ where: { OR: [{ companyId }, { clientCompanyId: companyId }] } }),
    db.context.count({ where: { companyId, type: 'EMPLOYEE', revokedAt: null } }),
    db.companyDomain.count({ where: { companyId, verifiedAt: { not: null } } }),
  ])
  const steps = readRecord(c.setupSteps)
  const filled = (kind: 'LEGAL' | 'BILLING') => addresses.some((a) => a.kind === kind && !!a.street && !!a.city)
  return {
    kind: c.kind,
    legalNameSet: !!c.legalName,
    legalAddress: filled('LEGAL'),
    billingAddress: c.billingSameAsLegal ? filled('LEGAL') : filled('BILLING'),
    sitesConfirmed: steps.SITES?.outcome === 'DONE',
    inChargeNamed: inCharge > 0 || !!c.accountsEmail,
    workAnswered: !!c.weekSettingsSetAt || !!c.paySettingsSetAt || steps.WORK?.outcome === 'DONE',
    papersConfirmed: papers.map((p) => p.party as string),
    papersOwed: PARTIES_OF[c.kind] ?? PARTIES_OF.VENDOR,
    bankEntered: bank > 0,
    counterparties: counterparties + contracts,
    teammates: Math.max(0, seats - 1),
    domainVerified: domains > 0 || (!!c.domain && c.domainVerified),
    teamsSet: !!c.teamsWebhookUrl,
  }
}

/**
 * Each item's recorded outcome. The first-sign-in steps that are also
 * checklist items (Sites, How you work, Your team) count where nothing
 * newer was recorded here, so an answer given at first sign-in is never
 * asked again.
 */
export async function checklistRecordFor(companyId: string, db: Db = prisma): Promise<ChecklistRecord> {
  const [rows, c] = await Promise.all([
    db.setupItem.findMany({ where: { companyId }, select: { item: true, outcome: true, answeredById: true, answeredAt: true } }),
    db.company.findUnique({ where: { id: companyId }, select: { setupSteps: true } }),
  ])
  const out: ChecklistRecord = {}
  const steps = readRecord(c?.setupSteps)
  const fromStep: [ItemKey, keyof typeof steps][] = [['SITES', 'SITES'], ['HOW_YOU_WORK', 'WORK'], ['TEAM', 'TEAM']]
  for (const [item, step] of fromStep) {
    const a = steps[step]
    if (a) out[item] = { outcome: a.outcome, byId: a.byId, at: a.at }
  }
  for (const r of rows) out[r.item as ItemKey] = { outcome: r.outcome as ItemOutcome, byId: r.answeredById, at: r.answeredAt.toISOString() }
  return out
}

/** Whether a company is asked the checklist at all: one somebody took possession of, or that began setup. */
export async function asksChecklist(companyId: string, db: Db = prisma): Promise<boolean> {
  const c = await db.company.findUnique({ where: { id: companyId }, select: { claimedAt: true, setupStartedAt: true, isCensusSandbox: true } })
  return !!c && !c.isCensusSandbox && (!!c.claimedAt || !!c.setupStartedAt)
}

export async function checklistOf(companyId: string, db: Db = prisma): Promise<{ checklist: Checklist; facts: ChecklistFacts; record: ChecklistRecord; kind: string }> {
  const [facts, record] = await Promise.all([checklistFactsFor(companyId, db), checklistRecordFor(companyId, db)])
  return { checklist: checklistFor({ kind: facts.kind, record, facts }), facts, record, kind: facts.kind }
}

export interface SetupReminder {
  /** "Finish setting up: addresses, papers you require, bank details." */
  says: string
  href: string
  /** The link's words: "Complete setup". */
  link: string
  owed: ItemKey[]
}

/**
 * The one line on Today and in the Ask Etyme greeting, or null.
 *
 * Only for a reader who may finish setup (the Owner or Admin, who hold
 * `settings.manage`), only at a company that is asked the checklist, and
 * only while something is owed. One line however many items are owed.
 */
export async function setupReminderFor(companyId: string, opts: { mayRun: boolean }, db: Db = prisma): Promise<SetupReminder | null> {
  if (!opts.mayRun) return null
  if (!(await asksChecklist(companyId, db))) return null
  const { checklist } = await checklistOf(companyId, db)
  const says = reminderSentence(checklist.owed)
  return says ? { says, href: CHECKLIST_HREF, link: COMPLETE_SETUP, owed: checklist.owed } : null
}

// ── Writing ──────────────────────────────────────────────────────────

/**
 * Record one item as done or skipped, with who and when. Answering again
 * replaces the earlier answer: a company that skipped its addresses and
 * came back to give them has done the item, and the record says so with
 * the later name and date. Refuses in a sentence and writes nothing.
 */
export async function recordItem(
  companyId: string,
  byId: string,
  item: unknown,
  outcome: unknown,
  db: Db = prisma,
): Promise<{ ok: true; item: ItemKey; outcome: ItemOutcome } | { ok: false; says: string }> {
  const c = await db.company.findUnique({ where: { id: companyId }, select: { kind: true } })
  if (!c) return { ok: false, says: 'There is no company here to set up.' }
  const v = checkItemAnswer(c.kind, item, outcome)
  if (!v.ok) return v
  const at = new Date()
  await db.setupItem.upsert({
    where: { companyId_item: { companyId, item: v.item } },
    create: { companyId, item: v.item, outcome: v.outcome, answeredById: byId, answeredAt: at },
    update: { outcome: v.outcome, answeredById: byId, answeredAt: at },
  })
  return v
}

export interface AnswerToRecord {
  field: string
  source: AnswerSource
  quote?: string | null
}

/** Where each answer came from, with who confirmed it and when. Replaces an earlier source for the same field. */
export async function recordAnswers(companyId: string, byId: string, answers: readonly AnswerToRecord[], db: Db = prisma): Promise<void> {
  const at = new Date()
  for (const a of answers) {
    const quote = a.quote ? String(a.quote).slice(0, 300) : null
    await db.setupAnswer.upsert({
      where: { companyId_field: { companyId, field: a.field } },
      create: { companyId, field: a.field, source: a.source, quote, answeredById: byId, answeredAt: at },
      update: { source: a.source, quote, answeredById: byId, answeredAt: at },
    })
  }
}

/** The items a company of this kind reads, re-exported for the route. */
export { itemsFor }
