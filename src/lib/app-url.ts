/**
 * The one base address every mailed link is built from, every link Etyme
 * offers to copy, and the target of the middleware's redirect from a
 * firm's address to the app (fault 4, 2026-11-12). A session cookie lives
 * on one host only, so every way back into the app goes to this one;
 * production holds https://www.etyme.com in NEXTAUTH_URL.
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
  // The production alias is not read here, on purpose (2026-11-15). A
  // mailed link and the middleware's redirect must land on the host the
  // sign-in cookie lives on, and with NEXTAUTH_URL unset that is the
  // host the request came to. Only the SCIM address reads the alias,
  // through fixedAppUrl below.
  const pick =
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
    'http://localhost:3000'
  return pick.replace(/\/+$/, '')
}

/**
 * The address a MAILED or COPIED link is built from (founder, 2026-11-18:
 * an invitation's links pointed at a one-off deployment address behind
 * the host's protection, which also dies at the next deploy). Never the
 * per-deploy address where a lasting one exists: NEXTAUTH_URL, then
 * NEXT_PUBLIC_APP_URL, then on the production deployment the project's
 * production address, and only then, for a preview, its own address.
 * appUrl() above is unchanged and stays the middleware's reader.
 */
export function mailedUrl(): string {
  return fixedAppUrl() ?? appUrl()
}

/**
 * Like mailedUrl(), but empty where nothing says where this deployment
 * lives (so a caller sends no link rather than one to localhost).
 */
export function mailedBase(): string {
  const said = fixedAppUrl() || process.env.VERCEL_URL
  return said ? mailedUrl() : ''
}

/**
 * The deployment's lasting public address, or null where it has none.
 * NEXTAUTH_URL, then NEXT_PUBLIC_APP_URL, then, on the production
 * deployment only, the project's production address Vercel provides
 * (VERCEL_PROJECT_PRODUCTION_URL). A preview's own one-off address and
 * localhost are never lasting, so they are not returned here.
 *
 * Settings → Sign-in builds its SCIM address from this (fix list G2,
 * 2026-11-15): the tester was shown a preview's address, which a
 * directory would stop reaching at the next deploy. Where this is null
 * the page says so in a sentence instead of printing an address.
 */
export function fixedAppUrl(): string | null {
  const production =
    process.env.VERCEL_ENV === 'production' && process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : ''
  const pick = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || production
  return pick ? pick.replace(/\/+$/, '') : null
}
