# 21Life

[![Web app](https://img.shields.io/badge/Open-Web_App-16a34a?style=flat-square)](https://app.phyrexianarena.dpdns.org)
[![Android](https://img.shields.io/badge/Android-v9.0.5-7c3aed?style=flat-square)](https://github.com/marco201091-glitch/21life/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)

Track Commander games, manage your playgroup, and turn match history into statistics that actually mean something — without a spreadsheet.

## What it is

A tracker for Commander pods. You run the game on a phone or tablet on the table, and the result lands in a shared history your playgroup can look back at: who is winning, with which deck, in which bracket, and why.

Every game is one tap away from being recorded, and every recorded game feeds the same analytics, so the numbers stay honest without anyone maintaining them by hand.

## What you get

**Run the game**

- Life, commander damage, infect, and eliminations for 2–6 players
- Undo at any point, and recovery if the app closes mid-game
- Win conditions are recorded, not just the winner: last standing, combo, concession, alternate win card
- Draws are tracked as their own outcome and never counted as a loss

**Keep the group together**

- Private playgroups with invitations and guests — nobody needs an account to sit at the table
- Shared match history that everyone sees
- Optional public results page to share the standings outside the group

**Understand the meta**

- Rankings across players, decks, and commanders
- Deck and commander performance with brackets, colours, and trends
- Personal analytics: your decks, your streaks, your win rate
- Playgroup awards for the memorable stuff — fastest win, most damage, best comeback

**Bring your decks**

- Import from Archidekt or Moxfield
- Deck metadata, commanders, and colour identity resolved automatically

English and Italian interfaces throughout.

## Install

### Web

Open **[app.phyrexianarena.dpdns.org](https://app.phyrexianarena.dpdns.org)** in any modern browser. Nothing to install.

### Android with Obtainium

[Obtainium](https://obtainium.imranr.dev/) keeps the app updated straight from this repository's releases — no store account.

1. Install Obtainium.
2. Choose **Add App** and paste this repository URL:

   `https://github.com/marco201091-glitch/21life`

3. Confirm the detected release and install the APK.

Obtainium will tell you when a new signed release is available. You can also grab the APK from [GitHub Releases](https://github.com/marco201091-glitch/21life/releases/latest), where each release ships a SHA-256 checksum so you can verify it before installing.

### iOS

A public build is not available yet. An unsigned IPA can be built from source and sideloaded.

### F-Droid

The official F-Droid submission is under review. The F-Droid edition keeps the same core tracking and analytics, but uses email/password authentication only and omits Google sign-in, push notifications, and Sentry, to comply with the F-Droid build policy.

## How it works

The web app and the Android app share one hosted account and data service, so matches, decks, playgroups, and statistics stay in sync across whatever you sign in on.

Sign-in is email/password, with optional Google sign-in on the web and the standard Android build. An internet connection is needed for account sync, multiplayer data, and external deck or card services.

## Project

- Built with Next.js for the web, Expo/React Native for mobile, and a self-hosted Supabase backend.
- Every migration, deploy script, and release workflow lives in this repository.
- Contributions, bug reports, and feature requests are welcome through [issues](https://github.com/marco201091-glitch/21life/issues).

## Privacy and legal

- [Privacy policy](https://app.phyrexianarena.dpdns.org/legal/privacy)
- [Terms of service](https://app.phyrexianarena.dpdns.org/legal/terms)
- [Account deletion](https://app.phyrexianarena.dpdns.org/legal/delete-account)
- [Third-party notices](THIRD_PARTY_NOTICES.md)
- [MIT License](LICENSE)

21Life - Tracker & Analytics is unofficial fan content. It is not approved, endorsed, or sponsored by Wizards of the Coast. Portions of the materials used are property of Wizards of the Coast LLC.
