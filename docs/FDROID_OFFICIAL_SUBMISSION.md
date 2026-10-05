# F-Droid official submission checklist

## Branch

Use `fdroid-prep` for official F-Droid work. Use `Dev` for development and
`main` for standard APK, Obtainium, and direct distribution.

## Local build intent

F-Droid flavor:

```bash
APP_VARIANT=fdroid
EXPO_PUBLIC_FDROID_BUILD=true
EXPO_PUBLIC_SENTRY_ENABLED=false
EXPO_PUBLIC_DISABLE_PUSH_NOTIFICATIONS=true
```

Expected differences from standard APK:

- Google sign-in hidden.
- Sentry removed from the mobile dependency graph and native Gradle project.
- Expo Push disabled and `expo-notifications` removed from the mobile dependency
  graph.
- Photo-library dependencies are absent from every build variant.
- Release build can be produced unsigned with Gradle property
  `-PfdroidBuild=true`, for byte comparison before copying the preserved developer signature.

## Local verification

```bash
npm ci
npm --prefix expo ci
npm run verify:fdroid
npm run verify:security
npm run typecheck
npm --prefix expo run typecheck
npm --prefix expo run android:bundle:check
```

Gradle unsigned release check:

```bash
cd expo/android
APP_VARIANT=fdroid EXPO_PUBLIC_FDROID_BUILD=true EXPO_PUBLIC_SENTRY_ENABLED=false EXPO_PUBLIC_DISABLE_PUSH_NOTIFICATIONS=true ./gradlew :app:assembleRelease -PfdroidBuild=true -PreactNativeArchitectures=arm64-v8a --no-daemon --console=plain
```

On Windows PowerShell:

```powershell
cd expo/android
$env:APP_VARIANT='fdroid'
$env:EXPO_PUBLIC_FDROID_BUILD='true'
$env:EXPO_PUBLIC_SENTRY_ENABLED='false'
$env:EXPO_PUBLIC_DISABLE_PUSH_NOTIFICATIONS='true'
.\gradlew.bat :app:assembleRelease -PfdroidBuild=true -PreactNativeArchitectures=arm64-v8a --no-daemon --console=plain
```

## F-Droid metadata

Draft metadata lives in:

```text
fdroid/metadata/com.phyrexianarena.app.yml
```

Before submitting each release, replace the draft marker with the exact full SHA of the public F-Droid source tag. The official 9.0.4 MR must point to the exact `fdroid-v9.0.4` source commit. F-Droid metadata requires commit hashes rather than branch names.

## Official submission

Merge request:

<https://gitlab.com/fdroid/fdroiddata/-/merge_requests/44721>

The earlier 8.2.0 revision passed its F-Droid build. The corrected 9.0.4 recipe
restores the source scanner and retains only the latest build. Its reference
workflow scans the source before two clean Gradle builds, compares APK bytes,
verifies package/version/ABI/permissions and the preserved signing certificate,
then scans the signed binary before publishing. The official pipeline and
maintainer on-device review remain separate gates. Never claim acceptance
based only on local quality checks or the GitHub reference build.

On 2026-10-05 the final official pipeline passed:
<https://gitlab.com/marco201091-glitch/fdroiddata/-/pipelines/2912844691>.
Build job 16933655464 successfully compared its APK with the supplied reference
and verified the allowed signer; check APK job 16933655472 passed. All metadata
jobs passed, including current fdroidserver master rewritemeta. The MR source
head is `46907e9d15c485e1c22807e1fc0d480aae30e7d4`; its recipe pins immutable
app source `688268860b1946ec8c060825d0780c0164f4a702`.
The reference is public at
<https://github.com/marco201091-glitch/PhyrexianArena/releases/tag/fdroid-v9.0.4>.
Maintainer approval and on-device testing are still external pending gates.
