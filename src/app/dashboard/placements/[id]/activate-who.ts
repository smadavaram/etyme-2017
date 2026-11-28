/**
 * Who starts this placement, said in the checklist's own line.
 *
 * The placement page's line "Get an I-9 and E-Verify on file, then
 * activate" named an act to a seat that may not do it. Money is adding
 * `who` (the roles that may activate, at that kind of firm) to
 * GET /api/contracts/:id/activate. Where the answer carries it, the line
 * reads "…then HR activates"; where it does not yet, the line is drawn as
 * it is, so the page is right whichever lands first.
 */

/** The route's `who`, as a list of role names, or null where it said none. */
export function whoFrom(answer: unknown): string[] | null {
  const who = answer && typeof answer === 'object' ? (answer as { who?: unknown }).who : undefined
  if (typeof who === 'string') return who.trim() ? [who.trim()] : null
  if (Array.isArray(who)) {
    const names = who
      .map((w) => (typeof w === 'string' ? w : w && typeof w === 'object' ? (w as { name?: unknown }).name : null))
      .filter((w): w is string => typeof w === 'string' && w.trim().length > 0)
      .map((w) => w.trim())
    return names.length > 0 ? names : null
  }
  return null
}

/** "HR", "the Owner": an acronym takes no article, a role name takes "the". */
function role(name: string): string {
  if (/^the\s/i.test(name)) return name
  return /^[A-Z&]{2,}$/.test(name) ? name : `the ${name}`
}

function either(names: string[]): string {
  const said = names.map(role)
  if (said.length === 1) return said[0]
  return `${said.slice(0, -1).join(', ')} or ${said[said.length - 1]}`
}

/**
 * The checklist's fix with who activates in it. A fix that does not end on
 * "then activate." is returned as it is, and so is any fix where `who` is
 * absent.
 */
export function fixWithWho(fix: string | null, who: string[] | null): string | null {
  if (!fix || !who || who.length === 0) return fix
  const m = fix.match(/^([\s\S]*\bthen )activate\.$/)
  if (!m) return fix
  return `${m[1]}${either(who)} activates.`
}
