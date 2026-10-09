# Technology maintenance implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline, task by task. User explicitly requested continuous cautious execution, silent until report; no repeated approval gates.

**Goal:** Execute the approved technology review with compatible upgrades and reproducible gates, preserving 9.1.0 and production.
**Architecture:** Existing Next/Expo/Supabase architecture; isolated branch from origin/Dev. Small commits per independently verified lot, no deployment or production configuration mutation.
**Tech Stack:** Node 24 LTS, Next 16, Expo SDK 57, React Native, npm, Vitest.
**Spec:** `docs/TECHNOLOGY_REVIEW_2026-10-09.md` in primary checkout; user authorization 2026-10-09 "procedi con tutto ... un passo alla volta".

## Global constraints
- Preserve PM checkout, app/native versions 9.1.0/90100, existing production and website publication hold.
- No npm force/legacy-peer-deps, no automatic renewal of security exceptions, no unsupported native combinations.
- New behavior gets reproducing tests. Dependency changes use existing quality/check/export/build gates rather than synthetic version assertions.
- Review major upgrades against peer compatibility and maintenance benefit; unsupported upgrades are documented with exact evidence, not forced.

## Review focus
- Build tooling vulnerability acceptance must not silently widen or renew after updates.
- Expo native peers and ABI coverage must remain coherent.
- Sentry production upload cannot silently skip required credentials.
- Environment gate must reject mixed Dev/production domains and allow staged production cutover.
- Browser language must respect saved preferences and correct HTML lang.

## Tasks
1. [ ] Align Expo SDK57 patches, Babel preset and compatible peers. Run Expo install check, quality, dependency audit, inspect lockfile. Commit.
2. [ ] Update compatible web/shared libraries, keeping Next/env/config versions coherent. Read bundled docs; web and Expo quality/audit. Commit.
3. [ ] Handle advisory paths and override provenance without widening policy: compare upstream versions and actual bundle paths, remove overrides only with compatible upstream proof. Document unresolved upstream security with concrete mitigation and expiry.
4. [ ] Reproducible tooling: Node24 contract/CI/Docker digest, pin EAS CLI; doctor drift bounded policy with reproducing tests; native ABI test command and Sentry behavior checks. Commit verified changes.
5. [ ] Centralize domain build expectations with old/new production rollout allowed and strict environment isolation tests. Integrate approved English default and HTML lang regression. Commit.
6. [ ] Evaluate major test/lint/compiler/Sentry/native upgrades and server stack with exact peer/changelog evidence. Implement safe useful upgrades separately; record reasons for incompatible/deferred migrations. No remote infra changes.
7. [ ] Final quality/audits/build/export/browser native validation, fresh independent whole-branch review, fixes and report. Keep production unchanged; hand off reviewed candidate for Dev integration.

## Execution rulings / evidence
- Existing audited clean linked worktree reused; branch `chore/technology-maintenance-9.1` from bbfbaa6. Baseline 615 tests and authenticated Dev E2E recorded in audit, dependencies unchanged since.
- User execution authorization overrides skill artifact approval handoffs; this plan records the already-approved scope.
