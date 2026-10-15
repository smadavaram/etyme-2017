/**
 * The Data Processing Addendum, word for word as the founder approved it on 2026-10-15
 * ("Publish", on the drafts at https://claude.ai/artifact/Hnpqrg2k7Kga7MNv1ADMN3).
 *
 * Held as the approved text rather than retyped into objects, so that
 * nothing between the approval and the page can change a word:
 * `lib/legal/parse` turns it into sections and blocks, and
 * `legal-pages.test.ts` writes the parsed document back out and fails
 * unless it is this text again, character for character.
 *
 * A change here is a change to a legal document. Change the words only
 * on the founder's word or to correct a fact, and say which.
 */
export const DPA_SOURCE = `> **Notice:** This document is a draft and has not yet been reviewed by legal counsel. Text in square brackets marks a point counsel must decide before publication.

# Data Processing Addendum

**Effective date:** [to be set on publication]
**Last updated:** October 15, 2026

This Data Processing Addendum ("DPA") forms part of the Terms of Service between Etyme Inc. ("Etyme", "we", "us") and the Customer that accepts it. Etyme's address is 3201 Yorktown Ave, Ste. 110B, Durham, NC 27713, and you can reach us at support@etyme.com.

This DPA covers how Etyme handles personal data in Customer Data when it provides the Services. Words with capital letters have the meaning given in the Terms of Service or the Privacy Notice.

---

## 1. Parties and roles

**For a Customer's own workforce data** — its job requests, approvals, timesheet decisions, and records about Workers its Suppliers provide — Etyme holds the data on the Customer's behalf.

**For a Worker's own account** — a profile the Worker keeps, resumes they upload, a public page they turn on, and the permissions they grant to each Supplier — no Customer instructs that processing.

The same information can fall under both. For example, a Worker keeps their own profile, and a Client reads that Worker's total time on its sites.

[To be confirmed by counsel: whether Etyme acts as a processor, a controller, or both, for each kind of data. The rest of this DPA states the facts so that either answer can be applied without changing them. Where this DPA says "processor obligations", it describes what Etyme does for data it holds on a Customer's behalf.]

## 2. Subject matter, duration, nature and purpose

| Item | Description |
|---|---|
| Subject matter | Managing a contract workforce across several staffing Suppliers: job requests, sending jobs to Suppliers, submissions, screening, interviews, awards, onboarding, timesheets, billing and compliance documents |
| Duration | For as long as the Customer has an account, and after that for as long as the retention schedule in the Privacy Notice requires for each category. Some periods are minimums set by law and run for years. Some categories have no period set |
| Nature | Storage, organization, retrieval, sharing with the other companies in the same engagement, and analysis for matching and compliance |
| Purpose | To provide, secure and support the Services for the Customer |

[To be confirmed by counsel: retention after termination.]

## 3. Categories of data subjects and personal data

| Data subjects | Categories of personal data |
|---|---|
| Workers and candidates | Identity and sign-in details; profile (headline, skills, location, work authorization type, minimum rate, mobile number, availability); resumes and the text read from them; visa petition history; records that third parties ran checks (I-9, E-Verify, background, education, drug screening); onboarding documents; employment status positions taken by companies; pay and bill rates, timesheets, expenses and payments; total days on a Client's site; messages |
| Business Users at a Client | Identity and sign-in details; role, permissions and team; actions taken in the Services; signer details on agreements; messages |
| Business Users at a Supplier | The same as for Business Users at a Client |
| Named references and contacts at other companies | Name, company and contact details |
| Contacts at prospective Clients | Name, work email, team, and the files sent for a contractor spend review |

**Sensitive data.** Work authorization type, visa petition history, I-9 and E-Verify records, background check, education check and drug screening results, and a bar recorded against a named person with a reason may be sensitive in some jurisdictions. Etyme holds checks as records that a check took place: who ran it, when, its reference and its expiry. Etyme runs none of these checks and does not reach a conclusion about the person.

[To be confirmed by counsel: which of these are special category or sensitive data in each jurisdiction, and whether any may not be held in some places.]

## 4. Etyme's obligations

### 4.1 Instructions

Etyme processes Customer Data to provide the Services as the Customer configures and uses them, and as described in the Terms of Service and Privacy Notice.

[To be confirmed by counsel: the documented-instructions clause, and what Etyme does if it believes an instruction breaks the law.]

### 4.2 Confidentiality of personnel

[To be confirmed: the confidentiality commitments Etyme's staff sign. None is recorded today.]

Etyme staff who open a named person's information through the Services are logged the same way as any other user.

### 4.3 Security measures

Etyme maintains the measures in Annex B. Annex B also lists the measures that are not yet in place.

### 4.4 Sub-processors

Etyme uses the sub-processors listed in Annex A. The list is kept up to date with the services the Services actually call.

[To be confirmed by counsel: the notice period before Etyme adds or replaces a sub-processor, how notice is given, and the Customer's right to object.]

[To be confirmed: the data processing agreements in place with each sub-processor. None is recorded today.]

### 4.5 Help with data subject requests

Etyme helps the Customer answer requests from individuals in these ways:

- **Self-service.** A person who is signed in can download everything held about them, or ask to be forgotten, from their own data page. They do not need to go through a Customer.
- **Requests received by email.** A compliance officer at the Customer can log a request that arrived by email, see what is due and when, and answer it from one page. The deadline counts from the day the request arrived.
- **Deadlines.** Each request stores its deadline and the reason for it. Under the EU and UK GDPR it is one calendar month. Under the California Consumer Privacy Act it is 45 days. If nobody has recorded which law applies, the earlier date is used.
- **Erasure.** An erasure waits 14 days so the person can withdraw it. It then removes the person's name and contact details and deletes their sign-in methods, profile, unsent resumes, and bars and favorites set against them. Records that other companies rely on, such as signed hours and amounts paid, stay without the person's name.
- **Legal holds.** If the Customer places a legal hold that names the person, the erasure waits until the hold is lifted. The person is told a hold applies, without the Customer's case details.
- **Refusals.** If part of a request cannot be met, the reason is recorded in plain words.
- **Correction and objection** requests are handled by hand.

[To be confirmed by counsel: the response time Etyme commits to when it assists the Customer.]

### 4.6 Personal data breaches

Etyme keeps a separate record for each personal data breach. It is opened by a person who decides that personal data went where it should not have.

Each breach record includes:

- when Etyme became aware of it;
- whether personal data was involved, and whose;
- which categories of data and which Customers are affected; and
- a deadline to notify the supervisory authority, the people affected, and each affected Customer, each with a named person responsible for sending it.

A deadline is empty until someone decides one applies. The Services do not set one by default. An automated check runs each night. It warns the responsible person a day before each deadline, and every day after a deadline is missed. A breach cannot be closed while a deadline has passed with no notice recorded.

[To be confirmed by counsel: the period within which Etyme will notify the Customer of a breach, and what the notice will contain.]

Not yet in place: a breach severity scale, a rehearsed breach response plan, and a named breach contact at each Customer held in advance.

### 4.7 Deletion or return at the end

A Customer can raise a request about its own records when it leaves, and the request carries a deadline like any other. The intended approach is to anonymize a departing Customer's company information rather than delete it, so records shared with other companies still add up. That step is not yet built.

Etyme does not yet offer an automatic export of a Customer's data. Some records belong to more than one company, such as a contract between two companies or the days a Worker spent on a Client's site. Until it is decided which of these go with an export, Etyme will answer a return request by hand.

[To be confirmed by counsel: the period for return and deletion after termination, and which shared records are returned.]

### 4.8 Audits

Etyme does not have a SOC 2 report, an ISO 27001 certificate, or an independent penetration test report.

On request, Etyme can show the Customer:

- the access log;
- the log of automated actions;
- the software code and its automated tests; and
- a written description of its security controls and their gaps.

[To be confirmed: whether Etyme will offer code review to Customers, and on what terms.]

[To be confirmed by counsel: the Customer's audit rights, notice, frequency and cost.]

## 5. International transfers

The Services run as a single system with one database. They do not keep data in a particular country or region.

[To be confirmed: the country and region where Etyme's database and hosting run.]

[To be confirmed by counsel: the transfer mechanism, such as standard contractual clauses or the UK addendum, or a regional deployment.]

## 6. Liability

[To be confirmed by counsel: how liability under this DPA relates to the limitation of liability in the Terms of Service.]

## 7. Order of precedence and term

[To be confirmed by counsel: order of precedence between this DPA, the Terms of Service and any standard contractual clauses, and the term of this DPA.]

---

## Annex A — Sub-processors

A service marked "where set up" is used only if it is configured.

| Sub-processor | Purpose | Personal data it receives |
|---|---|---|
| Managed database host [to be named] | Stores all data in the Services, including resume files | All Customer Data |
| Vercel | Hosts the Services and runs scheduled jobs | Everything in a page request and response, and standard request logs |
| Anthropic (where set up) | An outside service that reads text. Used to suggest matching jobs, check a resume against claimed skills, read imported files, draft public profile pages, and answer typed questions about a Customer's own data where that Customer has turned this on | For matching: a Worker's name, skills, headline, location, work authorization type, minimum rate and date available. For a resume check: resume text and claimed skills. For an import: up to 60,000 characters of the file. For a profile page: the words on that page. For a typed question: the question and related entries, with names, rates, pay and amounts replaced by placeholders |
| Resend or SendGrid (where set up) | Sends email | Name, email address and message content |
| Mail server for sign-in links (where set up) [to be named] | Sends one-time sign-in links | Email address and the link |
| Microsoft and Google (where set up) | Sign-in | Email address and the sign-in provider's account identifier |
| Microsoft Teams (where set up) | Delivers notices and approval requests to a Customer's Teams channel or chat | The notice or request text, which may include a person's name and the item to approve [to be confirmed: listed as a sub-processor] |

Notes:

- The typed-question feature is off for each Customer until someone at that Customer with authority turns it on. Each question sent and each answer received is logged, with placeholders in place of names and figures, and the Customer can read the log.
- If no Anthropic key is set, matching uses fixed rules and says so, and the resume check does not run.
- Etyme does not use file storage, e-signature, text-message, analytics, advertising or session-recording services.

## Annex B — Security measures

### In place

1. **Separation between companies.** Each database query is limited to the company asking. Information from another company is never fetched and then hidden on screen.
2. **Separation inside a company.** A Business User assigned to a team sees that team and the teams under it.
3. **Access logging.** Opening a named person's information is logged with who, from which company, why, and whether it was allowed. Refused attempts are logged before the refusal is sent. This covers the parts of the Services that show a named person, not every page.
4. **Separation of duties.** A person cannot approve their own job request, timesheet or supplier recommendation, or decide two steps of the same supplier approval.
5. **Sign-in.** Business Users can sign in through the Customer's own Microsoft or Google account. A sign-in method that is not configured is not offered. A company account cannot be opened with a consumer email address.
6. **Passwords.** Stored only as slow, salted hashes. Passwords must be at least 12 characters. After five failed attempts in 15 minutes for one email or one network address, sign-in pauses for one minute. Password reset and email verification links are random, and only a hash of each is stored.
7. **Machine access keys.** Stored only as a hash, compared in constant time, and never shown again after creation.
8. **Outgoing notifications to other systems** are signed so the receiver can check they came from Etyme.
9. **Links sent by email** use random, hard-to-guess codes and stop working once their purpose is complete.
10. **Scheduled jobs** require a shared secret. If no secret is set, every scheduled call is refused.
11. **Bank details.** Full account and routing numbers are never collected. No payment card data is held.
12. **Error monitoring.** Errors are recorded and staff are alerted by email. A daily check-in is sent even when nothing has failed.
13. **Retention.** A fixed retention schedule, a nightly job that deletes records whose legal period has ended, and legal holds that stop deletion.
14. **Typed questions.** Names, rates, pay and amounts are replaced with placeholders before a question leaves for the outside text-reading service, and each question sent is logged.

### Not yet in place

1. No SOC 2 report or ISO 27001 certificate.
2. No independent penetration test.
3. Two-step sign-in is not required by Etyme. Where a Customer signs in with Microsoft or Google, its own settings apply. Email-link sign-in has no second step.
4. No single sign-on enforcement or automatic user provisioning.
5. Encryption at rest and in transit depends on the hosting and database providers and has not been verified by Etyme.
6. No encryption of individual sensitive fields.
7. No key management service and no key rotation schedule. Secrets are stored as settings on the hosting platform.
8. No documented or tested backup restore, and no disaster recovery plan.
9. No general rate limiting, web application firewall or bot protection, other than the password sign-in limit above.
10. No security headers beyond the hosting platform's defaults.
11. No virus scanning of uploaded files.
12. No named security officer, formal review of staff access, staff background checks, or security training.
13. No live address for reporting security issues. [To be confirmed: security contact address.]
`
