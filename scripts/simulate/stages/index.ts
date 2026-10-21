/**
 * Every station, in the order of the trade. A domain replaces its stubs
 * in its own folder; this list changes only when a station is added.
 */
import type { Stage } from '../stage'
import postJobs from './demand/post-jobs'
import approveJobs from './demand/approve-jobs'
import sendToSuppliers from './demand/send-to-suppliers'
import benchAndConsent from './supply/bench-and-consent'
import submit from './demand/submit'
import documents from './regulatory/documents'
import match from './supply/match'
import interview from './demand/interview'
import award from './demand/award'
import contracts from './money/contracts'
import paperworkAndStart from './regulatory/paperwork-and-start'
import fileWeeks from './money/file-weeks'
import signWeeks from './money/sign-weeks'
import acceptDownTheChain from './money/accept-down-the-chain'
import expenses from './money/expenses'
import bills from './money/bills'
import invoiceReceipts from './money/invoice-receipts'
import threeWayCheck from './money/three-way-check'
import pay from './money/pay'
import payroll from './money/payroll'
import handoffs from './conversation/handoffs'

export const STAGES: Stage[] = [
  postJobs, approveJobs, sendToSuppliers, benchAndConsent, submit, documents, match, interview, award,
  contracts, paperworkAndStart, fileWeeks, signWeeks, acceptDownTheChain, expenses, bills,
  invoiceReceipts, threeWayCheck, pay, payroll, handoffs,
]
