/**
 * What Settings says about a setting, as pure sentences with no database
 * in them, so the panel, the route's reply and the tests read one copy
 * (fix list G1 and G3, 2026-11-15).
 *
 * No 'use client' here: the Ask Etyme route reads `modelStateSays` for its
 * reply, so the sentence after a press is the sentence the panel stands on.
 */

// ── Ask Etyme and the model (G1) ─────────────────────────────────────

/** The panel's heading line: true whatever the switch and the deployment say. */
export const MODEL_PANEL_SUBTITLE = 'Ask Etyme answers from your records first, whatever this is set to.'

/** The Company tab's card for the same switch: what it decides, and where the state is said. */
export const MODEL_CARD_SUBTITLE =
  'Whether a question your records cannot answer may be sent to a model, masked. The Ask Etyme tab says what happens now.'

export interface ModelFacts {
  /** The company's own switch. */
  on: boolean
  /** Whether this deployment has a model key at all. */
  modelSetUp: boolean
  /** Where the switch is on and the allowance holds it anyway, the sentence why. */
  heldSays?: string | null
}

/**
 * The one sentence that says what happens now, for every combination of
 * the company's switch, the deployment's key and the allowance. The only
 * place the state is said: nothing else on the panel says "may be sent".
 */
export function modelStateSays({ on, modelSetUp, heldSays }: ModelFacts): string {
  if (!on) {
    return modelSetUp
      ? 'Off. Ask Etyme answers from your records only and sends nothing outside.'
      : 'Off. Ask Etyme answers from your records only and sends nothing outside. No model is connected to this deployment yet either.'
  }
  if (!modelSetUp) {
    return 'On, but nothing is sent: no model is connected to this deployment yet. Ask Etyme answers from your records only.'
  }
  if (heldSays) return `On, but nothing is sent right now. ${heldSays}`
  return 'On. A question your records cannot answer may be sent, with names, rates and pay masked. Every one is listed below.'
}

// ── Walls (G3) ───────────────────────────────────────────────────────

/**
 * Every reader the account wall narrows today, by the file that calls
 * `accountFilterFor` (lib/account-walls). `walls-say-what-they-cover.test.ts`
 * fails when a file starts or stops calling it and this list is not
 * changed with it, so the sentence below cannot drift from the code.
 */
export const WALLED_READERS: Readonly<Record<string, string>> = Object.freeze({
  'src/app/api/contracts/route.ts': 'Contracts',
  'src/app/api/rolloff/route.ts': 'Rolloff',
  'src/app/api/program/view.ts': 'the program view',
  'src/app/api/program/summary.ts': 'the program view',
  'src/app/api/program/regions/read.ts': 'By region',
  'src/app/api/decisions/route.ts': 'the decisions waiting on each person',
  'src/app/api/conversations/twin/read.ts': 'Ask Etyme’s answers',
  'src/app/api/conversations/twin/billing.ts': 'Ask Etyme’s answers',
})

/** "Contracts, Rolloff, the program view, By region, … and Ask Etyme's answers": each once, in that order. */
export function wallCovers(): string {
  const seen: string[] = []
  for (const w of Object.values(WALLED_READERS)) if (!seen.includes(w)) seen.push(w)
  return seen.length > 1 ? `${seen.slice(0, -1).join(', ')} and ${seen[seen.length - 1]}` : seen[0] ?? ''
}

/** What one account is called at this kind of firm: a client's are its departments, a supplier's its client accounts. */
export function accountWord(kind: string): { one: string; many: string } {
  return kind === 'CLIENT' ? { one: 'department', many: 'departments' } : { one: 'client account', many: 'client accounts' }
}

/** The Walls checkbox's own sentences: what it does now, and what it covers. */
export function wallSays(kind: string, on: boolean): { state: string; covers: string } {
  const w = accountWord(kind)
  return {
    state: on
      ? `On. A person attached to a ${w.one} sees only that ${w.one}’s work. A person attached to none still sees every ${w.one}.`
      : `Off. Everybody here sees the work of every ${w.one}.`,
    covers: `It covers ${wallCovers()}.`,
  }
}

/** Beside a control the reader may not change. */
export const ONLY_OWNER_OR_ADMIN = 'Only the Owner or an Admin changes this.'

// ── Sign-in (G3): recorded, not enforced ─────────────────────────────

export const ASSURANCE_SAYS = 'Recorded only. Sign-in does not check it yet.'
export const RESIDENCY_SAYS = 'Recorded only. Etyme runs in one region today, so this changes nothing yet.'
export const SAY_WHY_FIRST = 'Say why in the box above first. It is kept with your name.'

// ── What kind of company (A6) ────────────────────────────────────────

/** Beside Change type, for the Owner, while the kind chosen is the one the company is now. */
export const TYPE_UNCHANGED = 'This is what you are now. Choose another kind above to change it.'

// ── Import records (G7, a pointer only) ──────────────────────────────

export const SUPPLIERS_HREF = '/dashboard/suppliers'
/** The words of the link, for a seat that may paste suppliers. */
export const PASTE_SUPPLIERS_LINK = 'pasting them on Suppliers'
/** Said whole where the reader may not paste them: the role, with no link. */
export const PASTE_SUPPLIERS_WHO = 'by whoever manages who you trade with'
export const NO_COMPANIES_IMPORT = 'A Companies import is not built yet.'
