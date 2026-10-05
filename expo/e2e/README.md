# Device smoke tests

Maestro smoke flow for the most important offline path: login → quick game → arena.

Run only during final device validation:

```powershell
npm run test:e2e:android
```

Build and install the isolated Dev package before the flow so the standard
release app and its local data stay untouched:

```powershell
$env:APP_VARIANT = 'dev'
$env:EXPO_PUBLIC_SUPABASE_URL = '<staging URL>'
$env:EXPO_PUBLIC_SUPABASE_ANON_KEY = '<staging anon key>'
npm run android -- --variant debug --no-bundler
npm run test:e2e:android
Remove-Item Env:APP_VARIANT, Env:EXPO_PUBLIC_SUPABASE_URL, Env:EXPO_PUBLIC_SUPABASE_ANON_KEY
```

Requirements: the Dev package installed, an unlocked ADB device connected, and
Maestro CLI installed locally. The flow targets `com.phyrexianarena.app.dev`
and leaves the standard package/data intact. The optional manual CI workflow below does not change the protected quality checks.

The optional `android-device-e2e.yml` workflow prepares a Dev emulator, Metro
over `adb reverse`, and three quick-game runs. It requires the GitHub variable
`STAGING_SUPABASE_URL` and secret `STAGING_SUPABASE_ANON_KEY`; neither is currently
configured. The workflow is manual, has not been run, and is not a required check.
It does not claim coverage of authenticated games or archive flows.

For the prepared authenticated archive flow, run from the repository root:

```powershell
$env:E2E_ENV_ROOT = 'C:/Users/marco/Documents/GitHub/PhyrexianArena'
$env:E2E_DRIVER = 'maestro'
$env:EXPO_PUBLIC_SUPABASE_URL = 'https://supabase-staging.phyrexianarena.dpdns.org'
$env:EXPO_PUBLIC_API_BASE_URL = 'https://dev.phyrexianarena.dpdns.org'
$env:EXPO_PUBLIC_SITE_URL = 'https://dev.phyrexianarena.dpdns.org'
# For a development-client APK, also set the link to its running Metro instance:
$env:E2E_METRO_URL = 'phyrexianarena-dev://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081'
node scripts/run-staging-authenticated-e2e.mjs
Remove-Item Env:E2E_DRIVER, Env:E2E_ENV_ROOT, Env:E2E_METRO_URL, Env:EXPO_PUBLIC_SUPABASE_URL, Env:EXPO_PUBLIC_API_BASE_URL, Env:EXPO_PUBLIC_SITE_URL
```

The runner checks Maestro, exactly one ADB device and the installed Dev package
before creating two temporary staging users, a playgroup and personal decks.
Credentials are inherited as `MAESTRO_` variables; they are not command-line
arguments or YAML literals. Cleanup deletes only fixture IDs and verifies absence.
The installed Dev APK and its Metro process must already use the same explicit
staging DB, API and site values, including the staging anon key. The preflight
can inspect the package and configuration provided to the runner; it does not
attest values compiled into an independently installed APK. Never run this
flow against an APK of unknown provenance. The archive YAML is prepared
but has not been executed on a device; Maestro is unavailable on this workstation.
See [Maestro parameters](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/parameters-and-constants)
for its shell-variable behavior. A live-game YAML also prepares two-player creation, damage, draw/save and recap;
the runner verifies a single saved match remains after archive/restore. Three
successful native executions still remain; the browser suite covers these
flows on desktop/mobile viewports but does not replace native device evidence.
