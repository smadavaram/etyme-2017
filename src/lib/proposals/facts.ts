/** What the firm's own record says, for the proposals agent (record 124): the real client over the one reader. */
import { prisma } from '@/lib/db'
import { readProposalFacts } from './facts-read'
import type { ProposalFacts } from './draft-rules'

export const proposalFacts = (companyId: string): Promise<ProposalFacts> => readProposalFacts(prisma as never, companyId)
