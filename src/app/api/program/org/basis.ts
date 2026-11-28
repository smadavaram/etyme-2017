/**
 * The sentence under the org view's figures: what they are annualized
 * from, and over how many people.
 *
 * Round three of the sign-up walk (2026-10-08, #19) read "Annualised …
 * across 0 of 0 live contractor(s)" on a new client's page. Two faults:
 * the British spelling, and a count that is a code rather than a
 * sentence. With nobody on site there is nothing to annualize, and the
 * page says that instead of dividing nothing by nothing.
 */

function contractors(n: number): string {
  return `${n} live contractor${n === 1 ? '' : 's'}`
}

export function orgBasis(args: {
  clientName: string
  hoursPerMonth: number
  /** People on site whose top contract this client pays and can price. */
  priced: number
  /** Everybody on site, priced or not. */
  headcount: number
}): string {
  const { clientName, hoursPerMonth, priced, headcount } = args
  if (headcount === 0) {
    return `No contractors are on site at ${clientName} yet, so there is nothing to annualize. ` +
      `Spend and rate variance appear here once a placement starts.`
  }
  const unpriced = headcount - priced
  const across = priced === headcount
    ? headcount === 1 ? 'the one live contractor on site' : `all ${contractors(headcount)} on site`
    : `${priced} of the ${contractors(headcount)} on site`
  return (
    `Annualized from the rates ${clientName} is itself billed, at ${hoursPerMonth} hours a month, across ${across}. ` +
    (unpriced > 0
      ? `${unpriced} ${unpriced === 1 ? 'is' : 'are'} on site through a supplier chain whose top contract is not live here, ` +
        `so ${unpriced === 1 ? 'that person is' : 'those people are'} counted in the headcount and carry no rate — ` +
        `what a supplier pays its own supplier is not this client's price. `
      : '') +
    `Somebody bought through a chain is counted once, at the contract ${clientName} pays. ` +
    `Rate variance is the difference between what a contractor is billed at and the median for that skill; ` +
    `each person is counted once even when they appear under several skills. It is an opportunity, not a committed saving.`
  )
}
