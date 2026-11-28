## The Owner decides who sees what, by team, by role or for the whole company — the founder, 2026-11-08

*"Owner should control who should see what, but owner should give
permissions by team hierarchy or individual role or company as well."*
Said on the answer that a sub-vendor's recruiter and managers read no
margin unless given Finance's whole permission. Today a permission
belongs to a role, a seat holds one role, the Owner and Admin edit the
roles under Users & permissions, and a REGION unit already scopes a
seat to its sites. What is new is the **grant**: the Owner gives a
permission, or takes one away, at one of three scopes, and the record
narrows what the permission reads to that scope.
- **Three scopes, one grant row.** A grant names the permission, who
  holds it (a role at the company, or one person's seat), what it
  reaches (the whole company; one unit of the org tree and everything
  under it, which is the team hierarchy; or one person's own book), who
  gave it, when, and the reason. `hasPermission` keeps answering yes or
  no; a new reader beside it answers *over what*, and every list a
  scoped permission opens is narrowed at the query, never only on the
  screen (the REGION rule, generalized). A manager given `margin.read`
  on her unit reads Profitability for the placements charged to or
  delivered by her unit and its children, and nothing else; the Owner's
  figure is the firm's.
- **The Owner alone grants; Admin may be given the right to.** A grant
  is an act on Users & permissions, recorded like a role edit, ledgered,
  reversible in one press. Teams carries the same card through the one
  approval route when the keys exist.
- **What a grant can never do:** cross a company (a client never reads a
  supplier's margin, a sub never reads the prime's rate, whatever is
  granted); break segregation (`HELD_APART` is checked on the seat's
  effective permissions, so a grant that would let one person bill and
  pay, or submit and award, is refused in a sentence); give `pnl.read`
  or payroll to a seat outside the roles that may hold them without the
  Owner saying so by name; or grant more than the Owner holds.
- **Default aggressively.** The shipped roles stay exactly as they are,
  so a firm that never opens the grants works as today. A recruiter
  still reads no margin until the Owner says so.
- **Built in this order:** the schema (`PermissionGrant`: permission,
  roleId or contextId, scope COMPANY · UNIT · PERSON with the unit,
  grantedById, grantedAt, reason, revokedAt) and the scope reader beside
  `hasPermission` (architect); Users & permissions gains "Give access":
  pick the permission in plain words ("read what placements make"), who
  (a role or a person), how far (the company, a team, themselves), a
  reason (architect); Profitability, cash flow and Bench profit read the
  scope (money); the bench and consultant lists (supply); jobs and
  submissions (demand); Ask Etyme's refusal says the scope ("You read
  margin for the Dayton team; ask the Owner for the firm's") and the
  Owner's chat gets a "give access" card (conversation). Tests as
  sentences; a walk as a sub-vendor's recruiter, manager and Owner.
