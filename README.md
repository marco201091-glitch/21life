<p align="center"><img src="public/icon-192.png" width="96" height="96" alt="21Life emblem"></p>

# 21Life

[![Android 9.1.2](https://img.shields.io/badge/Android-v9.1.2-7c3aed?style=flat-square)](https://21life.win/download/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)

**Your Commander table, from the first life total to the last match statistic.**

21Life helps you run Commander games, manage your playgroup and understand its meta. Record a game once; share its result and use the same history for player, deck and commander analytics.

[**Visit 21life.win**](https://21life.win) · [**Open the web app**](https://app.21life.win) · [**Download**](https://21life.win/download/) · [**Getting started**](https://21life.win/guida/)

English is the default language. Italian is available in both the app and the website.

## At the table

- Track life, commander damage, infect and eliminations for **2–6 players**.
- Use undo and recover an interrupted game.
- Record wins, draws and how the game ended: last player standing, combo, concession or an alternate win condition.
- Play with registered members or guests in private playgroups.
- Keep shared match history, decks, rankings and awards together.
- Import decks from **Archidekt or Moxfield**, with commander and colour metadata.
- Explore player, deck and commander performance, brackets, colours and trends.

Accounts, shared history, imports and synchronization require an internet connection. Interrupted-game recovery does not make every feature available offline.

Learn more on the [About page](https://21life.win/info/) or follow the [guide](https://21life.win/guida/).

## Install and update

### Web

Open [**app.21life.win**](https://app.21life.win) in a modern browser. The web and mobile clients share your account and hosted data service.

### Android

Download the signed APK from the [**official download page**](https://21life.win/download/) or [GitHub Releases](https://github.com/marco201091-glitch/21life/releases/latest). Each new release includes a SHA-256 checksum.

For automatic update checks with [Obtainium](https://obtainium.imranr.dev/):

1. Install Obtainium and choose **Add App**.
2. Paste the repository URL:

   ```text
   https://github.com/marco201091-glitch/21life
   ```

3. Confirm the detected release and install its APK.

Use the standard production APK when updating an existing production installation. Dev and F-Droid builds have separate purposes and build policies.

### iPhone and iPad

The web app works in the browser. [**Unsigned IPA builds**](https://github.com/marco201091-glitch/21life/releases) are provided for compatible **TrollStore Lite** installations. They are built on Expo from the production release source, include iPad support and need a compatible sideloading setup. They are not App Store releases.

The website's download page lists Android and Web only.

## Start a playgroup

1. Create an account or sign in. The standard release supports email/password and Google sign-in.
2. Create or join a private playgroup; invite its members and add guests as needed.
3. Add your decks or import them from Archidekt or Moxfield.
4. Set up a game, track the table and record the result.
5. Open history and analytics to see how players, decks and commanders perform over time.

See the [guide](https://21life.win/guida/) and [FAQ](https://21life.win/supporto/) for more detail.

## What's new in 9.1.2

- Use an **Occasional deck** for a registered player when borrowing or trying a deck, in live games, manual records and existing match edits.
- Results count toward the player's statistics; the occasional deck stays in match history, outside the personal collection and profile mastery.
- Changing a recorded match's deck updates the original deck's statistics while keeping the player and result.
- Create occasional decks online; created decks retain their identity in offline games and Recovery Center.

### From 9.1.1

- Restored the compact game editor, with player replacements opened on demand and consistent deck/winner selections.
- Recovery Center displays synchronization progress and actionable errors, and supports retrying stalled requests.
- Safer synchronization retries preserve operation IDs, prevent duplicate life changes and recover partially acknowledged batches.

### From 9.1.0

- New home at **21life.win**, with production web and backend domains migrated together.
- English by default, with Italian available.
- Improved life gain/loss feedback and arena animations that respect reduced motion.
- The profile selects the deck with the highest mastery score: **games played + 2 × wins**.
- iPad damage management follows the attacking player's card orientation.
- Improved guest management on iPad, including form recovery on errors and safer claim sharing.
- Updated web/mobile tooling and expanded automated regression checks.

Read the [release notes](docs/releases/9.1.1.md) and [official releases](https://github.com/marco201091-glitch/21life/releases).

## Domains and compatibility

| Purpose | Address |
| --- | --- |
| Website and download guide | [21life.win](https://21life.win) |
| Production web app | [app.21life.win](https://app.21life.win) |
| Production Supabase backend | `https://supabase.21life.win` |
| Development web app | `https://dev.21life.win` |
| Development Supabase backend | `https://supabase-dev.21life.win` |

Existing accounts and data are preserved. Previous production endpoints remain available as compatibility aliases for installed clients and the registered Google callback. Native package identifiers, deep-link schemes and local session keys retain their established values to preserve upgrades and sessions.

## Support, privacy and legal

- [Support and FAQ](https://21life.win/supporto/)
- [Report a bug or request a feature](https://github.com/marco201091-glitch/21life/issues)
- Email: [support@21life.win](mailto:support@21life.win)
- [Privacy policy](https://app.21life.win/legal/privacy)
- [Terms of service](https://app.21life.win/legal/terms)
- [Cookies and storage](https://app.21life.win/legal/cookies)
- [Account deletion guide](https://21life.win/supporto/#account)
- [Account data export](docs/ACCOUNT_EXPORT.md)

## Development

The repository contains the **Next.js web app**, the **Expo / React Native mobile app** and the configuration for a **self-hosted Supabase backend**. The presentation website is a separate project deployed through Dokploy.

Use the Node version in [.node-version](.node-version) and the package manager declared in [package.json](package.json). Create a local `.env.local` from [.env.example](.env.example) with **Dev** credentials; native configuration examples live in [expo/.env.example](expo/.env.example) and [expo/.env.production.example](expo/.env.production.example). Keep production credentials out of development builds.

```sh
npm ci
npm --prefix expo ci
npm run dev
```

For automated verification:

```sh
npm run quality
npm --prefix expo run quality
```

See [branch and release workflow](docs/BRANCH_RELEASE_WORKFLOW.md), [Obtainium release checks](docs/OBTAINIUM_RELEASE_CHECKLIST.md) and [Supabase operations](docs/SUPABASE_OPERATIONS.md). Supabase runs on the project VM; the local workstation does not need a local database container for remote operations.

The F-Droid submission is under review. Its separate edition uses email/password authentication and omits Google sign-in, push notifications and Sentry; see [F-Droid readiness](docs/FDROID_RELEASE_READINESS.md). It is not currently advertised as a download on the website.

## License and attribution

21Life is released under the [MIT License](LICENSE). See [third-party notices](THIRD_PARTY_NOTICES.md) for bundled and external components.

21Life - Tracker & Analytics is unofficial fan content. It is not approved, endorsed or sponsored by Wizards of the Coast. Magic: The Gathering and related trademarks belong to their respective owners.
