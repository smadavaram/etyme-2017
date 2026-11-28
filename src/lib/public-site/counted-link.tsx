'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { count } from './count'
import type { MarketEvent } from './market-events'

/** A plain link that counts its click (see `./count`). Nothing else changes. */
export function CountedLink({
  href, event, className, children,
}: { href: string; event: MarketEvent; className?: string; children: React.ReactNode }) {
  return (
    <Link href={href as Route} className={className} onClick={() => count(event)}>
      {children}
    </Link>
  )
}
