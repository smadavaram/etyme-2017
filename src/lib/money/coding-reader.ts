/**
 * Who may read the cost coding on an invoice: a client's codes stay the
 * client's.
 *
 * A client's cost centers, GL accounts, internal orders and project codes
 * belong to the client (CLAUDE.md, "Money"; the schema's note above
 * InternalOrder). A supplier, a firm between and another client never
 * read them. Only the company that pays an invoice receipt reads the
 * codes on it, and a firm seated in that company's program reads them
 * only while acting as it (the caller's books, `booksFor`).
 *
 * The coding route let both parties read it, so the supplier that issued
 * a bill could download the client's cost centers and GL accounts. The
 * decision is here, pure, so the route and its tests read one answer.
 *
 * No database in here, on purpose.
 */

export interface CodingParty {
  id: string
  name?: string | null
}

export type CodingReader =
  /** The company that pays it, or a seat acting as that company. */
  | { kind: 'PAYER' }
  /** The firm that issued it. Told whose the codes are, logged first. */
  | { kind: 'ISSUER'; says: string }
  /** Anybody else: answered exactly as an invoice that does not exist. */
  | { kind: 'STRANGER' }

/**
 * Which of the three the reader is.
 *
 * `readerCompanyId` is the company whose books the request is on: the
 * caller's own firm, or the client whose program a seated firm is acting
 * in. Where nothing says who pays, nobody is the payer.
 */
export function codingReader(input: {
  readerCompanyId: string | null | undefined
  vendor: CodingParty | null
  payer: CodingParty | null
  invoiceNumber: string
}): CodingReader {
  const { readerCompanyId, vendor, payer } = input
  if (!readerCompanyId) return { kind: 'STRANGER' }
  if (payer && readerCompanyId === payer.id) return { kind: 'PAYER' }
  if (vendor && readerCompanyId === vendor.id) {
    return { kind: 'ISSUER', says: codesAreThePayers(input.invoiceNumber, payer?.name ?? null) }
  }
  return { kind: 'STRANGER' }
}

/**
 * The one sentence the issuer reads. It names only the company the
 * issuer billed, which it already deals with, and never the end client
 * on a chain.
 */
export function codesAreThePayers(invoiceNumber: string, payerName: string | null): string {
  const who = payerName?.trim() || 'the company that pays it'
  return (
    `The cost centers and accounts on ${invoiceNumber} belong to ${who}, and only ${who} reads them. ` +
    `Your bill, its lines and its total stay open to you on the bill's page.`
  )
}

/**
 * Whether one line's cost split is the payer's own to read.
 *
 * On a chain the sell line's split names the end client's cost centers,
 * and the payer of a sub-vendor's invoice is the firm between, which
 * never reads them. A split is shown only where every cost center in it
 * is the payer's; otherwise the line reads as not coded, for the payer to
 * code in its own books, and no other company's code or share is shown.
 */
export function splitIsPayers(
  allocations: ReadonlyArray<{ costCenter: { companyId: string } }>,
  payerId: string
): boolean {
  return allocations.length > 0 && allocations.every((a) => a.costCenter.companyId === payerId)
}
