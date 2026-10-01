# Supabase self-hosted operations

## Applying and verifying schema migrations

The Dev and production Supabase stacks run remotely in Dokploy on the project
VM. From the repository root, after reviewing a migration, apply it to the
intended environment explicitly:

```powershell
node scripts/selfhosted-db.mjs apply dev supabase/migrations/<migration-file>.sql
```

Use `production` only after explicit PM authorization. The runner reads the
environment-specific SSH host, user, key path, Compose project, and database
role from `.env.local`. One SSH session runs the migration and checksum record
inside a single PostgreSQL transaction under a transaction-scoped advisory
lock. Reapplying the same version and checksum is a no-op; reusing a version
with different SQL fails before changing the database. The runner records the
filename version and SHA-256 in `app_private.schema_migrations`. This is
separate from Supabase CLI migration history. Verify the resulting table, RLS
policies, grants, publication, and runner checksum with a read-only query over
the same SSH target.

The workstation does not need Docker or Podman installed for this workflow.
`npx supabase status` only inspects a local stack and a local-container error
does not indicate that the Dokploy VM is unavailable. Do not use linked-project
or local-stack migration commands for this self-hosted deployment.

### Staging target mapping

In the current Dokploy setup, the public host in `STAGING_SUPABASE_DOMAIN` and
`SUPABASE_URL` is served by the VM configured in `.env.local` as
`SELFHOSTED_DEV_*`, using Compose project `supabase-dev`. This `dev` alias is
the staging database used by the Dev application. The separate Dokploy Compose
record named `supabase-staging` is currently idle and is not the active target
for that URL. Use the SSH target from `.env.local` and the `supabase-dev`
Compose label for staging SQL tests; do not substitute a local container.

## Compatibility boundary

Release 8.2 migrations are additive. The minimum supported client remains
8.1.0: do not drop or rename existing tables, columns, RPCs, Storage buckets,
or enum values while 8.1 is supported. Avatar UI and loading are removed from
8.2, but legacy avatar data is retained and still deleted with the account.

## Envoy gateway migration preflight

Supabase changed the default self-hosted API gateway from Kong to Envoy in
August 2026. This can break a Dokploy deployment when its compose, proxy, or
health checks depend on the `kong` service name, Kong's HTTPS listener, plugins,
or a custom `kong.yml`. It is not safe to replace the image in place.

Before upgrading:

1. Export the exact Dokploy compose and image digests; record the current
   Postgres major version and whether Studio uses `supabase_admin` or `postgres`.
2. Search the compose and Dokploy proxy configuration for `kong`, ports 8000,
   8443, custom plugins, and `API_EXTERNAL_URL`.
3. Take and verify encrypted database and Storage backups.
4. Start the proposed stack on an isolated hostname and copied non-production
   data. Do not attach it to production volumes.
5. Test `/auth/v1/health`, REST with anon and authenticated JWTs, Storage upload
   and download, Realtime subscribe/broadcast, CORS, forwarded client IP, rate
   limiting, and `/api/ready` through the public proxy.
6. Keep the previous compose and immutable image digests as rollback. Switch
   traffic only after all checks pass; never attempt a Postgres 15-to-17 upgrade
   as part of the same change.

Kong can remain explicitly pinned during this validation. Envoy should be
adopted only after Dokploy routing no longer depends on Kong-specific behavior.

The production compose pins every service to an exact image tag
(`kong/kong:3.9.1`, `supabase/postgres:17.6.1.136`, `supabase/storage-api:v1.60.4`,
…), and the weekly `/opt/scripts/supabase-update.sh` only re-pulls those same
pinned tags. The gateway therefore cannot switch to Envoy on its own: adopting
it requires an explicit tag change in addition to the validation above. That
script also force-recreates the whole production stack every Sunday at 01:00
UTC, which is a planned weekly restart and shows up as a short uptime on the
containers — not an incident.

## Production backup

The local backup protects against accidental data loss. Configure the optional
encrypted off-site copy before relying on it for host or provider failure; see
[`OFFSITE_BACKUP_SETUP.md`](OFFSITE_BACKUP_SETUP.md).

`/etc/cron.d/supabase-backup` runs `ops/supabase-backup.sh` daily at 03:00 UTC
as root. Each run writes one dated directory under `/var/backups/phyrexianarena`
containing:

- `database.dump` — `pg_dump --format=custom` of the whole cluster, taken inside
  the `supabase-db` container as `supabase_admin`. That role is the cluster
  superuser; with `postgres` the dump misses the schemas owned by
  `supabase_admin`. It authenticates on the container's local socket, so no
  database password exists in the script or in any environment file.
- `storage.tar.gz` — the Storage volume.
- `SHA256SUMS` — checksums of both archives.
- `manifest.json` — name, timestamp, size, retention.

The directory is published atomically and `/var/backups/phyrexianarena/last-success`
is refreshed only after that. When rclone crypt is configured, a second marker
`offsite-last-success` is refreshed only after the encrypted remote copy. Both
retain the 7 most recent complete backups by default.

`ops/vm-health-alert.sh` (cron, every 5 minutes) warns when the marker is
missing or older than `BACKUP_MAX_AGE_HOURS` (default 30). It also covers disk
usage, container health and the public endpoints, and notifies once per state
change — not once per run — through the webhook, or by email when no webhook is
configured. A failing backup also emails directly from `ops/supabase-backup.sh`.

Alert credentials live in `/etc/phyrexian-health-alert.env` (0600 root) and are
never stored in the scripts.

Restore drill, verified 2026-09-15: restoring the newest dump into a temporary
database reproduced all 73 tables across `public`, `auth`, `storage`,
`realtime` and `supabase_functions` with identical row counts and no
`pg_restore` errors. Repeat into an isolated database at least quarterly.

## Read-only database review

### Staging Realtime connectivity (2026-10-01)

The staging domain is served by Compose project `supabase-dev`. Kong's Realtime
upstream is `realtime-dev.supabase-realtime:4000`; that name must be an alias
of the Realtime service on the default Compose network. A healthy container
alone does not prove public WebSocket connectivity. The missing alias caused
HTTP 503 (`name resolution failed`) and stale concurrent clients.

In `/opt/supabase-staging/supabase/docker/docker-compose.yml`, the `realtime`
service now declares `networks.default.aliases: [realtime-dev.supabase-realtime]`.
Only that staging service was recreated with `docker compose -p supabase-dev
up -d --no-deps realtime`. A real anonymous channel subscription reached
`SUBSCRIBED`; two authenticated browser clients subsequently converged after
overlapping mutations. Preserve the alias when regenerating the Dokploy stack.

Rollback: the VM holds the original Compose file beside it as
`docker-compose.yml.imp-realtime-alias.bak` (0600). Restore that file and recreate
only staging Realtime using the same Compose project. This restores the old
configuration, including its known connectivity failure. Production was untouched.

Run `scripts/qa/supabase-runtime-audit.sql` through `psql` with a read-only
administrative session. Review missing foreign-key indexes, large sequential
scans, RLS expressions, table bloat, connections, and the most expensive
`pg_stat_statements` entries before creating any performance migration.
