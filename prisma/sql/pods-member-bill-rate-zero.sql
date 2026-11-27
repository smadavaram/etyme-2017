-- Record 120, pods: a member line of a sold team has no hourly rate of its own;
-- the team is billed by deliverable. Sets billRate 0 on existing pod member
-- SellContracts. LOCAL ONLY: never run on production (no production write
-- without the owner's yes). Idempotent. Run after the push that adds
-- PodProject.onSite:
--   npx prisma db execute --file prisma/sql/pods-member-bill-rate-zero.sql --schema prisma/schema.prisma
UPDATE "SellContract" SET "billRate" = 0
WHERE "projectOrderId" IN (SELECT "projectOrderId" FROM "PodProject");
