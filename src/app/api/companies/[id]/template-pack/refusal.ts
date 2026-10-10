/**
 * Who may set up a company from a template pack, said in a sentence.
 *
 * It read "You need settings.manage permission on this company" — a
 * permission key, which is a code, where CLAUDE.md asks for a sentence
 * that says what is missing and who to go to. The desks that do it are
 * read off the company's own role set (`askTheDesk` in lib/permissions),
 * so the sentence changes when the roles do.
 */
import { askTheDesk, hasPermission } from '@/lib/permissions'

export function templatePackRefusal(args: {
  /** The caller holds a live seat at this company. */
  seated: boolean
  permissions: readonly string[]
  companyName: string
  companyKind: string | null
}): string | null {
  if (!args.seated) {
    return `You do not have a seat at ${args.companyName}, so you cannot set up its documents and calendar.`
  }
  if (hasPermission(args.permissions, 'settings.manage')) return null
  return askTheDesk({
    doing: 'Setting up a company’s documents and calendar from a template pack',
    needs: 'settings.manage',
    kind: args.companyKind,
    companyName: args.companyName,
  })
}
