/**
 * Writing the résumé's education lines onto the person's profile.
 *
 * The one write every place that reads a résumé onto a profile calls:
 * the first résumé writes the list, a later one replaces the résumé's
 * lines (`educationAfterResume`), and the person's own corrections stay.
 * A résumé with no education section writes `[]`, never null.
 */

import type { Prisma, PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/db'
import type { EducationLine } from '@/lib/cv-reader'
import { educationAfterResume } from './education'

type Db = PrismaClient | Prisma.TransactionClient

export async function recordResumeEducation(
  profileId: string,
  read: EducationLine[],
  db: Db = prisma
): Promise<void> {
  const profile = await db.consultantProfile.findUnique({
    where: { id: profileId },
    select: { education: true },
  })
  if (!profile) return
  await db.consultantProfile.update({
    where: { id: profileId },
    data: { education: educationAfterResume(profile.education, read) as unknown as Prisma.InputJsonValue },
  })
}
