'use client'

import { useState } from 'react'
import { REPAIR_BUTTON, windowRepairBody } from '@/lib/money/window-repair-body'

/**
 * The one act a week held after its pay window ended waits on: "Repair
 * the pay window", on the held row, for a seat that runs payroll. Posts to
 * POST /api/payroll/window-repair (lib/money/window-repair). Done, it hands the
 * sentence (where the window now runs) to the page and reloads it, so the held week reads
 * as owed in this pay. Refused, it shows the route's own sentence.
 */
export function WindowRepair({
  target,
  onSaved,
}: {
  target: { sellContractId: string; buyContractId: string; personId: string }
  /** Called with the route's own sentence; the page keeps it, because this row stops being held. */
  onSaved: (says: string) => void
}) {
  const [saving, setSaving] = useState(false)
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
      onSaved(body.data?.says ?? 'The pay window was moved.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <span className="mt-1 block">
      <button type="button" className="btn-secondary !px-2 !py-1 !text-[11.5px]" disabled={saving} onClick={repair}>
        {saving ? 'Repairing…' : REPAIR_BUTTON}
      </button>
      {refused && <span className="mt-1 block text-etyme-danger">{refused}</span>}
    </span>
  )
}
