# Obtainium release checklist

This document prepares distribution through GitHub Releases and Obtainium. It
does not authorize or trigger a publication.

For F-Droid-style publication, also follow `docs/FDROID_RELEASE_READINESS.md`.

## One-time setup

- [x] Replace every launcher, splash, favicon, and wordmark asset with the
  approved 21Life brand artwork.
- [ ] Record the author, source, and license of every distributed visual asset
  in `docs/ASSET_PROVENANCE.md`.
- [ ] Create a permanent Android release keystore outside the repository.
- [ ] Back up the keystore and passwords in two secure offline locations.
- [ ] Configure local signing variables from
  `expo/android-signing.properties.example`.
- [ ] Verify the public Privacy Policy, Terms, support address, and account
  deletion flow.

## Every release

- [ ] Promote the approved version from `Dev` into `main`.
- [ ] Create an annotated version tag matching the app version.
- [ ] Build from the tagged clean worktree with the production environment.
- [ ] Confirm package `com.phyrexianarena.app`, version name, and version code.
- [ ] Confirm the APK is not debuggable and is signed by the permanent key.
- [ ] Run the complete verification suite and install/upgrade smoke test.
- [ ] Generate and verify SHA-256.
- [ ] Publish APK, matching `.apk.sha256`, web SBOM, and Android SBOM from the
  same tagged build. Verify their version, source commit, APK checksum, and
  uploaded bytes before marking the GitHub Release complete.
- [ ] Keep IPA distribution explicitly separate until its channel and signing
  format are approved; never report an unsigned IPA as a published iOS release.
- [ ] Test the GitHub Release URL in Obtainium before announcing it.

## Release blockers

- Debug or temporary signing certificate.
- Unapproved or undocumented artwork.
- Dirty worktree or source/version mismatch.
- Production environment pointing to Dev/Test services.
- Missing legal pages or inaccessible account deletion.
- APK signature different from the previous public release.
- A same-name release asset with different bytes; stop and investigate rather
  than overwriting it.
- Store listing or app name using third-party trademarks in a way that could
  imply official Wizards endorsement. Existing domain and package identifiers
  remain technical compatibility identifiers for this release.
