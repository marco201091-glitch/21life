# 21Life rebranding Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. PM authorized execution on Dev on 2026-10-08; production release remains separate.

**Goal:** Rinominare repository, domini e riferimenti correnti da PhyrexianArena a 21Life senza interrompere app installate, autenticazione e dati offline.

**Architecture:** Sviluppo destinato a Dev, migrazione infrastrutturale additiva con vecchi endpoint temporaneamente disponibili. Separare nomi pubblici, dati persistenti e identità applicative; nessuna sostituzione globale cieca.

**Tech Stack:** Next.js, Expo, GitHub, Dokploy, Supabase self-hosted, DNS, Resend, Google OAuth, Sentry.

**Spec:** Richiesta PM 2026-10-08: lavorare su dev; piano e accessi necessari per repo/dominio/occorrenze phyrexianarena → 21life.

## Global Constraints

- Target Dev; produzione e fdroid-prep hanno promozioni separate.
- Nome repository previsto: 21life; nome prodotto già presente: 21Life.
- Dominio confermato dal PM: 21life.win, registrato su Cloudflare. Host applicativi app/dev/test. Backend nuovi da configurare dopo inventario servizi; vecchi endpoint disponibili durante la transizione.
- Preservare modifiche locali preesistenti. Prima dell'implementazione preparare checkout isolato dal Dev remoto verificato.
- Leggere guide Next installate prima del codice e checklist merge/prebuild prima di build/tag/deploy.
- Nessuna riscrittura Git, tag o migrazioni SQL già applicate per eliminare riferimenti storici.
- Identificativi com.phyrexianarena.app e suffisso .dev: preservare per aggiornamenti compatibili; rinomina totale richiede decisione PM su nuove identità app.

## Review Focus

- Client vecchi con URL backend incorporati: mantenere servizio compatibile sui vecchi host.
- Partite offline/storage: migrare chiavi senza perdita, leggere legacy e verificare idempotenza.
- Cambio origine web: storage/cookie non si trasferiscono automaticamente; sincronizzare dati pendenti e prevedere nuovo login.
- OAuth/reset password/inviti: whitelist, callback, deep link e associazioni OS su vecchi e nuovi URL.
- Repo rinominata: remote Git, webhook Dokploy, CI, release/Obtainium e metadata F-Droid devono restare coerenti.

### Task 1: Inventario e preflight accessi

- [ ] Confermare dominio, email supporto, transizione e scelta identificativi mobili.
- [ ] Inventariare file tracciati, env ignorate, CI/segreti, servizi VM e integrazioni. Non stampare segreti.
- [ ] Verificare read-only disponibilità repo 21life, DNS/provider, scope API Dokploy/Cloudflare/Resend/Sentry/GitLab e progetto Google/Expo.
- [ ] Registrare matrice occorrenze: rinominare, migrare, alias legacy, storico immutabile.

### Task 2: Preparare domini e servizi

**Files:** lib/canonical-host.ts, lib/legal-site.ts, expo/lib/env.ts, docs/SUPABASE_OPERATIONS.md, ops/vm-health-alert.sh, scripts/vm-health-alert.sh, env locali e remoti.

- [ ] Registrare/ottenere controllo dominio; creare host app/dev/test/backend necessari secondo inventario effettivo, TLS e routing Dokploy.
- [x] Aggiornare configurazioni Dev, Supabase Auth site URL/redirect, Google OAuth, Turnstile, email Resend e DNS SPF/DKIM/DMARC. Supabase Dev pubblico nuovo e legacy verificati; env Dokploy efficaci al prossimo deploy.
- [ ] Verificare health, login/password/reset, inviti, API, Realtime e invio email Dev.
- [x] Conservare vecchi endpoint backend e callback; redirect web solo dopo valutazione dati offline e client vecchi.

### Task 3: Codice e compatibilità su Dev

**Files:** README.md, package.json/lockfile se necessario, expo/package.json/lockfile, expo/app.json, expo/app.config.js, public/.well-known/assetlinks.json, .github/workflows/*, scripts/verify-*.mjs, lib/legal-documents.ts, expo/lib/legal-documents.ts, lib/reserved-usernames.ts, file importatori/User-Agent, lib/live-game-offline.ts, lib/live-game-setup.ts, expo/lib/{live-game-offline,live-game-setup,arena-cache,language-storage-core}.ts e test associati.

- [ ] Aggiornare riferimenti correnti, URL, email, metadata, script, workflow e documentazione operativa secondo matrice.
- [ ] Introdurre scheme nuovo con supporto callback legacy; verificare Google/login, reset, join e deep link Android/iOS.
- [x] Preservare storage offline e compatibilità sessioni: stessi nomi legacy anche sui nuovi hostname backend; test di isolamento Dev/produzione e fallback SDK.
- [x] Preservare package/bundle ID, EAS projectId, firma e identità notifiche per gli aggiornamenti compatibili autorizzati.
- [ ] Eseguire quality web/Expo e regressioni pertinenti. Build ed export solo dopo gate checklist e richiesta esecutiva applicabile.

### Task 4: Rinomina GitHub coordinata

- [x] Rinominare marco201091-glitch/PhyrexianArena in marco201091-glitch/21life tramite gh/API con admin già confermato.
- [x] Aggiornare origin nei checkout, riferimenti correnti GitHub e source Dokploy Dev/main. Integrazioni EAS/store e proposta F-Droid restano verifica separata.
- [ ] Verificare release/tag/asset, CI, protezioni branch, Obtainium e link pubblici; nessuna riscrittura tag storici.
- [ ] Aggiornare metadata F-Droid e proposta GitLab in fase separata, preservando app ID e revisione ufficiale.
- [ ] Rinominare directory locale con sessioni/processi chiusi e aggiornamento percorsi workspace/skill/automazioni; non necessaria per rinominare GitHub.

### Task 5: Collaudo Dev e successiva promozione

- [ ] Verificare nuovi host, vecchi client, OAuth/reset/inviti, offline, email, notifiche e installazione come aggiornamento APK.
- [ ] Verificare diff residui: ogni vecchio nome deve avere motivazione legacy/storico/identità.
- [ ] Integrare su Dev rispettando check/protezioni; piano rollback di codice/config/DNS con endpoint vecchi disponibili.
- [ ] Produzione/main, release mobile e F-Droid solo con successiva autorizzazione PM; ritiro vecchi host dopo migrazione client verificata.

## Accessi osservati

- GitHub gh autenticato: permissions.admin=true sulla repo attuale, verificato read-only.
- .env.local contiene nomi di configurazione Dokploy API, SSH Dev/produzione, Cloudflare, Resend, Google OAuth, Sentry e GitLab; valori/scope non verificati in questo piano.
- GOOGLE_CLIENT_ID/SECRET consentono configurare il provider, non dimostrano accesso di gestione Google Cloud.
- SUPABASE_ACCESS_TOKEN non sostituisce SSH/Dokploy nel setup self-hosted.
- DNS: serve controllo del dominio scelto; Cloudflare token non dimostra gestione/registrazione del dominio dpdns.org.
- Expo/EAS e store: nessuna sessione o permesso gestionale verificati.

## Evidenze esterne

- GitHub rinomina e redirect: https://docs.github.com/en/repositories/creating-and-managing-repositories/renaming-a-repository
- Android application ID e identità app: https://developer.android.com/build/configure-app-module
