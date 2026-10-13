-- Fresh CLI databases do not run the SSH runner's registry bootstrap.
-- Keep its exact schema, with no fabricated historical migration entries.
CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS app_private.schema_migrations (
  version text PRIMARY KEY,
  name text NOT NULL,
  checksum text NOT NULL CHECK (checksum ~ '^[a-f0-9]{64}$'),
  applied_at timestamptz NOT NULL DEFAULT now(),
  applied_by text NOT NULL DEFAULT current_user
);
REVOKE ALL ON app_private.schema_migrations FROM PUBLIC, anon, authenticated;
