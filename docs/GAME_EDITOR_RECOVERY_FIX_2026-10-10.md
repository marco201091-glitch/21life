# Game editor and Recovery Center fixes — 2026-10-10

Reported symptoms: replacement UI overwhelmed the game editor; a completed iPad game with registered users and a concession stayed in Recovery Center and Sync appeared inactive.

## Changes

- Restored the existing participant/deck cards. Replacement choices now open only for the requested row, with one compact action instead of a full roster repeated above every card.
- Replacement identity, deck options and winner now follow the selected replacement. Original participants remain excluded from other rows to preserve the existing sequential persistence constraints; duplicate effective replacements are also excluded.
- Recovery shows sync progress and the actual Supabase error, including plain-object errors. Sync/discard are disabled during a request. The busy state clears after a completed session as well as an active game.
- Creation, mutation, finalization and cancellation requests have a 15-second transport timeout. A stalled attempt releases the sync lock so another attempt can run.
- A partially acknowledged mutation batch falls back to the idempotent single-mutation RPC, preserving operation IDs. Already committed actions are not applied twice.
- Queued operation versions advance even when an action became a no-op after another client changed server state, matching the RPC version contract.
- Sync failures, including finalization, are recorded with a sanitized useful error message for diagnosis.

## Evidence

Regression tests were run before fixes: hidden replacement choices/winner mapping, partial acknowledgement and no-op replay failed on the previous code. Timeout and recovery feedback tests were added. Full Expo quality checks passed, followed by an independent review; the review found original-player reuse risks, which were excluded and covered by another regression test.

A real Dev backend test used synthetic registered users/decks/group: partial acknowledgement recovered exactly once, concession produced one match, repeated finalization returned the same match. Fixture sessions were revoked and fixture data removed. No production data was changed.

Browser preview of the actual editor and participant components passed at 1024x1366, 1366x1024 and 390x844, including replacement and save, with screenshots inspected. Native-only wrappers, icons/date field were shimmed; this is not a physical iPad test.

## Delivery and limits

Changes target Dev. The published v9.1.0 tag and APK/IPA are immutable and unchanged. The specific device's outbox cannot be inspected from this workstation: the reproduced recovery defects are fixed, but the user's saved game is not claimed to have been synchronized. Its original storage keys/payloads remain compatible with an updated client; retry from that device is required. Do not discard the pending game or uninstall the app before recovering it.

Local evidence: ignored artifacts/game-recovery in the implementation worktree, including real-backend results, quality log and rendered screenshots.
