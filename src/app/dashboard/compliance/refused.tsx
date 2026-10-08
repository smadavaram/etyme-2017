/**
 * The compliance page for a reader the route refused.
 *
 * A heading and the route's own sentence — which names the desks that
 * do read it — and nothing else. No figures, because a zero is an
 * answer the page has not got; no tabs, because each would open onto
 * the same refusal; no subtitle naming the program, because the reader
 * was not shown whose it is.
 */
/** `section` is the page's section on the reader's own menu, read by
 * the page with `usePageSection`; nothing is drawn while it is null. */
export function ComplianceRefused({ says, section = null }: { says: string; section?: string | null }) {
  return (
    <>
      <div className="page-head">
        {section && <p className="eyebrow">{section}</p>}
        <h1>Compliance overview</h1>
      </div>
      <div className="panel" role="status">
        <p className="text-[13px] text-etyme-ink">{says}</p>
      </div>
    </>
  )
}
