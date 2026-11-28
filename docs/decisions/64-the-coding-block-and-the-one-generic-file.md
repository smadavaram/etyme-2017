## The coding block and the one generic file — the founder, 2026-11-13

**The founder's words.** He asked how a file reaches a client's
accounting system, naming four such systems and an expense product (the
names are left out here, by the rule that no real company is named):
*"The file integration to erp [...] is at gl, cost center/internal
order/project code level and profit center level - how are we covering
this? Check what [an expense product] does for such an easy integration?
Are we overthinking"*. The answer was yes: four named layouts were built
where one would do. His decision: *"Build the coding block and the one
generic file."*

**What stands.**

1. **The coding block is four things**, on every line a client pays: a
   GL account, a cost object (a cost center, an internal order or a
   project code), a company code, and an optional profit center.
2. **One generic file per payment run**, with a column picker the
   client's Finance person sets once. No layout named after a product.
   The four named layouts are deleted.
3. **A client's codes are the client's.** Cost centers, GL accounts,
   internal orders and project codes are read only by the company that
   pays the invoice receipt, and by a firm seated in that company's
   program acting as it. A supplier, a firm between and another client
   never read them. A supplier reads its own bill through a read of its
   own that carries no code.
4. **Etyme still never moves money** (record 55). The file leaves for
   the client's own system, and the confirmation marks receipts paid.

**The design, reviewed 2026-11-13: build it smaller.**
- Schema, through the architect alone: a new `CompanyCoding` (one per
  company: company code, the labor GL account, the file's column
  layout); a new `ErpGlAccount` (code, name, active); a profit center on
  `CostCenter`; a kind on `InternalOrder` (internal order or project
  code); and the supplier's number in the client's own books on the
  register row.
- Pieces, in order: the schema; then, side by side, the sheets and the
  settings page (architect), the resolver that codes a line (money) and
  the job form (demand); then the file, which also deletes the named
  layouts (money); then the screens (money).
- Calls made on the way, each reversible in a sentence: one GL account
  for labor; the bank's last four digits in the default columns; the
  received date for a receipt the payer typed in; no tax column.

**Shipped in the first deploy of this wave**, because they were live
leaks: the coding read answers only the payer (5ac9cc7b3); a supplier
opening its own bill reads what is left on the order through a read
with no client code (d0c860a27); the payroll export carries no cost
code.

**Not built.** The block and the file are the second deploy. Three
small hardening items ride with them: the award writes the client's
cost center code into its own log and reply; an internal order's owner
is not checked at the award; two tests hold an old rate.

**Open, for the founder.** Whether Etyme's own invoices to a client
belong in a payment run. Recommended: yes.
