/**
 * The letters that go when a document a line depends on runs out.
 *
 * "Ensure the loop of documents never cracks between parties."
 * — the founder, 2026-09-21.
 *
 * ── The crack this closes ────────────────────────────────────────────
 *
 * The table that says what a line requires landed on the 21st, and the
 * nightly watch learned to read it the same day: `documentsToChase` in
 * `lib/document-request` now returns every signed paper and every check
 * that is inside the window or past it, with the party that owes each
 * one. Nothing wrote to anybody. A loop that computes who owes what and
 * tells nobody is a spreadsheet.
 *
 * Two letters go for every lapse, and they are not the same letter:
 *
 *   the chase    to the party that owes it — the worker whose license
 *                runs out, the supplier whose certificate did. It names
 *                the document, the day, and the one place to put the
 *                renewal.
 *   the notice   to the party the lapse costs — the client whose site
 *                the person stands on, the prime that put them there.
 *                It names what it costs and who to ask, and it is not a
 *                chase, because that firm cannot renew somebody else's
 *                paper.
 *
 * ── Six rules this file exists to keep ───────────────────────────────
 *
 * 1. **The wall.** A client reading about a firm two rungs down reads
 *    standing without a name, unless its own agreement with the prime
 *    discloses sub-vendors. `lib/chain-names` decides that, here as
 *    everywhere else — this file never compares two company ids itself.
 * 2. **What blocks and what warns is the line's answer.** `stopsWork`
 *    comes off the effective requirement. A letter never promises a
 *    block the line did not ask for, and never softens one it did.
 * 3. **A nudge has a cost.** Each party hears once per milestone — sixty
 *    days, thirty, the day itself, and once more when it has gone. Four
 *    letters over two months, not sixty.
 *    And a person reads one letter a night, whatever the number of
 *    papers: every paper that concerns them is a line in it, grouped by
 *    firm, the one that stops work first (`oneLetterPerPerson`). The
 *    first real night wrote one compliance officer twenty-one letters.
 * 4. **Never invent a name.** `owedByName` is null for a line that
 *    resolves nobody, and the sentence is written without one: "the firm
 *    that owes it", "the person this line is about". A plausible wrong
 *    name in a compliance letter is worse than a blank.
 * 5. **A verdict is ordered, never uploaded.** A background check or a
 *    drug screen is a report the provider posts to the firm that ordered
 *    it. The worker is never asked for it; the firm is told to order a
 *    new one, and the worker is asked for consent when it does.
 * 6. **A person's paper is said about the person.** A right-to-work proof
 *    a supplier owes on a line stops the person, not every start through
 *    the firm; a firm's certificate stops the firm.
 *
 * ── What this file does not write ────────────────────────────────────
 *
 * An agreement running out. `cron/agreement-terms` has told both signers
 * at ninety, sixty, thirty and zero since `lib/agreement-term` learned
 * the client side, and an MSA is not a `DocInstance` in this system —
 * `lineExtras` answers a set that asks for one from `MasterAgreement`.
 * So a dated MSA lapse is demand's letter and is left alone here, and
 * the count of what was left alone is returned rather than swallowed.
 *
 * An MSA that was never papered at all is nobody's letter under that
 * rule, because there is no agreement row to warn about — and that is
 * the one Cavanaugh Glassworks has. It is told here.
 */

import { prisma } from '@/lib/db'
import { notify, notifyBulk, type NotifyParams } from '@/lib/notify'
import { day, type Audience } from '@/lib/notify/letters'
import { hasPermission, type Permission } from '@/lib/permissions'
import { mayNameSubVendors, nameForClient, type ChainRung, type SeenName } from '@/lib/chain-names'
import { documentsToChase, type DocumentWatch, type LapsingDocument } from '@/lib/document-request'
import { baseUrl } from '@/lib/signed-link'
import { ADVERSE_STEPS, contractClearance, lineExtras, newestReports } from '@/lib/contract-clearance'
import { adverseRecordFrom } from '@/lib/attestation'
import type { OwedBy } from '@/lib/document-requirements'
import { typeByKey } from '@/lib/document-type'

type Db = typeof prisma

// ── When somebody hears ───────────────────────────────────────────────

/**
 * The days out at which a party is told, tightest first.
 *
 * Sixty is the chase window `lib/document-request` already reads — there
 * is no point in a ninety-day milestone for a watch that does not look
 * ninety days ahead, and a milestone that can never fire is a line of
 * documentation pretending to be a behavior. Thirty is the second
 * warning. Zero is the day itself.
 */
export const LAPSE_MILESTONES: readonly number[] = [60, 30, 0]

/** It has already run out. Told once, and then not again. */
export const LAPSED_MILESTONE = -1

/**
 * It was required and never filed at all.
 *
 * Told once, because there is no second date to count down to: a
 * document nobody ever produced has no expiry to become unfixable on.
 * The refusal at the start is what stops the work; this is the letter
 * that goes before it.
 */
export const NEVER_FILED_MILESTONE = -2

/**
 * The tightest milestone this document is now inside, or null for none.
 *
 * Tightest rather than every one it has crossed: with forty-five days
 * left the sixty-day warning is stale and there is nothing new to say
 * until thirty. The same reasoning as the visa watch and the agreement
 * watch, and the same bug already fixed twice.
 */
export function milestoneFor(daysLeft: number | null, neverFiled = false): number | null {
  if (neverFiled) return NEVER_FILED_MILESTONE
  if (daysLeft == null) return null
  if (daysLeft < 0) return LAPSED_MILESTONE
  const crossed = LAPSE_MILESTONES.filter((m) => daysLeft <= m)
  if (crossed.length === 0) return null
  return Math.min(...crossed)
}

/**
 * The key that says this milestone has been announced to this side.
 *
 * The chased party's key is bare — `id:milestone` — which is the shape
 * `saidKeyFor` in `lib/agreement-term` writes for the party that owes an
 * agreement, so the two halves of the loop dedupe the same way and
 * nobody has to learn a second convention. A firm that is told because
 * the lapse costs it carries its own id in the key, because two clients
 * above one supplier are two different pieces of news.
 */
export function docSaidKeyFor(
  documentId: string,
  milestone: number,
  atCompanyId?: string | null,
  as: 'AT' | 'EMPLOYS' = 'AT'
): string {
  return atCompanyId ? `${documentId}:${milestone}:${as}:${atCompanyId}` : `${documentId}:${milestone}`
}

// ── What a letter is written from ─────────────────────────────────────

/**
 * One document that is running out, has run out, or was never filed.
 *
 * A superset of `LapsingDocument` with two fields it does not carry:
 * `neverFiled`, and dates that may be null because of it. Everything
 * else is read straight off the watch.
 */
export interface OwedDocument {
  /** The `DocInstance`, `Verification` or requirement row this is about. */
  id: string
  key: string | null
  /** What it is called, in the words the parties use. */
  document: string
  line: { side: 'SELL' | 'BUY'; id: string } | null
  owedBy: OwedBy | null
  /** The firm or the person that owes it. Null is a real answer. */
  owedByName: string | null
  personId: string | null
  companyId: string | null
  /** The firm holding the line — whoever placed the person. */
  tellCompanyId: string | null
  expiresAt: Date | null
  daysLeft: number | null
  lapsed: boolean
  neverFiled: boolean
  /** True where the line's own set says a lapse stops the work. */
  stopsWork: boolean
  /**
   * Who rendered it, for a verdict: "HireRight", "Sterling". Read off the
   * verification where there is one; never guessed where there is not.
   */
  provider?: string | null
  /**
   * A supplier's own cover or standing, read off the firm rather than a
   * line. The firm itself is told by the nightly watch's own finding, so
   * only the firms buying from it are told here.
   */
  cover?: boolean
  /**
   * The screening company's newest report on this check came back
   * flagged or not clear, and the firm that ordered it has not decided
   * yet. It is on file, so it is never told as missing; what is owed is
   * the firm's decision, and only the firm hears it, because a flagged
   * report is not another firm's to read before the steps after it.
   */
  flagged?: { provider: string | null; on: Date | null; status: 'FLAGGED' | 'FAILED' }
}

/** The watch's rows, in the shape the letters read. */
export function fromWatch(watch: DocumentWatch): OwedDocument[] {
  const rows: LapsingDocument[] = [...watch.lapsed, ...watch.lapsing]
  return rows.map((r) => ({
    id: r.id,
    key: r.key,
    document: r.document,
    line: r.line,
    owedBy: r.owedBy,
    owedByName: r.owedByName,
    personId: r.personId,
    companyId: r.companyId,
    tellCompanyId: r.tellCompanyId,
    expiresAt: r.expiresAt,
    daysLeft: r.daysLeft,
    lapsed: r.lapsed,
    neverFiled: false,
    stopsWork: r.stopsWork,
  }))
}

/**
 * Whether this one is demand's to tell rather than ours.
 *
 * An MSA with a date on it is a `MasterAgreement` in this system, and
 * `cron/agreement-terms` writes to both signers at every milestone. A
 * second letter about the same paper from a second job is the fastest
 * way to teach somebody to filter both.
 */
export function leftToDemand(d: OwedDocument): boolean {
  return d.key === 'MSA' && !d.neverFiled
}

// ── Who reads it ──────────────────────────────────────────────────────

/**
 * The desks that can do something about a document the firm owes.
 *
 * Named by what the seat may do, never by what the role is called: a
 * company may rename Compliance Officer, and an owner's role is stored
 * as the wildcard, which a string comparison on a role name misses at
 * every firm run by its founder.
 *
 *   `privacy.manage`  the compliance desk, at a client and a supplier
 *                     alike — the one seat answerable by name for what
 *                     is held about the people on a site
 *   `rates.write`     the contracting desk, which is who papers an
 *                     agreement or a certificate at a supplier
 *   `settings.manage` the one-person firm whose only seat is its founder
 */
export const CHASE_DESK: readonly Permission[] = ['privacy.manage', 'rates.write', 'settings.manage']

/**
 * The desks that hear because the lapse costs this firm.
 *
 * The program office and the compliance desk, and nobody else: an AP
 * clerk cannot renew a license and a hiring manager cannot ask a
 * sub-vendor for a certificate. The desk that acts is the desk that
 * hears.
 */
export const EXPOSED_DESK: readonly Permission[] = ['privacy.manage', 'governance.write']

/** Everybody a letter about one document goes to, already resolved. */
export interface Cast {
  /** The person the document is about, where it is about one. */
  personName: string | null
  /** The site the work happens at, where the chain names one. */
  clientName: string | null
  /** The party that owes it, by name, where the line resolves one. */
  owedByName: string | null
  /**
   * The firm the document hangs on, which is not always the party that
   * owes it.
   *
   * A worker owes their own license and the firm that employs them is
   * what a client up the chain reads on the row — "held by Ingrid
   * Sørensen through Byrne Critical Care". Writing the notice off
   * `owedByName` said "held by Ingrid Sørensen through Ingrid Sørensen",
   * and telling a client to ask the contractor for their own license is
   * telling the client to do the supplier's job.
   */
  aboutFirmName: string | null
  /** The party that owes it: who to write the chase to. */
  chase: { personId: string; companyId: string | null; audience: Audience }[]
  /** Each firm the lapse costs, with what it may call the firm that owes it. */
  exposed: {
    companyId: string
    people: string[]
    sees: SeenName
    /**
     * Who stands on this reader's site through the firm, for a firm's own
     * paper read off no line: the client reads its supplier's lapsed cover
     * as the names it puts at risk, which it already knows.
     */
    onSite?: string[]
  }[]
  /**
   * The firm that employs the worker, where a worker owes the document.
   *
   * Not an exposed buyer, and the bug that made this field exist: a
   * worker-owed document has no owing company, so the employing firm was
   * cast as somebody the lapse merely costs, handed the client's letter,
   * and then masked from itself by the chain wall — thirteen letters in
   * one night telling a staffing firm to ask itself for its own
   * consultant's license, and describing that consultant as somebody at
   * a firm below one of its own suppliers.
   *
   * It is neither the party that owes the paper nor a bystander: it is
   * the firm whose job it is to chase its own worker, and it reads a
   * letter of its own that says so.
   */
  employs: { companyId: string; people: string[] } | null
}

// ── The words ─────────────────────────────────────────────────────────

/** "runs out on October 3, 2026" · "ran out on September 30, 2026" */
function whenSays(d: OwedDocument): string {
  if (!d.expiresAt) return 'is not on file'
  const on = day(d.expiresAt)
  if (d.lapsed) return `ran out on ${on}`
  if (d.daysLeft === 0) return `runs out today, ${on}`
  return `runs out on ${on}`
}

/** "October 3, 2026", or null where there is no date to name. */
function theDay(d: OwedDocument): string | null {
  return d.expiresAt ? day(d.expiresAt) : null
}

function lower(s: string): string {
  // Only the first letter, and only where the rest is not already a
  // name: "I-9 and E-Verify" keeps its capitals inside a sentence, which
  // is its own rule elsewhere in the app and is right here too.
  if (!s) return s
  return /^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s
}

/**
 * "a nursing license" · "an I-9 and E-Verify" · "a W-9".
 *
 * An initialism takes the article its first letter is pronounced with,
 * not the one it is spelled with — "an I-9", "a W-9" — which is the
 * difference between a sentence somebody wrote and one a template did.
 */
const SOUNDS_LIKE_A_VOWEL = new Set(['A', 'E', 'F', 'H', 'I', 'L', 'M', 'N', 'O', 'R', 'S', 'X'])

export function article(label: string): string {
  const first = label.trim()[0]
  if (!first || !/[A-Za-z]/.test(first)) return 'a'
  const initialism = /^[A-Z][-0-9A-Z]/.test(label.trim())
  const vowel = initialism ? SOUNDS_LIKE_A_VOWEL.has(first.toUpperCase()) : 'aeiou'.includes(first.toLowerCase())
  return vowel ? 'an' : 'a'
}

/**
 * The worker's own paperwork page, as an address rather than the name
 * of a screen.
 *
 * Three of these letters ended by naming a Paperwork page for a week
 * before the page existed, and a chase that names a screen a reader
 * cannot find is a chase nobody can act on. It exists now, so the
 * letter carries the link.
 *
 * **"your own"**, deliberately. A one-person corporation's owner reads
 * her firm's menu as well as her own, and her firm already has a
 * Paperwork page under Governance — the certificates and agreements the
 * company owes. She is the person *and* the firm, so naming the page
 * without the word "own" would point a solo contractor at the wrong one
 * of her own two pages. Every worker reads the same sentence, because a
 * letter that reads differently depending on how somebody is
 * incorporated is a letter that has to know how, and this one does not.
 *
 * Where nothing says where this deployment lives the words stand alone
 * and no link is offered, which is the rule `choicesBlock` already
 * keeps: a message with a link that goes nowhere is worse than one with
 * no link at all.
 */
export const WORKER_PAPERWORK_PATH = '/dashboard/my-work/paperwork'

export function ownPaperworkPage(base: string = baseUrl()): string {
  const page = 'your own paperwork page'
  return base ? `${page}: ${base}${WORKER_PAPERWORK_PATH}` : page
}

/** "the person this line is about" — never an invented name. */
const NO_PERSON = 'the person this line is about'
/** "the firm that owes it" — never an invented name. */
const NO_FIRM = 'the firm that owes it'

/**
 * What a warn says, in the line's own words rather than in ours.
 *
 * Addendum E: BLOCK where legally grounded, WARN and capture a reason
 * everywhere else, never silently permit. A letter about a warn has to
 * say both halves — nothing stops, and it is still owed — or it reads
 * as either a threat or a formality, and both are wrong.
 */
const WARNS = 'It stops nothing on its own: a start proceeds with the reason on the record, and it is still owed.'

// ── Whose paper, and who renders it ───────────────────────────────────

/**
 * The parties that make a document a person's rather than a firm's.
 *
 * A right-to-work proof a supplier owes on a line is still Tobias
 * Lindqvist's proof: it stops Tobias, not every placement through the
 * firm. The first nightly run said "Nobody can start through that firm"
 * about it while the I-9 beside it said "Tobias Lindqvist cannot be on
 * site", so one client read two contradicting lines about one man. Who
 * owes the paper decides who is asked; whose paper it is decides what
 * the sentence is about.
 */
const A_PERSONS_PAPER = new Set(['CANDIDATE', 'EMPLOYEE', 'GOVERNMENT', 'PROVIDER'])

/** True where the document is about a person, whoever owes it on the line. */
export function isPersonsPaper(d: Pick<OwedDocument, 'key' | 'owedBy'>): boolean {
  if (d.owedBy === 'WORKER') return true
  const t = d.key ? typeByKey(d.key) : null
  return !!t?.suppliedBy && A_PERSONS_PAPER.has(t.suppliedBy)
}

/**
 * True where a third party renders the verdict: a background check, a
 * drug screen.
 *
 * "Who renders the verdict" (CLAUDE.md, 2026-09-22): the screening
 * company says clear or not clear and posts the report to the firm that
 * ordered it. The worker never holds it, so she is never asked to upload
 * it; the firm is told to order a new one, and the worker gives consent
 * when that firm asks. The dictionary says which kinds these are
 * (`suppliedBy: 'PROVIDER'`), so a client-defined screening inherits the
 * rule by declaring it, not by being named here.
 */
export function isVerdict(d: Pick<OwedDocument, 'key'>): boolean {
  const t = d.key ? typeByKey(d.key) : null
  return t?.suppliedBy === 'PROVIDER'
}

/** "Tobias Lindqvist's". The record stores no pronouns, so a name it is. */
function whose(name: string): string {
  return `${name}'s`
}

/** " from HireRight", where the record names the provider. */
function fromProvider(d: OwedDocument): string {
  return d.provider ? ` from ${d.provider}` : ''
}

/**
 * One letter's words, in the pieces a night's letter is built from.
 *
 *   title  what a letter about this one fact alone is called
 *   body   the letter about this one fact alone
 *   short  the fact in a few words, for the title of a night's letter
 *   line   the fact and what it costs, without the ask
 *   group  the firm this line sits under in a night's letter
 *   ask    the one thing to do, for this fact alone
 *   askMany the same thing to do, said once for several facts
 */
export interface Said {
  title: string
  body: string
  short: string
  line: string
  group: string
  ask: string
  askMany: string
}

function said(p: Omit<Said, 'body'> & { body?: string }): Said {
  return { ...p, body: p.body ?? `${p.line} ${p.ask}` }
}

/** The firm heading a line sits under, where nothing better is known. */
const NO_GROUP = 'This placement'

/**
 * The letter to the party that owes it.
 *
 * Null where there is nothing to say to them — a document owed by a
 * party this line cannot name is still told to the firms it costs, and
 * inventing a recipient for the chase would be worse than the gap. Null
 * too for a worker asked about a verdict somebody else renders: she
 * cannot upload a report she was never sent, and a letter she cannot act
 * on is one she learns to ignore. Her employer is told to order it, and
 * she is asked for her consent when it does.
 */
export function chaseLetter(d: OwedDocument, cast: Cast): Said | null {
  const doc = lower(d.document)
  const when = whenSays(d)
  const on = theDay(d)
  const site = cast.clientName

  if (d.owedBy === 'WORKER') {
    if (isVerdict(d)) return null
    const group = site ?? 'Your paperwork'
    const askMany = `Upload each one from ${ownPaperworkPage()}.`
    const title = d.neverFiled ? `${d.document} is not on file` : `Your ${doc} ${when}`

    if (d.neverFiled) {
      return said({
        title,
        short: `your ${doc} is not on file`,
        group,
        line:
          `${site ? `${site} requires` : 'This placement requires'} your ${doc} and there is none on file.` +
          (d.stopsWork ? ` Nobody can be on site without it.` : ` ${WARNS}`),
        ask: `Upload it from ${ownPaperworkPage()}.`,
        askMany,
      })
    }
    if (d.lapsed) {
      return said({
        title,
        short: `your ${doc} ran out on ${on}`,
        group,
        line:
          `Your ${doc} ran out on ${on}.` +
          (d.stopsWork ? ` You cannot be on site ${site ? `at ${site} ` : ''}until a current one is on file.` : ` ${WARNS}`),
        ask: `Upload the renewal from ${ownPaperworkPage()}.`,
        askMany,
      })
    }
    return said({
      title,
      short: `your ${doc} ${when}`,
      group,
      line:
        `Your ${doc} ${when}.` +
        (d.stopsWork ? ` ${site ?? 'Nobody'} cannot keep you on site past that day without a current one.` : ` ${WARNS}`),
      ask: `Upload the renewal from ${ownPaperworkPage()}.`,
      askMany,
    })
  }

  const named = cast.owedByName ?? 'this firm'
  const who = cast.personName
  const asker = site

  // A person's paper a firm owes on the line: said about the person.
  if (who && isPersonsPaper(d)) {
    const group = asker ?? named
    if (isVerdict(d) && d.flagged) {
      const by = d.flagged.provider ?? 'The screening company'
      const said_ = d.flagged.status === 'FLAGGED' ? 'flagged' : 'did not clear'
      const when_ = d.flagged.on ? ` on ${day(d.flagged.on)}` : ''
      return said({
        title: `${by} ${said_} ${whose(who)} ${doc}; the decision is yours`,
        short: `${whose(who)} ${doc} came back ${d.flagged.status === 'FLAGGED' ? 'flagged' : 'not clear'}`,
        group,
        line: `${by} ${said_} ${whose(who)} ${doc}${when_}, and nothing has been decided on it. ${WARNS}`,
        ask: `Before deciding, give ${who} the pre-adverse action notice with a copy of the report and wait; or record that you will not act on it, with the reason, on your Compliance page.`,
        askMany: `For each one, give the pre-adverse action notice with a copy of the report and wait, or record that you will not act on it, with the reason, on your Compliance page.`,
      })
    }
    if (isVerdict(d)) {
      // The firm orders it; the provider renders it; the person consents.
      const askOrder = `Order ${d.neverFiled ? 'one' : 'a new one'} from your screening provider; ${who} is asked for consent first. Record the result it sends back on your Compliance page.`
      if (d.neverFiled) {
        return said({
          title: `No ${doc} on file for ${who}`,
          short: `no ${doc} on file for ${who}`,
          group,
          line:
            `${asker ? `${asker} requires` : 'This placement requires'} ${article(d.document)} ${doc} on ${who}, and none is on file.` +
            (d.stopsWork ? ` ${who} cannot start until one is recorded.` : ` ${WARNS}`),
          ask: askOrder,
          askMany: `Order each one from your screening provider; each person is asked for consent first. Record each result on your Compliance page.`,
        })
      }
      const past = d.lapsed ? `is past its date (${on})` : when
      return said({
        title: `${whose(who)} ${doc}${fromProvider(d)} ${past}`,
        short: `${whose(who)} ${doc} ${past}`,
        group,
        line:
          `${whose(who)} ${doc}${fromProvider(d)} ${past}.` +
          (d.stopsWork
            ? d.lapsed
              ? ` ${who} cannot be on site until a new one is recorded.`
              : ` ${who} cannot be on site after that day without a new one.`
            : ` ${WARNS}`),
        ask: askOrder,
        askMany: `Order each new one from your screening provider; each person is asked for consent first. Record each result on your Compliance page.`,
      })
    }
    if (d.neverFiled) {
      return said({
        title: `${whose(who)} ${doc} is not on file`,
        short: `${whose(who)} ${doc} is not on file`,
        group,
        line:
          `${asker ? `${asker} requires` : 'This placement requires'} ${whose(who)} ${doc}, and there is none on file.` +
          (d.stopsWork ? ` ${who} cannot start until it is.` : ` ${WARNS}`),
        ask: `File it on your Compliance page.`,
        askMany: `File each one on your Compliance page.`,
      })
    }
    return said({
      title: `${whose(who)} ${doc} ${when}`,
      short: `${whose(who)} ${doc} ${when}`,
      group,
      line:
        `${whose(who)} ${doc} ${when}.` +
        (d.stopsWork
          ? d.lapsed
            ? ` ${who} cannot be on site until a current one is on file.`
            : ` ${who} cannot be on site after that day without a current one.`
          : ` ${WARNS}`),
      ask: `File the renewal on your Compliance page.`,
      askMany: `File each renewal on your Compliance page.`,
    })
  }

  // A firm owes it. Which firm decides what the second sentence says: a
  // supplier's lapse stops anybody starting through it, and a customer's
  // or our own stops this line and nothing else.
  const title = d.neverFiled ? `${d.document} is not on file` : `Your ${doc} ${when}`
  const group = asker ?? named

  if (d.neverFiled) {
    // Who is asking, and of whom. A customer's own paper is asked of
    // the customer, and writing "Cavanaugh Glassworks requires an NDA
    // from Cavanaugh Glassworks" is a sentence that tells the reader
    // nothing except that nobody read it.
    const asked =
      d.owedBy === 'CUSTOMER'
        ? `This placement requires ${article(d.document)} ${doc} from you, and there is none on file.`
        : d.owedBy === 'US'
          ? `This placement requires ${article(d.document)} ${doc}. It is ours to produce and there is none on file.`
          : `${asker ? `${asker} requires` : 'This placement requires'} ${article(d.document)} ${doc} ` +
            `from ${named}, and there is none on file.`
    return said({
      title,
      short: `${article(d.document)} ${doc} is not on file`,
      group,
      line:
        `${asked}` +
        (d.stopsWork
          ? d.owedBy === 'SUPPLIER'
            ? ` Nobody can start through ${named} until it is.`
            : ` Nobody can start on this placement until it is.`
          : ` ${WARNS}`),
      ask: `File it on your Compliance page.`,
      askMany: `File each one on your Compliance page.`,
    })
  }

  const consequence =
    d.owedBy === 'SUPPLIER'
      ? d.lapsed
        ? ` Nobody can start through ${named} until it is renewed and on file.`
        : ` Nobody can start through ${named} after that day until it is renewed and on file.`
      : d.lapsed
        ? ` This placement is running with a document that has run out.`
        : ` This placement runs past that day, so it needs a current one.`

  return said({
    title,
    short: `your ${doc} ${when}`,
    group,
    line: `Your ${doc} ${when}.` + (d.stopsWork ? consequence : ` ${WARNS}`),
    ask: `File the renewal on your Compliance page.`,
    askMany: `File each renewal on your Compliance page.`,
  })
}

/**
 * The letter to a firm the lapse costs, in that firm's own words.
 *
 * `sees` is what `lib/chain-names` says this reader may call the firm
 * that owes it: its own name where the client pays it or its agreement
 * discloses sub-vendors, and a sentence naming the prime where it does
 * not. Nothing in here decides that; it is handed in already decided.
 */
export function noticeLetter(d: OwedDocument, cast: Cast, sees: SeenName | null, onSite: string[] = []): Said {
  const doc = lower(d.document)
  const who = cast.personName
  const firm = sees ? (sees.masked ? sees.phrase : sees.name) : (cast.aboutFirmName ?? NO_FIRM)
  const on = theDay(d)

  // Whether the sentence is about a person or about a firm is whose
  // paper it is, not who owes it on the line and not whether a person
  // happens to be on the line. An agreement between two firms is not
  // "held by" the contractor standing under it; a right-to-work proof a
  // supplier owes is still the person's, and stops the person.
  const aboutAPerson = isPersonsPaper(d) && !!who
  const verdict = isVerdict(d)
  const subject = who ? 'one of your contractors' : 'one of your suppliers'
  const title = d.neverFiled
    ? `A document ${subject} depends on is not on file`
    : d.lapsed
      ? `A document ${subject} depends on ran out on ${on}`
      : `A document ${subject} depends on ${whenSays(d)}`

  // "through Byrne Critical Care" where the reader may name the firm,
  // "at the firm supplied through Computer Systems Inc" where it may
  // not — because chain-names' phrase already carries a "through" and
  // two of them in one clause reads as a mistake.
  const via = `${sees?.masked ? 'at' : 'through'} ${firm}`
  const held = aboutAPerson
    ? verdict
      ? `${whose(who!)} ${doc}${fromProvider(d)}, ${via}`
      : `${article(d.document)} ${doc}, held by ${who} ${via}`
    : `${article(d.document)} ${doc}, owed by ${firm}`

  const opening = d.neverFiled
    ? `A document ${subject} depends on is not on file: ${held}.`
    : `A document ${subject} depends on ${whenSays(d)}: ${held}.`

  const cost = d.stopsWork
    ? d.lapsed || d.neverFiled
      ? aboutAPerson
        ? `${who} cannot be on site until it is on file.`
        : `Nobody can start through that firm until it is on file.`
      : aboutAPerson
        ? `After that day ${who} cannot be on site.`
        : `After that day nobody can start through that firm.`
    : WARNS
  // The people a firm's lapse puts at risk on this reader's site, by name:
  // a client already knows who works there, and "one of your suppliers"
  // alone does not say whose start is about to stop.
  const theirs = onSite.length ? ` On your site through it: ${listed(onSite)}.` : ''

  // Who this reader can actually call: the firm it pays, where the one
  // that owes the document sits below a wall, and the firm itself where
  // it does not. Never the contractor — a client asking a person for
  // their own paperwork has gone round the supplier it buys from.
  const callee = sees?.through && sees.masked ? sees.through : (cast.aboutFirmName ?? null)
  const ask = verdict
    ? callee
      ? `Ask ${callee} to order ${d.neverFiled ? 'one' : 'a new one'}.`
      : `Ask the firm you buy this placement from to order ${d.neverFiled ? 'one' : 'a new one'}.`
    : callee
      ? `Ask ${callee} for it.`
      : `Ask the firm you buy this placement from for it.`
  const askMany = verdict
    ? callee
      ? `Ask ${callee} to order them.`
      : `Ask the firm you buy this placement from to order them.`
    : callee
      ? `Ask ${callee} for them.`
      : `Ask the firm you buy this placement from for them.`

  // The line in a night's letter drops the opening every notice shares:
  // read twenty times in one letter it is the part nobody reads.
  const fact = aboutAPerson
    ? verdict
      ? `${whose(who!)} ${doc}${fromProvider(d)} ${d.neverFiled ? 'is not on file' : d.lapsed ? `is past its date (${on})` : whenSays(d)}`
      : `${whose(who!)} ${doc} ${d.neverFiled ? 'is not on file' : whenSays(d)}`
    : `${article(d.document)} ${doc} owed by ${firm} ${d.neverFiled ? 'is not on file' : whenSays(d)}`

  return {
    title,
    body: `${opening} ${cost}${theirs} ${ask}`,
    short: fact,
    line: `${upperFirst(fact)}. ${cost}${theirs}`,
    group: callee ?? firm,
    ask,
    askMany,
  }
}

/** "Ana", "Ana and Ben", "Ana, Ben and 3 others". */
function listed(names: string[]): string {
  const shown = names.slice(0, 3)
  const more = names.length - shown.length
  if (more > 0) return `${shown.join(', ')} and ${more} ${more === 1 ? 'other' : 'others'}`
  if (shown.length <= 1) return shown.join('')
  return `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`
}

function upperFirst(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

/**
 * The letter to the firm that employs the worker who owes the document.
 *
 * Its own consultant, by name, in its own voice. Three things it must
 * do and one it must never: name who owes the paper, say what happens
 * if it does not arrive, and say that the chase is theirs — and never
 * tell a firm to ask itself, or describe its own employee as somebody
 * standing at a firm below one of its suppliers.
 *
 * Null where nothing on the line names the person, because a letter
 * telling a firm to chase "the person this line is about" is a letter
 * nobody can act on.
 */
export function employerLetter(d: OwedDocument, cast: Cast): Said | null {
  if (d.owedBy !== 'WORKER') return null
  const who = cast.personName
  if (!who) return null
  const doc = lower(d.document)
  const on = theDay(d)
  const site = cast.clientName
  const at = site ? ` at ${site}` : ''
  const group = site ?? 'Your people'

  const cost = d.stopsWork
    ? d.lapsed || d.neverFiled
      ? `${who} cannot be on site until it is on file.`
      : `After that day ${who} cannot be on site.`
    : WARNS

  const title = d.neverFiled
    ? `${whose(who)} ${doc} is not on file`
    : d.lapsed
      ? `${whose(who)} ${doc} ran out on ${on}`
      : `${whose(who)} ${doc} ${whenSays(d)}`

  const opening = d.neverFiled
    ? `${who} works for you${at}, and the ${doc} this placement requires is not on file.`
    : d.lapsed
      ? `${who} works for you${at}, and their ${doc} ran out on ${on}.`
      : `${who} works for you${at}, and their ${doc} ${whenSays(d)}.`

  const ask = d.neverFiled
    ? `Chasing it is yours: ask ${who} for it, then file it against this placement.`
    : `Chasing it is yours: ask ${who} for the renewal, then file it against this placement.`

  return {
    title,
    body: `${opening} ${cost} ${ask}`,
    short: title,
    line: `${title}. ${cost}`,
    group,
    ask,
    askMany: `Chasing them is yours: ask each person, then file each one against the placement.`,
  }
}

// ── One document, every letter it produces ────────────────────────────

/** One message, ready for `notify`, with why it was written on it. */
export interface LapseLetter {
  /** The chase, the notice, or the employer's own chase. Never the same words. */
  side: 'OWES' | 'EXPOSED' | 'EMPLOYS'
  personId: string
  /** Whose books this letter is written in. Null where there are none. */
  companyId: string | null
  audience: Audience
  /** Business users take Teams where the firm has a channel; delivery decides. */
  channel: 'EMAIL'
  type: 'SYSTEM'
  title: string
  body: string
  /** The pieces a night's letter is built from; see `Said`. */
  short: string
  line: string
  group: string
  ask: string
  askMany: string
  entityId: string
  saidKey: string
  /** What the automation log says, already masked for this reader. */
  logSummary: string
  logReason: string
  data: {
    documentId: string
    documentKey: string | null
    document: string
    milestone: number
    daysLeft: number | null
    lapsed: boolean
    neverFiled: boolean
    stopsWork: boolean
    owedBy: OwedBy | null
    /** The line the document hangs off, so one fact cannot be told twice. */
    lineId: string | null
    side: 'OWES' | 'EXPOSED' | 'EMPLOYS'
    saidKey: string
    /**
     * The keys of the letters this one stood in for.
     *
     * A letter suppressed as a duplicate was never written, so its key
     * was nowhere to be read back the next night — and the next run sent
     * it, having found only its sibling's key on file. One night's
     * silence became the following night's letter. The survivor carries
     * the keys it covered, `alreadySaid` reads them back, and a second
     * run the same night writes nothing.
     */
    alsoSaid?: string[]
  }
}

/** The desk a letter arrived at, said as a role rather than as a name. */
const DESK_WORDS: Record<'OWES' | 'EXPOSED' | 'EMPLOYS', string> = {
  OWES: 'the firm that owes it',
  EXPOSED: 'the program manager and compliance officer',
  EMPLOYS: 'the employer',
}

/**
 * Every letter one document produces, pure.
 *
 * No database, no clock beyond the days already counted on the row. The
 * resolution — who sits at which desk, which name a client may read — is
 * `tellDocumentLapses`'s, and it hands the answer in.
 */
export function lettersFor(d: OwedDocument, cast: Cast, alreadySaid: ReadonlySet<string> = new Set()): LapseLetter[] {
  const milestone = milestoneFor(d.daysLeft, d.neverFiled)
  if (milestone == null) return []

  const out: LapseLetter[] = []
  const base = {
    documentId: d.id,
    documentKey: d.key,
    document: d.document,
    milestone,
    daysLeft: d.daysLeft,
    lapsed: d.lapsed,
    neverFiled: d.neverFiled,
    stopsWork: d.stopsWork,
    owedBy: d.owedBy,
    lineId: d.line?.id ?? null,
  }
  // "runs out on October 3, 2026" · "ran out on September 30, 2026" ·
  // "is not on file". One phrase, so the letter, the log summary and
  // the log reason cannot end up saying three different things about
  // one date.
  const saysWhen = d.neverFiled
    ? 'is not on file'
    : d.expiresAt
      ? `${d.lapsed ? 'ran out on' : 'runs out on'} ${day(d.expiresAt)}`
      : 'is not on file'
  const reason =
    `A document this line requires ${saysWhen}. ` +
    `Every party the lapse costs is told once at each milestone — sixty days, thirty, the day itself, and once more when it has gone.`

  const chase = chaseLetter(d, cast)
  if (chase) {
    const key = docSaidKeyFor(d.id, milestone)
    if (!alreadySaid.has(key)) {
      for (const r of cast.chase) {
        out.push({
          side: 'OWES',
          personId: r.personId,
          companyId: r.companyId,
          audience: r.audience,
          channel: 'EMAIL',
          type: 'SYSTEM',
          title: chase.title,
          body: chase.body,
          short: chase.short,
          line: chase.line,
          group: chase.group,
          ask: chase.ask,
          askMany: chase.askMany,
          entityId: d.id,
          saidKey: key,
          logSummary:
            `Asked ${d.owedBy === 'WORKER' ? 'the worker it is about' : DESK_WORDS.OWES} ` +
            `for the ${lower(d.document)}, which ${saysWhen}.`,
          logReason: reason,
          data: { ...base, side: 'OWES', saidKey: key },
        })
      }
    }
  }

  // A flagged report is the ordering firm's alone until it has decided.
  const employs = d.flagged ? null : cast.employs
  const employer = employs ? employerLetter(d, cast) : null
  if (employs && employer) {
    const key = docSaidKeyFor(d.id, milestone, employs.companyId, 'EMPLOYS')
    if (!alreadySaid.has(key)) {
      for (const personId of employs.people) {
        out.push({
          side: 'EMPLOYS',
          personId,
          companyId: employs.companyId,
          audience: 'business',
          channel: 'EMAIL',
          type: 'SYSTEM',
          title: employer.title,
          body: employer.body,
          short: employer.short,
          line: employer.line,
          group: employer.group,
          ask: employer.ask,
          askMany: employer.askMany,
          entityId: d.id,
          saidKey: key,
          logSummary:
            `Told ${DESK_WORDS.EMPLOYS} to chase their own worker for the ${lower(d.document)}, which ${saysWhen}.`,
          logReason: reason,
          data: { ...base, side: 'EMPLOYS', saidKey: key },
        })
      }
    }
  }

  for (const e of d.flagged ? [] : cast.exposed) {
    const key = docSaidKeyFor(d.id, milestone, e.companyId)
    if (alreadySaid.has(key)) continue
    const letter = noticeLetter(d, cast, e.sees, e.onSite)
    // The log row is written in this reader's books, so it says what
    // this reader may read: a masked firm is masked here too, or the
    // audit trail leaks what the letter withheld.
    const firmWords = e.sees.masked ? e.sees.phrase : e.sees.name
    for (const personId of e.people) {
      out.push({
        side: 'EXPOSED',
        personId,
        companyId: e.companyId,
        audience: 'business',
        channel: 'EMAIL',
        type: 'SYSTEM',
        title: letter.title,
        body: letter.body,
        short: letter.short,
        line: letter.line,
        group: letter.group,
        ask: letter.ask,
        askMany: letter.askMany,
        entityId: d.id,
        saidKey: key,
        logSummary: `Told ${DESK_WORDS.EXPOSED} that the ${lower(d.document)} owed by ${firmWords} ${saysWhen}.`,
        logReason: reason,
        data: { ...base, side: 'EXPOSED', saidKey: key },
      })
    }
  }

  return out
}

// ── Resolving the cast ────────────────────────────────────────────────

const SEAT_SELECT = {
  personId: true,
  companyId: true,
  role: { select: { permissions: true } },
} as const

/** Whoever at these firms holds one of these permissions. */
async function desksAt(
  db: Db,
  companyIds: string[],
  permissions: readonly Permission[]
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>()
  const ids = [...new Set(companyIds.filter(Boolean))]
  if (ids.length === 0) return out
  const seats = await db.context.findMany({
    where: { companyId: { in: ids }, revokedAt: null },
    select: SEAT_SELECT,
  })
  // Named first, everything-holders only where nobody is named. An
  // owner's role is the wildcard, so it "holds" every desk at every firm;
  // at a client with a compliance officer and a program manager the
  // owner was a third reader of every paper, and the first night wrote
  // the same twenty-one papers to all three. The desk that acts is the
  // desk that hears; the owner hears where the owner is the desk, which
  // at a one-person firm is always.
  const named = new Map<string, string[]>()
  const everything = new Map<string, string[]>()
  for (const s of seats) {
    // A context with no company is a consultant's own seat, which is
    // nobody's desk. It cannot be asked for a firm's paperwork.
    if (!s.companyId) continue
    const held = (s.role?.permissions ?? []) as string[]
    if (!permissions.some((p) => hasPermission(held, p))) continue
    const into = permissions.some((p) => held.includes(p)) ? named : everything
    const at = into.get(s.companyId) ?? []
    if (!at.includes(s.personId)) at.push(s.personId)
    into.set(s.companyId, at)
  }
  for (const id of ids) {
    const people = named.get(id) ?? everything.get(id)
    if (people && people.length > 0) out.set(id, people)
  }
  return out
}

interface LineFacts {
  personId: string | null
  supplierCompanyId: string | null
  customerCompanyId: string | null
  holderCompanyId: string | null
}

/** The two firms and the person on the line a document hangs off. */
async function factsOfLine(db: Db, line: { side: 'SELL' | 'BUY'; id: string } | null): Promise<LineFacts> {
  if (!line) return { personId: null, supplierCompanyId: null, customerCompanyId: null, holderCompanyId: null }

  if (line.side === 'SELL') {
    const row = await db.sellContract.findUnique({
      where: { id: line.id },
      select: { personId: true, companyId: true, clientCompanyId: true },
    })
    return {
      personId: row?.personId ?? null,
      // On a sell line the firm holding it is the supplier — it is the
      // one being paid — and the client is the customer.
      supplierCompanyId: row?.companyId ?? null,
      customerCompanyId: row?.clientCompanyId ?? null,
      holderCompanyId: row?.companyId ?? null,
    }
  }

  const row = await db.buyContract.findUnique({
    where: { id: line.id },
    select: {
      companyId: true,
      vendorCompanyId: true,
      candidates: { select: { personId: true }, take: 1 },
      sellLinks: {
        select: { sellContract: { select: { personId: true, clientCompanyId: true } } },
        take: 1,
      },
    },
  })
  const sell = row?.sellLinks[0]?.sellContract ?? null
  return {
    personId: row?.candidates[0]?.personId ?? sell?.personId ?? null,
    // On a buy line the supplier is the firm below, where there is one.
    // Where there is none we employ the person, and the firm being paid
    // for the work is us.
    supplierCompanyId: row?.vendorCompanyId ?? row?.companyId ?? null,
    customerCompanyId: sell?.clientCompanyId ?? null,
    holderCompanyId: row?.companyId ?? null,
  }
}

interface Rung extends ChainRung {
  state: string
}

/** Every rung of every chain this person is standing on today. */
async function rungsFor(db: Db, personId: string | null): Promise<Rung[]> {
  if (!personId) return []
  const rows = await db.sellContract.findMany({
    where: { personId, state: { in: ['IN_PROGRESS', 'PAUSED'] } },
    select: {
      id: true,
      personId: true,
      companyId: true,
      company: { select: { name: true } },
      clientCompanyId: true,
      state: true,
    },
  })
  return rows
    .filter((r) => !!r.clientCompanyId)
    .map((r) => ({
      id: r.id,
      personId: r.personId!,
      companyId: r.companyId,
      companyName: r.company.name,
      clientCompanyId: r.clientCompanyId!,
      state: r.state,
    }))
}

/**
 * What one firm may call the firm that owes the document.
 *
 * Through `lib/chain-names`, always — the file that decides whether a
 * rate may be read decides whether a name may be, and a surface that
 * closed one and left the other open has closed nothing.
 */
function seenBy(
  rungs: Rung[],
  owingCompanyId: string | null,
  owingCompanyName: string | null,
  readerCompanyId: string,
  terms: { clientId: string; vendorId: string; disclosesSubVendors: boolean; status: string }[]
): SeenName {
  const own: SeenName = {
    companyId: owingCompanyId ?? '',
    name: owingCompanyName ?? NO_FIRM,
    masked: false,
    through: null,
    phrase: owingCompanyName ?? NO_FIRM,
    says: owingCompanyName ?? NO_FIRM,
  }
  if (!owingCompanyId) return own
  const rung = rungs.find((r) => r.companyId === owingCompanyId)
  // No rung for this firm means the reader is not reading it through a
  // chain at all — a supplier's own customer, or a firm with nobody
  // standing anywhere today. Its own name, which was never anybody's to
  // withhold.
  if (!rung) return own
  const seen = nameForClient(rung, rungs, readerCompanyId, (primeCompanyId: string) =>
    mayNameSubVendors(terms, readerCompanyId, primeCompanyId)
  )
  // chain-names answers with the rung's own company name; where the
  // document names a party the line resolved differently, the unmasked
  // answer keeps the name the requirement gave it.
  return seen.masked ? seen : { ...seen, name: own.name, phrase: own.phrase, says: own.says }
}

/**
 * The cast for one document: who to chase, who to tell, and what each
 * of them may read.
 */
async function castFor(db: Db, d: OwedDocument): Promise<Cast> {
  if (d.cover) return castForCover(db, d)
  const line = await factsOfLine(db, d.line)
  const personId = d.personId ?? line.personId
  const rungs = await rungsFor(db, personId)

  const owingCompanyId =
    d.owedBy === 'SUPPLIER'
      ? (d.companyId ?? line.supplierCompanyId)
      : d.owedBy === 'CUSTOMER'
        ? line.customerCompanyId
        : d.owedBy === 'US'
          ? (line.holderCompanyId ?? d.tellCompanyId)
          : null

  // Which firms the lapse costs: whoever buys this person's work above
  // the firm that owes the document, and the firm holding the line where
  // that is not the firm being chased.
  // The firm the document hangs on: the one that owes it where a firm
  // does, and the firm that employs the person where the worker does.
  // A client up the chain reads its name — or the sentence that stands
  // in for it — and asks that firm, never the contractor.
  const sellers = new Set(rungs.map((r) => r.companyId))
  const buyersOfRungs = new Set(rungs.map((r) => r.clientCompanyId))
  const bottom = rungs.find((r) => !buyersOfRungs.has(r.companyId)) ?? null
  const aboutCompanyId =
    owingCompanyId ?? bottom?.companyId ?? line.supplierCompanyId ?? d.tellCompanyId ?? null

  const buyers = new Set<string>()
  for (const r of rungs) {
    // A person's paper costs every firm above the person, whoever owes it
    // on the line: a background check the sub-vendor orders is still the
    // client's exposure on its own site. A firm's paper costs the firms
    // that buy from that firm.
    if (r.companyId === aboutCompanyId || isPersonsPaper(d)) buyers.add(r.clientCompanyId)
  }
  if (rungs.length === 0 && line.customerCompanyId) buyers.add(line.customerCompanyId)
  if (line.holderCompanyId && line.holderCompanyId !== owingCompanyId) buyers.add(line.holderCompanyId)
  if (d.tellCompanyId && d.tellCompanyId !== owingCompanyId) buyers.add(d.tellCompanyId)
  // Nobody is told twice about their own paper: the firm being chased
  // reads the chase, not a notice about itself.
  if (owingCompanyId) buyers.delete(owingCompanyId)

  // The firm that employs the worker is not a firm the lapse merely
  // costs. A worker-owed document names no owing company, so this firm
  // fell through to the exposed list, read the client's letter about
  // "one of your contractors", and was then masked from itself by the
  // chain wall — ending in "Ask <its own name> for it". It gets its own
  // letter instead, and is removed from here before anybody is told.
  const employsCompanyId = d.owedBy === 'WORKER' ? aboutCompanyId : null
  if (employsCompanyId) buyers.delete(employsCompanyId)

  const exposedIds = [...buyers]

  const [names, chaseDesks, exposedDesks, terms, person] = await Promise.all([
    db.company.findMany({
      where: { id: { in: [...exposedIds, owingCompanyId, aboutCompanyId].filter((v): v is string => !!v) } },
      select: { id: true, name: true },
    }),
    desksAt(db, [owingCompanyId, employsCompanyId].filter((v): v is string => !!v), CHASE_DESK),
    desksAt(db, exposedIds, EXPOSED_DESK),
    exposedIds.length
      ? db.masterAgreement.findMany({
          where: { clientId: { in: exposedIds } },
          select: { clientId: true, vendorId: true, disclosesSubVendors: true, status: true },
        })
      : Promise.resolve([]),
    personId ? db.person.findUnique({ where: { id: personId }, select: { name: true } }) : Promise.resolve(null),
  ])

  const nameOf = new Map(names.map((n) => [n.id, n.name]))
  const owedByName = d.owedByName ?? (owingCompanyId ? (nameOf.get(owingCompanyId) ?? null) : null)

  const aboutFirmName = aboutCompanyId
    ? (nameOf.get(aboutCompanyId) ?? (await companyName(db, aboutCompanyId)))
    : (bottom?.companyName ?? null)

  // The site the work is at: the top of the chain, which is the buyer
  // nobody else buys from. Null where the chain does not say, and the
  // sentence is written without it rather than around a guess.
  const top = rungs.find((r) => !sellers.has(r.clientCompanyId))
  const clientName = top
    ? (nameOf.get(top.clientCompanyId) ?? (await companyName(db, top.clientCompanyId)))
    : line.customerCompanyId
      ? (nameOf.get(line.customerCompanyId) ?? (await companyName(db, line.customerCompanyId)))
      : null

  const chase: Cast['chase'] = []
  if (d.owedBy === 'WORKER') {
    if (personId) chase.push({ personId, companyId: d.tellCompanyId ?? line.holderCompanyId, audience: 'candidate' })
  } else if (owingCompanyId) {
    for (const p of chaseDesks.get(owingCompanyId) ?? []) {
      chase.push({ personId: p, companyId: owingCompanyId, audience: 'business' })
    }
  }

  const exposed: Cast['exposed'] = []
  for (const companyId of exposedIds) {
    const people = exposedDesks.get(companyId) ?? []
    if (people.length === 0) continue
    exposed.push({
      companyId,
      people,
      sees: seenBy(rungs, aboutCompanyId, aboutFirmName, companyId, terms),
    })
  }

  // The desk that chases a person for their paper is the desk that
  // chases a firm for its own — the same permissions, because it is the
  // same job seen from the employer's side.
  const employsPeople = employsCompanyId ? (chaseDesks.get(employsCompanyId) ?? []) : []

  return {
    personName: person?.name ?? null,
    clientName,
    owedByName,
    aboutFirmName,
    chase,
    exposed,
    employs: employsCompanyId && employsPeople.length > 0 ? { companyId: employsCompanyId, people: employsPeople } : null,
  }
}

/**
 * The cast for a supplier's own cover: every firm buying from it, up
 * each chain a person of theirs stands on, through the name wall.
 *
 * Pinnacle's liability cover lapsed and Pinnacle's owner was told; the
 * client whose site its people stood on was told nothing, because the
 * nightly finding goes to the firm it is about and nobody at the client
 * holds the supplier's chase. The client's exposure is the standing of
 * whoever employs the person on its site, and no NDA changes that. So
 * every firm above the supplier on a live chain hears, in the name it
 * may read: the prime that pays the supplier by name, the client above
 * the prime as "the firm supplied through" the prime unless its
 * agreement discloses sub-vendors.
 */
async function castForCover(db: Db, d: OwedDocument): Promise<Cast> {
  const supplierId = d.companyId
  const none: Cast = {
    personName: null, clientName: null, owedByName: d.owedByName, aboutFirmName: d.owedByName,
    chase: [], exposed: [], employs: null,
  }
  if (!supplierId) return none

  const lines = await db.sellContract.findMany({
    where: { companyId: supplierId, state: { in: ['IN_PROGRESS', 'PAUSED'] } },
    select: { personId: true, person: { select: { name: true } } },
    orderBy: { id: 'asc' },
  })
  const nameOfPerson = new Map(lines.map((l) => [l.personId, l.person?.name ?? null]))

  // Reader → the people on its site through this supplier, and one chain
  // to read the supplier's name through.
  const readers = new Map<string, { names: string[]; rungs: Rung[] }>()
  for (const personId of nameOfPerson.keys()) {
    const rungs = await rungsFor(db, personId)
    const seen = new Set<string>([supplierId])
    let at = supplierId
    for (;;) {
      const up = rungs.find((r) => r.companyId === at)
      if (!up || seen.has(up.clientCompanyId)) break
      seen.add(up.clientCompanyId)
      const entry = readers.get(up.clientCompanyId) ?? { names: [], rungs }
      const name = nameOfPerson.get(personId)
      if (name && !entry.names.includes(name)) entry.names.push(name)
      readers.set(up.clientCompanyId, entry)
      at = up.clientCompanyId
    }
  }
  const readerIds = [...readers.keys()]
  if (readerIds.length === 0) return none

  const [desks, terms] = await Promise.all([
    desksAt(db, readerIds, EXPOSED_DESK),
    db.masterAgreement.findMany({
      where: { clientId: { in: readerIds } },
      select: { clientId: true, vendorId: true, disclosesSubVendors: true, status: true },
    }),
  ])
  const supplierName = d.owedByName ?? (await companyName(db, supplierId))

  const exposed: Cast['exposed'] = []
  for (const [companyId, r] of readers) {
    const people = desks.get(companyId) ?? []
    if (people.length === 0) continue
    exposed.push({
      companyId,
      people,
      sees: seenBy(r.rungs, supplierId, supplierName, companyId, terms),
      onSite: r.names,
    })
  }
  return { ...none, owedByName: supplierName, aboutFirmName: supplierName, exposed }
}

/** The supplier papers whose lapse stops work, read off the dictionary. */
const COVER_TYPES = ['INSURANCE_GL', 'INSURANCE_WC', 'INSURANCE_EO', 'INSURANCE_CYBER', 'GOOD_STANDING'].filter(
  (k) => typeByKey(k)?.blocks
)

/**
 * A supplier's cover or standing running out under somebody on a site.
 *
 * Only the latest row of each kind per firm counts, so a renewal on file
 * silences the old certificate rather than being told as a lapse; only a
 * firm with somebody on a live line is read, because a firm with nobody
 * anywhere costs no client anything tonight.
 */
export async function supplierCoverLapses(
  now: Date = new Date(),
  opts: { db?: Db; windowDays?: number } = {}
): Promise<OwedDocument[]> {
  const db = opts.db ?? prisma
  const horizon = new Date(now.getTime() + (opts.windowDays ?? LAPSE_MILESTONES[0]) * 86_400_000)
  const rows = await db.verification.findMany({
    where: {
      companyId: { not: null },
      type: { in: COVER_TYPES as never[] },
      status: { in: ['CLEAR', 'CONDITIONAL'] },
      expiresAt: { not: null },
      company: { sellContractsOut: { some: { state: { in: ['IN_PROGRESS', 'PAUSED'] } } } },
    },
    select: { id: true, type: true, companyId: true, expiresAt: true, company: { select: { name: true } } },
    orderBy: [{ expiresAt: 'desc' }, { id: 'asc' }],
  })

  const latest = new Map<string, (typeof rows)[number]>()
  for (const r of rows) {
    const k = `${r.companyId}:${r.type}`
    if (!latest.has(k)) latest.set(k, r)
  }

  const out: OwedDocument[] = []
  for (const r of latest.values()) {
    if (!r.expiresAt || r.expiresAt > horizon) continue
    const daysLeft = Math.ceil((r.expiresAt.getTime() - now.getTime()) / 86_400_000)
    const t = typeByKey(r.type)
    out.push({
      id: r.id,
      key: r.type,
      document: t?.label ?? lower(r.type.replace(/_/g, ' ')),
      line: null,
      owedBy: 'SUPPLIER',
      owedByName: r.company?.name ?? null,
      personId: null,
      companyId: r.companyId,
      tellCompanyId: null,
      expiresAt: r.expiresAt,
      daysLeft,
      lapsed: daysLeft < 0,
      neverFiled: false,
      stopsWork: !!t?.blocks,
      cover: true,
    })
  }
  return out
}

async function companyName(db: Db, id: string): Promise<string | null> {
  const c = await db.company.findUnique({ where: { id }, select: { name: true } })
  return c?.name ?? null
}

// ── The one door the nightly job calls ────────────────────────────────

export interface LapseTelling {
  letters: LapseLetter[]
  /** Documents left to `cron/agreement-terms`, counted rather than dropped quietly. */
  leftToDemand: number
  /**
   * Documents nobody could be written about, and why.
   *
   * A worker with no person on the row, a firm with no seat that may
   * act. Reported rather than swallowed: a chase that could not be sent
   * is the state this whole file exists to make visible.
   */
  unaddressed: { document: string; because: string }[]
}

/**
 * Every letter tonight's watch produces, with nothing sent.
 *
 * Returning the letters rather than sending them is what makes the
 * words testable on a fixed day, and it is the same split
 * `lib/document-request` made between the dates and the letter.
 */
export async function tellDocumentLapses(
  watch: DocumentWatch,
  now: Date = new Date(),
  db: Db = prisma
): Promise<LapseTelling> {
  return tellAbout(fromWatch(watch), now, db)
}

/** The same, for documents that were required and never filed at all. */
export async function tellAbout(
  documents: OwedDocument[],
  now: Date = new Date(),
  db: Db = prisma
): Promise<LapseTelling> {
  void now
  const out: LapseTelling = { letters: [], leftToDemand: 0, unaddressed: [] }
  const mine = documents.filter((d) => {
    if (leftToDemand(d)) {
      out.leftToDemand++
      return false
    }
    return true
  })
  if (mine.length === 0) return out

  const said = await alreadySaid(db, mine.map((d) => d.id))

  // Who rendered each verdict, off the verification it was recorded on,
  // so the letter can say "from HireRight" and never invents a provider.
  const verdictIds = mine.filter((d) => isVerdict(d) && !d.neverFiled && d.provider === undefined).map((d) => d.id)
  if (verdictIds.length > 0) {
    const rows = await db.verification.findMany({
      where: { id: { in: verdictIds } },
      select: { id: true, provider: true },
    })
    const by = new Map(rows.map((r) => [r.id, r.provider]))
    for (const d of mine) if (by.has(d.id)) d.provider = by.get(d.id) ?? null
  }

  for (const d of mine) {
    const cast = await castFor(db, d)
    const letters = lettersFor(d, cast, said)
    // Nobody to chase is a gap, except a supplier's own cover, which the
    // nightly finding tells the supplier itself.
    if (cast.chase.length === 0 && !d.cover) {
      out.unaddressed.push({
        document: d.document,
        because:
          d.owedBy === 'WORKER'
            ? 'Nothing on this line names the person who owes it, so there is nobody to ask.'
            : 'No seat at the firm that owes it may act on paperwork, so there is nobody to ask.',
      })
    }
    for (const l of letters) {
      out.letters.push(l)
      said.add(l.saidKey)
    }
  }
  out.letters = oneLetterPerPartyPerFact(out.letters)
  return out
}

/**
 * One letter per party per fact, in one night's run.
 *
 * A nudge has a cost, and the run was paying it twice. One night wrote
 * 194 letters of which 164 were distinct: three compliance officers at
 * one client each read the identical NDA sentence twice, and one
 * recruiter read two different sentences about a single missing NDA —
 * one from the expiry half of the watch and one from the never-filed
 * half, for the same document on the same line.
 *
 * Two passes, because the two faults are different:
 *
 *   the same words twice   a reader cannot tell two facts apart when
 *                          the sentence is character-for-character the
 *                          same, so it is one letter however many rows
 *                          produced it.
 *   one fact, two letters  the same reader, the same side, the same
 *                          document on the same line. The first stands:
 *                          callers put the dated lapse before the
 *                          never-filed one, and a date is the more
 *                          actionable of the two.
 */
export function oneLetterPerPartyPerFact(letters: LapseLetter[]): LapseLetter[] {
  const words = new Map<string, LapseLetter>()
  const facts = new Map<string, LapseLetter>()
  const out: LapseLetter[] = []
  const stoodInFor = (survivor: LapseLetter, dropped: LapseLetter) => {
    if (dropped.saidKey === survivor.saidKey) return
    const also = survivor.data.alsoSaid ?? []
    if (!also.includes(dropped.saidKey)) also.push(dropped.saidKey)
    survivor.data.alsoSaid = also
  }
  for (const l of letters) {
    const to = `${l.personId}|${l.companyId ?? ''}|${l.side}`
    const sameWords = `${to}|${l.title}|${l.body}`
    const sameFact = `${to}|${l.data.documentKey ?? l.data.document}|${l.data.lineId ?? l.entityId}`
    const said = words.get(sameWords) ?? facts.get(sameFact)
    if (said) {
      stoodInFor(said, l)
      continue
    }
    words.set(sameWords, l)
    facts.set(sameFact, l)
    out.push(l)
  }
  return out
}

// ── One letter per person per night ───────────────────────────────────

/**
 * A night's letter to one person: every paper that concerns them, as
 * lines, grouped by firm, the one that stops work first.
 *
 * The first real night on the seeded world sent 266 emails, and the
 * compliance officer, the program manager and the shared seat at one
 * client read twenty-one each, one per paper. A person who gets
 * twenty-one letters from one sender in one night builds a mail rule,
 * and the twenty-second, the one that stops a start, goes to the folder
 * with the rest. So a night writes each person once. Every fact is still
 * logged on its own, in its own firm's books, and remembered on its own
 * key, so tomorrow says only what is new.
 */
export interface NightLetter {
  personId: string
  /** Whose books the letter sits in: the firm of the line that stops work first. */
  companyId: string | null
  audience: Audience
  channel: 'EMAIL'
  type: 'SYSTEM'
  title: string
  body: string
  /** The document the first line is about, for linking. */
  entityId: string
  /** Every fact inside it, worst first. */
  facts: LapseLetter[]
}

/** Worst first: what stops work and has already gone, then what stops work, then the rest. */
function rankOf(l: LapseLetter): number {
  const gone = l.data.lapsed || l.data.neverFiled
  if (l.data.stopsWork && gone) return 0
  if (l.data.stopsWork) return 1
  if (gone) return 2
  return 3
}

function worstFirst(a: LapseLetter, b: LapseLetter): number {
  const r = rankOf(a) - rankOf(b)
  if (r !== 0) return r
  return (a.data.daysLeft ?? -1) - (b.data.daysLeft ?? -1)
}

function papers(n: number): string {
  return n === 1 ? 'one more paper' : `${n} more papers`
}

/**
 * Fold one night's letters into one per person, pure.
 *
 * A person with one fact reads exactly the letter that fact would have
 * been on its own. A person with several reads one letter: the worst
 * fact as its title, then a heading per firm, a line per paper, and the
 * one thing to do about that firm said once.
 */
export function oneLetterPerPerson(letters: LapseLetter[]): NightLetter[] {
  const byPerson = new Map<string, LapseLetter[]>()
  for (const l of letters) byPerson.set(l.personId, [...(byPerson.get(l.personId) ?? []), l])

  const out: NightLetter[] = []
  for (const [personId, theirs] of byPerson) {
    const facts = [...theirs].sort(worstFirst)
    const worst = facts[0]
    const audience: Audience = facts.every((f) => f.audience === 'candidate') ? 'candidate' : 'business'

    if (facts.length === 1) {
      out.push({
        personId, companyId: worst.companyId, audience, channel: 'EMAIL', type: 'SYSTEM',
        title: worst.title, body: worst.body, entityId: worst.entityId, facts,
      })
      continue
    }

    // Groups in the order their worst line comes, lines unique within one.
    const groups = new Map<string, LapseLetter[]>()
    for (const f of facts) groups.set(f.group, [...(groups.get(f.group) ?? []), f])

    const sections: string[] = []
    for (const [group, inGroup] of groups) {
      const lines = [...new Set(inGroup.map((f) => f.line))]
      const asks = lines.length === 1 ? [inGroup[0].ask] : [...new Set(inGroup.map((f) => f.askMany))]
      sections.push([group, ...lines.map((l) => `- ${l}`), ...asks].join('\n'))
    }

    out.push({
      personId,
      companyId: worst.companyId,
      audience,
      channel: 'EMAIL',
      type: 'SYSTEM',
      title: `${upperFirst(worst.short)}, and ${papers(facts.length - 1)}`,
      body: sections.join('\n\n'),
      entityId: worst.entityId,
      facts,
    })
  }
  return out
}

// ── What was required and never filed ─────────────────────────────────

/**
 * Documents a line requires and nobody ever produced.
 *
 * Not a lapse — there is no date to count down to — and the crack the
 * seeded world was built to show: Cavanaugh Glassworks sent Wrenfield
 * Technical a purchase order, the order requires a master service
 * agreement, and nobody ever papered one. Nothing told either firm,
 * because a watch that reads expiry dates cannot see a document that
 * does not exist.
 *
 * The verdict is not computed here. `lineExtras` and `contractClearance`
 * are `etyme-regulatory`'s door and they already answer "what does this
 * line require and what is in hand"; this reads their answer and writes
 * the letters. Insurance and good standing are deliberately not in it —
 * the checklist hands those to the cover gate, and `cron/watch` already
 * chases them through `lib/cover-gap`, so a letter from here would be
 * the second one about the same certificate.
 */
export async function documentsNeverFiled(
  now: Date = new Date(),
  opts: { db?: Db; limit?: number; sellContractIds?: string[] } = {}
): Promise<OwedDocument[]> {
  const db = opts.db ?? prisma
  const lines = await db.sellContract.findMany({
    where: opts.sellContractIds
      ? { id: { in: opts.sellContractIds } }
      : { state: { in: ['IN_PROGRESS', 'PAUSED'] } },
    select: {
      id: true,
      personId: true,
      companyId: true,
      endDate: true,
      person: { select: { name: true } },
      company: { select: { name: true } },
      clientCompany: { select: { name: true } },
      requirement: { select: { title: true } },
    },
    take: opts.limit ?? 200,
    orderBy: { id: 'asc' },
  })

  const out: OwedDocument[] = []
  for (const line of lines) {
    const extras = await lineExtras({ sellContractId: line.id }, db as never, now)
    if (!extras.requirements || extras.requirements.length === 0) continue

    const personVerifications = line.personId
      ? await db.verification.findMany({
          where: { personId: line.personId },
          select: {
            type: true, status: true, issuedAt: true, validFrom: true,
            expiresAt: true, verifiedAt: true, provider: true, result: true,
            // The firm's steps after a flagged report, so one it decided
            // not to act on is not chased as undecided.
            ...ADVERSE_STEPS,
          },
        })
      : []
    const newest = newestReports(personVerifications as never)

    const verdict = contractClearance({
      personName: line.person?.name ?? NO_PERSON,
      personVerifications: personVerifications as never,
      supplierName: line.company.name,
      supplierCertificates: [],
      clientName: line.clientCompany?.name ?? null,
      on: now,
      through: line.endDate,
      role: line.requirement?.title ?? null,
      ...extras,
    })

    for (const item of verdict.items) {
      if (!item.required || item.waived || item.state !== 'NEEDED') continue
      // A report that came back flagged or not clear is on file, so it is
      // never told as missing. Decided (acted on, or not with a reason):
      // nothing to say. Undecided: the decision is owed, to the firm.
      const report = newest.get(item.key)
      let flagged: OwedDocument['flagged']
      if (report && (report.status === 'FLAGGED' || report.status === 'FAILED')) {
        const decided = adverseRecordFrom(
          ((report as { adverseActions?: unknown[] }).adverseActions ?? []) as never,
          report.result
        ).decision
        if (decided) continue
        flagged = { provider: report.provider ?? null, on: report.verifiedAt ?? report.issuedAt ?? null, status: report.status }
      }
      out.push({
        // The requirement on the line, not a row in a table: nothing was
        // ever filed, so there is no document id to name. The line and
        // the type together are what the letter is about, and what the
        // dedupe key is built from.
        // A flagged report is a new fact, not the missing paper told
        // again, so it carries a key of its own and is told once.
        id: flagged ? `${line.id}:${item.key}:flagged` : `${line.id}:${item.key}`,
        key: item.key,
        document: item.label,
        line: { side: 'SELL', id: line.id },
        owedBy: asOwedBy(item.owedByRole),
        owedByName: item.owedByName ?? null,
        personId: line.personId,
        companyId: null,
        tellCompanyId: line.companyId,
        expiresAt: null,
        daysLeft: null,
        lapsed: false,
        neverFiled: true,
        stopsWork: item.blocks,
        ...(flagged ? { flagged } : {}),
      })
    }
  }
  return out
}

function asOwedBy(role: string | undefined): OwedBy | null {
  return role === 'WORKER' || role === 'SUPPLIER' || role === 'CUSTOMER' || role === 'US' ? role : null
}

/**
 * Everything worth a letter tonight, from both halves of the loop.
 *
 * The one call `api/cron/watch` makes.
 */
export async function everyDocumentLetter(
  now: Date = new Date(),
  opts: { db?: Db; windowDays?: number; limit?: number } = {}
): Promise<LapseTelling> {
  const db = opts.db ?? prisma
  const watch = await documentsToChase(now, { db, windowDays: opts.windowDays })
  const missing = await documentsNeverFiled(now, { db, limit: opts.limit })
  const cover = await supplierCoverLapses(now, { db, windowDays: opts.windowDays })
  // One pass over both halves rather than two, because the dedupe and
  // what-was-already-said are the same question: a document that is
  // both lapsing and never filed is one fact, and two passes each read
  // back only their own half's record of having told somebody. The
  // dated half comes first, so the letter that survives is the one that
  // can name a day.
  return tellAbout([...fromWatch(watch), ...missing, ...cover], now, db)
}

/**
 * What has already been said, read back off the notifications
 * themselves.
 *
 * Nothing dedupes these rows in the database, so the ledger is the
 * letters — the same shape, and the same bug already fixed twice, as the
 * visa watch and the agreement watch.
 */
async function alreadySaid(db: Db, documentIds: string[]): Promise<Set<string>> {
  if (documentIds.length === 0) return new Set()
  // A night's letter names one document as its entity and carries the
  // rest in its keys, so it is read back by its mark as well as by id.
  const rows = await db.notification.findMany({
    where: {
      type: 'SYSTEM',
      OR: [
        { entityId: { in: [...new Set(documentIds)] } },
        { data: { path: ['letter'], equals: NIGHT_LETTER } },
      ],
    },
    select: { data: true },
  })
  const out = new Set<string>()
  for (const r of rows) {
    const d = r.data as { saidKey?: string; alsoSaid?: unknown } | null
    if (typeof d?.saidKey === 'string') out.add(d.saidKey)
    // The keys of the letters this one stood in for, so a duplicate
    // suppressed tonight is not sent tomorrow for want of a record.
    if (Array.isArray(d?.alsoSaid)) for (const k of d.alsoSaid) if (typeof k === 'string') out.add(k)
  }
  return out
}

// ── Sending them ──────────────────────────────────────────────────────

export interface Sent {
  /** Every paper fact somebody was told, one per reader per fact. */
  letters: LapseLetter[]
  /** Messages that actually left: one per person, papers and findings together. */
  people: number
  /** One row per paper fact, in the books of whoever read it. */
  logged: number
  /** People told the firm's own findings, alone or inside their paper letter. */
  findingsTold: number
}

/** The mark a night's letter carries, so tomorrow can read it back. */
export const NIGHT_LETTER = 'DOCUMENTS_NIGHT'

/**
 * The firm's own findings for one person tonight, as the nightly check
 * built them: one message already worded, whether its worst finding
 * stops work today, and the key of every finding inside it.
 */
export type NightFindings = NotifyParams & {
  /** The worst finding inside it stops work today. */
  blocking: boolean
  /** The said-key of every finding inside it, so tomorrow reads them back. */
  keys: string[]
}

function moreOf(n: number, what: string): string {
  return n === 1 ? `one more ${what}` : `${n} more ${what}s`
}

/**
 * One message carrying a person's papers and their findings.
 *
 * The half that stops work leads. A paper that stops work, or a finding
 * that does, comes first; on a tie the papers lead, because they carry a
 * date somebody can act before. Every key in it is written on it, so
 * neither half says any of it again tomorrow.
 */
export function papersWithFindings(night: NightLetter, note: NightFindings): NotifyParams {
  const paperStops = night.facts.some((f) => f.data.stopsWork)
  const findingFirst = note.blocking && !paperStops
  const papers = night.facts.length
  const findings = note.keys.length

  const findingSection = `${note.title}\n${note.body}`
  const paperSection = papers === 1 ? `${night.title}\n${night.body}` : night.body
  const title = findingFirst
    ? `${note.title}, and ${moreOf(papers, 'paper')}`
    : `${night.title}, and ${moreOf(findings, 'thing to look at')}`

  const paperKeys = night.facts.flatMap((f) => [f.saidKey, ...(f.data.alsoSaid ?? [])])
  const first = findingFirst ? note.keys[0] : night.facts[0].saidKey
  const every = [...new Set([...paperKeys, ...note.keys])]

  return {
    personId: night.personId,
    companyId: night.companyId ?? note.companyId,
    type: 'SYSTEM',
    title,
    body: findingFirst ? `${findingSection}\n\n${paperSection}` : `${paperSection}\n\n${findingSection}`,
    entityId: findingFirst ? note.entityId : night.entityId,
    // A paper letter is always an email; a finding folded into it rides along.
    channel: 'EMAIL',
    data: {
      letter: NIGHT_LETTER,
      saidKey: first,
      alsoSaid: every.filter((k) => k !== first),
      documentIds: [...new Set(night.facts.map((f) => f.data.documentId))],
      count: papers + findings,
      stopsWork: night.facts.filter((f) => f.data.stopsWork).length + (note.blocking ? 1 : 0),
      kinds: (note.data as { kinds?: unknown } | undefined)?.kinds ?? [],
    },
  }
}

/** The message one person's papers alone make. */
function papersAlone(night: NightLetter): NotifyParams {
  const [first, ...rest] = night.facts
  const keys = night.facts.flatMap((f) => [f.saidKey, ...(f.data.alsoSaid ?? [])])
  return {
    personId: night.personId,
    companyId: night.companyId ?? undefined,
    type: night.type,
    title: night.title,
    body: night.body,
    entityId: night.entityId,
    channel: night.channel,
    data:
      rest.length === 0
        ? first.data
        : {
            letter: NIGHT_LETTER,
            saidKey: first.saidKey,
            // Every fact folded into this letter, so none of them is
            // sent on its own tomorrow for want of a record.
            alsoSaid: [...new Set(keys.filter((k) => k !== first.saidKey))],
            documentIds: [...new Set(night.facts.map((f) => f.data.documentId))],
            count: night.facts.length,
            stopsWork: night.facts.filter((f) => f.data.stopsWork).length,
          },
  }
}

/**
 * Send tonight's letters, one per person, and write the record of each
 * paper having been told.
 *
 * `findings` are the firm's own findings from the same night, one
 * message per person already worded. A person owed both reads one
 * message carrying both (`papersWithFindings`); a person owed only
 * findings reads them exactly as worded; a person owed only papers reads
 * the paper letter. Every paper in any of them leaves its own log row.
 *
 * Awaited, unlike most callers of `notify`: this job's whole output is
 * that somebody was told, and a count returned while the writes are
 * still in flight is a claim rather than a fact.
 */
export async function sendDocumentLapses(
  letters: LapseLetter[],
  now: Date = new Date(),
  db: Db = prisma,
  opts: { findings?: NightFindings[] } = {}
): Promise<Sent> {
  const sent: LapseLetter[] = []
  let people = 0
  let logged = 0
  let findingsTold = 0

  const noteOf = new Map<string, NightFindings>()
  for (const n of opts.findings ?? []) noteOf.set(n.personId, n)
  const nights = oneLetterPerPerson(letters)
  const withPapers = new Set(nights.map((n) => n.personId))

  // Findings for people with no paper tonight go as they were worded.
  const alone: NotifyParams[] = [...noteOf.values()]
    .filter((n) => !withPapers.has(n.personId))
    .map(({ blocking: _b, keys: _k, ...n }) => n)
  if (alone.length > 0) {
    await notifyBulk(alone)
    people += alone.length
    findingsTold += alone.length
  }

  for (const night of nights) {
    const note = noteOf.get(night.personId)
    const written = await notify(note ? papersWithFindings(night, note) : papersAlone(night))
    if (!written) continue
    people++
    if (note) findingsTold++

    for (const l of night.facts) {
      sent.push(l)
      await db.automationLog.create({
        data: {
          companyId: l.companyId,
          action: 'DOCUMENT_LAPSE_TOLD',
          summary: l.logSummary,
          reason: l.logReason,
          payload: {
            documentId: l.data.documentId,
            documentKey: l.data.documentKey,
            milestone: l.data.milestone,
            daysLeft: l.data.daysLeft,
            side: l.side,
            stopsWork: l.data.stopsWork,
            told: DESK_WORDS[l.side],
            // How many papers shared the one letter it went out in.
            inOneLetterWith: night.facts.length,
            ...(note ? { withFindings: true } : {}),
            at: now.toISOString(),
          },
          reversible: false,
        },
      })
      logged++
    }
  }

  return { letters: sent, people, logged, findingsTold }
}
