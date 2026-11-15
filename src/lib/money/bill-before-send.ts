/**
 * What the bill's own page says before Send is pressed: where the bill
 * goes, and, where no email can leave, that Send marks it sent and
 * emails nobody.
 *
 * The founder's walk, 2026-11-15 (layer 2, Bills): nothing before the
 * press said whether an email could leave; she found out afterwards.
 * The rule (CLAUDE.md, "No screen says an email went, or will go, unless
 * email can leave") reads `mailLeaves`, passed in by the route.
 *
 * The recipients by name are picked inside lib/notify/bill-delivery
 * (`recordedAt`), which exports no reader for them before a sending. So
 * this says who receives it by the rule that file applies, never by name,
 * until that reader is exported.
 *
 * Pure: no database, no environment.
 */
import { NO_MAIL_HERE } from '@/lib/notify/mail-leaves'

export function beforeSendSays(a: { payerName: string; payerOnEtyme: boolean; mailLeaves: boolean }): string {
  if (a.payerOnEtyme) {
    const shown = `Send shows it in Etyme to the people at ${a.payerName} who record payments.`
    return a.mailLeaves ? shown : `${shown} ${NO_MAIL_HERE}.`
  }
  if (!a.mailLeaves) return `${NO_MAIL_HERE}, so Send marks it sent and emails nobody at ${a.payerName}.`
  return `Send emails it to your contacts at ${a.payerName}: accounts payable if you recorded one, otherwise all of them.`
}
