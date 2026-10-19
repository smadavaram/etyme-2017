/**
 * The Privacy Notice, word for word as the founder approved it on 2026-10-15
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
 *
 * Corrected 2026-10-19, a fact: each seat now keeps one saved Ask Etyme
 * conversation (founder, 2026-10-18), which is personal information the
 * text did not name. The change is a row in sections 3 and 10 and four words in section 11 and the
 * "Last updated" date, and nothing else.
 */
export const PRIVACY_SOURCE = `> **Notice:** This document is a draft and has not yet been reviewed by legal counsel. Text in square brackets marks a point counsel must decide before publication.

# Privacy Notice

**Effective date:** [to be set on publication]
**Last updated:** October 19, 2026

Etyme Inc. ("Etyme", "we", "us") provides software that companies use to manage contract workers and the staffing suppliers who provide them. Our address is 3201 Yorktown Ave, Ste. 110B, Durham, NC 27713, and you can reach us at support@etyme.com.

This Privacy Notice explains what personal information we hold, where it comes from, how we use it, who receives it, how long we keep it, and the choices you have.

---

## 1. Who we are and the words we use

In this notice:

- **"Services"** means the Etyme website, web application, and the emails and Microsoft Teams messages it sends.
- **"Customer"** means a company that has an account with us. A Customer that buys contract work is a **"Client"**. A Customer that provides workers to a Client, directly or through another company, is a **"Supplier"**.
- **"Business User"** means a person who uses the Services on behalf of a Customer, such as a hiring manager, recruiter, or accounts payable clerk.
- **"Worker"** means an individual who looks for work or does work through the Services, including candidates, consultants, and contractors.
- **"Customer Data"** means the information a Customer, its Business Users, or its Suppliers put into the Services.

Etyme is not a staffing agency. We do not employ Workers, place them, or decide whether they may work. Clients and Suppliers do those things, and they use the Services to keep track of them.

## 2. Two kinds of people, and our role for each

We serve two groups of people, and our relationship with each is different.

**Business Users.** A Business User's access belongs to the Customer that granted it. An owner or administrator at that Customer can suspend or end it at any time. Ending access removes the person's ability to sign in. It does not delete the history of what they did.

**Workers.** A Worker has their own account, signed in with their own email address. The account belongs to the Worker, not to a Supplier that invited them. It stays with the Worker if they move between Suppliers.

When we hold a Client's records about its own workforce, we act on that Client's behalf. When a Worker keeps their own profile and decides who may see it, no Customer instructed that. Our legal role may differ in the two cases.

[To be confirmed by counsel: whether Etyme is a controller or a processor (or a "business" or "service provider") for each kind of data described in this notice.]

## 3. Information we collect

Not every field is listed below. Every category of personal information is.

| Category | Examples | Source |
|---|---|---|
| Identity and sign-in | Name, email address, time zone, the account identifier from Microsoft or Google, a password stored only in scrambled (hashed) form, and when each sign-in method was last used | You; your employer's sign-in provider |
| Worker profile | Headline, skills, location, work authorization type, minimum rate, mobile number, date available, and an optional public profile page | The Worker |
| Resumes | The resume file, its name, type and size, and the text read from it | The Worker, or a Supplier that submits the Worker |
| Work authorization and immigration | Visa petitions, filings, requests for evidence, approvals, expiry and stamping dates, and related documents | The Worker's employer or Supplier |
| Checks run by others | Records that an I-9, E-Verify, background check, education check, or drug screening took place: who ran it, when, its reference number, its expiry date, and what the provider reported | The employer or Supplier that ordered the check |
| Onboarding documents | Which documents a placement needs, what was requested, sent, uploaded or signed, the file name, and a fingerprint of the file so the same file is stored once | The Worker, the Supplier, or the Client |
| Employment status positions | Whether a company treats a person as an employee or an independent contractor, and whether an employer says the person is exempt from overtime, with who said so, when, and why | The company that took the position |
| Pay and billing | Pay rates and bill rates, timesheets and approved hours, expenses, bill lines and payments | Clients, Suppliers and Workers |
| Time on site | The total days a Worker has worked at a Client, added up across every Supplier, counting each day once | Calculated from contracts and timesheets |
| Business User activity | The Customer that granted access, role and permissions, team, and each action taken, such as a job request raised, an approval or refusal with its reason, a timesheet signed, or a supplier decision. Agreements carry the signer's name, title and email as they appear on the document. | The Customer and the Business User |
| Bars and favorites | A note by one Customer not to engage a named person or firm, with a reason, or a mark that it would engage them again | The Customer that set it |
| Contractor spend review | Information a prospective Client sent us so we could prepare a summary of its own contract workforce: company name, contact name and work email, team, who accepted the review agreement and which edition, and the files sent | The prospective Client |
| Company and supplier information | Legal name, addresses, tax registration, teams, cost centers, contacts, agreements, orders, bills and invoices, and a Supplier's application, including named references and their contact details | The Customer or Supplier |
| Payment details | Bank name, the name on the account, and the last four digits of the account number | The Supplier |
| Messages | Conversations between two companies about a deal, in-app notices, and emails we sent | Business Users, Workers and the Services |
| Ask Etyme conversations | Each person's saved conversation with Ask Etyme at each company: the questions they typed, the answers shown to them with their tables, links and cards, what became of each card, and when they cleared it. Lines cleared from the screen are kept. No one else can read it | The person, and the Services |
| Logs | Who opened a person's information, from which company, why, and whether access was allowed or refused; actions the Services took automatically; scheduled job runs; and errors | Generated by the Services |
| Public website visits | A count of a few actions on our public pages (for example, clicking a demo button), the page, and a random visit number kept only for that browser tab | Your browser |

**What we do not collect.** We never ask for or store a full bank account number or routing number. A Supplier's application asks only for the bank name, the account name and the last four digits, and says so on the form. We hold no payment card data. The public website count records no name, email address, IP address, browser details or cookie.

## 4. How we use information

We use personal information to:

1. **Run the Services**: job requests, sending jobs to suppliers, submissions, interviews, onboarding, timesheets, bills, invoice receipts and payments.
2. **Keep each company's information separate** and show each person only what their role allows.
3. **Show a Client a Worker's total time on site** across all Suppliers. Clients use this to manage limits on how long a contractor may stay.
4. **Record checks and documents** that others ran or supplied, with their dates, so a Client or Supplier can see what is on file and what has expired.
5. **Suggest matches and read documents**, using an outside service described in Section 6.
6. **Send notices** by email and, where a Customer sets it up, Microsoft Teams.
7. **Keep the Services secure**, log access, investigate problems and respond to errors.
8. **Answer privacy requests** and meet legal duties to keep certain records.
9. **Count visits** to our public website, without identifying anyone.

We do not use personal information for advertising, and we do not sell it.

[To be confirmed by counsel: the legal basis for each use, by jurisdiction, including whether a Worker's permission to be shown to a Supplier is "consent" in the legal sense.]

## 5. Automated features

Some steps happen automatically. For example, the Services end a contract after its last day, expire an invitation nobody answered, approve a timesheet that falls within a Customer's limits, and flag a visa that is close to its expiry date. Each automated action is logged with a plain-English reason and a note saying whether it can be undone. Customers can read these logs.

Most automated actions are simple date checks, thresholds or counts.

**A person always decides awards, rejections and bars.** No automated result, and no output of the outside service in Section 6, awards a job to anyone, rejects anyone, or bars anyone. A match score always shows the factors behind it, the basis, how confident it is, and what it could not assess.

[To be confirmed by counsel: whether any processing amounts to automated decision-making that requires a specific notice or opt-out.]

## 6. Who receives information

**Other companies in the same engagement.** A Client sees information about Workers its Suppliers put forward to it. A Supplier sees the jobs sent to it and its own Workers. Where a Client buys from a Supplier who buys from another Supplier, the Client sees the company it pays, not the companies below it, unless the Client's agreement with its Supplier requires them to be named. A Client can always see whether the company employing a person on its site is insured and whether the person is authorized to work.

**Service providers.** These outside services receive personal information so we can run the Services. A service marked "where set up" is used only if it is configured.

| Service provider | Purpose | What it receives |
|---|---|---|
| Managed database host [to be named] | Stores all information in the Services, including resume files | All information described in this notice |
| Vercel | Hosts the Services and runs scheduled jobs | Everything in a page request and response, and standard request logs |
| Anthropic (where set up) | An outside service that reads text. We use it to suggest matching jobs, check a resume against the skills claimed for it, read an imported file into structured entries, draft the words on a public profile page, and answer a typed question about a company's own data where that company has turned this on | For matching: a Worker's name, skills, headline, location, work authorization type, minimum rate and date available. For a resume check: the resume text and the skills claimed. For an import: up to 60,000 characters of the file. For a profile page: the words on that page. For a typed question: the question and related entries, with names of people and companies, rates, pay and amounts replaced by placeholders before sending |
| Resend or SendGrid (where set up) | Sends email | Name, email address and the message |
| Mail server for sign-in links (where set up) [to be named] | Sends one-time sign-in links | Email address and the link |
| Microsoft and Google (where set up) | Sign-in only | Email address and the sign-in provider's account identifier |
| Microsoft Teams (where set up) | Delivers notices and approval requests to a Customer's Teams channel or chat | The text of the notice or request, which may include a person's name and the item to approve [to be confirmed: listed as a sub-processor] |

The question feature is off for each company until someone at that company with authority turns it on. Each question sent and each answer received is logged, with placeholders in place of names and figures, and the company can read that log.

If no Anthropic key is set, matching uses fixed rules and says so, and the resume check does not run.

[To be confirmed by counsel: which providers need a signed data processing agreement, and what notice we give before adding one. None is recorded today.]

**Legal and safety.** We may disclose information if the law requires it. [To be confirmed by counsel: wording for legal requests, business transfers and protection of rights.]

## 7. What we do not do

- We do not sell personal information.
- We do not use any advertising, analytics or session-recording service.
- We set no third-party cookies.
- We do not send text messages. A mobile number is used to recognize the same Worker across two Suppliers, not to message them.
- We do not use file storage, e-signature or text-message services, even though some configuration files mention them.
- We do not compare one Supplier's rates across different Clients.

## 8. Cookies and browser storage

- **Session cookie.** Set when you sign in. It lasts up to 30 days unless you sign out.
- **Display preferences.** Choices such as showing a list as a table or as cards are saved in your browser on your device.
- **Visit number.** On our public pages, a random number is kept in your browser tab and deleted when the tab closes.

## 9. Who can see information, and how access is logged

- **Each company sees its own information.** Records are filtered by company when they are fetched from the database, not hidden on the screen.
- **Teams inside a company.** A Business User assigned to a team sees that team and the teams under it. A Business User assigned to no team sees the whole company, by the company's choice.
- **Deal conversations** stay between the two companies on the deal.
- **Interview notes** a Client writes stay with the Client. Suppliers and Workers do not see them.
- **Rate ranges** a Client sets for one Supplier are not visible to other Suppliers.
- **Access logs.** When someone opens a named person's information (a profile, resume, placement, submission, compliance record, time-on-site total and similar), we log who opened it, from which company, why, and whether access was allowed. Refused attempts are logged too. This covers the parts of the Services that show a named person. It does not cover every page.

## 10. How long we keep information

We keep information according to a fixed schedule. A Customer cannot shorten it. A Customer that must keep records longer can place a legal hold, which states a reason, a name and a review date.

Every period below is a minimum set by US federal law. Some states require longer. Where no federal minimum applies, we state no period and do not delete on a timer.

| Category | When you ask to be forgotten | Period kept |
|---|---|---|
| Identity and sign-in | Deleted | Not set |
| Worker profile | Deleted | Not set |
| Resumes | Deleted if never sent. If sent to a company, the entry stays but the file and its text are removed | Not set |
| Bars and favorites | Deleted | Not set |
| Messages | Kept, with your name removed | Not set |
| Ask Etyme conversations | Deleted. Your answers on its cards stay as Business User activity, with your name removed | Not set. Cleared lines are kept as long as the records they explain |
| Business User activity | Kept, with your name removed | Not set by us. Hiring records: at least 1 year (2 for federal contractors) |
| Pay and billing | Kept, with your name removed | 4 years from the later of the tax due date and payment |
| Time on site | Kept, with your name removed | Not set |
| Checks run by others | Kept until the period ends, then deleted | I-9: the later of 3 years after hire or 1 year after employment ends. Other checks: at least 1 year (2 for federal contractors) |
| Onboarding documents | Kept until the period ends, then deleted | 1 year after employment ends (2 for federal contractors). An I-9 and its evidence follow the I-9 period |
| Work authorization and immigration | Kept | Not set. No single federal period covers a petition file |
| Employment status positions | Kept until the period ends, then deleted | 3 years from the last related payroll record |
| Logs | Kept in full | Not set. Kept as long as the records they relate to |
| Contractor spend review | Files deleted 45 days after they arrive. A note of how many files and when they were deleted is kept, with names removed | 45 days for files |
| Company and supplier information | Kept. It belongs to the company, not to a person | Not set |
| Payment details | Kept. It belongs to the company | Not set |

**Other points.**

- An automated job runs each night. It deletes records whose period has ended, unless a legal hold applies.
- Ending a Business User's access deletes no records. Suspending access can be undone.
- If a Worker removes a resume from their list, a company it was already sent to can still open its copy.
- Demo accounts that nobody uses for 30 days are deleted automatically.
- We do not delete the information of a person who has simply stopped using the Services.

[To be confirmed by counsel: state-law retention periods, and whether inactive records should be deleted after a set time.]

## 11. Your rights and how to use them

Anyone who is signed in can use these rights from their own data page. You do not need a Customer's permission.

**See and download your information.** Your data page lists what we hold about you, by the categories in Section 3, and lets you download a copy at once. Each time the copy is opened, we log who opened it, including our own staff.

**Ask to be forgotten.**

1. You ask from your data page.
2. We send you a letter saying what will be deleted and what will be kept, and why. It includes a link to withdraw your request.
3. We wait 14 days, so you can change your mind.
4. On day 14, your sign-in methods, Worker profile, unsent resumes, saved Ask Etyme conversations, and any bars or favorites set against your name are deleted. Your Worker profile's permissions for Suppliers end. Your name is replaced with "Erased person" and your email with an address that cannot receive mail.
5. Records that other companies rely on stay, without your name. Examples are signed hours, amounts paid, and days on a Client's site.

**What we cannot erase.** Some records must be kept by law, and those duties belong to the company that holds them. Examples: payroll and tax records kept by whoever paid you, an I-9 kept by whoever completed it, and days on site kept by the Client. Your letter names these.

**Legal holds.** If a company has placed a legal hold that names you, your request waits rather than being refused. We tell you a hold applies, but not the company's case details. The erasure runs automatically when the last hold is lifted.

**Correct your information.** Workers can edit their own profile, resumes, availability and minimum rate. For anything else, contact us. We handle corrections and objections by hand.

**Requests by email.** You can also send a request to support@etyme.com or to a company that holds your information. A compliance officer at that company logs it, and the deadline counts from the day it arrived.

**Deadlines.** We track each request against the deadline set by the law that applies: for example, one calendar month under the EU and UK GDPR, or 45 days under the California Consumer Privacy Act. If we do not know which law applies, we use whichever deadline comes first.

[To be confirmed by counsel: the response time we commit to, the rights available in each jurisdiction, identity verification, and appeal rights.]

## 12. Security

**In place today:**

- Company information is separated in every database query.
- Business Users can sign in with their employer's Microsoft or Google account. Passwords are stored only as slow, salted hashes. After five failed tries in 15 minutes, sign-in pauses for a minute.
- Access to a named person's information is logged, including refused attempts.
- A person cannot approve their own request, timesheet or recommendation.
- Machine access keys are stored only as hashes and cannot be shown again.
- Links sent by email use random, hard-to-guess codes and stop working once their purpose is complete.
- Errors are recorded and our staff are alerted.

**Not yet in place:**

- We do not have a SOC 2 report or an ISO 27001 certificate.
- No independent penetration test has been done.
- We do not require two-step sign-in. If you sign in through your employer's Microsoft or Google account, your employer's settings apply.
- We have not documented or tested a backup restore or disaster recovery plan.
- Encryption of stored data and data in transit depends on our hosting and database providers. We have not yet verified their settings.
- There is no general rate limiting or web application firewall.
- We do not scan uploaded files for viruses.

## 13. Where information is stored

The Services run as a single system with one database. They do not keep information in a particular country or region.

[To be confirmed: the country and region where our database and hosting run.]

[To be confirmed by counsel: the legal mechanism for transfers of personal information out of the EU, the UK and other countries.]

## 14. Children

The Services are built for businesses and for adults seeking work. They do not check a user's age.

[To be confirmed by counsel: minimum age and the statement on children's information.]

## 15. Sensitive information

Some information we hold may be sensitive under the law of some places, such as immigration status and background check results. We hold these as records that a check took place, with the provider, date and expiry. We do not reach our own conclusion about the person.

[To be confirmed by counsel: which fields are sensitive in each jurisdiction, and whether any may not be stored in some places.]

## 16. Changes to this notice

We will update the "Last updated" date when we change this notice.

[To be confirmed by counsel: how and how far in advance we notify users of material changes.]

## 17. Contact us

Etyme Inc.
3201 Yorktown Ave, Ste. 110B
Durham, NC 27713
support@etyme.com
`
