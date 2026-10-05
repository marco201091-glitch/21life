# F-Droid 9.0.4 release correction plan — 2026-10-05

Goal: submit 9.0.4 / 90004 with a source-only recipe, reproducible developer-signed reference APK and every actionable review item addressed.
Specification: PM request; MR 44721 reviewer notes (mezinster, 2026-10-03; linsui).
Execution: inline, in the existing improvement/fdroid-904 worktree; preserve the original workspace changes.

1. Restore scandelete and retain only 9.0.4 in fdroid/metadata/com.phyrexianarena.app.yml. Run fdroid rewritemeta/readmeta/lint and enforce LF. Pin the official recipe to the same immutable commit as fdroid-v9.0.4.
2. Verify the actual Expo autolinking command from the Android working directory requires source builds for every resolved Expo project. Reproduce the failure by omitting the source policy, then restore it. Keep excluded dependencies absent.
3. Configure NetInfo before listeners to use the app backend for its HTTP reachability fallback while preserving Android native reachability; remove the inaccurate sign-in/diagnostics store copy and update 90004 changelogs.
4. Add source scanner and autolinking checks to the reference workflow before Gradle. Build twice after scanner deletion, compare unsigned APK bytes, verify package/version/ABI/signing certificate and scan the signed binary before publishing.
5. Run local quality, scanner/metadata checks and native source-only validation. Promote the reviewed candidate onto fdroid-prep, publish the immutable release tag and start the reference build. Update the GitLab recipe only with the exact public source pin; reference availability and F-Droid inclusion remain separate gates.

Evidence: older failed job 16735722726 builds cf4d8d4 (no source policy), not 84fe4e31. Latest job 16781865562 fails with 137 scanner findings because scandelete is absent. Existing Windows candidate/rebuild evidence is reusable only for unchanged inputs and does not prove the corrected Linux recipe.
Progress is tracked only in .agents/PROJECT_CHECKLIST.md.
