/**
 * The compliance page for a reader the route refused.
 *
 * A heading and the route's own sentence — which names the desks that
 * do read it — and nothing else. No figures, because a zero is an
 * answer the page has not got; no tabs, because each would open onto
 * the same refusal; no subtitle naming the program, because the reader
 * was not shown whose it is.
 */
export function ComplianceRefused({ says }: { says: string }) {
  return (
    <>
      <div className="page-head">
        <p className="eyebrow">Governance</p>
        <h1>Compliance overview</h1>
      </div>
      <div className="panel" role="status">
        <p className="text-[13px] text-etyme-ink">{says}</p>
      </div>
    </>
  )
}
