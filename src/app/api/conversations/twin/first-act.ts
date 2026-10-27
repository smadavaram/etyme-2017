/**
 * A new party's first greeting names its one next act and the link
 * (founder, 2026-10-27, decision 8 of the onboarding walk). The walk
 * found every party's first screen after sign-up either empty ("Nothing
 * needs you today") or pointing at a door that did not exist: a new
 * client read "Finish setting up: your people, your team." and nothing
 * else, an MSP with no seat was told to ask somebody with no way to ask,
 * a worker was told firms find her through a page that was off, and a
 * one-person firm was asked to ask herself.
 *
 * So the greeting's recommendation, where nothing else is recommended,
 * is the party's first act, read off the company's own rows:
 *
 *   client        no supplier yet     recommend your first supplier, then post a job
 *                 no job yet          post your first job
 *   supplier      no client yet       nothing from a client yet; record one you work with
 *   integrator    nobody of its own   add your people, then a delivery manager flags who rolls off
 *   MSP           no seat             ask a client for a seat
 *   one-person    no contract         record the contract you already have, and your papers
 *   worker        (./worker)          Your page is off: turn it on, and put a paper on file
 *
 * And a colleague who arrived from an invitation, and has asked nothing
 * yet, is told where she is and what to do first.
 *
 * This file is the rules and the words, with no database in it; the
 * route reads the counts (`firstActFacts`), each of the caller's own
 * company's rows and nobody's person data. Nothing here acts: every line
 * is a link to the page where the person does it.
 */

import type { Party, RichLine } from './ask'

/** Where each act is done. One constant per door, so a page that moves is one line. */
export const FIRST_ACT_HREF = {
  suppliers: '/dashboard/suppliers',
  jobs: '/dashboard/requisitions',
  companies: '/dashboard/companies',
  importPeople: '/dashboard/data',
  people: '/dashboard/consultants',
  /**
   * An MSP's own Today, where the architect's "Ask for a seat" sits beside
   * the seats it holds (onboarding walk, decision 3). Today is the page
   * that already says a program office has no seat yet.
   */
  askForSeat: '/dashboard',
  contracts: '/dashboard/contracts',
  companyPaperwork: '/dashboard/documents',
} as const

/** The counts the route reads, each of the caller's own company's rows. Absent where not read. */
export interface FirstActFacts {
  party: Party
  /** The company's kind: an integrator (GSI) adds its own people; a staffing firm waits on a client. */
  companyKind: string | null
  /** A client: firms on its supplier list, recommended or traded with. */
  suppliers?: number
  /** A client: job requests it raised, in any state. */
  jobs?: number
  /** A supplier: clients it trades with, invitations it received, lines it sells on. */
  clients?: number
  /** An integrator: people it brought in, by import, on its bench, or on a line it sells. */
  people?: number
  /** An MSP: live seats a client granted it. */
  seats?: number
  /** A one-person firm: lines it sells on. */
  contracts?: number
  /** A one-person firm: papers on file for the firm (a W-9, a certificate of insurance). */
  firmPapers?: number
}

/**
 * The party's first act, where the record says it has not been done;
 * null where it has, or where the counts were not read. Never a guess:
 * an unread count is not zero.
 */
export function firstActFor(f: FirstActFacts): RichLine | null {
  switch (f.party) {
    case 'CLIENT': {
      if (f.suppliers === 0) {
        return {
          says: 'Recommend your first supplier, then post a job.',
          links: [{ text: 'Recommend your first supplier', href: FIRST_ACT_HREF.suppliers }],
        }
      }
      if (f.suppliers != null && f.suppliers > 0 && f.jobs === 0) {
        return { says: 'Post your first job.', links: [{ text: 'Post your first job', href: FIRST_ACT_HREF.jobs }] }
      }
      return null
    }
    case 'MSP':
      return f.seats === 0
        ? {
            says: 'No client has given you a seat in its program yet. Ask a client for a seat; its owner or program manager grants it.',
            links: [{ text: 'Ask a client for a seat', href: FIRST_ACT_HREF.askForSeat }],
          }
        : null
    case 'FIRM':
      if (f.companyKind === 'GSI') {
        return f.people === 0
          ? {
              says: 'Add your people: import a file, or add them one by one. Then a delivery manager can flag who rolls off.',
              links: [{ text: 'import a file', href: FIRST_ACT_HREF.importPeople }, { text: 'add them one by one', href: FIRST_ACT_HREF.people }],
            }
          : null
      }
      return f.clients === 0
        ? {
            says: 'Nothing from a client yet; when a client invites you, it lands here. Record a client you already work with.',
            links: [{ text: 'Record a client you already work with', href: FIRST_ACT_HREF.companies }],
          }
        : null
    case 'SOLO': {
      const noContract = f.contracts === 0
      const noPapers = f.firmPapers === 0
      if (noContract && noPapers) {
        return {
          says: 'Record the contract you already have, and put your W-9 and insurance on file.',
          links: [{ text: 'Record the contract you already have', href: FIRST_ACT_HREF.contracts }, { text: 'put your W-9 and insurance on file', href: FIRST_ACT_HREF.companyPaperwork }],
        }
      }
      if (noContract) return { says: 'Record the contract you already have.', links: [{ text: 'Record the contract you already have', href: FIRST_ACT_HREF.contracts }] }
      if (noPapers) return { says: 'Put your W-9 and insurance on file.', links: [{ text: 'Put your W-9 and insurance on file', href: FIRST_ACT_HREF.companyPaperwork }] }
      return null
    }
    default:
      return null
  }
}

/** How long after an invitation a colleague is still greeted as new, if she has asked nothing yet. */
export const NEW_ARRIVAL_DAYS = 14

const DAY = 86_400_000

/**
 * The line that tells a colleague who came in by invitation where she is
 * and what to do first. Said while the invitation is under two weeks old
 * and she has asked Ask Etyme nothing; null otherwise.
 *
 * Her first thing is the recommendation above it where there is one;
 * where there is none, Today, where the company's work is listed and
 * where anything for her desk arrives first.
 */
export function welcomeFor(w: {
  company: string
  role: string | null
  invitedAt: Date | null
  asked: boolean
  recommended: boolean
  now: Date
  /** The seat's own Today: a client's program page, any other firm's dashboard. */
  today?: string
}): RichLine | null {
  if (!w.invitedAt || w.asked) return null
  const age = w.now.getTime() - w.invitedAt.getTime()
  if (age < 0 || age > NEW_ARRIVAL_DAYS * DAY) return null
  const where = `Welcome to ${w.company}${w.role?.trim() ? `, as ${w.role.trim()}` : ''}.`
  return w.recommended
    ? { says: `${where} Your first thing to do is the recommendation above.` }
    : { says: `${where} Nothing waits on you yet. Start on Today: the company’s work is there, and anything for you arrives here first.`, links: [{ text: 'Today', href: w.today ?? '/dashboard' }] }
}
