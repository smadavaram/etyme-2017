/**
 * Which overtime rule a week of work falls under, by the country where the
 * work was done (Owner's decision, docs/decisions/92, answer 4).
 *
 * A W-2 week worked outside the US is paid under the local overtime rules
 * of the country of work. Where Etyme has no rule for that country the
 * week over forty hours is held, never paid on a guess. The country that
 * decides is the week's WORK LOCATION, never the entity country or the pay
 * currency: those are the home employment, and a business-visa trip does
 * not move the work location.
 *
 * Today the US is the only country with a rule here. Every other country
 * reads `known: false`. A country is added to this table only after
 * regulatory confirms its rule with its source (CLAUDE.md, Papers); until
 * then it holds and never pays on a guess.
 *
 * Pure.
 */

export type LocalOvertimeRule = { known: true; rule: 'US_FLSA' } | { known: false }

const isUS = (c: string) => ['US', 'USA'].includes(c.trim().toUpperCase())

/** The rule for the country the work was done in. An unset country is the home employment: the US rule is not asked of it here. */
export function localOvertimeRuleFor(workCountry: string | null | undefined): LocalOvertimeRule {
  if (workCountry && workCountry.trim() && isUS(workCountry)) return { known: true, rule: 'US_FLSA' }
  return { known: false }
}
