/**
 * The Owner gate's words, with no database in them, so a screen can read
 * them too (lib/owner-proof re-exports every name here for the routes).
 *
 * Screen walk on df3074094: three Owner-only screens said "Only the Owner
 * …, ask the Owner" at a company that has no verified Owner yet, so there
 * was nobody to ask. `ownerOnlyLine` is the one helper they read: the
 * gate's own sentence naming Prove ownership, with its link, where the
 * company waits for a verified Owner; the Owner-only sentence otherwise.
 */


export type GatedAct = 'PAY' | 'BANK' | 'SIGN' | 'COMPANY_TYPE' | 'SIGN_IN_MODE' | 'GIVE_ACCESS' | 'PASS_OWNERSHIP'

/** Each act, said as the start of its refusal. */
export const GATED_ACT_WORDS: Record<GatedAct, string> = {
  PAY: 'Paying a firm',
  BANK: 'Changing bank details',
  SIGN: 'Signing an agreement',
  COMPANY_TYPE: 'Changing the type of company',
  SIGN_IN_MODE: 'Changing how people sign in',
  GIVE_ACCESS: 'Giving access by team or for the whole company',
  PASS_OWNERSHIP: 'Passing ownership',
}

/** Where the step is: the checklist item's own address. */
export const PROVE_OWNERSHIP_HREF = '/dashboard/settings/setup/ownership'
export const PROVE_OWNERSHIP_PLACE = 'Setup → Prove ownership'

export interface GateFacts {
  ownerProofRequiredAt: Date | null
  ownerVerifiedAt: Date | null
}

export type OwnerGate = { ok: true } | { ok: false; says: string; href: string; step: 'OWNERSHIP' }

/** Whether the proof rule applies to this company and is not yet met. */
export function waitsForVerifiedOwner(c: GateFacts): boolean {
  return c.ownerProofRequiredAt !== null && c.ownerVerifiedAt === null
}

/**
 * Pure: may this act go ahead at this company? One sentence that names the
 * step and links to it where it may not. A company formed before the rule
 * (no `ownerProofRequiredAt`) is never refused.
 */
export function needsVerifiedOwner(c: GateFacts & { name?: string | null }, act: GatedAct): OwnerGate {
  if (!waitsForVerifiedOwner(c)) return { ok: true }
  const who = c.name ? `${c.name} has` : 'this company has'
  return {
    ok: false,
    says: `${GATED_ACT_WORDS[act]} waits until ${who} a verified Owner. Prove ownership under ${PROVE_OWNERSHIP_PLACE}.`,
    href: PROVE_OWNERSHIP_HREF,
    step: 'OWNERSHIP',
  }
}


// ── What a screen says beside an act only the Owner does ──────────────

/** The sentence a screen says beside an act only the Owner does, at a company that has one. */
export const OWNER_ONLY_WORDS: Record<GatedAct, string> = {
  PAY: 'Only the Owner, or a role the Owner gives, pays a firm.',
  BANK: 'Only the Owner, or a role the Owner gives, changes bank details.',
  SIGN: 'Only the Owner, or a role the Owner gives, signs an agreement.',
  COMPANY_TYPE: 'Only the Owner changes the type. Ask the Owner if it is wrong.',
  SIGN_IN_MODE: 'Only an Owner changes how people sign in.',
  GIVE_ACCESS: 'Only the Owner gives access by team or for the whole company.',
  PASS_OWNERSHIP: 'Only an Owner passes ownership.',
}

/** A sentence and, where there is a step to take, its link. */
export interface OwnerLine {
  says: string
  href: string | null
  /** The link's words, "Prove ownership", where there is a link. */
  linkSays: string | null
}

/**
 * What a reader who may not do an Owner act is told beside it. At a company
 * waiting for a verified Owner it is the gate's own sentence with the link
 * to Prove ownership, because there is no Owner to ask; otherwise the
 * Owner-only sentence for the act.
 */
export function ownerOnlyLine(c: GateFacts & { name?: string | null }, act: GatedAct): OwnerLine {
  const gate = needsVerifiedOwner(c, act)
  if (!gate.ok) return { says: gate.says, href: gate.href, linkSays: 'Prove ownership' }
  return { says: OWNER_ONLY_WORDS[act], href: null, linkSays: null }
}

/**
 * A route's refusal read as a line: the gate's refusal carries its href
 * (code OWNER_NOT_VERIFIED, `gateRefusal` in lib/owner-proof), and the
 * screen draws the link under the sentence.
 */
export function refusalLine(err: { message?: string | null; href?: string | null; code?: string | null } | null | undefined): OwnerLine | null {
  if (!err?.message) return null
  const href = err.href ?? (err.code === 'OWNER_NOT_VERIFIED' ? PROVE_OWNERSHIP_HREF : null)
  return { says: err.message, href, linkSays: href === PROVE_OWNERSHIP_HREF ? 'Prove ownership' : href ? 'Open it' : null }
}
