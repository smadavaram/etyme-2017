/**
 * Terms the database has to be able to hold.
 *
 * Four pieces of work were blocked on columns that did not exist, and
 * each of them is a fact somebody agreed to in writing: what an overtime
 * hour is worth to the worker, when the clock on an invoice starts, what
 * a supplier takes off for early settlement, and whether an employer has
 * claimed an exemption. None of these is arithmetic — the arithmetic is
 * elsewhere and belongs to other people. These sentences say only that
 * there is somewhere honest to put the answer.
 *
 * Checked against the schema rather than against memory, the same way
 * `schema-hygiene` is, because a column is the one thing a passing unit
 * test can be built on top of and still be missing.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Prisma } from '@prisma/client'

const schema = readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8')

type Field = { name: string; type: string; isRequired: boolean; isList: boolean; default?: unknown }

function model(name: string) {
  const m = Prisma.dmmf.datamodel.models.find((x) => x.name === name)
  expect(m, `model ${name} should exist`).toBeTruthy()
  return m!
}

function field(modelName: string, fieldName: string): Field {
  const f = model(modelName).fields.find((x) => x.name === fieldName)
  expect(f, `${modelName}.${fieldName} should exist`).toBeTruthy()
  return f as unknown as Field
}

function uniques(modelName: string): string[][] {
  return model(modelName).uniqueFields.map((u) => [...u])
}

describe('Exempt or nonexempt is the employer’s position, and Etyme only holds it', () => {
  it('an exempt assertion belongs to one employment relationship, so the same person can differ at two employers', () => {
    // Keyed on the contract AND the person. A key on the person alone
    // would force one of two honest answers to be wrong: the same
    // consultant can be exempt at one employer and not at another,
    // because the duties, the supervision and the salary basis are all
    // different. `ClassificationCall` is keyed on (company, person) and
    // this is deliberately not that row.
    expect(uniques('ExemptAssertion')).toContainEqual(['buyContractId', 'personId'])

    // And two people on one buy contract can differ from each other, so
    // the contract alone is not unique either.
    expect(uniques('ExemptAssertion')).not.toContainEqual(['buyContractId'])
    expect(field('ExemptAssertion', 'buyContractId').type).toBe('String')
    expect(field('ExemptAssertion', 'personId').type).toBe('String')
  })

  it('only the employer on the buy leg may assert exempt status', () => {
    // The employer bears the burden of proving an exemption, so the
    // employer is the only party with anywhere to record one. There is
    // no client column here and no Etyme column here, because a Wage and
    // Hour investigator does not bill the client and does not bill us.
    const companyFks = model('ExemptAssertion')
      .fields.filter((f) => f.type === 'Company' || /companyId$/i.test(f.name))
      .map((f) => f.name)
    expect(companyFks.sort()).toEqual(['assertedByCompany', 'assertedByCompanyId'])
    expect(field('ExemptAssertion', 'assertedByCompanyId').isRequired).toBe(true)
  })

  it('records what the screen said at the time, so a position can be re-derived rather than trusted', () => {
    // The asymmetry, kept as data: the screen can rule an exemption OUT
    // on a pay rate that cannot reach the floor, and can never rule one
    // IN, because the duties test is not in this data. So the outcome it
    // wrote down has two values and neither of them is "exempt".
    expect(field('ExemptAssertion', 'screenOutcome').isRequired).toBe(true)
    expect(field('ExemptAssertion', 'screenRulesOut').isList).toBe(true)
    expect(field('ExemptAssertion', 'screenSays').isRequired).toBe(true)

    const body = schema.match(/model ExemptAssertion \{([\s\S]*?)^\}/m)![1]
    expect(body).toMatch(/CANNOT_BE_EXEMPT/)
    expect(body).toMatch(/ETYME_CANNOT_SAY/)

    // A position with no review date rots: a promotion changes the
    // duties and nothing sweeps a date that is not there.
    expect(field('ExemptAssertion', 'reviewBy').isRequired).toBe(false)
  })
})

describe('What an overtime hour is worth to the worker', () => {
  it('a buy contract can carry overtime terms its client never sees', () => {
    // Statute sets a floor, not a ceiling. Where an employer agreed more
    // than the floor with the worker — double time past sixty — Etyme
    // held it nowhere, so payroll had nothing to value a premium week
    // from except the client's billing terms, which are not a wage.
    const after = field('BuyContract', 'overtimeAfterHours')
    expect(after.type).toBe('Int')
    expect(after.isRequired).toBe(false) // null is straight time

    const mult = field('BuyContract', 'overtimeMultiplierBps')
    expect(mult.type).toBe('Int')
    expect(mult.default).toBe(15000) // time and a half

    // The sell leg keeps its own, and they are different facts: a client
    // on straight time and a worker on time-and-a-half is ordinary.
    expect(field('SellContract', 'overtimeAfterHours').type).toBe('Int')
    expect(field('SellContract', 'overtimeMultiplierBps').default).toBe(15000)
  })

  it('only one place holds the pay-side premium, so two records cannot disagree about it', () => {
    // `RateHistory.overtimeRate` is written and read by nothing, and is a
    // third copy of a fact that now lives on the contract. It is either
    // gone or marked dead; what it may never be is quietly present.
    const stillThere = model('RateHistory').fields.some((f) => f.name === 'overtimeRate')
    if (stillThere) {
      const body = schema.match(/model RateHistory \{([\s\S]*?)^\}/m)![1]
      expect(body, 'RateHistory.overtimeRate must say it is dead').toMatch(/DEAD/)
    }
  })
})

describe('When the clock on an invoice starts', () => {
  it('payment terms say what they run from, and an invoice records when the client received it', () => {
    // NET 30 runs from receipt of the invoice, not from the end of the
    // work period. A period ending the 31st and invoiced on the 6th is
    // due six days later than the arithmetic used to claim, and chasing
    // a client who is not late is the visible half of that error.
    for (const m of ['MasterAgreement', 'SellContract', 'BuyContract']) {
      const f = field(m, 'paymentTermsFrom')
      expect(f.type, m).toBe('String')
      expect(f.isRequired, m).toBe(true)
    }

    const body = schema.match(/model MasterAgreement \{([\s\S]*?)^\}/m)![1]
    for (const anchor of ['RECEIPT_DATE', 'INVOICE_DATE', 'PERIOD_END', 'APPROVAL_DATE']) {
      expect(body, anchor).toMatch(new RegExp(anchor))
    }

    // Issued is the day we billed. Received is the day the contractual
    // clock starts, and the gap between them was invisible.
    const received = field('Invoice', 'receivedAt')
    expect(received.type).toBe('DateTime')
    expect(received.isRequired).toBe(false)
    expect(field('Invoice', 'issuedAt').name).toBe('issuedAt')
  })

  it('an existing contract keeps counting from the period end, so no invoice already raised moves', () => {
    // The default is what the arithmetic already does. Adding the column
    // must change no date and no value on anything already billed; a new
    // contract chooses.
    for (const m of ['MasterAgreement', 'SellContract', 'BuyContract']) {
      expect(field(m, 'paymentTermsFrom').default, m).toBe('PERIOD_END')
    }

    // Null receipt is honest: nobody has confirmed it, which is not the
    // same as it arriving today.
    expect(field('Invoice', 'receivedAt').default).toBeUndefined()
  })
})

describe('Paying early for a discount', () => {
  it('a discount tier says how many days and how much, and several can sit on one agreement', () => {
    // "3% at zero days, 2% at ten, otherwise net thirty" is three
    // answers, and a pair of columns holds one of them — the rest gets
    // typed into a notes field where no arithmetic can reach it.
    expect(field('EarlyPaymentDiscount', 'withinDays').type).toBe('Int')
    expect(field('EarlyPaymentDiscount', 'withinDays').isRequired).toBe(true)
    expect(field('EarlyPaymentDiscount', 'discountBps').type).toBe('Int')
    expect(field('EarlyPaymentDiscount', 'discountBps').isRequired).toBe(true)

    // One rung per number of days on any one document, and several days
    // on the same one. Zero days is a real rung — settlement on the day
    // carries the best rate because it is the hardest to hit.
    expect(uniques('EarlyPaymentDiscount')).toContainEqual(['msaId', 'withinDays'])
    expect(uniques('EarlyPaymentDiscount')).not.toContainEqual(['msaId'])

    expect(model('MasterAgreement').fields.some((f) => f.name === 'earlyPaymentDiscounts')).toBe(true)
  })

  it('a rung hangs on the agreement or on the order that overrides it, never on two at once', () => {
    // Exactly one of the three is set. There are no migration files, so
    // there is no CHECK constraint to say it — the writer enforces it and
    // a reader that finds none or two refuses rather than guesses. Same
    // shape and same reasoning as InvoiceLine, which is an hours line, an
    // expense line or a milestone line and never two.
    for (const owner of ['msaId', 'workOrderId', 'workOrderId']) {
      expect(field('EarlyPaymentDiscount', owner).isRequired, owner).toBe(false)
      expect(uniques('EarlyPaymentDiscount')).toContainEqual([owner, 'withinDays'])
    }
  })
})
