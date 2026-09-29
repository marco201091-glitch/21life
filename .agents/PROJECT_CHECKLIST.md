# Project checklist

Preferenza permanente PM: comunicare SEMPRE nella modalità OK / Fatto + checklist.

- [x] Login password manager: semantica username/current-password/new-password e disattivazione maiuscola automatica nei campi password web/Android; test Playwright, build web, typecheck/lint e test web/Expo OK.
- [x] Awards deck web: descrizioni dei premi sopra il podio, tradotte IT/EN; typecheck OK.
- [x] Awards deck Expo: descrizione spostata sopra il podio; righe mazzo mostrano solo il conteggio partite. Aggiornamento live nell’emulatore.
- [x] Profilo Expo: etichetta “Collection insights” rinominata “Decks insights” (IT: “Analisi mazzi”); Fast Refresh attivo.

## In progress

- [ ] Production hotfix 9.0.3: fix duplicated Supabase participant embeds that silently empty match history; restore Cinzel `21Life` wordmark; add owner-only personal deck archive/restore for web and Expo; migration, production release and verified APK.

- [x] Android 9.0.2 production: support x86_64 alongside arm64-v8a; release published through Obtainium.

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

- [x] Backup off-site rclone crypt/Google Drive: primo upload e marker verificati il 2026-09-24.
- [ ] Monitor the official F-Droid merge request until approval.
- [ ] PM verification of the Dokploy production build.

## Completed

- [x] Wizard live game: avvia il sync Archidekt del membro selezionato solo se abilitato; richiesta Realtime autorizzata e sync eseguito dalla sessione del proprietario. Migrazione applicata e verificata su Supabase Dev via SSH; lint, typecheck e 248 test Expo OK.

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
