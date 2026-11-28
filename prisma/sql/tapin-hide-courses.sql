-- Tapin's storefront hides courses always (record 120, answer 3): a setting
-- for that tenant, not a rule for all. Tapin is created on production by
-- signing up, not by the seed (lib/seed-setup), so the setting is applied here.
-- Idempotent. Run once after the push that adds the column:
--   npx prisma db execute --file prisma/sql/tapin-hide-courses.sql --schema prisma/schema.prisma
UPDATE "Company" SET "coursesHiddenOnStorefront" = true WHERE slug = 'tapin';
