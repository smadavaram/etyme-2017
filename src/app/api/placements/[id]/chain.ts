/**
 * What the placement says about the chain below the reader (station 5).
 * Pure, so a test holds it without the route.
 *
 * Found by money, 2026-11-01: the route said a supplier "employs them
 * directly" wherever its buy line named no vendor, and a firm with no buy
 * line at all named none either, so it read as the employer. An absence
 * of a buy line is not employment: the sentence is money's one sentence
 * for it (`chainUnderSays` in lib/money/rate-words), null where the record
 * claims nothing. A client reads no cost side on the deal, so it gets the
 * count of firms below and nothing about who employs whom.
 */
import { chainUnderSays } from '@/lib/money/rate-words'

export function chainBelow(a: {
  isSupplier: boolean
  firmName: string
  personName: string
  /** This firm's own buy line for the person, with the vendor it names; null where it has none. */
  buyLine: { vendorName: string | null } | null
  /** How many firms stand below this contract on the person's chain. */
  below: number
  /** The firm one rung down, by name, where the record has one. */
  firmBelow: string | null
}): { hopsBelow: number; weEmployThem: boolean | null; says: string | null } {
  if (!a.isSupplier) return { hopsBelow: a.below, weEmployThem: null, says: null }
  return {
    hopsBelow: a.below,
    weEmployThem: a.buyLine != null && a.buyLine.vendorName == null && a.below === 0,
    says: chainUnderSays({ firmName: a.firmName, personName: a.personName, buyLine: a.buyLine, firmBelow: a.firmBelow }),
  }
}
