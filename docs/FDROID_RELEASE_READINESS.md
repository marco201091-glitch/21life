# F-Droid-style release readiness

Version 9.0.1 is being prepared in the official F-Droid `fdroiddata` merge request. Source build, reproducibility, and device review must pass before inclusion.

## Current assessment

- Source and license: repository source is public-facing and the project has an
  MIT license.
- Build model: Expo/React Native produces an unsigned Android APK entirely from
  source. Expo modules are built from source and Gradle/JVM targets are aligned
  for the F-Droid build environment.
- Network services (Non-Free Network Services / Tethered Network Services): the app depends on a self-hosted Supabase backend,
  Scryfall,
  Archidekt, Moxfield, EDHREC, Resend, Turnstile, optional Google OAuth, optional
  Expo Push, and optional Sentry diagnostics. These may require F-Droid
  Anti-Feature disclosure.
- Tracking: Sentry is disabled unless `EXPO_PUBLIC_SENTRY_ENABLED=true`; the
  F-Droid build flag disables Sentry initialization and removes the Expo Sentry
  config plugin from generated native config.
- Optional proprietary service entry points: the F-Droid build flag hides Google
  sign-in on Android so email/password remains the primary auth path.
- Assets: bundled brand assets are documented in `docs/ASSET_PROVENANCE.md`.
  Commander card imagery is fetched at runtime and is not bundled in the APK.
- Naming risk: `phyrexianarena`, `MTG`, `Magic: The Gathering`, and `Commander`
  are legally sensitive signals. Maintainer decision for the current public
  build: keep the existing domain/package/scheme and bundled mana symbols for
  the first submission attempt, because the user-facing branding is not centered
  on those internal identifiers. If a store review rejects the app on this
  basis, prepare a follow-up flavor with neutral identifiers and replacement
  symbols.
- App display name: Android now uses `21Life`.
- Repository name: a pure GitHub repository rename to `MTG_Tracker_Analytics`
  is low-impact for code and Git history. GitHub redirects normal web and git
  operations from the old repository URL, but existing local clones should still
  update `origin`, GitHub Pages URLs are the notable exception, and the old name
  must not be reused by a new repository because that can break redirects.

## F-Droid build flag

Set these variables for a F-Droid-oriented Android build:

```text
APP_VARIANT=fdroid
EXPO_PUBLIC_FDROID_BUILD=true
EXPO_PUBLIC_SENTRY_ENABLED=false
```

The standard APK/Obtainium build keeps optional Google sign-in and mobile push
notifications available. The F-Droid branch hides Google sign-in, removes
Sentry from the mobile dependency graph, disables Expo Push, removes
`expo-notifications`, and uses email/password as the primary login path. Photo
library access is absent from every build variant.

Run the local verifier before exporting the Android build:

```bash
npm run verify:fdroid
APP_VARIANT=fdroid EXPO_PUBLIC_FDROID_BUILD=true EXPO_PUBLIC_SENTRY_ENABLED=false npm --prefix expo run android:bundle:check
```

Official F-Droid metadata draft:

```text
fdroid/metadata/com.phyrexianarena.app.yml
```

Operational checklist:

```text
docs/FDROID_OFFICIAL_SUBMISSION.md
```

## Submission status

- Official merge request: <https://gitlab.com/fdroid/fdroiddata/-/merge_requests/44721>
- The 9.0.1 source build, APK checks, scanner, and pipeline are pending.
- `NonFreeNet` is declared for the fixed hosted and third-party network services.
- Store text and changelog live upstream under `fastlane/metadata/android/en-US`.
- Remaining work is external maintainer review and any requested follow-up.
- Keep the neutral-identity fallback plan only if store review rejects the
  current name, domain, or symbols.
