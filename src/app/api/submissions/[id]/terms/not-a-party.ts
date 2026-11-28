/**
 * The refusal a stranger to a person's terms reads. Pure.
 *
 * Round five, problem 8: the terms page told Mo, a Member at Northbend
 * with no business on the submission, "These are the terms between
 * Helena Marsh and the firm that holds them." A seat refused every
 * submission still learned who was submitted. The person is named only
 * where the reader's company already knows them (`nameIfKnown`); the
 * firm is never named, because which firm holds a person is itself what
 * the refusal protects.
 */
export function notAPartySays(knownName: string | null | undefined): string {
  const who = knownName?.trim() ? knownName.trim() : 'a person'
  return `These are the terms between ${who} and the firm that holds them. Only those two can read them.`
}
