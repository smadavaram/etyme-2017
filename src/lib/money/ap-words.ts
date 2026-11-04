/**
 * What the accounts payable page says to send somebody to the invoice
 * receipts, and how it explains itself, in the reader's own words.
 *
 * A client's AP clerk read, on 2026-10-03, "Open Invoices, under 'We
 * owe'" — but her menu says "Invoice receipts", and that page offers no
 * "We owe" switch to a client, because a client only buys and has one
 * side. The same panel explained itself as "days to pay and chain float",
 * which is a treasurer's phrase and not a clerk's.
 *
 * So the link names the menu entry the reader actually has, and the note
 * says what the page is not showing in plain words. No database, no clock.
 */

/** Where the invoice receipts live for this reader, and what to call the link. */
export interface ReceiptsLink {
  href: string
  says: string
}

/**
 * The link to where invoice receipts are paid, read by the AP page and by
 * Ask Etyme's refusal to pay (`neverSays`), so the two cannot disagree.
 *
 * A client — or a program office reading a client's book — has one menu
 * entry for them, "Invoice receipts", and the page opens on what it owes.
 *
 * A supplier, an integrator or an MSP has, since 2026-11-03, a menu link
 * of its own called "Invoice receipts", and it opens the AP page, where
 * every invoice receipt it owes is listed and the typed-in ones are paid.
 * So a firm asked to pay is sent to the page its menu calls Invoice
 * receipts, never to Bills, which is what it issues upward. (Money's call,
 * 2026-11-04; reversible in a sentence by sending it back to
 * `/dashboard/invoices?side=PAYABLE`.)
 *
 * A one-person firm pays nobody below her and has no Invoice receipts
 * link, so she keeps Bills, opened on the payable side.
 */
export function receiptsLink(reader: { companyKind: string | null | undefined; seatedAtClient: boolean }): ReceiptsLink {
  if (reader.companyKind === 'CLIENT' || reader.seatedAtClient) {
    return { href: '/dashboard/invoices', says: 'Open Invoice receipts' }
  }
  if (reader.companyKind === 'VENDOR' || reader.companyKind === 'GSI' || reader.companyKind === 'MSP') {
    return { href: AP_PAGE, says: 'Open Invoice receipts' }
  }
  return { href: '/dashboard/invoices?side=PAYABLE', says: 'Open Bills, at the invoice receipts you owe' }
}

/** The AP page's own address: the page a firm's Invoice receipts link opens. */
export const AP_PAGE = '/dashboard/ap'

/**
 * The note under the list when every invoice receipt came from a supplier
 * on the platform, so no supplier contract carries a keyed-in receipt.
 */
export const RECEIPTS_ONLY_NOTE =
  'How many days you take to pay, and how long your own money covers work before the client pays you, ' +
  'are worked out only from invoice receipts entered against a supplier contract. None here were, ' +
  'so this page shows what you owe and where to pay it, and no figure with nothing behind it.'
