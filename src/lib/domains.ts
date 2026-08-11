/**
 * Domain detection — routes users to the right population.
 *
 * CLAUDE.md: "if the OAuth domain is gmail.com, yahoo.com, outlook.com,
 * hotmail.com, or any known consumer provider → candidate, not company admin.
 * The OAuth tenant is the authority — replaces the 2017 EXCLUDED_DOMAINS check."
 *
 * Two populations:
 *   Business users → Microsoft/Google Workspace → Teams notifications
 *   Candidates     → Gmail/Yahoo/magic link    → email notifications
 */

const CONSUMER_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.in',
  'yahoo.co.uk',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'msn.com',
  'aol.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'mail.com',
  'protonmail.com',
  'proton.me',
  'zoho.com',
  'yandex.com',
  'rediffmail.com',
  'facebook.com',
  'qq.com',
  '163.com',
  'naver.com',
])

export type UserPopulation = 'business' | 'candidate'

export type NotificationChannel = 'teams' | 'email'

/**
 * Determine the user population from their email domain.
 * Consumer email → candidate. Corporate domain → business user.
 */
export function detectPopulation(email: string): UserPopulation {
  const domain = extractDomain(email)
  if (!domain || CONSUMER_DOMAINS.has(domain)) return 'candidate'
  return 'business'
}

/**
 * Get the notification channel for a user population.
 * Business users → Teams. Candidates → email.
 */
export function notificationChannel(population: UserPopulation): NotificationChannel {
  return population === 'business' ? 'teams' : 'email'
}

/**
 * Check if an email domain can register a company.
 * Only corporate domains can register companies.
 * Consumer domains are routed to the candidate experience.
 */
export function canRegisterCompany(email: string): boolean {
  return detectPopulation(email) === 'business'
}

/**
 * Extract the domain from an email address, lowercased.
 */
export function extractDomain(email: string): string | null {
  const parts = email.split('@')
  if (parts.length !== 2) return null
  return parts[1].toLowerCase()
}

/**
 * Check if a domain is a known consumer email provider.
 */
export function isConsumerDomain(domain: string): boolean {
  return CONSUMER_DOMAINS.has(domain.toLowerCase())
}
