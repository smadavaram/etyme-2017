/**
 * Where a job's work is done, and whether it offers sponsorship, read
 * from what the job request form sent.
 *
 * Decided by the founder, 2026-11-03 ("Work authorization is checked
 * where the work is done"): an onsite or hybrid job is checked against
 * its site's country, a remote one against where the person works from.
 * That needs the work mode on the job, which nothing wrote until now.
 *
 * And a job that offers no sponsorship is the one restriction a hiring
 * manager may set on her own, because it is lawful on its face: it turns
 * away only somebody who would need a visa filed for them. It is written
 * the way lib/work-authorisation reads a restriction — "needs no
 * sponsor", the basis SPONSORSHIP_UNAVAILABLE, and the firm's own words
 * for its policy as the cite — so the screen and the vendor's check hold
 * back exactly the people the policy covers, and never a green card
 * holder or a citizen.
 *
 * Beside the route rather than in src/lib, because a new file there needs
 * an owner in src/lib/domains.ts. Pure: no database, no clock.
 */

import { NEEDS_NO_SPONSOR_VALUE } from '@/lib/checks'

export const WORK_MODES = ['ONSITE', 'HYBRID', 'REMOTE'] as const
export type WorkMode = (typeof WORK_MODES)[number]

/** The longest policy sentence kept, so the cite stays a sentence. */
export const POLICY_MAX = 300

export type WorkFacts = {
  /** Null where the caller did not say (an import, an older caller). */
  workMode: WorkMode | null
  /** The three columns, only where the job offers no sponsorship. */
  restriction: { workAuthRequired: string; workAuthBasis: 'SPONSORSHIP_UNAVAILABLE'; workAuthCite: string } | null
}

export type WorkFactsRead =
  | { ok: true; facts: WorkFacts }
  | { ok: false; field: 'workMode' | 'sponsorshipPolicy' | 'sponsorship'; says: string }

/**
 * The form's answers, checked. A work mode that is not one of the three
 * is refused rather than stored, because a reader comparing against
 * REMOTE must never meet "remote-ish". "No" with no words is refused,
 * because a policy nobody can quote is one nobody can check.
 */
export function readWorkFacts(body: {
  workMode?: unknown
  sponsorship?: unknown
  sponsorshipPolicy?: unknown
}): WorkFactsRead {
  let workMode: WorkMode | null = null
  if (body.workMode != null && body.workMode !== '') {
    const m = String(body.workMode).trim().toUpperCase()
    if (!(WORK_MODES as readonly string[]).includes(m)) {
      return { ok: false, field: 'workMode', says: 'Say where the work is done: on site, hybrid or remote.' }
    }
    workMode = m as WorkMode
  }

  const s = body.sponsorship == null || body.sponsorship === '' ? null : String(body.sponsorship).trim().toUpperCase()
  if (s !== null && s !== 'YES' && s !== 'NO') {
    return { ok: false, field: 'sponsorship', says: 'Say whether this job offers sponsorship: yes or no.' }
  }
  if (s !== 'NO') return { ok: true, facts: { workMode, restriction: null } }

  const policy = typeof body.sponsorshipPolicy === 'string' ? body.sponsorshipPolicy.trim() : ''
  if (!policy) {
    return {
      ok: false,
      field: 'sponsorshipPolicy',
      says: 'Say your policy in a few words, for example "We do not sponsor work visas for this role". Suppliers read it, and it is the reason on record when somebody who needs a visa is held back.',
    }
  }
  if (policy.length > POLICY_MAX) {
    return { ok: false, field: 'sponsorshipPolicy', says: `Keep the policy to ${POLICY_MAX} characters; it is one sentence.` }
  }
  return {
    ok: true,
    facts: {
      workMode,
      restriction: {
        workAuthRequired: NEEDS_NO_SPONSOR_VALUE,
        workAuthBasis: 'SPONSORSHIP_UNAVAILABLE',
        workAuthCite: policy,
      },
    },
  }
}

// ── Changing them on a job already raised ────────────────────────────
//
// The edit form asks the two questions the raise form asks (the
// work-country wave's leftover, 2026-11-03), so a job raised before the
// questions existed, or raised wrong, is put right without a new job.

/** The three columns a job's restriction lives in, and its work mode. */
export interface WorkColumns {
  workMode: string | null
  workAuthRequired: string | null
  workAuthBasis: string | null
  workAuthCite: string | null
}

/**
 * The job's two answers as the edit form opens on them, and as the
 * change rule compares them. A job that never said where the work is done
 * reads as on site, the way lib/work-country reads it, so opening the
 * form and saving it unchanged changes nothing. Sponsorship reads "not
 * offered" only where the restriction is the sponsorship one; a job held
 * back on another recorded basis (export control, a clearance) reads as
 * offering it, and `otherBasis` says why the form cannot change it.
 */
export function workFactsOf(row: WorkColumns): {
  workMode: WorkMode
  sponsorship: 'YES' | 'NO'
  sponsorshipPolicy: string
  otherBasis: string | null
} {
  const mode = (WORK_MODES as readonly string[]).includes(String(row.workMode ?? '').toUpperCase())
    ? (String(row.workMode).toUpperCase() as WorkMode)
    : 'ONSITE'
  const noSponsor = row.workAuthBasis === 'SPONSORSHIP_UNAVAILABLE'
  return {
    workMode: mode,
    sponsorship: noSponsor ? 'NO' : 'YES',
    sponsorshipPolicy: noSponsor ? (row.workAuthCite ?? '') : '',
    otherBasis: !noSponsor && row.workAuthRequired ? row.workAuthBasis ?? 'a recorded basis' : null,
  }
}

/** The one value the change rule compares for sponsorship: "YES", or "NO: <the policy>". */
export function sponsorshipValue(f: { sponsorship: 'YES' | 'NO'; sponsorshipPolicy: string }): string {
  return f.sponsorship === 'NO' ? `NO: ${f.sponsorshipPolicy.trim()}` : 'YES'
}

export type WorkEdit =
  | {
      ok: true
      /** What the change rule compares, only for the questions the caller sent. */
      after: { workMode?: WorkMode; sponsorship?: string }
      /** What is written, only for what the caller sent. */
      columns: Partial<WorkColumns>
    }
  | { ok: false; field: 'workMode' | 'sponsorship' | 'sponsorshipPolicy'; says: string }

/**
 * An edit's two answers, checked by the raise's own reader, and what they
 * write. Nothing is read or written for a question the caller did not
 * send, because a field left off a PATCH is not a field set to a default.
 *
 * Offered again: the sponsorship restriction comes off, and only that
 * one. Not offered: the restriction is written with the firm's words. A
 * job already held back on another recorded basis is refused rather than
 * overwritten, because swapping an export-control rule for a sponsorship
 * policy would let through somebody the other rule holds back.
 */
export function readWorkEdit(row: WorkColumns, body: {
  workMode?: unknown
  sponsorship?: unknown
  sponsorshipPolicy?: unknown
}): WorkEdit {
  const sentMode = body.workMode != null && body.workMode !== ''
  const sentSponsor = body.sponsorship != null && body.sponsorship !== ''
  if (!sentMode && !sentSponsor) return { ok: true, after: {}, columns: {} }

  const read = readWorkFacts({
    workMode: sentMode ? body.workMode : undefined,
    sponsorship: sentSponsor ? body.sponsorship : undefined,
    sponsorshipPolicy: body.sponsorshipPolicy,
  })
  if (!read.ok) return read

  const after: { workMode?: WorkMode; sponsorship?: string } = {}
  const columns: Partial<WorkColumns> = {}
  if (sentMode && read.facts.workMode) {
    after.workMode = read.facts.workMode
    columns.workMode = read.facts.workMode
  }
  if (sentSponsor) {
    const now = workFactsOf(row)
    const offered = read.facts.restriction === null
    if (!offered && now.otherBasis) {
      return {
        ok: false,
        field: 'sponsorship',
        says:
          'This job already holds people back on its own recorded basis, which is stricter than a sponsorship policy. ' +
          'Leave sponsorship as it is, or ask whoever recorded that basis to change it.',
      }
    }
    if (offered) {
      after.sponsorship = 'YES'
      // Only the sponsorship restriction comes off; another basis stays.
      if (row.workAuthBasis === 'SPONSORSHIP_UNAVAILABLE') {
        columns.workAuthRequired = null
        columns.workAuthBasis = null
        columns.workAuthCite = null
      }
    } else {
      const r = read.facts.restriction!
      after.sponsorship = sponsorshipValue({ sponsorship: 'NO', sponsorshipPolicy: r.workAuthCite })
      columns.workAuthRequired = r.workAuthRequired
      columns.workAuthBasis = r.workAuthBasis
      columns.workAuthCite = r.workAuthCite
    }
  }
  return { ok: true, after, columns }
}
