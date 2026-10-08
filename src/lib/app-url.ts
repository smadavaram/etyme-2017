/**
 * The one base address every mailed link is built from.
 *
 * NEXTAUTH_URL first, because it is the address sign-in already uses,
 * so a link and the sign-in it leads to agree. Then NEXT_PUBLIC_APP_URL,
 * then Vercel's per-deploy address, then localhost. Reading VERCEL_URL
 * first sent supplier links to a one-off deploy address that stops
 * working at the next deploy.
 *
 * Its own file, with no server-only import, because a screen reaches it
 * too (the privacy page, through lib/data-request). It lived in
 * lib/supplier-link beside a token minted with node:crypto, and that
 * import broke the client bundle; lib/supplier-link re-exports it so
 * every existing import keeps working.
 */
export function appUrl(): string {
  const pick =
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
    'http://localhost:3000'
  return pick.replace(/\/+$/, '')
}
