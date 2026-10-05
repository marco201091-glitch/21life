---
name: project-development-workflow
description: Apply the PM-led, specification-driven workflow for 21Life. Use for every development, maintenance, audit, release, deployment, documentation, or repository task in this project so branch roles, persistent task tracking, terse communication, and the current code map remain consistent.
---

# Project Development Workflow

## Start every chat

1. Read `.agents/PROJECT_CHECKLIST.md` before taking task action.
2. Treat the user as the PM and specification owner; act as the developer responsible for implementation and verification.
3. Convert the PM's request into acceptance criteria and checklist items. Resolve contradictions against the latest explicit specification.
4. Ask blocking questions immediately when requirements are materially unclear. Otherwise reply only `OK` and start work.

## Execute the specification

- Keep `.agents/PROJECT_CHECKLIST.md` current while working. Record active development, blockers, external follow-ups, and completed work.
- Work on the branch matching the delivery target:
  - `Dev`: upstream for new development and integration.
  - `main`: public web app and standard APK/Obtainium release, including Google OAuth and notifications.
  - `fdroid-prep`: F-Droid-compatible variant and submission preparation.
  - `archive/main-pre-8.0.0`: rollback archive only; do not develop on it.
- Preserve intentional differences between standard and F-Droid builds through configuration or isolated commits; avoid two unrelated implementations.
- Verify changes proportionally with lint, type checks, tests, production builds, release checks, and CI where applicable.
- Update the code map below whenever a substantial change alters architecture, ownership, major directories, release flow, or branch responsibilities.
- Finish only after the requested outcome is verified. Respond with `fatto` followed by an extremely concise checklist of completed items. Include remaining blockers only when any exist.

## Builds and deployments

- Trigger the requested build or deployment and verify only that the platform accepted and started it.
- Do not monitor GitHub, Dokploy, store, or other remote builds unless the PM explicitly asks. The PM will report failures for diagnosis.
- After launch, respond only `Build <target> in corso`, using a clear target such as `github`, `dokploy-production`, or `dokploy-dev`. This is the exception to the normal `fatto` response.

## Current code map

- `app/`: Next.js 16 App Router pages, layouts, and API routes for the web application.
- `components/`: shared web UI and feature components.
- `lib/`: web domain logic, authentication, data access, validation, and security utilities.
- `tests/`: web unit, integration, security, end-to-end tests, and snapshots.
- `expo/`: Expo SDK 57 / React Native client.
  - `expo/app/`: Expo Router screens and navigation.
  - `expo/components/`: mobile UI and feature components.
  - `expo/lib/`: mobile domain, API, authentication, and platform services.
  - `expo/plugins/`: native Expo configuration plugins.
  - `expo/fdroid-build-env.json`: public production client configuration pinned for identical F-Droid/reference bundles.
  - `expo/tests/`: mobile test suites.
- `supabase/`: self-hosted backend configuration, migrations, and Edge Functions.
- `scripts/`: build, verification, release, and operations automation.
  - `prepare-fdroid-env.mjs`, `verify-fdroid-autolinking.mjs`, `scan-fdroid-source.py`: deterministic F-Droid environment and source-only build gates.
- `ops/`: VM services and deployment-retention automation.
- `.github/workflows/`: CI and signed Obtainium release automation.
- `fastlane/metadata/android/`: canonical public store listing metadata.
- `fdroid/metadata/`: local F-Droid build recipe; the official submission is reviewed on GitLab.
- `docs/`: current release-readiness, legal, provenance, and operating documentation.

## Persistent checklist

Use `.agents/PROJECT_CHECKLIST.md`. Keep it concise and never create a competing task ledger.
