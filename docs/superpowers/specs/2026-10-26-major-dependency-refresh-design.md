# Major dependency refresh on Dev

## Intent and scope
Use Dev as a compatibility branch to upgrade major web/mobile dependencies and expose migration work while the app remains at version 9.1.3. Production, main, deployed services, and version identifiers are out of scope.

## Goals and constraints
- Upgrade Expo in one SDK step to SDK 58 and use the React Native version in that SDK's bundled compatibility matrix (0.88.0).
- Upgrade compatible direct dependency majors, including Sentry and Framer Motion. Keep toolchain majors on versions supported by the SDK and framework plugin peer ranges.
- Preserve app version 9.1.3, native identity, existing platform configuration and the existing `node-forge` patch mitigation.
- Fix migration breakages in source and config; do not mask compatibility issues by force-installing unsupported dependency combinations.
- Verify clean installs, security audits, web/Expo quality, Expo doctor, Android bundle, and web build where the available host permits.
- Keep everything on a feature branch and integrate only to Dev after review/CI. No production action.

## Approaches considered
1. Upgrade every package directly to `latest` — rejected because Expo/RN native packages must follow the SDK compatibility matrix.
2. Upgrade within existing major ranges only — already completed; leaves requested major refresh outstanding.
3. Recommended: upgrade Expo SDK incrementally to 58, use its compatible package matrix, then upgrade remaining web/mobile majors in small compatible groups and validate after each group.

## Decisions
Proceed with the SDK-aligned upgrade and major refresh on Dev. Keep package/app version 9.1.3 unchanged. Treat API/config migrations as required work and stop only for a platform constraint that cannot be resolved in this environment.
