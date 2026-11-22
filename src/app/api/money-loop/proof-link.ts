import { prisma } from '@/lib/db'
import { CHAIN_RECORD } from '@/lib/money/money-chain'
import { LOOP_HREF, mayReadLoop, monthKeyOf, placementHref, readMonth } from '@/lib/money-loop'

/**
 * A dispute's proof link, as the decision's page draws it (record 107, B1
 * to A3): the consultant and the month, opening that placement's month. A
 * seat that does not read payroll reads no name, and the link opens the
 * page that says so in a sentence.
 */
export const isChainProof = (recordType: string) => recordType === CHAIN_RECORD

export async function chainProofLink(companyId: string, permissions: readonly string[], chainId: string) {
  const c = mayReadLoop(permissions)
    ? await prisma.moneyChain.findFirst({ where: { id: chainId, companyId }, select: { sellContractId: true, periodStart: true, person: { select: { name: true } } } })
    : null
  const month = c ? readMonth(monthKeyOf(c.periodStart)) : null
  return {
    recordType: CHAIN_RECORD, recordId: chainId, label: 'A consultant’s month',
    name: c && month ? `${c.person.name}, ${month.words}` : null,
    href: c && month ? placementHref(c.sellContractId, month.key) : LOOP_HREF,
  }
}
