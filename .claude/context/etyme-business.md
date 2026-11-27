# Etyme: what a newcomer needs to know

## What Etyme is

Etyme is a platform for contract staffing. It follows a contractor through every
company in the supply chain, from the client's request for a person, through
the contract, timesheets, invoices and payments, to payroll.

The owner owns the domain etyme.com, and the website will eventually live there.

## The parties

Each party has its own operating-model page (`docs-*.html`). The same data, in
one file, is `model.js` (`window.ETYME_MODEL`).

| Party | In one line | Page |
|---|---|---|
| Client | The enterprise that buys and never sells. | `docs-client.html` |
| GSI (systems integrator) | Sells to the client; buys from a sub-vendor or uses its own W2 staff. | `docs-systems-integrator.html` |
| MSP (program office) | Runs the client's program from a seat the client grants. Places nobody. | `docs-msp-program-office.html` |
| Prime vendor | Sells to the client; buys from a sub-vendor or uses its own W2 staff. | `docs-prime-vendor.html` |
| Sub-vendor | Sells to the prime. Knows the site, never the client's name. | `docs-sub-vendor.html` |
| Bench vendor | Owns a bench of people who agreed to be sold, and sells them up. | `docs-bench-vendor.html` |
| Self-employed | A consultant's own corporation: the firm and the worker in one person. | `docs-self-employed.html` |
| Candidate, on a bench | Listed by a firm they chose, which pays them. | `docs-candidate.html` |
| Candidate, independent | No bench and no employer yet. | `docs-candidate-independent.html` |
| Candidate, employee | Staffed directly by their employer and paid by payroll. Never sees the bill rate. | `docs-candidate-employee.html` |

## The value streams

Every party's work is split into the same streams: Source to contract, Contract
to onboard, Work to approve, Approve to invoice, Approve to pay, An expense
(receipt to reimbursement), Record to report, and Govern and protect.

## Contract types

W2 (employee), 1099 (independent), C2C (corp-to-corp), contract-to-hire
versions of these, and third-party corp-to-corp. The full list is in
`app/models/contract.rb`.

## The core process

The owner's own notes are in `notes.md`. In short, for W2 and 1099 contracts:

1. Create the contract: salary and payment terms, and the company roles (HR admin,
   accounts payable, accounts receivable, timesheet admin, salary admin).
2. Check the timeline, then activate the contract.
3. The contractor submits a timesheet, and it is approved.
4. Invoice the customer, then receive payment.
5. Calculate commission and salary, process the salary, send it to the payroll
   processor, then clear the salary.

A timesheet moves through these statuses: open → submitted → approved (or
partially approved, or rejected) → invoiced → salaried. Client expenses follow
their own flow, also described in `notes.md`.

## The two halves of this project

- **The app:** Ruby on Rails, in `app/`, with a PostgreSQL database. Sign-in uses
  Devise, the super-admin screens use ActiveAdmin, and background jobs use
  Sidekiq. It is deployed to AWS with Capistrano: staging from the
  `deploy-staging` branch and production from `deploy-prod`. Setup and
  deployment steps are in `README.md`.
- **The website and docs:** plain HTML pages in the top folder (`index.html`,
  `docs-*.html`, `contracts.html` and so on). They are styled by `kit.css` and
  `brand-kit/`, and `dash.js` draws their dashboards from `model.js`.
