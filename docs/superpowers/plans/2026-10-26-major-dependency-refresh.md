# Major dependency refresh implementation plan

> **For agentic workers:** execute sequentially on the existing maintenance branch; keep version 9.1.3 and all production resources unchanged.

**Goal:** Upgrade Dev dependencies through major versions and leave a tested migration candidate.

**Architecture:** Upgrade Expo SDK 57→58 and its matched native modules as one unit; refresh compatible JS dependencies in web and Expo, then handle API migrations. Commit only lockfiles, package manifests, source compatibility fixes, and this task record.

**Tech Stack:** npm workspaces/package roots, Expo SDK 58, React Native version required by SDK 58, Next.js 16, React, Sentry, TypeScript, ESLint.

**Spec:** `docs/superpowers/specs/2026-10-26-major-dependency-refresh-design.md`

## Global Constraints
- App version remains 9.1.3.
- Work only on `maintenance/dependency-refresh-dev-20261026` based on Dev.
- Expo-managed versions follow SDK 58 compatibility; no arbitrary latest native package overrides.
- No main, production, database, release or deploy actions.

## Review Focus
- Expo native package alignment and generated Android/iOS project changes.
- Router, file-system, notifications, strict RN TypeScript API and removed APIs.
- Sentry native/web initialization and source-map upload behavior.
- Dependency audit and exact node-forge patch hashes after reinstall.
- Clean lockfile install and Android bundle behavior.

## Tasks
- [x] Read SDK 58 and relevant package migration documentation; use the exact module versions in Expo 58's bundled matrix.
- [x] Upgrade Expo SDK 57→58 and matched React Native 0.88/native modules; preserve the node-forge postinstall mitigation and regenerate both lockfiles.
- [x] Upgrade compatible majors: Sentry web 10→11, Sentry React Native 7→8, Framer Motion 13→14. Keep ESLint 9 (Next/Expo plugins do not support 10), TypeScript 6 (typescript-eslint requires <6.1), and resolver 5 (resolver 6 conflicts with installed optional Effect peers). AsyncStorage 3 was tested then reverted because SDK 58 requires 2.2.0.
- [x] Resolve source/config changes for SDK 58 and Sentry 11, including strict RN instance/event types and explicit restrictive Sentry `dataCollection`; add/adjust focused tests for native-state fallback and AsyncStorage test isolation.
- [x] Run clean npm ci in both package roots, dependency audits, web quality/build, Expo quality and Android JS bundle. Final rerun: web quality, Expo quality, web build, Android JS bundle and audits pass; doctor verifies SDK versions but cannot fetch Expo schema because local DNS returns `EAI_AGAIN exp.host`. Android native prebuild is pending the Dev Firebase client config.
- [ ] Review full diff, commit, open PR against Dev, wait for all required checks, then merge only if clean.
