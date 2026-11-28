## Learn the Vercel flows: Etyme does the wiring — 2026-11-17

**What came in.** A vision note from Sharath, Owner of Tapin, sent through
the founder on 2026-11-17. He numbers it decision 78 in his own copy of the
record. In this repository decision 78 is a different file, so it is
recorded here as 93.

**The vision.** Vercel is the benchmark: an enterprise app that needs
almost no change management. Etyme flows the same way. Five marks:
1. *Few steps, in the order a person thinks.*
2. *State visible on the item itself.* Nobody opens a log to learn where
   a thing stands.
3. *Verification that turns green by itself.* The person never presses
   "check" and then waits.
4. *Reversible by default.* A step taken can be taken back, and the screen
   says so.
5. *The system does the wiring.* Never a person relaying values between
   admin portals. A flow that needs a value copied from one system into
   another is Etyme's fault.

**The anti-pattern, by his own example.** Today's Microsoft wiring runs
across four systems: the tenant, the domain's host, the app registration
and the hosting project's settings. The person copies identifiers and
secrets between them by hand. The LinkedIn app is the same.

**Where it applies first, in his order.**
1. Tenant setup.
2. Settings.
3. The wiring of each sign-in door.
4. Integration connections.

**The rule he states:** *a flow that needs training or a rollout plan is
wrong, not the user.* This sharpens "Zero training" in CLAUDE.md. A flow
is judged by the five marks above, and one that fails them is a defect.

**What it does not change.**
- Security rules stand. A secret still lives in the platform's secret
  store, never in the database, a log or a chat. A directory binds only
  to a domain the company has verified (record 13 and CLAUDE.md,
  Sign-in). "The system does the wiring" means Etyme drives the steps it
  can. Where a step must be done in another company's own portal, Etyme
  says that one step plainly, shows its state, and detects when it is
  done.
- No new feature is built under this note ahead of the stabilization
  layers. It is the test every flow in Layers 7 to 10 is built to, and the
  first thing fixed in the four areas above.

**First step.** A read-only map of today's flows in those four areas,
scored on the five marks, with the smallest first slices. It goes to the
founder before anything is built.
