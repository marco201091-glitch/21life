# F-Droid 9.1.2 alignment

Production source: main `23b23fe8e4163bf7628f66465e68a17101064304`.
Previous F-Droid branch: `bfe6af29a6d83a9c9dd0468f0fd7c3367d6a544c`.
Version 9.1.2 / 90102. Integration retains both histories.

The F-Droid client includes production profile mastery, game recovery, iPad guest-dialog fixes, occasional decks and current 21Life domains. Package identity and signing key are unchanged.

Preserved review requirements from MR44721:
- Only the latest build entry, LF canonical YAML and separate command-list entries.
- Debian Forky nodejs/npm; no NodeSource or binary repositories.
- All Expo Android modules build from source. Source scanner deletes dependency binaries; no prebuilt AAR exemptions.
- Deterministic Glide registration, JDK21 and matched build paths/tooling.
- Two clean unsigned builds must compare byte-for-byte before signing. APK identity, arm64 ABI, forbidden permissions, signer and binary scan are gates.
- Pinned public environment, backend NetInfo reachability, no Google OAuth/mobile Sentry/push/image-picker dependencies.
- Fastlane text remains upstream; only build metadata goes to fdroiddata.
- Canonical GitHub URLs use marco201091-glitch/21life, as requested in the latest independent review.
- Reference releases remain prereleases, latest=false, with immutable fdroid-v tags. Standard Obtainium releases remain separate.

Quality and CodeQL now run on fdroid-prep pull requests/pushes. Mobile CI verifies the F-Droid source and pinned environment. Reference workflow additionally enforces annotated tags and fdroid-prep ancestry.

Publication order: pass candidate CI; merge and verify remote final SHA/tree/version; create annotated fdroid-v9.1.2 tag on that final SHA; start reference workflow; after its published APK passes, pin the official MR recipe to the same full SHA and start GitLab validation. Do not update the official recipe while its reference binary is unavailable. Maintainer device testing and inclusion remain external gates.

Validation evidence and remaining actions are recorded in PROJECT_CHECKLIST.md. No main/Dev deployment or database change is part of this alignment.

Reference tooling updated to Node24.21.0/npm12.0.2 to match current Debian Forky packages (https://packages.debian.org/forky/nodejs and https://packages.debian.org/forky/npm). Only F-Droid manifests allow npm12; standard branch requirements are unchanged. Source package versions remain locked. Future Debian drift requires a new matched reference and independent reproducibility verification.

CI doctor rejected seven upstream SDK patch drifts after the production snapshot. Updated seven direct dependencies: @expo/ui57.0.23, expo57.0.28, expo-crypto57.0.4, expo-router57.0.26, expo-screen-orientation57.0.3, expo-sharing57.0.23 and expo-splash-screen57.0.10. Domain logic remains unchanged. The existing advisory policy retains the same two IDs, vulnerable leaf versions and expiry; only the exact Expo/CLI ancestor versions are updated to the verified new lock, and the unused Sentry exception is removed. No new advisory or extended exemption was accepted.

The SDK patch update also resolves normal lockfile transitives, including Expo autolinking57.0.15 and modules-core57.0.22. Repeated clean prebuild confirms all22Expo Android projects still build from source on the new lock; no aarProjects are permitted.
