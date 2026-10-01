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
