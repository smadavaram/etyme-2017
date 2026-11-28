/**
 * Who may open a placement line at all (record 119).
 *
 * The firm that sells the line and the firm that buys it. The site the
 * work is done at, named on the line as its end client, is a party only to
 * the line it pays: where another firm is the buyer, the line is a deal
 * between two other firms, and the end client is refused it, shaped as
 * not found.
 */
export function mayOpenLine(
  mine: string,
  line: { companyId: string; clientCompanyId: string }
): boolean {
  return line.companyId === mine || line.clientCompanyId === mine
}
