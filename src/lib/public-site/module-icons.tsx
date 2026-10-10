/**
 * One icon per part of the product, for the home page's eight tiles.
 *
 * Copied from the brand kit's icon set (`git show
 * deploy/main:brand-kit/icons.svg`) path for path: a 24-unit grid, a 1.8
 * stroke, round caps and joins, drawn in currentColor so the tile decides
 * the color. Inlined rather than referenced by `<use href>` because the
 * kit is not checked into this branch, and a sprite that 404s draws
 * nothing without an error.
 *
 * The tiles carry no screenshots, on a CRO's review ("too many screens"),
 * so an icon is the only picture in the band. Each is decorative: the
 * tile's name says what it is, and the icon is hidden from a screen
 * reader.
 */

/** Kit symbol id → its path data, for the eight the tiles use. */
const KIT: Record<string, string[]> = {
  'i-requisition': ['M5 6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z', 'M9 4V3h6v1M9 10h6M9 14h6'],
  'i-list': ['M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01'],
  'i-contract': ['M7 3h7l4 4v14H7z', 'M14 3v4h4M10 13l2 2 4-4'],
  'i-timesheet': ['M12 3.5a8.5 8.5 0 1 1 0 17a8.5 8.5 0 1 1 0-17z', 'M12 7.5V12l3 2'],
  'i-invoice': ['M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21z', 'M9 8h6M9 12h6M9 16h4'],
  'i-compliance': ['M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z', 'M9 12l2 2 4-4'],
  'i-network': [
    'M5 3.8a2.2 2.2 0 1 1 0 4.4a2.2 2.2 0 1 1 0-4.4z',
    'M19 3.8a2.2 2.2 0 1 1 0 4.4a2.2 2.2 0 1 1 0-4.4z',
    'M12 15.8a2.2 2.2 0 1 1 0 4.4a2.2 2.2 0 1 1 0-4.4z',
    'M7 7l4 9M17 7l-4 9M7.2 6h9.6',
  ],
  'i-shield': ['M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z'],
}

/** Which kit icon stands for which part, by the part's route. */
export const MODULE_ICON: Record<string, keyof typeof KIT> = {
  '/requisitions': 'i-requisition',
  '/submissions': 'i-list',
  '/contracts': 'i-contract',
  '/timesheets': 'i-timesheet',
  '/invoices': 'i-invoice',
  '/compliance': 'i-compliance',
  '/chain': 'i-network',
  '/governance': 'i-shield',
}

/** The kit's icon for one part of the product, or nothing if it has none. */
export function ModuleIcon({ href, className }: { href: string; className?: string }) {
  const id = MODULE_ICON[href]
  if (!id) return null
  return (
    <svg
      viewBox="0 0 24 24"
      width={20}
      height={20}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {KIT[id].map((d) => <path key={d} d={d} />)}
    </svg>
  )
}
