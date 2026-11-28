import { prisma } from '@/lib/db'
import { ADVERSE_STEPS, contractClearance, lineExtrasForSellLines, sentencePhrases } from '@/lib/contract-clearance'
import { heldStartSays } from '@/app/dashboard/program/needs-you'

/**
 * The two things on a client's desk that are not approvals and still
 * need somebody: a start the paperwork will refuse, and a supplier with
 * people on site and no agreement on file.
 *
 * ── Why one file ─────────────────────────────────────────────────────
 *
 * The program page counted both in its headline, and `GET /api/decisions`
 * — the one count for a seat, read by the Ask Etyme mark and the
 * greeting — did not. Two routes deciding "is this start held" each in
 * their own words is two answers waiting to disagree, so both read the
 * verdict from here and from nowhere else (2026-10-13).
 */

/**
 * The columns a clearance reads. `validFrom` as well as `expiresAt`,
 * because a preview that disagrees with the activation it previews is
 * worse than no preview; `provider` and `result` because a refusal has to
 * name who issued a license and its number. Shared by both queries in
 * `startPaperwork`, which is why adding a column to one would have missed.
 * `ADVERSE_STEPS` because a decision not to act on a flagged background
 * report is a row of its own, and a page that does not read it still
 * holds a start the decision already cleared.
 */
export const VERIFICATION_SHAPE = {
  type: true, status: true, issuedAt: true, validFrom: true, expiresAt: true,
  verifiedAt: true, provider: true, result: true,
  ...ADVERSE_STEPS,
} as const

/** One line not started yet, in the shape the clearance needs. */
export interface StartLine {
  id: string
  personId: string
  companyId: string
  startDate: Date
  endDate: Date | null
  person: { name: string }
  requirement?: { title: string } | null
}

/**
 * The verdict activation will give on the day, read early: PASS, WARN
 * (says something, refuses nobody) or BLOCK (the start is held).
 *
 * The same checklist activation runs, with the role so a licensed role is
 * cleared against the licensed packet, the last day so a license that
 * runs out mid-assignment says so, and what this client's own order asked
 * for on the line, last, so it beats the default shape.
 */
export async function startPaperwork(
  c: StartLine,
  opts: { supplierPhrase: string; clientName: string; now: Date }
): Promise<StartVerdict> {
  const one = await startPaperworkFor([c], { supplierPhraseOf: () => opts.supplierPhrase, clientName: opts.clientName, now: opts.now })
  return one.get(c.id)!
}

/** The start's verdict, as activation will give it. */
export type StartVerdict = { outcome: 'PASS' | 'WARN' | 'BLOCK'; says: string; fix: string | null; short: string | null }

/**
 * `startPaperwork` for many lines at once: the queue's held starts, the
 * program page's starting-soon panel, a region's held starts.
 *
 * Each line's verdict is worked out exactly as `startPaperwork` works it
 * out for one, on the same rows: every person's papers read once for all
 * the lines, every supplier's own certificates once, and every line's own
 * set and extras through regulatory's many-lines read
 * (`lineExtrasForSellLines`). One start at a time was about twenty-five
 * statements per start, and the queue asked for every start its client
 * has (the page timing pass, 2026-11-02).
 */
export async function startPaperworkFor<T extends StartLine>(
  lines: readonly T[],
  opts: { supplierPhraseOf: (c: T) => string; clientName: string; now: Date }
): Promise<Map<string, StartVerdict>> {
  const out = new Map<string, StartVerdict>()
  if (lines.length === 0) return out
  const personIds = [...new Set(lines.map((c) => c.personId))]
  const companyIds = [...new Set(lines.map((c) => c.companyId))]
  const [personRows, firmRows, extras] = await Promise.all([
    prisma.verification.findMany({ where: { personId: { in: personIds } }, select: { ...VERIFICATION_SHAPE, personId: true } }),
    // `personId: null`: a person's own file is not the firm's standing.
    prisma.verification.findMany({ where: { companyId: { in: companyIds }, personId: null }, select: { ...VERIFICATION_SHAPE, companyId: true } }),
    lineExtrasForSellLines(lines.map((c) => c.id)),
  ])
  // Grouped by whose they are, in the order they were read, and handed on
  // without the key, so each line reads exactly the rows a read of its own
  // would have handed it.
  const ofPerson = new Map<string, Omit<(typeof personRows)[number], 'personId'>[]>()
  for (const { personId, ...row } of personRows) {
    if (!personId) continue
    ofPerson.set(personId, [...(ofPerson.get(personId) ?? []), row])
  }
  const ofFirm = new Map<string, Omit<(typeof firmRows)[number], 'companyId'>[]>()
  for (const { companyId, ...row } of firmRows) {
    if (!companyId) continue
    ofFirm.set(companyId, [...(ofFirm.get(companyId) ?? []), row])
  }
  for (const c of lines) {
    const papers = contractClearance({
      personName: c.person.name, personVerifications: ofPerson.get(c.personId) ?? [],
      supplierName: opts.supplierPhraseOf(c), supplierCertificates: ofFirm.get(c.companyId) ?? [],
      clientName: opts.clientName, on: c.startDate > opts.now ? c.startDate : opts.now,
      role: c.requirement?.title ?? null,
      through: c.endDate,
      ...(extras.get(c.id) ?? {}),
    })
    // The row's own sentence, where papers alone hold the start: the
    // person is named on the row already, so it says what is missing once
    // and what to do once (`heldStartSays`). Each item carries the
    // clearance's own phrase for it, so a license names its board.
    const short = heldStartSays({
      outcome: papers.outcome,
      blocking: papers.blocking.map((i) => ({ ...i, said: i.said ?? sentencePhrases([i])[0] })),
      licenseBlocks: papers.license.outcome === 'BLOCK',
      coverBlocks: papers.cover.outcome === 'BLOCK',
    })
    out.set(c.id, { outcome: papers.outcome, says: papers.says, fix: papers.fix ?? null, short })
  }
  return out
}

/** The suppliers, of those named, with an agreement on file with this client. */
export async function agreementsOnFile(clientId: string, vendorIds: string[]): Promise<Set<string>> {
  if (vendorIds.length === 0) return new Set()
  const rows = await prisma.masterAgreement.findMany({
    where: { clientId, vendorId: { in: vendorIds } },
    select: { vendorId: true },
  })
  return new Set(rows.map((a) => a.vendorId))
}
