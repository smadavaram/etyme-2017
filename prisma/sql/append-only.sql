-- The security log is append-only, and the database itself says so.
-- Layer 7, record 86 (2026-11-16): "a separate security log that nothing
-- can change".
--
-- The schema reaches the database by `prisma db push`, which runs no SQL
-- of its own and cannot declare a trigger. So this file runs right after
-- every push: scripts/db-sync.mjs on a deploy that sets DB_PUSH_ON_BUILD,
-- and __integration__/templates.ts when the test template is built.
--
-- Safe to run any number of times. The function is replaced in place, and
-- each trigger is created only where it is missing, so there is never a
-- moment with no guard on the table.
--
-- What it cannot stop, said plainly: the database's owner can drop a
-- trigger. The next step is a second, lesser database role for the app,
-- which needs the founder's hosting settings. /ready proves the guard is
-- present on the deployment (lib/readiness, "The security log cannot be
-- changed").

CREATE OR REPLACE FUNCTION etyme_security_log_refuses_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'The security log is append-only: a row is never changed, deleted or emptied.'
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = '"SecurityEvent"'::regclass AND tgname = 'security_event_never_changed'
  ) THEN
    CREATE TRIGGER security_event_never_changed
      BEFORE UPDATE OR DELETE ON "SecurityEvent"
      FOR EACH ROW EXECUTE FUNCTION etyme_security_log_refuses_change();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = '"SecurityEvent"'::regclass AND tgname = 'security_event_never_emptied'
  ) THEN
    CREATE TRIGGER security_event_never_emptied
      BEFORE TRUNCATE ON "SecurityEvent"
      FOR EACH STATEMENT EXECUTE FUNCTION etyme_security_log_refuses_change();
  END IF;
END
$$;

-- No grant to change a row, where the database allows it. The app
-- connects as the table's owner, and an owner may revoke its own
-- ordinary privileges; a superuser ignores them, which is why the
-- triggers above are the guard and this is the second line.
REVOKE UPDATE, DELETE, TRUNCATE ON "SecurityEvent" FROM PUBLIC;
REVOKE UPDATE, DELETE, TRUNCATE ON "SecurityEvent" FROM CURRENT_USER;
