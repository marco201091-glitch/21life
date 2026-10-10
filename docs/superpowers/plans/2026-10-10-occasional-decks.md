# Occasional Decks Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task. Independent web/native adapters may use separate agents with disjoint file ownership.

**Goal:** Record registered players using occasional decks, including historical match editing, and release 9.1.2.
**Architecture:** Reuse arena-scoped `decks` rows with source_type occasional and existing deck_id contracts; protected idempotent RPC creates them. Shared service feeds native/web creation forms and existing game/editor state.
**Tech Stack:** Next.js 16, Expo 57, TypeScript, self-hosted Supabase/Postgres, Vitest, Playwright.
**Spec:** ../specs/2026-10-10-occasional-decks-design.md

## Global Constraints
- Version 9.1.2 / 90102; English default and Italian secondary.
- Player results count; occasional decks outside personal collection/mastery.
- Online creation; offline/recovery preserve created deck IDs and snapshots.
- No general RLS loosening, cross-arena references, fake guests or deletion of historical data.
- Same final remote main SHA for all platform builds; Dev aligned.

## Review Focus
- Registered users with zero personal decks can select occasional deck.
- Editor replacement keeps player/winner while old deck counters drop.
- Failed/double submit keeps form, retries once without duplicate rows.
- Foreign-arena attachment fails even through direct database writes.
- Native modal/commander selection remains usable on iPad orientations.

### Task 1: Storage and shared creation contract
Files: new supabase migration; expo/lib/occasional-decks.ts; lib/occasional-decks.ts re-export; relevant query filters; tests for shared service and SQL security contract.
Interface: `createOccasionalDeck(client: SupabaseClient, input: { id: string; groupId: string; userId: string; name: string; commander: string; commanderImage: string|null; colorIdentity: string[]; bracket: string|null; commanderOptions?: unknown[] }): Promise<MemberDeck>`; `isOccasionalDeck({source_type?:string|null}): boolean`.
- [x] Write failing service/security tests for stable ID, authorized scope, idempotency and exclusion from normal choices.
- [x] Implement RPC plus match/live scope validation, helper and filters. No production mutation during implementation.
- [x] Apply Dev migration, test real authorized/denied RPC calls, existing match editing, finalization and cleanup.
- [x] Review, verify and commit task files.

### Task 2: Expo game and editor UX
Files: new expo/components/table/occasional-deck-form.tsx; existing record-match-modal.tsx, edit-match-modal.tsx, live setup components/play route; translations/types where necessary; native UI tests.
Consumes Task1 interface. Create client UUID once per form submission, persist returned deck in local choice list and select ID. Pass groupId explicitly from arena/play screen; embed form in existing modal. Use useTranslation/current language or existing label conventions. Regular deck selection clears temporary form. Hydrate existing occasional match deck from joined snapshot.
- [x] Write failing regressions for registered user/no decks and editor deck replacement preserving identity/winner.
- [x] Add compact inline form, existing commander picker and bracket; expose in manual/live/editor flows.
- [x] Verify targeted tests, typecheck and iPad portrait/landscape preview when feasible.
- [x] Review and commit task files.

### Task 3: Web UX and collection isolation
Files: components/arena/occasional-deck-form.tsx; app/table/[id]/page.tsx and play/page.tsx; profile/archive query filters if needed; shared arena queries. Read installed Next.js docs before writing app code.
Consumes Task1 same helper; web form uses established guest commander picker. Normal picker excludes occasional rows; editor injects selected historical deck. Arena/player performance continues counting match rows; personal collection/group-null excludes occasional. No changes to source importer behavior.
- [x] Write failing regressions for collection/preferred-deck isolation and existing editor replacement.
- [x] Implement web live/manual/editor integration and audit all personal/preferred deck queries.
- [x] Verify web tests/typecheck/browser layout; review and commit.

### Task 4: Release and deployment
Files: official version updater outputs, README/release notes and root persistent checklist.
- [ ] Run complete quality gates and independent whole-branch review; fix findings and confirm source remains clean.
- [ ] Back up production; compare actual schema dependencies, apply reviewed feature migration via SSH runner and verify authorized/denied reads/API behavior.
- [ ] Bump 9.1.2/90102 with official updater; required PR checks; normal merge main, verify remote final SHA/tree; align Dev to main with normal checked PR.
- [ ] Read prebuild/merge-failure gates; annotate/push v9.1.2 only after final remote merge/version proof.
- [ ] Launch APK GitHub, unsigned IPA Expo production and web Dokploy same main SHA; restore web autodeploy and record acceptance IDs. No remote completion monitoring.
