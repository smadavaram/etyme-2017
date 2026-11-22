import Link from 'next/link'

/**
 * Rows of the record ledger (record 107, A3 to A6): when, what, the entity
 * acted for, the person or agent, and the role she held. A table from a
 * small tablet up; at phone width each row stacks as lines, so no column
 * is cut off and nothing scrolls sideways.
 */
export interface LedgerRow {
  id: string
  at: string
  summary: string
  href?: string | null
  entityName: string | null
  by: string
  heldAs: string
}

/** The moment of an act, with its time: "Nov 21, 2026, 3:04 PM". */
export function ledgerWhen(at: string): string {
  return new Date(at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
}

function What({ r }: { r: LedgerRow }) {
  return r.href ? <Link href={r.href as any} className="text-etyme-action hover:underline">{r.summary}</Link> : <>{r.summary}</>
}

export function LedgerRows({ rows }: { rows: readonly LedgerRow[] }) {
  return (
    <>
      <table className="hidden sm:table w-full text-[13px] tabular-nums">
        <thead>
          <tr className="text-left text-[12px] text-etyme-muted border-b border-etyme-rule">
            <th className="py-2 pr-3 font-normal">Time</th>
            <th className="py-2 pr-3 font-normal">Action</th>
            <th className="py-2 pr-3 font-normal">Entity</th>
            <th className="py-2 pr-3 font-normal">Person or agent</th>
            <th className="py-2 font-normal">Role held</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-etyme-rule last:border-0 align-top">
              <td className="py-2 pr-3 whitespace-nowrap">{ledgerWhen(r.at)}</td>
              <td className="py-2 pr-3"><What r={r} /></td>
              <td className="py-2 pr-3">{r.entityName ?? '—'}</td>
              <td className="py-2 pr-3">{r.by}</td>
              <td className="py-2">{r.heldAs}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="sm:hidden text-[13px]">
        {rows.map((r) => (
          <li key={r.id} className="py-2 border-b border-etyme-rule last:border-0">
            <p className="text-etyme-ink"><What r={r} /></p>
            <p className="text-etyme-muted tabular-nums">{ledgerWhen(r.at)}</p>
            <p className="text-etyme-muted">{r.by} · {r.heldAs}{r.entityName ? ` · for ${r.entityName}` : ''}</p>
          </li>
        ))}
      </ul>
    </>
  )
}
