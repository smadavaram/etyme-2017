/**
 * Which tab the week's approval form opens on (2026-11-14). The worker's
 * page links here with `?mode=EVIDENCE` ("Attach the timesheet the client
 * approved") or `?mode=LINK`, and the page opens on the tab its address
 * names. With no mode, a client not on Etyme approves in its own system,
 * so the page opens on "Attach evidence"; otherwise on "Approve by email".
 * Pure, so the browser page may import it.
 */
export type ApprovalTab = 'LINK' | 'EVIDENCE'

export function firstTab(mode: string | null | undefined, clientOffPlatform: boolean): ApprovalTab {
  const asked = (mode ?? '').trim().toUpperCase()
  if (asked === 'LINK' || asked === 'EVIDENCE') return asked
  return clientOffPlatform ? 'EVIDENCE' : 'LINK'
}

/** The chip on a link that is still open. Never "Link sent" where no email could leave. */
export function waitingWords(emailLeaves: boolean): { label: string; chip: string } {
  return emailLeaves
    ? { label: 'Link sent, waiting', chip: 'chip chip--action' }
    : { label: 'Link not sent', chip: 'chip chip--attention' }
}

/** The line under a link: who asked for it, and whether it went. */
export function linkLine(emailLeaves: boolean, sentBy: string, sentAt: string): string {
  return emailLeaves
    ? `link sent by ${sentBy} on ${sentAt}`
    : `link not sent, because email is not set up here. Asked for by ${sentBy} on ${sentAt}`
}
