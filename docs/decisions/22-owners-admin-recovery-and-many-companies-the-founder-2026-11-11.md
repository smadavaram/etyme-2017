## Owners, Admin, recovery and many companies — the founder, 2026-11-11

Said on seating sharath@etyme.com at Tapin (the staff bootstrap, which now
seats an account that already signs in and has no seat, with no link and no
password: b61e88ad2): *"can a company have more than one owner, what
happens when real owner takes over"*; *"can one owner remove other
owner"*; *"build pass ownership. also treat admin as manager or IT owner
and not business owner in the whole app"*; *"owners manage multiple
companies, sometimes commission-basis employees work with more than one
company"*; *"a real owner should always prove his domain ownership"*; *"do
what most business software does — the owner can always have a new
subdomain"*. Drawn, not built
(https://claude.ai/artifact/9zm9nYuyuH1mP6tHAp6E3i); code starts on his
"build it".

- **A company may have any number of Owners.** Only an Owner suspends,
  revokes or demotes an Owner, never an Admin. With two or more Owners,
  removing one needs another Owner's yes on a card. The last Owner is
  never removed or demoted. Today an Admin can remove an Owner and the
  only guard is "never the last person who manages access"
  (`lib/account-lifecycle`); this closes it.
- **Pass ownership is one act**: the Owner picks who, and what they
  become afterwards (Admin, stay an Owner, or leave); the new Owner must
  say yes on a card and by email; both changes happen together, with who
  and when ledgered. Nothing about the company moves: address, bank check,
  signed agreements and history stay, and what a person did stays under
  their name.
- **Admin is IT and people, not the business owner, in the whole app**
  (menu, buttons, Ask Etyme cards, routes). Admin keeps inviting and
  removing people (never an Owner), roles, team structure, directory
  import, sites, setup and integrations. Admin loses the money and
  contract acts (payroll, paying and sending bills, bank checks, signing,
  awarding, extending), the company type, the domain claim and giving
  access by team or company; those go to the Owner or to the business
  role the Owner gives (Finance, AP & Payroll, Contract Manager). Existing
  Admin seats keep working for people and settings. The table in the
  drawing is for the founder's read before it is built.
- **Recovery is by proof of the domain, always.** A real owner who lost
  access proves control of the company's verified domain (the DNS proof
  setup already uses). It is automatic and free, nobody at Etyme judges
  it, every current Owner is told by email and card and the recovery
  waits seven days with payments and bank changes frozen, and the domain
  holder wins after the seven days (what most business software does).
  Etyme never reads the company's data to check; the claimant gets the
  Owner seat and nothing else. A company with no verified domain cannot
  be recovered this way, so verifying the domain stops being a quiet
  skippable item: the reminder says so on Today until it is done. A
  consumer address and etyme.com can never be a company's domain, so
  Tapin needs its own. The domain's first-verified date is shown in the
  notice, because an expired domain bought by a stranger is the attack.
  No fee: there is no human judgment to charge for. Etyme staff may still
  seat an Owner with the staff key as an emergency tool, logged.
- **An owner can always have a new Etyme address.** Already built
  (`PATCH /api/settings/address`, `settings.manage`): the old address is
  kept and redirects, so a company is never hostage to a name or a
  domain.
- **Many companies, one sign-in.** The account menu already lists every
  seat and switches in one click (the hats, 2026-11-03). New: the number
  of decisions waiting at each other company beside it, a search past five
  seats, "Add a company" (the person becomes its Owner), and an "Etyme
  staff" line only for addresses on `ETYME_STAFF_EMAILS`, which opens
  staff tools and never a company's data. A commission-basis person holds
  one seat per company and reads only their own commissions at each.
  Nothing crosses companies and switching copies nothing.
- **support@etyme.com is Etyme's own mailbox, never a Tapin seat. The
  founder, 2026-11-11:** *"support@etyme.com is required for etyme.com to
  communicate with larger user base … wont use it in tapin."* It is the
  address on the Terms, the privacy notice, the DPA, "Talk to a person"
  and the DMARC reports. Tapin's seats are four: sharath (Owner), hradmin
  (HR), oliver (Account Manager), timesheets (AP and Payroll). Tapin's
  Admin is named later by its Owner. The "support (Admin)" seat in "Etyme
  runs on Etyme" (2026-10-13) is withdrawn.
- **The ladder and its words, said by the founder the same day: "An
  admin is always below owner or superadmin — use right terminology."**
  Three levels, always in this order, on every screen, card, email and
  reply: **Superadmin** (Etyme's own staff, the addresses on
  `ETYME_STAFF_EMAILS`; platform tools only, never a company's data
  except the logged emergency seat) above **Owner** (the company's
  business owner; one or more) above **Admin** (the company's IT and
  people manager). Admin never suspends, demotes, removes or recovers an
  Owner, and never acts for one. The account menu's "Etyme staff" line
  reads **Superadmin**. The role named Admin is never called "manager" or
  "IT owner" on a screen; "Owner" is never said of an Admin. Machine
  names (`ETYME_STAFF_EMAILS`, role keys) do not move.
- **Built in this order:** the Owner rules and Pass ownership (architect,
  conversation for the cards); Admin narrowed in the role table, the menu
  and the routes (architect, with money and regulatory for the acts that
  move); recovery by domain proof with its notice and the Today reminder
  (architect, regulatory for the wording, counsel for the Terms' dispute
  section, still "to be confirmed"); the switcher's numbers, search and
  staff line (architect). A release pass and a walk as two Owners, an
  Admin and a commission-basis recruiter before any deploy.
