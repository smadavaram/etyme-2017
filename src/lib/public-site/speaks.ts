/**
 * Whether a company may have a public page at all.
 *
 * A firm can arrive on the record two ways: somebody there signed up, or
 * another firm wrote it down as a counterparty (a supplier listing the
 * client it already works for, a client listing its suppliers). The
 * second kind never chose to be here. A public page under its name — a
 * tagline, an introduction, "on Etyme since" — would be Etyme speaking
 * for a company that has not agreed, which is the one thing a public
 * page may never do.
 *
 * So a page is served only where somebody at the firm took possession of
 * it (`claimedAt`) or holds a seat there. A firm on somebody else's
 * register is that firm's own record until it joins, and has no page.
 *
 * The seat count stands beside `claimedAt` on purpose: a company made by
 * sign-up is seated at once and is not stamped as claimed, so the stamp
 * alone would take every signed-up firm's page down.
 */
export function speaksForItself(company: {
  siteLiveAt: Date | null
  claimedAt: Date | null
  /** Seats at the firm that hold a role — staff, not a worker the firm employs. */
  seats: number
}): boolean {
  if (!company.siteLiveAt) return false
  return company.claimedAt != null || company.seats > 0
}
