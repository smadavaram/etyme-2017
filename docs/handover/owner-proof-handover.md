Piece B handover: the first person is an Admin; Owner is earned by proof
Base: c4449e7c4 (Piece A, pushed). Apply: git apply owner-proof-wip.patch (adds 4 new files; the type check was clean on it).

What is done (in the patch, not tested):
- lib/company-create: `ownerProofRequired` flag. It sets Company.ownerProofRequiredAt, uses rolesFor(kind,{narrowAdmin:true}) and seats the founder as Admin. It returns `seatedAs`.
  The three doors pass it: api/companies (Add company, when ownsIt), api/onboarding (first sign-in by Google or Microsoft), lib/password-door makeCompany. ownsAFirm also counts an Admin founder under the rule.
- lib/counterparty: the "registering makes you its owner" sentence now says Admin until proven.
- The gate is wired into routes I own: settings/kind.ts (COMPANY_TYPE), settings/sign-in PATCH (SIGN_IN_MODE), settings/grants POST for COMPANY/UNIT scope (GIVE_ACCESS), settings/remit-to writes and the setup BANK item (BANK). Pass ownership's gate went in with Piece A.
- lib/owner-proof: mayBecomeOwner (pure).
- api/settings/owner-proof/route.ts: GET shows the caller's two proofs; POST {action:'become-owner'}. become.ts records the DOMAIN proof, reseats the Admin as Owner and sets ownerVerifiedAt, in one transaction, logged as OWNER_VERIFIED.
- api/superadmin/owner-proof/route.ts: a Superadmin records a provider's result as an OwnerProof PERSON row, verbatim. A one-person firm's person is seated Owner on a confirmed result. Logged as OWNER_PROOF_RECORDED, with an access row under 'OWNER_PROOF_RECORD' cast as AccessAction; regulatory must add that name.
- dashboard/superadmin/page.tsx: the "Record an identity check" form.

What is left:
1. Re-add 'OWNER_VERIFIED', 'OWNER_PROOF_RECORDED' to RULE_ATTRIBUTED in lib/autonomy.ts (taken out in A so the autonomy test stayed green).
   Then bump docs/security-posture.md: actions 227→229, attributed 176→178, route files 373→375.
   Also add both names to the ladder list in owner-rules.test.ts.
2. Setup checklist item OWNERSHIP ("Prove ownership", slug 'ownership', after DOMAIN, every kind). Files:
   - lib/setup-checklist.ts: ItemKey, ITEM_ORDER, ITEM_WORDS, ITEM_SLUG, NUMBER_WORDS 'Thirteen', ChecklistFacts.ownerVerified, NO_FACTS, doneByFacts.
   - lib/setup-gate-rules.ts: STEP_PLACE OWNERSHIP.
   - lib/setup-checklist-state.ts: the fact comes from company.ownerVerifiedAt. Refuse a DONE outcome unless verified, like FORWARDING.
   - api/settings/setup/read.ts: detail.OWNERSHIP.
   - dashboard/settings/setup/items.tsx: OwnershipItem. It reads GET /api/settings/owner-proof and offers a "Become Owner" button. It uses Frame noSave.
   PROVE_OWNERSHIP_HREF already points at /dashboard/settings/setup/ownership.
3. Tests: a new __tests__/invariants/owner-proof.test.ts, written as sentences:
   - a new company's first person is an Admin;
   - each gated act is refused naming the step until an Owner is verified (needsVerifiedOwner);
   - an existing company is not gated (ownerProofRequiredAt null);
   - a one-person firm becomes Owner on the person proof alone (proofStanding plus mayBecomeOwner);
   - Become Owner refused without both proofs.
   Then update the signup and company-setup tests that assume the signer-up is the Owner, and count them.
   Run: tsc; setup-checklist, setup-steps, company-setup, signup-*, two-hats, autonomy, legal-pages, matrix, map, domain-ownership, every-route-has-a-door.
4. Matrix: add L3.2.2.19 for the proof rule. Add a task to L3.6.3.12 for the thirteenth item. Run npm run matrix.
