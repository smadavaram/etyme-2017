'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Chip } from '@/components/ui'
import { useSession } from '@/components/session-provider'
import {
  mayChangePaperSet,
  paperSetHref,
  paperSetQuery,
  paperSetSays,
  paperStanding,
  type PaperSetTarget,
} from '@/lib/money/paper-set'

/**
 * What an order, or one line on it, asks for on paper — read-only.
 *
 * Screen walk, 2026-10-22: a client could not reach its own order's
 * paper set from anywhere. This shows it where the order already is —
 * the purchase orders page and the contracts drawer — through the one
 * door every other reader uses (GET /api/documents/requirements), so the
 * list here and the verdict at the start cannot disagree.
 *
 * Nothing here changes the set. A desk that may change it is offered a
 * link to the document-set page; everybody else reads, and is told
 * nothing they cannot act on.
 */

interface Item {
  key: string
  label: string
  required: boolean
  owedBy: string
  owedByName: string | null
  blocks: boolean
  waived: boolean
  waivedSays: string | null
  waiverRefused: boolean
  from: 'DEFAULT' | 'ORDER' | 'LINE'
}

const OWED_BY_WORD: Record<string, string> = {
  WORKER: 'the worker',
  SUPPLIER: 'the supplier',
  CUSTOMER: 'the customer',
  US: 'us',
}

const TONE = {
  'Waiver refused': 'danger',
  Waived: 'passive',
  'Stops work': 'danger',
  Required: 'attention',
  Optional: 'passive',
} as const

export function PaperSet({
  target,
  buyerCompanyId,
  title,
  startOpen = false,
}: {
  target: PaperSetTarget
  /** The firm whose rules these are: the order's issuer, or the line's buyer. */
  buyerCompanyId: string | null
  /** What the toggle says: "Papers this order asks for". */
  title: string
  startOpen?: boolean
}) {
  const session = useSession()
  const [open, setOpen] = useState(startOpen)
  const [items, setItems] = useState<Item[] | null>(null)
  const [refused, setRefused] = useState<string | null>(null)
  const query = paperSetQuery(target)
  const onOrder = 'workOrderId' in target

  useEffect(() => {
    if (!open || items || refused) return
    let live = true
    fetch(`/api/documents/requirements?${query}`)
      .then(async (r) => {
        const body = await r.json().catch(() => null)
        if (!live) return
        // The route's own sentence, never a code: a stranger is told
        // there is nothing here, a supplier reads its customer's set.
        if (!r.ok) setRefused(body?.error?.message ?? 'This document set could not be read.')
        else setItems((body?.data?.items ?? []) as Item[])
      })
      .catch(() => { if (live) setRefused('Network error. Please try again.') })
    return () => { live = false }
  }, [open, items, refused, query])

  const mayChange = buyerCompanyId
    ? mayChangePaperSet({
        viewerCompanyId: session.company?.id ?? null,
        buyerCompanyId,
        permissions: session.permissions,
        seat: session.seat,
      })
    : false

  return (
    <div className="mt-3 border-t border-etyme-rule pt-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="text-[12px] text-etyme-action hover:underline"
      >
        {open ? '▾' : '▸'} {title}
      </button>

      {open && (
        <div className="mt-2">
          {refused ? (
            <p className="text-[12px] text-etyme-muted" role="status">{refused}</p>
          ) : !items ? (
            <p className="text-[12px] text-etyme-faint">Reading the set…</p>
          ) : (
            <>
              <p className="text-[12px] text-etyme-muted">
                {paperSetSays({ count: items.length, onOrder })}
              </p>
              {items.length > 0 && (
                <ul className="mt-1.5 space-y-1.5">
                  {items.map((i) => {
                    const standing = paperStanding(i)
                    const owed = i.owedByName ?? OWED_BY_WORD[i.owedBy] ?? null
                    return (
                      <li key={i.key} className="flex items-baseline justify-between gap-3">
                        <span className="text-[13px] text-etyme-ink">
                          {i.label.charAt(0).toUpperCase() + i.label.slice(1)}
                          {owed && <span className="text-[11px] text-etyme-muted ml-2">owed by {owed}</span>}
                          {i.waived && i.waivedSays && (
                            <span className="block text-[11px] text-etyme-muted">{i.waivedSays}</span>
                          )}
                        </span>
                        <Chip tone={TONE[standing]}>{standing}</Chip>
                      </li>
                    )
                  })}
                </ul>
              )}
              {mayChange && (
                <Link href={paperSetHref(target) as any} className="inline-block mt-2 text-[12px] text-etyme-action underline">
                  Change what it asks for
                </Link>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

