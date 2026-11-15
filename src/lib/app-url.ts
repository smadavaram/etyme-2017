/**
 * The one base address every mailed link is built from, every link Etyme
 * offers to copy, and the target of the middleware's redirect from a
 * firm's address to the app (fault 4, 2026-11-12). A session cookie lives
 * on one host only, so every way back into the app goes to this one;
 * production holds https://www.etyme.com in NEXTAUTH_URL.
 *
 * NEXTAUTH_URL first, because it is the address sign-in already uses,
 * so a link and the sign-in it leads to agree. Then NEXT_PUBLIC_APP_URL,
 * then, on production, the project's production address, then Vercel's
 * per-deploy address, then localhost. Reading VERCEL_URL
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
  return (fixedAppUrl() || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') || 'http://localhost:3000').replace(/\/+$/, '')
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
