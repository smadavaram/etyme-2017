import { promises as dns } from 'dns'

/**
 * The one outside read "Your domain" makes: the TXT record the company
 * published to prove it owns its domain. Held in an object so a test can
 * answer for DNS without the network.
 */
export const txt = {
  resolve: (name: string): Promise<string[][]> => dns.resolveTxt(name),
}
