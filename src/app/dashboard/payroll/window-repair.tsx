'use client'

import { useState } from 'react'
import { REPAIR_BUTTON, windowRepairBody } from '@/lib/money/window-repair-body'

/**
 * The one act a week held after its pay window ended waits on: "Repair
 * the pay window", on the held row, for a seat that runs payroll. Posts to
 * POST /api/payroll/window-repair (lib/money/window-repair). Done, it says
 * where the window now runs and reloads the page, so the held week reads
 * as owed in this pay. Refused, it shows the route's own sentence.
 */
export function WindowRepair({
  target,
  onSaved,
}: {
  target: { sellContractId: string; buyContractId: string; personId: string }
  onSaved: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [said, setSaid] = useState<string | null>(null)
  const [refused, setRefused] = useState<string | null>(null)

  async function repair() {
    setSaving(true)
    setRefused(null)
    try {
      const res = await fetch('/api/payroll/window-repair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(windowRepairBody(target)),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setRefused(body.error?.message ?? 'The pay window was not moved. Try again.')
        return
      }
      setSaid(body.data?.says ?? 'The pay window was moved.')
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  if (said) return <span className="mt-1 block text-etyme-verified">{said}</span>
  return (
    <span className="mt-1 block">
      <button type="button" className="btn-secondary !px-2 !py-1 !text-[11.5px]" disabled={saving} onClick={repair}>
        {saving ? 'Repairing…' : REPAIR_BUTTON}
      </button>
      {refused && <span className="mt-1 block text-etyme-danger">{refused}</span>}
    </span>
  )
}
