/**
 * What is true of SAML today, said in one place for the sign-in refusal
 * (lib/identity/directory) and the Sign-in screen. No database here, so a
 * browser page may import it. A directory saved as SAML is stored, and
 * sign-in through it is refused; nothing here says "on".
 */
export const SAML_NOT_BUILT = 'Sign-in through a SAML directory is set up and stored, and not built yet in this pass. Use an OpenID Connect directory, or sign in another way your company allows.'
/** The panel's state word for a stored SAML directory, where an OIDC one reads On or Off. */
export const SAML_STATE = 'Stored, not built yet'
