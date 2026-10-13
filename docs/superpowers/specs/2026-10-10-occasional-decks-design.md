# Occasional decks for registered players — 9.1.2

## Authorized scope
PM approved the design and instructed autonomous implementation, main release 9.1.2, Dev alignment and APK/unsigned IPA/web compilation. That explicit continuation instruction replaces further design/plan approval prompts. No physical-device testing is requested.

## User behavior
A registered player can choose **Occasional deck** / **Mazzo occasionale** in live game setup, manual recording, or editing an existing match. Enter a name, choose commander (including supported partner selection), optional bracket. Reuse established commander search/art behavior. Keep the player's registered identity and all player-level results/statistics. Show the actual deck in history. When changing an existing match's deck, preserve player, winner, date, notes and unrelated participants unless the editor explicitly changes them. Derived statistics of the previously selected personal deck must reflect the replacement.

Occasional decks do not enter the personal collection, archive, profile mastery or automatic preferred-deck selection. Do not present them as guest players. Do not globally suggest every past one-off deck as a regular choice. Existing occasional selection remains visible when reopening the match editor. Choosing a regular deck again is supported.

## Storage and compatibility
Use the existing `decks` identity and `match_participants.deck_id` relationship. An occasional deck has `source_type='occasional'`, non-null `group_id` for its arena and `user_id` for its registered player; personal collections and profile performance already select `group_id IS NULL`. Retain data and historical references; do not auto-delete after finalization. No guest identity or fake user is created. Existing live game/offline journal deck IDs and snapshots remain compatible.

Creation is online and uses an authenticated idempotent `create_occasional_deck` RPC. Input includes a client-generated stable UUID, arena, player, deck name, commander, image, color identity, optional bracket and commander options. Both actor and target must belong to the arena. Retry with the same ID must not duplicate or mutate an existing different deck. Once created, normal offline game/recovery flows preserve the deck and game. Display a creation error and retain the form if the network fails; don't claim offline deck creation support.

Validate scope/ownership of occasional decks at database boundaries for recorded matches and live games. Arena members can create the deck for another registered member as part of recording/setup, consistent with existing arena recording permissions; never allow arbitrary personal-deck writes or cross-arena attachment. Security-definer RPC has empty search path, explicit auth/membership checks, restricted execute grants and bounded input. Do not loosen general deck RLS.

## UI and languages
Default English, secondary Italian. Inline form within existing edit/record modal avoids simultaneous native iPad modals. Use shared compact creation form and commander selector; actions have loading/disabled state and clear errors. Selecting/replacing a player clears incompatible occasional selection. Support users with no personal decks. Read-only history/public history show the deck through existing snapshots/joins.

## Validation and release
Regression tests before implementation: authorized/idempotent creation, cross-arena/user mismatch rejection, no personal collection/mastery contamination, edit personal→occasional→personal without identity/result changes, live/manual/recovery persistence and empty collection usability. Verify real Dev backend fixture creation/finalization/edit and cleanup; test browser/native-web layouts as practical without physical iPad claims. Run project quality/CI gates; independent review before merge.

Production currently lacks the September participant-release migration (observed in prior recovery diagnosis). Audit required feature dependencies against production; do not blindly replay all migrations. Back up before any authorized production changes. Apply only reviewed required migrations with the repository SSH runner and verify read-only schema/API behavior. This release's deployment authorization includes necessary feature migrations.

Release 9.1.2 / native code 90102 from one final remote main SHA, annotated v9.1.2. Main and Dev end with identical source trees and main ancestry in Dev. Launch signed GitHub/Obtainium APK, Expo production ios-release-unsigned IPA, Dokploy web app.21life.win. Verify platform acceptance; do not monitor remote compilation to completion unless PM asks. Preserve active public downloads until new artifacts are verified.
