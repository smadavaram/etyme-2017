import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { negotiation, type Event } from '@/lib/rate-negotiation'

/**
 * A consultant sees what they are paid and never what they are billed at.
 *
 * ── What went wrong ──────────────────────────────────────────────────
 *
 * `Submission.rate` is the price at that rung — what the sending firm
 * charges the receiving firm. The schema settles it in the docblock on
 * `parentSubmissionId`: a sub at $62 and the prime above it at $95 are
 * two rows of one chain, a sell-side price at each hop.
 *
 * Two routes on the person's own surface read it as though it were
 * theirs. `GET /api/me/pipeline` returned it as `rateCents` under a
 * comment saying "their own rate on this submission… they agreed to
 * it". `GET /api/me/submissions/:id/rate` seeded the negotiation with it
 * as the vendor's opening OFFER. On the seeded world both handed Karthik
 * Menon 13600 — $136/hr, what his employer charges the client — while he
 * is paid $89. The employer's margin, on the employee's own screen, once
 * as a number and once as a sentence claiming it was offered to him.
 *
 * Nothing rendered either field, which is the only reason it was never
 * seen, and is exactly why this is a test and not a fix.
 *
 * The person named on a sell contract is the subject of it, not a party
 * to it — matrix L3.7.3.5.
 */

const ROOT = process.cwd()

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(full)
  }
  return out
}

const read = (f: string) => readFileSync(f, 'utf8')
const shortName = (f: string) => f.replace(ROOT + '/', '')

/**
 * Code only — no comments, no strings.
 *
 * The sweep below looks for one identifier, and this file's own
 * explanation of the bug names it a dozen times. A guard that a comment
 * can trip is a guard nobody keeps.
 */
function codeOnly(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/`(?:[^`\\]|\\.)*`/g, ' ')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, ' ')
    .replace(/"(?:[^"\\\n]|\\.)*"/g, ' ')
}

/**
 * Everything under `/api/me`, split by who is actually at the keyboard.
 *
 * `staffOnly` is the marker, and it is a real distinction rather than a
 * convenient one: it refuses a consultant seat outright. A route that
 * calls it is a firm's own desk that happens to live under this path —
 * `me/scorecard` is the supplier reading its own card — and a firm may
 * read its own price. A route that does not is the person's own screen.
 */
const UNDER_ME = walk(join(ROOT, 'src/app/api/me'))
const OWN_SURFACE = UNDER_ME.filter((f) => !/staffOnly/.test(read(f)))
const FIRM_SURFACE = UNDER_ME.filter((f) => /staffOnly/.test(read(f)))

describe('a consultant is never shown what the firm above them charges for their time', () => {
  it('finds the surface a person opens as themselves', () => {
    expect(OWN_SURFACE.length).toBeGreaterThan(8)
  })

  it('no screen a person opens as themselves reads the rate on a submission', () => {
    const hits = OWN_SURFACE.filter((f) => /\brate\b/.test(codeOnly(read(f))))

    expect(
      hits.map(shortName),
      'Submission.rate is the price at that rung — what one firm charges another. ' +
        'The person it names is the subject of that contract, not a party to it. ' +
        'If a screen needs what somebody is PAID, read it from the buy contract that ' +
        'pays them, never from this and never from a subtraction.'
    ).toEqual([])
  })

  it('can see the field it is banning, so a green result means something', () => {
    // The positive control. `me/scorecard` is the supplier's own card,
    // refused to a consultant by `staffOnly`, and it compares the firm's
    // own submission rates against the client's band — which is the one
    // legitimate read of this column on this path. If the sweep stops
    // finding it here, the sweep has stopped working.
    const seen = FIRM_SURFACE.filter((f) => /\brate\b/.test(codeOnly(read(f))))

    expect(seen.map(shortName)).toContain('src/app/api/me/scorecard/route.ts')
  })

  it('the pipeline says where a person was put forward and attaches no rate to it', () => {
    const text = read(join(ROOT, 'src/app/api/me/pipeline/route.ts'))

    expect(text).not.toContain('rateCents')
    // A submission is not a payment. Nobody is paid for being put
    // forward, and a pay rate exists only once a buy contract does.
    expect(text).toContain('/api/me/work')
  })

  it('leaves the comment that described the field wrongly nowhere in the tree', () => {
    // The comment was a false statement about what the column is, and a
    // reader who believed it would make the same mistake again.
    const hits = UNDER_ME.filter((f) => /their own rate on this submission/i.test(read(f)))

    expect(hits.map(shortName)).toEqual([])
  })
})

describe('a rate conversation opens from what was said to the person, never from a price between two firms', () => {
  const t = (mins: number) => new Date(2026, 8, 18, 9, mins)

  it('says no rate has been proposed where nobody has proposed one', () => {
    const state = negotiation([])

    expect(state.stage).toBe('NOT_STARTED')
    expect(state.liveCents).toBeNull()
    expect(state.says).toBe('No rate has been proposed yet.')
  })

  it('lets a consultant open the conversation themselves from a standing start', () => {
    // Removing the vendor's fake opening offer must not leave the
    // candidate with nothing to do. A blank screen with no move on it
    // would be a worse product than the wrong number was.
    expect(negotiation([]).mayCounter('CANDIDATE')).toBe(true)
  })

  it('carries a figure the moment somebody actually names one', () => {
    const events: Event[] = [{ at: t(0), by: 'CANDIDATE', move: 'OFFER', cents: 9_500 }]
    const state = negotiation(events)

    expect(state.stage).toBe('AWAITING')
    expect(state.liveCents).toBe(9_500)
    expect(state.awaiting).toBe('VENDOR')
  })
})

describe('what a consultant is paid comes from the leg that pays them and never from a rung above', () => {
  const WORK = read(join(ROOT, 'src/app/api/me/work/route.ts'))

  it('reads pay only from a buy contract with no supplier underneath it', () => {
    // Award writes a BuyContractCandidate at every hop, and at every hop
    // but the bottom its payRate is what one firm pays another firm for
    // this person's hours — a sell-side price one rung down.
    // `supplierSellContractId` is that rung; null means there is none.
    expect(WORK).toContain("l.buyContract.supplierSellContractId === null")
  })

  it('tells somebody why a rung shows no rate, rather than leaving a blank', () => {
    expect(WORK).toContain('price between two firms and not your rate')
  })

  it('still says the agency holds it where nothing is recorded at all', () => {
    // Two different blanks. One is a gap in the record and the person
    // should go and ask; the other is a figure that was never theirs.
    expect(WORK).toContain('Your rate is not recorded on Etyme for this placement.')
  })

  it('never reaches a pay figure by subtracting one rate from another', () => {
    const code = codeOnly(WORK)

    expect(/billRate/.test(code)).toBe(false)
    expect(/margin/i.test(code)).toBe(false)
  })
})
