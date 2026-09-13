import { NextRequest, NextResponse } from 'next/server'
import { getCallerContext } from '@/lib/api-context'
import { prisma } from '@/lib/db'
import { statusWord } from '@/lib/document-request'

/**
 * GET /api/me/papers — the documents asked of me, by whom, and what each needs.
 *
 * A consultant's own view: their W-9 for Pinnacle, the NDA Nike wants
 * signed. Never another person's, and nothing about what the companies
 * say to each other. Answered from the same page with
 * /api/documents/:id/upload and /sign.
 */
export async function GET(request: NextRequest) {
  const { caller, error } = await getCallerContext(request)
  if (error) return error
  const me = caller.person.id

  const rows = await prisma.docInstance.findMany({
    where: {
      OR: [
        { subjectType: 'PERSON', subjectId: me },
        { sellContract: { personId: me } },
        { buyContract: { candidates: { some: { personId: me, state: 'ACTIVE' } } } },
      ],
    },
    include: { template: { select: { name: true, needsSignature: true, company: { select: { name: true } } } } },
    orderBy: [{ sentAt: { sort: 'desc', nulls: 'last' } }],
  })

  return NextResponse.json({
    data: {
      papers: rows
        // Not asked yet is the company's business, not the person's.
        .filter((r) => r.status !== 'PENDING')
        .map((r) => ({
          id: r.id,
          name: r.template.name,
          askedBy: r.template.company.name,
          needsSignature: r.template.needsSignature,
          status: r.status,
          word: statusWord(r.status),
          askedAt: r.sentAt?.toISOString() ?? null,
          doneAt: r.signedAt?.toISOString() ?? null,
          /** What is theirs to do, in a word: sign, upload, or nothing. */
          todo: r.status === 'SENT' ? (r.template.needsSignature ? 'sign' : 'upload') : null,
        })),
    },
  })
}
