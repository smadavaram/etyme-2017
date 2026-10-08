/**
 * The time-on-site page for a reader the route refused.
 *
 * A heading and the route's own sentence — which names the desk that
 * does read it — and nothing else. No figures, because a zero is an
 * answer the page has not got; no table, no search, no subtitle naming
 * the client, because the reader was not shown whose it is.
 */
export function TenureRefused({ says }: { says: string }) {
  return (
    <>
      <div className="page-head">
        <p className="eyebrow">Governance</p>
        <h1>Time on site</h1>
      </div>
      <div className="panel" role="status">
        <p className="text-[13px] text-etyme-ink">{says}</p>
      </div>
    </>
  )
}
