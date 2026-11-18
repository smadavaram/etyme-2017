/**
 * The door a worker's bio reaches the model through (record 96, "the model
 * boundary"). A worker has no company switch of her own: the switch that
 * holds is the one of a firm that has her on an open seat. Where none of
 * her firms has the model on, there is no door and the words are written
 * by rule. What leaves carries no name; what is logged is what left.
 */
import { prisma } from '@/lib/db'
import { modelOnFor, recordModelPrompt } from '@/lib/model-boundary'
import { BIO_PURPOSE, type BioDoor } from '@/lib/consultant-portfolio'

export async function bioDoorFor(personId: string): Promise<BioDoor | undefined> {
  const seats = await prisma.context.findMany({
    where: { personId, companyId: { not: null }, revokedAt: null },
    select: { companyId: true },
    take: 20,
  })
  const companies = [...new Set(seats.map((s) => s.companyId).filter((c): c is string => !!c))]
  let companyId: string | null = null
  for (const c of companies) {
    if (await modelOnFor(c)) { companyId = c; break }
  }
  if (!companyId) return undefined
  const asks = companyId
  return {
    modelOn: () => modelOnFor(asks),
    logPrompt: (p) =>
      recordModelPrompt({
        companyId: asks,
        personId,
        provider: 'anthropic',
        model: p.model,
        maskedPrompt: p.maskedPrompt,
        maskedAnswer: p.maskedAnswer,
        tokensIn: p.tokensIn,
        tokensOut: p.tokensOut,
        purpose: BIO_PURPOSE,
        realValues: p.realValues,
      }),
  }
}
