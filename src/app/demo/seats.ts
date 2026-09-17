/**
 * The doors on /demo, as data.
 *
 * They were written inline on the page, so nothing could check them
 * against the world they claim to describe. A seat that names a company
 * the seed does not build is a demo page that 404s on a click, and the
 * founder found exactly that: he was told to open /demo and sit at
 * Teleworld, and Teleworld was not on the page at all.
 *
 * Everything here is true of the seeded world (lib/seed-world,
 * lib/seed-programmes) and `__integration__/demo-seats.test.ts` walks
 * every slug below into a real company of the kind the words claim.
 *
 * `slug` is the company slug in the seeded world — the seed writes every
 * firm with a `world-` prefix, so `teleworld` in the seed list is
 * `world-teleworld` here, which is what POST /api/demo accepts.
 *
 * The slugs and the names deliberately disagree. Three of these firms
 * were named after real enterprises, which on a public page reads as
 * three live customers who have never heard of us; the names are
 * invented now (`docs/demo-names.md`) and the slugs stay, because a
 * slug is an address nobody reads and changing it would break every
 * integration test and every `POST /api/demo` body written down
 * anywhere. `__tests__/invariants/demo-names.test.ts` refuses the old
 * names coming back, here and in the seeds.
 */

import type { Program } from './desk-picker'

/**
 * The three enterprise programs, each with a desk per job.
 *
 * These get the desk list: a client is four or five jobs rather than one
 * seat, and the point of the door is to find your own work on it.
 */
export const CLIENT_PROGRAMS: Program[] = [
  {
    slug: 'world-nike',
    name: 'Northbend Athletic',
    where: 'Tualatin, OR',
    about:
      'Three suppliers, one of them supplying through a bench vendor it never names. ' +
      'A planning analyst on her second supplier here, fourteen months into an eighteen-month cap.',
  },
  {
    slug: 'world-corning',
    name: 'Cavanaugh Glassworks',
    where: 'Elmira, NY',
    about:
      'A glass plant hiring validation, MES and quality people. A supplier whose liability ' +
      'certificate runs out in twelve days, and a past contractor who is clear to come back.',
  },
  {
    slug: 'world-terumo-bct',
    name: 'Talvern Medical',
    where: 'Westminster, CO',
    about:
      'A medical device maker. One SAP consultant is twenty-three months on site across two ' +
      'suppliers, against a cap of eighteen — a number neither supplier can see.',
  },
]

/** The staffing firms that placed the people above. One seat each. */
export const SUPPLIER_SEATS: Program[] = [
  {
    slug: 'world-computer-systems',
    name: 'Computer Systems Inc',
    where: 'Prime supplier',
    about: 'Sells into Northbend Athletic and Talvern Medical. Buys one of those people from a bench vendor.',
  },
  {
    slug: 'world-vertex-global',
    name: 'Vertex Global',
    where: 'Prime supplier',
    about: 'Sells into Cavanaugh Glassworks and Talvern Medical.',
  },
]

/**
 * The two integrators, who staff a client seat off their own payroll.
 *
 * A GSI is the one firm that sells a person it already employs, so it
 * has no bench listing to grant and nobody's consent to ask — the
 * employment contract already said it. That is the INTERNAL submission
 * path, and these two seats are the only place in the demo where it can
 * be walked.
 *
 * Both sit at the delivery manager's desk, because that is the desk that
 * submits.
 */
export const INTEGRATOR_SEATS: Program[] = [
  {
    slug: 'world-teleworld',
    name: 'Teleworld Solutions',
    where: 'Systems integrator',
    about:
      'Sunil Raghavan runs delivery, with four people on his own payroll between projects — ' +
      'validation, data, SAP and integration. Corveldt Aerospace has an open DO-178C ' +
      'verification engineer seat, and Karthik Menon fits it: submit him with no bench listing anywhere.',
  },
  {
    slug: 'world-sundara',
    name: 'Sundara Systems',
    where: 'Systems integrator',
    about:
      'Lakshmi Iyer has the same four disciplines idle between projects, and PLM work running ' +
      'at Corveldt already. The same Corveldt avionics seat is open to Sundara too, at a band of ' +
      'its own, and Aditi Ramaswamy is the one who fits it.',
  },
]

/** Every door on the page, for anything that has to check them all. */
export const ALL_SEATS: Program[] = [...CLIENT_PROGRAMS, ...SUPPLIER_SEATS, ...INTEGRATOR_SEATS]
