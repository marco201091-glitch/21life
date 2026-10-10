# Occasional decks — implementation and verification

Registered players can create and select an occasional deck in live setup, manual recording and historical game editing. Their account, winner and result remain associated with the match; the arena-scoped deck is retained in history and excluded from personal collection, profile mastery and automatic preferred selection. Creation requires connectivity; existing offline journals retain the created deck ID and snapshots.

Storage uses existing `decks` rows (`source_type=occasional`, arena `group_id`, registered `user_id`) and existing `match_participants.deck_id`. `expo/lib/occasional-decks.ts`, re-exported by `lib/occasional-decks.ts`, calls an authenticated, idempotent, bounded RPC. Database guards reject cross-arena/player attachments and changes to occasional identity/scope. General deck RLS was not loosened.

Native and web forms use existing commander/partner selectors and optional bracket. They preserve input after failure, retain request IDs for retries and block conflicting player/deck/seat changes during creation. Historical edit hydrates the original deck only for its original player. Saved setup restoration is gated during network failure and offers retry, preventing background restoration from overwriting new choices. Existing active-game journal recovery remains compatible.

## Verification

- Web complete quality: 344 tests passed, one pre-existing optional test skipped; lint, typecheck, 103-file coverage ratchet, script tests, operations migration manifest and dependency checks passed. Final native/UI deltas additionally passed root lint/typecheck and focused web tests.
- Expo complete quality on final native logic: 312 tests / 80 files passed; lint, typecheck, 101-file coverage ratchet, brand asset verification and dependency checks passed. Subsequent changes only corrected replacement characters in loading copy.
- Real Dev backend: 19 checks passed, including concurrent stable-ID creation, collision/auth denial, cross-arena/user guards, collection/preferred isolation, personal→occasional→personal editing with refreshed snapshots and recalculated original deck counts, live creation/recovery/finalization idempotency and a member without personal decks. Synthetic users, sessions and groups cleaned.
- Native-web preview: actual editor and creation form at 1024×1366, 1366×1024 and 390×844; create/select/save preserves participant and winner, no horizontal overflow. Native wrappers, commander search and transport were shimmed. This is not a physical iPad test.
- Independent review found and resolved identity/historical injection, occasional auto-selection, concurrent request state, context switching during requests and transient setup hydration issues; no outstanding critical or important findings.

## Production database

Backup: `/var/backups/21life-release-9.1.2/postgres.dump`, SHA-256 `894cf3dba559e3c76b39662a5e5bb608639ef761c436aa980dfa6a589c868285`; pg_restore listing verified (1110 records).

Initial feature migration rolled back atomically because production's old `get_arena_member_decks` lacked the `is_favorite` OUT field. Verified no partial RPC or migration registry entry remained. Applied the existing required prerequisite `20260729070641`, then `20261010105147_occasional_decks.sql`, using the SSH-backed runner. The feature does not depend on the previously observed missing participant-release projection migration; that unrelated follow-up remains separate.

Actual production snapshot trigger and required columns verified. RPC and four guards present; anonymous execute denied, authenticated execute enabled. Nine additional production compatibility checks ran inside a rolled-back transaction; no fixture groups persisted.

Both Dev/production registries match the applied byte hashes: prerequisite `8979bea2a9e0959336716611de9342d2e7cba8823c320fec6f7f252db5806b51`, feature `0773179d44ea577d6b16558cef68870931b4379665f17eddeaf63693c97e07b1`. Targeted `-text` Git attributes preserve these exact CRLF bytes; prerequisite SQL logic is unchanged.

Release version 9.1.2 / 90102 is synchronized using the official updater. Final PR/remote SHA, Dev alignment, annotated tag and platform launch IDs are recorded separately in the persistent project checklist and release launch report. Builds are not declared complete solely from platform acceptance.
