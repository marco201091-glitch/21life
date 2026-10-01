# Account export

`GET /api/auth/export-account` keeps the version 1 JSON shape and the existing
Bearer authentication and per-user rate limit. Collections are paged by their
immutable UUID primary key in ascending order. The requested page is 500 rows;
pagination continues until an empty page so a lower PostgREST server cap does
not truncate the result. Matches are collected from the authenticated user's
participations in groups of 100. Access-log IDs are used only as cursors and are
removed from the published rows.

The export fails as a whole on a query error, timeout, or size limit. Defaults
are 25,000 rows, 20 MiB serialized JSON, and a 30-second query budget. The
server can override them with `ACCOUNT_EXPORT_MAX_ROWS`,
`ACCOUNT_EXPORT_MAX_BYTES`, and `ACCOUNT_EXPORT_TIMEOUT_MS` (bounded by the
implementation). It retries once when collection counts or participation
references change during the read, then returns HTTP 409.

PostgREST reads span multiple requests, so the response is not a transactional
point-in-time snapshot. Count and reference checks detect common concurrent
inserts/deletes, but cannot detect every same-count replacement or in-place
update. A strict snapshot would need a database-side export transaction.
