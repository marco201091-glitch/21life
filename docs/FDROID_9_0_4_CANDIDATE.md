# F-Droid 9.0.4 candidate

Prepared locally on `improvement/fdroid-904`, based on `origin/fdroid-prep`
`1254d80`. The 9.0.4 metadata recipe pins the source commit `3125ada`.
The source is local until this branch is reviewed and pushed; no release tag,
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
