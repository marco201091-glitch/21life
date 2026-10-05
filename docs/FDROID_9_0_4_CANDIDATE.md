# F-Droid 9.0.4 candidate

Prepared locally on `improvement/fdroid-904`, based on `origin/fdroid-prep`
`1254d80`. The 9.0.4 metadata recipe pins the source commit `f12b7de0c2cb60a7c9d6721245ecae1397ea9347`.
The source is prepared on this feature branch for review; no release tag,
public APK, store acceptance or official merge-request update is claimed.

| Capability | Standard 9.0.4 | F-Droid candidate |
| --- | --- | --- |
| Deck archive and restore | Included | Same common implementation |
| Archidekt live-game sync/wait state | Included | Same common implementation |
| Email login | Included | Included |
| Google login | Included | Hidden on Android by variant policy |
| Push | Expo notifications | Dependency absent; existing variant stub retained |
| Sentry | Included | Dependency/plugin absent; runtime stub retained |
| Android ABI | arm64-v8a, x86_64 | arm64-v8a recipe retained |
| Source build | Standard signing | Unsigned recipe, source autolinking and reproducibility patches retained |

Only functional files were carried from Dev. The variant package graph,
native configuration, Sentry stub and reproducibility patches were retained.
Version fields are 9.0.4 / 90004. The old build recipes remain unchanged.
Compatible `brace-expansion` patches resolved the inherited high advisory;
no excluded module was added.

Verified locally: Expo lint/typecheck/coverage/logo checks/Knip, F-Droid
readiness, production audit (zero findings), Android export (2,630 modules),
and JS budget (7.73 MiB / 12 MiB). `npm ls` confirms Sentry, Expo notifications
and image picker are absent from the installed graph. This is dependency and
bundle evidence; the updated recipe still needs native fdroidserver
scanner/build/reproducibility validation. Device checks are assigned to PM.


Native candidate verification (2026-10-01): Gradle assembleRelease completed
with arm64-v8a, fdroidBuild=true and the F-Droid environment flags, after
using locally installed CMake 3.31.6 through a temporary Gradle init script.
The default CMake 3.22.1/Ninja failed on this Windows checkout. This local
workaround is not a change to the official Linux recipe or proof of its build.
Final source: f12b7de0c2cb60a7c9d6721245ecae1397ea9347; generated APK is unsigned,
package com.phyrexianarena.app, version 9.0.4 / 90004, label 21Life, arm64-v8a.
SHA-256: 71b05cdb3649de9660883da7fe15d0a25991b295e9ae9c577e342458c214056e.
Android apkanalyzer dex packages found no io.sentry, expo.modules.notifications
or expo.modules.imagepicker class namespaces. apksigner rejects it as expected
for the unsigned recipe (no META-INF/MANIFEST.MF). No device install occurred.
Binary scanner fdroidserver 2.4.5 ran on this exact APK with `--refresh --exit-code`
and returned exit 0 (2026-10-01). It checked known non-free classes and extra
signing blocks. A second scan using Android SDK build-tools in PATH also
returned exit 0. This Windows binary scan does not attest the official Linux
recipe, source scanner or clean-build reproducibility; those remain pending.


Additional Windows reproducibility check: `gradlew clean` followed by a fresh
release rebuild, same F-Droid flags/CMake 3.31.6, produced an APK identical
byte for byte to the saved candidate (SHA-256 above). The first app configure
step needed regeneration of Reanimated/Worklets Prefab outputs after clean;
`:react-native-reanimated:prefabReleasePackage` and
`:react-native-worklets:prefabReleasePackage` succeeded, then app assembleRelease
completed in 10m07s (1,191 tasks executed). This documents the local workaround,
without changing or attesting the official Linux recipe.

Review corrections (2026-10-05): source scan restored before Gradle; only the
9.0.4 recipe retained; LF enforced and canonical rewritemeta applied. Actual
Gradle autolinking command resolves 22 Expo source projects. Removing the
source policy reproduces the verification failure. The old failed build job
16735722726 used cf4d8d4 (no source policy); its failure does not prove a
regression in the later 84fe4e31 policy. NetInfo preserves native reachability
and points its fallback at the app backend /api/ready (HTTP 200), instead of
Google. Store copy now describes the F-Droid exclusions, with a 90004 changelog.

Fresh quality: 249 Expo tests, lint, typecheck, coverage, logos and Knip pass.
The October 5 npm audit reports 20 high findings propagated from two upstream
advisories without published fixes: braces <=3.0.3 (GHSA-vfj7-8cjw-p6xm) and
node-forge <=1.4.0 (GHSA-86w9-cpqp-85rv). npm's suggested downgrade to Expo 44 is
incompatible and was not applied. These are Expo CLI/Metro dependencies; audit
is not green and no general vulnerability-free claim is made.

The upstream recipe uses fdroid-v9.0.4 because a commit cannot embed its own
hash. The official fdroiddata recipe must use the exact SHA of that tag. Do not
publish the official update before the signed reference asset exists.

Reference runtime environment correction: the old workflow exposed a
PRODUCTION_SUPABASE_ANON_KEY variable but never mapped it to Expo's public
variables. A clean build had no Supabase URL/key, so native compilation alone
could not prove startup. expo/fdroid-build-env.json now pins only public client
configuration (JWT role anon verified; production Auth settings HTTP 200).
prepare-fdroid-env.mjs validates the whitelist, role, expiry, production URLs
and exclusions, then writes exactly the same .env in GitHub and F-Droid.
Signing credentials remain in GitHub secrets. No privileged key is included.
Independent release review found the RUNNER_TEMP gh repository-context error;
the publisher now passes --repo explicitly.

Local source scanner completed successfully on the disposable source/dependency
tree (fdroidserver 2.4.5, refreshed signatures, zero fatal findings). Every
prebuilt Expo AAR was deleted. The real Gradle autolinking command still resolves
all 22 Expo Android projects from source after deletion. The source scan used
the pre-environment-helper snapshot with the same dependency graph; the Linux
workflow scans the final tagged tree again before building. Updated public
environment tests pass 8/8; fresh Expo tests remain 249/249. Android F-Droid
export passes at 7.73 MiB / 12 MiB, and byte inspection confirms the production
Supabase URL, public anon key, API URL and Turnstile site key are in the Hermes
bundle (values are deliberately not printed in logs).

Reference attempt 37286774149 stopped before dependency installation/native
build: setup-gradle tried to write GRADLE_USER_HOME before the mirrored directory
was created (EACCES). The action now runs after directory creation/chown. No
9.0.4 release or APK existed, and the official MR still referenced 9.0.1; only
this unpublished candidate tag may be realigned to the corrected source, using
an explicit force-with-lease against 7079dd597e42d2acb850adee59d36ded8ac1f6bd.

Final reference run 37287041006 passed on immutable source/tag
688268860b1946ec8c060825d0780c0164f4a702. The final Linux source scan, two
byte-identical unsigned builds, APK identity/ABI/permissions, signing certificate
and signed binary scan all passed. Release fdroid-v9.0.4 contains the reference
APK and checksum; downloading both confirms SHA-256
b6d14c27cbeaeae7092a394542baaff1be7cadb6e48634cde584c978e227c865.
Do not move this published tag. Official MR 44721 now contains fdroiddata commit
52e0624c3251a0a53282901e273d3bbe9865bdf5, pinning that exact source SHA.
Official pipeline 2912832364 is running; independent F-Droid reproducibility
and maintainer on-device review remain pending.

The official rewritemeta job uses fdroidserver master c21c177, whose formatter
wraps the long Binaries URL differently from local fdroidserver 2.4.5. Official
recipe follow-up 46907e9d1 applies its exact output (blob
13f254cfb3c8f562c030ffe5e1da29fddacd1b94). This formatting-only correction
preserves the source pin, published APK and build instructions. The formatter
itself writes a space after Binaries: before its newline; this is intentional
official output, not an accidental trailing-whitespace change.

Final official pipeline 2912844691 PASSED on 2026-10-05, source head
46907e9d15c485e1c22807e1fc0d480aae30e7d4. Build job 16933655464 reports
"compared built binary to supplied reference binary successfully" and the
allowed signer 5d25e32cdf901becfba81adf93189e1d755e50a90b897efa21da4c2ab3002106.
Check APK job 16933655472 and every metadata/source check passed. The technical
release/submission work is complete; maintainer approval and physical device
review are pending. No Android device was connected to this workstation.
