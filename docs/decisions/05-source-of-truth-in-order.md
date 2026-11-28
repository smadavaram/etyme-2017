## Source of truth, in order

1. `/spec/Etyme_Master_BRD_v3_7_FINAL.docx` — 34 sections. **FROZEN BASELINE.**
   Amendments require a change log, never a rewrite.
2. `/spec/Etyme_BRD_Addendum_D.docx` — work authorisation transition, consultant
   retention, rate transparency. Ratified.
3. `/spec/Etyme_BRD_Addendum_E.docx` — client workforce governance, co-employment
   and tenure, approval chains. Ratified.
4. `/spec/Etyme_User_System_Stories.docx` — 22 modules, paired user and system stories.
5. `prisma/schema.prisma` — the data model. Consolidates 134 legacy models into ~28.
6. `BUILD.md` — API surface, workflows, background jobs, permissions.

If code and spec disagree, the spec wins — unless the spec is wrong, in which case
stop and say so rather than quietly diverging.
