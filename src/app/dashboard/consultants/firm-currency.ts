'use client'

import { useEffect, useState } from 'react'
import { useSession } from '@/components/session-provider'

/**
 * The currency the firm in use pays and bills in (`Company.homeCurrency`),
 * for a form that types a rate: a rate typed at a dong firm is whole dong,
 * at a dollar firm dollars and cents (`minorPerUnit` in lib/money decides
 * the exponent). Read from `/api/me`, the seat whose company is the one in
 * use; dollars until it is read, which is the old behavior and never a
 * second currency.
 */
let cache: Promise<Record<string, string>> | null = null

function currencies(): Promise<Record<string, string>> {
  if (!cache) {
    cache = fetch('/api/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        const out: Record<string, string> = {}
        for (const c of body?.data?.contexts ?? []) {
          if (c?.company?.id && c.company.homeCurrency) out[c.company.id] = c.company.homeCurrency
        }
        return out
      })
      .catch(() => {
        cache = null
        return {}
      })
  }
  return cache
}

export function useFirmCurrency(): string {
  const session = useSession()
  const companyId = session.company?.id ?? null
  const [currency, setCurrency] = useState('USD')
  useEffect(() => {
    let live = true
    if (!companyId) return
    currencies().then((m) => {
      if (live && m[companyId]) setCurrency(m[companyId])
    })
    return () => {
      live = false
    }
  }, [companyId])
  return currency
}
