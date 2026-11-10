# Archidekt synchronization from the game wizard

Selecting a registered arena member with Archidekt synchronization enabled invokes
`POST /api/arena-archidekt-sync` using the requesting player's authenticated session.
The server downloads the target's public Commander decks using the username in
their profile. The target's phone and app session are unnecessary. Guests and
players who disabled synchronization do not trigger an import.

The server verifies both arena memberships and the target's opt-in before the
download. The service-only database RPC checks them again immediately before
saving, including a changed Archidekt username. The database locks the profile
and membership rows and saves the import atomically. The client cannot supply
another requester's identity or imported deck contents. Private decks are excluded.

The import bypasses search/detail caches, follows pagination, deduplicates source
IDs and runs at most four detail imports concurrently. A 90-second deadline bounds
the download; the mobile request allows 120 seconds. Excessive catalogs (over
5,000 public decks or 100 pages), malformed responses and pagination loops fail
explicitly. Failed downloads preserve existing decks. Partial imports report the
number skipped; zero changed decks can still be a completed synchronization.

Commander extraction ignores cards explicitly marked as companions even when
they are also in the Commander category. If no commander is identified and the
deck contains exactly one physical card, that card is used as the commander;
larger ambiguous decks are not guessed. The next successful sync updates existing
Archidekt deck records in place, retaining their identifiers and history.

The wizard refreshes the selected member's catalog before reporting completion.
If saving succeeds but reading the list fails, the message reports a saved sync
and retries the list read without re-importing. The client distinguishes session,
permission, configuration, rate-limit and upstream failures, and reports an
uncertain outcome when the request or save result cannot be confirmed. In-flight
requests for the same arena/member are shared. A list of 120 decks is flagged as
potentially truncated. Responses for an earlier player selection cannot replace the current status.
Requester and target rate limits protect upstream resources.

Structured server diagnostics cover import/save outcomes and durations, push
worker failures and processed counts, and account export/deletion stages. They
do not include user IDs, deck names, credentials, request bodies or raw errors.
Events go to application logs; their retention and availability depend on the
deployment's log configuration. Live-game telemetry additionally redacts common
credentials and push tokens. These logs cannot prove that a notification was
displayed or resolve an operation whose response was lost.

Existing clients retain their self-service RPC and legacy Realtime queue. Their
wizard still uses the old phone-dependent flow until the client is updated.
Existing personal decks preserve their identifiers, history and archive status;
arena-specific decks and other source types are untouched.

## Delivery and verification

- Apply `20261005132724_arena_archidekt_server_sync.sql` before deploying the new
  backend and mobile client to the same environment. It has been applied and
  verified on self-hosted Dev. Production requires separate PM authorization.
- The migration keeps the private helper inaccessible to application roles and
  grants its execution only to the existing administrative self-service RPC owner.
  This supports installations whose migration runner and old RPC have different owners.
- `scripts/qa/arena-archidekt-sync.sql` uses isolated users/arena fixtures and rolls
  back every change. It checks ACLs, membership removal, opt-out, username changes,
  atomic invalid-payload rollback, insert/update/unchanged results and old RPC compatibility.
  CI runs it against its disposable database; remote QA must target Dev explicitly.
- Unit/security tests cover API authorization and forged input, fresh imports,
  pagination, private decks, failures, timeouts, concurrency and client result validation.
- Standard and F-Droid release branches consume the common implementation during
  their next promotion. Existing immutable release tags must not be moved.
