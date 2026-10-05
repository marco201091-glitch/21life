# Project checklist

Preferenza permanente PM: comunicare SEMPRE nella modalità OK / Fatto + checklist.

- [x] Login password manager: semantica username/current-password/new-password e disattivazione maiuscola automatica nei campi password web/Android; test Playwright, build web, typecheck/lint e test web/Expo OK.
- [x] Awards deck web: descrizioni dei premi sopra il podio, tradotte IT/EN; typecheck OK.
- [x] Awards deck Expo: descrizione spostata sopra il podio; righe mazzo mostrano solo il conteggio partite. Aggiornamento live nell’emulatore.
- [x] Profilo Expo: etichetta “Collection insights” rinominata “Decks insights” (IT: “Analisi mazzi”); Fast Refresh attivo.

## In progress

- [x] Backup off-site: risolto 403 `RATE_LIMIT_EXCEEDED` del client OAuth condiviso. Rclone 1.75.1 installato con checksum ufficiale; config e binario precedenti conservati. Client OAuth dedicato in produzione con scope `drive.file`, cartella backup nuova e chiave crypt originale preservata. Backup del 2026-09-28 riuscito; marker locale/off-site e file cifrati verificati. Config di recupero e checksum caricati e verificati su Drive.

- [x] Hotfix 9.0.1 gestione record arena: cancellazione verificata su web/mobile; partecipanti eliminati nuovamente disponibili; sostituzione partecipante in modifica riservata ad Arena Manager. PR production #118 e promozione Dev #119 unite. CI completa verde (migrazioni SQL, web/Expo quality, build, E2E). Deploy Dev avviato sul commit `fd83926`; migrazione DB Dev avviata. RLS cancellazione manager applicata e verificata su Supabase production e Dev via Dokploy. Migrazione versionata e PR #120 (main) / #121 (Dev) unite, CI verde.

- [x] Preparazione F-Droid 9.0.1 superata dal candidato 9.0.4; conservati firma e requisiti della MR ufficiale.

- [x] iPad: pre-caricamento immagini limitato a 4 operazioni parallele su iOS; Android invariato.

- [ ] Hotfix 9.0.1 Android: icona nativa durata, award Healing Master e Beginner’s luck, premi mazzo senza soglia tranne Più veloce; release production da completare.

- [x] Rebranding v9: nome visibile `21Life`, lockup interno `21Life - Tracker & Analytics`, dado con `21`, icone web/Android, email, notifiche, condivisioni e metadata aggiornati; identificativi tecnici preservati.

- [x] App Android uniformata con palette nero neutro/verde fluo approvata: card neutre, accenti e glow verdi; snapshot locale verificato e ripristinato esattamente.
- [x] Confrontata su emulatore la palette alternativa nero/blu notte/ciano.
- [x] Provata su Android la palette Gilda fornita dal PM e salvata localmente come variante recuperabile.
- [ ] Dopo approvazione PM, allineare la palette web a quella Android.

- [x] UI v9: palette awards player attenuata per tema scuro; coccarde con pieghe e nastri oro/argento/bronzo a decrescente rilievo; typecheck web/Expo OK. Storico completo e spaziatura Archidekt corretta.
- [x] Home Android: card playgroup arricchite con emblema, conteggio membri e icone statistiche; typecheck Expo OK.
- [x] Home Android: rimosso codice invito e tasto condivisione; card riprogettata con due statistiche leggibili e apertura compatta.
- [x] Arena Android: season corrente integrata nella card playgroup, sopra alle azioni; typecheck Expo OK.
- [x] Filtri arena Android: ripristinato filtro bracket su tutte le schede non Awards, applicato a storico e statistiche; risolto separatore non UTF-8 nel riepilogo. Typecheck/lint OK.
- [x] Edit Battle Android: aumentata l'altezza del solo modal di modifica per usare meglio lo schermo, mantenendo scroll e footer fissi; typecheck OK.
- [x] Winning streaks nelle statistiche profilo sempre espanse.

- [x] UI Android: stile, profilo, azioni mazzi, report, storico, moduli, leggibilita, notifiche, filtri e accesso/impostazioni aggiornati. Typecheck, lint e 25 test OK; app avviata su Pixel_9 con Metro/Fast Refresh. Validazione visiva completa PM da effettuare; nessun push.

- [x] Wizard Android uniforme: preview partecipanti, vita iniziale, assegnazione posti; 2 giocatori solo layout classico. Toolbar live ampliata e icona dado distinta. Typecheck/lint OK.

- [x] Scelta layout Android ridisegnata: tavoli separati, giocatori esterni, carte orientate secondo il runtime; typecheck OK. Validazione visiva PM in corso.

- [x] Roadmap 9: rifinitura awards giocatori, report Details, filtri mazzo multipli e wizard tavolo.

- [x] Roadmap 9: notifiche intelligenti (partita, inviti, fine stagione) e scheda personale profilo su Dev/Staging.
- [x] Roadmap 9: validazione fisica E2E Android su APK Dev. F-Droid dopo una 9 stabile.

- [x] Backup off-site: rclone crypt/Google Drive, retention e alert implementati; configurazione VM documentata.
- [x] Runtime 9 e diagnostica migrazioni: migrazione applicata e verificata su Supabase staging; verifica CI implementata.
- [x] Sicurezza Expo: vulnerabilità URI risolta con override compatibile `decode-uri-component` 0.5.0; audit produzione verde.
- [x] Retrocompatibilità: client dalla 8.1 restano supportati; modifiche e migrazioni v9 additive.
- [x] Dashboard salute e analytics: diagnostica admin presente; staging conferma gli indici analytics necessari. Alert backup off-site corretto.
- [x] E2E Android: comando Maestro con controllo dispositivo implementato.
- [x] UI v9: Details mazzo con impronta visiva W/P/S; Details partita con pressione relativa dei giocatori, web e Android.
- [x] Player Awards web: 10 premi concordati, podio Top 3, calcolo su partite disponibili e schede Giocatori/Mazzi.

- [x] Preparata 9.0.0 su Dev: dipendenze compatibili e major web aggiornate; qualità, build, bundle Android e smoke staging verificati; nessun deploy o mutazione produzione.
- [x] Ripristolta risoluzione DNS locale disattivando WARP: Expo Doctor 21/21 verde.

- [x] Audit Dev/main e release 8.5 completato: docs/AUDIT_2026-09-22.md; CI verde, 501 test locali superati, follow-up nel report.

- [x] Compilare e verificare APK Dev locale 8.3.0 per test Android (prebuild e Gradle eseguiti su junction C:\\pa83 per riprodurre il percorso breve storico; CMake 3.31.6; packaging riuscito; package/version verificati; APK Dev firmata con certificato debug come previsto e salvata in `artifacts/apk/phyrexian-arena-dev-v8.3.0.apk`; mapping P: e junction rimossi).

## External follow-up

- [x] Backup off-site rclone crypt/Google Drive: migrazione al client OAuth dedicato e primo backup verificati il 2026-09-28; i file storici sono conservati nella vecchia cartella.
- [ ] Monitor the official F-Droid merge request until approval.
- [ ] PM verification of the Dokploy production build.

## Completed

- [x] Spostare lo storico season sotto le partite recenti con Top 10 giocatori/mazzi per win rate e minimo 5 partite.

- [x] Mostrare negli archivi delle season la top 10 giocatori completa con record W/L su web ed Expo.

- [x] Validare integralmente la release 8.2.0, promuovere `Dev` su `main` e pubblicare web/APK Obtainium.

- [x] Integrare la 8.2.0 completa su `Dev`, verificare test web/app e compilare una APK development locale 8.2.0 firmata.

- [x] Completare hardening Live 8.2: recap PNG senza eventi di correzione, validazione finale, centro recupero, E2E, ordinamento win rate, statistiche win condition, verifica conversione guest, aptica, preload selettivo e dashboard sync.
- [x] Live 8.2: reset wizard senza cambio step; mostrare solo contatori modificati e non nulli; errori sync persistenti solo con dati pendenti; recap avanzato, onboarding contestuale, condivisione recap e correzioni distinguibili.
- [x] Compattare l'indicatore di giocatore iniziale/direzione e auto-nascondere gli stati live `Synced`/`Offline` dopo 15 secondi fino al prossimo cambio stato.
- [x] Consolidare la 8.2.0 su un feature branch riallineato a `main`, mantenendo compatibilità con i client 8.1.
- [x] Rimuovere completamente la funzionalità avatar da web/Expo/API, conservando soltanto la cancellazione dei dati legacy per privacy e compatibilità.
- [x] Risolvere Expo doctor/audit e stabilizzare automazioni dipendenze, E2E, supply chain e release governance.
- [x] Preparare hardening Supabase/Postgres, audit read-only, monitoraggio, backup cifrato e documentazione operativa senza mutare la VM Dokploy.
- [x] Ridurre duplicazioni del dominio live, ampliare test e introdurre budget prestazionali per bundle web/mobile.
- [x] Implementare dashboard operativa, compatibilità client 8.1+, feature flag, osservabilità notifiche, export account e changelog 8.2.
- [x] Proteggere `main`, verificare read-only lo stato F-Droid/GitLab e preparare la PR 8.2.0 su `Dev`.
- [x] Super audit read-only dello stato completo di `Dev`/`main` e proposta numerata delle migliorie.
- [x] Preparare su `Dev` la release 8.2.0 con ricerca mazzi nel wizard live, versione app nei log admin e Last Standing con danni letali automatici.
- [x] Predisporre il backup automatico cifrato della chiave Android, senza build o carico sulla VM.
- [x] Aggiungere la pulizia notturna delle cache Gradle inattive, installarla sul server e rimuovere l'Android SDK server-side inutilizzato.
- [x] Audit read-only dello spazio server e identificazione di elementi Docker/log/cache eliminabili in sicurezza.
- [x] Publish MTG Tracker & Analytics 8.0.0 through Obtainium.
- [x] Prepare and submit the F-Droid-compatible build.
- [x] Replace the main README with the public installation and web-app guide.
- [x] Correct the responsive login-logo rendering.
- [x] Remove confirmed obsolete code, assets, documentation, and dependencies.
- [x] Validate web, mobile, release, and dependency quality gates.
- [x] Start the `main` web application deployment on Dokploy production.

- [x] F-Droid 9.0.4 (2026-10-05): correggere review mezinster/linsui, ripristinare scanner sorgenti, ricetta unica e LF, NetInfo sul backend, env pubblica deterministica validata (8 test), 249 test Expo/quality e scanner sorgenti OK, bundle produzione verificato; reference Linux firmata pubblicata (run 37287041006), doppia build byte-identica, scanner APK e firma OK; MR 44721 aggiornata con pin/tag 688268860, pipeline ufficiale 2912844691 PASSED, riproducibilità indipendente/certificato/check APK e tutti i controlli metadata OK; MR head 46907e9d1. Restano approvazione maintainer e test fisico (voce monitoraggio separata); piano docs/FDROID_9_0_4_RELEASE_PLAN.md. GitLab CLI OAuth scaduto; git fetch funzionante.

- [x] PM 2026-10-05: monitorare standard9.0.5 fino a verifica finale e portare fix wizard Archidekt su F-Droid9.0.5. Versione90005, patch comune Expo, esclusioni variante preservate; reference prerelease/latest=false per isolamento Obtainium. Verificare qualità, doppia build riproducibile, scanner e pipeline ufficiale prima di dichiarare completato.

- [x] F-Droid9.0.5 finale: reference37337201417 e pipeline ufficiale2914442626 SUCCESS, confronto indipendente riuscito, checkAPK16945440386 SUCCESS, recipe/MR head a19a6c5bfcda194174611991b65bf65cdf781b43 pin f6d23f4db0b539586b6349f91b4a12513c5ff977; checklist MR e commento maintainer aggiornati con prove. Reference prerelease/non-Latest; standard latest v9.0.5 da main invariata. Pubblicazione nel catalogo e test fisico restano in attesa dei maintainer; label waiting-on-response gestita upstream, richiesta review-requested nel commento.
