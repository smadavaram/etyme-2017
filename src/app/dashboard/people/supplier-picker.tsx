'use client'

/**
 * "Pick one of your suppliers", under Ask somebody you know.
 *
 * A firm that may take somebody on is a button. A firm that may not is
 * its name and the sentence why, read from the same rule the `pick`
 * action refuses on (`supplierOptions` in app/api/contractor-invites):
 * never a greyed-out choice with nothing beside it, which is what the
 * founder's tester met when every firm was held back for having no
 * standing set. Where nobody may, the one sentence says what to do.
 */

export interface SupplierChoiceRow {
  companyId: string
  name: string
  offered: boolean
  why: string | null
}

export function SupplierPicker({ personName, choices, says, busy, onPick }: {
  personName: string
  /** Null until the read is back. */
  choices: SupplierChoiceRow[] | null
  says: string | null
  busy: boolean
  onPick: (supplierCompanyId: string) => void
}) {
  if (choices === null) return <p className="text-[12px] text-etyme-muted">Reading your suppliers…</p>
  const offered = choices.filter((c) => c.offered)
  const held = choices.filter((c) => !c.offered)
  return (
    <div className="w-full space-y-1.5" aria-label={`A supplier to take ${personName} on`}>
      {offered.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {offered.map((c) => (
            <button
              key={c.companyId}
              type="button"
              disabled={busy}
              onClick={() => onPick(c.companyId)}
              className="rounded-lg border border-etyme-rule px-3 py-1.5 text-[12px] text-etyme-ink hover:border-etyme-ink disabled:opacity-40"
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
      {offered.length === 0 && says && <p className="text-[12px] text-etyme-attention">{says}</p>}
      {held.length > 0 && (
        <ul className="space-y-0.5">
          {held.map((c) => (
            <li key={c.companyId} className="text-[12px] text-etyme-muted">{c.why}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
