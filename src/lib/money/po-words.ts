import { orderNoun, type OrderSide } from '@/lib/order-naming'

/**
 * What the orders page says over its rows, from the end the reader stands at.
 *
 * Sign-up walk, round four, problem 9. A one-person nursing corporation
 * opened the page and read "What you have authorized … what a supplier
 * may invoice you in total … every supplier invoice will fail its
 * check." She has no supplier. The order her client sends her is her
 * sales order, and a staffing supplier read the same buyer-only page.
 *
 * `lib/order-naming` already decides what each reader calls the
 * document — purchase order to the buyer, sales order to the seller —
 * and this follows the same rule one level up: the heading, the line
 * under it and the empty state speak as the buyer, the seller, the
 * one-person firm, or a firm that is both (a prime buys from a
 * sub-vendor and sells to the client in the same week).
 *
 * The stance is read off the orders on screen first, because a firm's
 * kind says what it usually is and the rows say what it is today; with
 * no rows yet it falls back on the kind. A program office reading a
 * client's orders from the client's seat reads them as the buyer.
 *
 * Pure: no React, no database.
 */

export type OrdersStance = 'BUYER' | 'SELLER' | 'SOLO' | 'BOTH'

export function ordersStance(args: {
  kind: string | null | undefined
  /** The reader's end of each order on screen. */
  sides: readonly OrderSide[]
  /** True where the page reads a client's orders from a seat the client granted. */
  inASeat?: boolean
}): OrdersStance {
  if (args.inASeat) return 'BUYER'
  const solo = args.kind === 'CONSULTANT_CORP'
  const buys = args.sides.includes('BUYER')
  const sells = args.sides.includes('SELLER')
  if (buys && sells) return 'BOTH'
  if (sells) return solo ? 'SOLO' : 'SELLER'
  if (buys) return 'BUYER'
  if (args.kind === 'CLIENT') return 'BUYER'
  if (solo) return 'SOLO'
  return 'BOTH'
}

export interface OrdersWords {
  title: string
  subtitle: string
  empty: string
}

const LINES = 'Each line is one person, at one rate, at one site.'

export function ordersWords(stance: OrdersStance): OrdersWords {
  const po = orderNoun('BUYER').noun
  const so = orderNoun('SELLER').noun
  switch (stance) {
    case 'BUYER':
      return {
        title: 'What you have authorized',
        subtitle:
          'One document, a header and its lines. The header is the ceiling — what a supplier may ' +
          'invoice you in total, and an invoice that quotes an exhausted one will not match. ' + LINES,
        empty:
          `No ${po}s. If your accounts-payable policy requires one, every supplier invoice will ` +
          'fail its check until there is something to quote.',
      }
    case 'SELLER':
      return {
        title: 'What your customers have agreed',
        subtitle:
          `Your ${so}s. One document, a header and its lines. The header is the ceiling — what your ` +
          'customer agreed you may bill in total, and a bill past it will not match on their side. ' + LINES,
        empty:
          `No ${so}s yet. One appears when a customer sends you its order, or when a placement you ` +
          'record names one.',
      }
    case 'SOLO':
      return {
        title: 'What your customers have agreed',
        subtitle:
          `Your own ${so}s — the orders your customers sent you for your work. The header is the ` +
          'ceiling: what your customer agreed you may bill in total, and a bill past it will not ' +
          'match on their side. Each line is you, at one rate, at one site.',
        empty:
          `No ${so}s yet. One appears when a customer sends you its order for your work, or when ` +
          'you record a contract that names one.',
      }
    case 'BOTH':
      return {
        title: 'Your orders',
        subtitle:
          `Two kinds on one list. A ${so} is what your customer agreed you may bill; a ${po} is ` +
          'what you have authorized a supplier to invoice you. Each is one document, a header and ' +
          'its lines: the header is the ceiling, and ' + LINES.charAt(0).toLowerCase() + LINES.slice(1),
        empty:
          `No orders yet. A ${so} appears when a customer sends you its order; a ${po} when you ` +
          'raise one to a supplier.',
      }
  }
}
