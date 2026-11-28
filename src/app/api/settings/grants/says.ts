/**
 * The sentence a grant is confirmed in, and written to the activity log in
 * (fix list, 2026-11-15). Give access lists invited people on purpose, so
 * access can be set up before somebody's first day. But "Saved. Dana may
 * now approve timesheets" read as if Dana could do it today, while Dana
 * has never signed in. For somebody invited and not signed in yet, the
 * sentence says when it starts, and with which address. Pure.
 */
export interface GrantSaid {
  /** "Dana Whitlock", or "Everybody in Recruiter". */
  holderName: string
  /** What the grant lets them do, in the catalog's words. */
  doWhat: string
  /** Where: "for the whole company", "for Denver and every team under it". */
  scopeWords: string
  /** The address an invited person signs in with; null for a role, or for somebody who has signed in. */
  invitedAs?: string | null
  /** True for a person invited and never signed in, even where no address is kept. */
  invited?: boolean
}

export function grantSaid(g: GrantSaid): string {
  const what = `${g.doWhat} ${g.scopeWords}`.trim()
  if (!g.invited) return `${g.holderName} may now ${what}.`
  return g.invitedAs
    ? `${g.holderName} may ${what} once they sign in with ${g.invitedAs}.`
    : `${g.holderName} may ${what} once they sign in.`
}
