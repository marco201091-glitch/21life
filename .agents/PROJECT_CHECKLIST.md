# Project checklist

Preferenza permanente PM: comunicare SEMPRE nella modalità OK / Fatto + checklist.

- [x] Login password manager: semantica username/current-password/new-password e disattivazione maiuscola automatica nei campi password web/Android; test Playwright, build web, typecheck/lint e test web/Expo OK.
- [x] Awards deck web: descrizioni dei premi sopra il podio, tradotte IT/EN; typecheck OK.
- [x] Awards deck Expo: descrizione spostata sopra il podio; righe mazzo mostrano solo il conteggio partite. Aggiornamento live nell’emulatore.
- [x] Profilo Expo: etichetta “Collection insights” rinominata “Decks insights” (IT: “Analisi mazzi”); Fast Refresh attivo.

## In progress

- [x] Audit miglioramenti e piano esecutivo (2026-10-01): `docs/AUDIT_2026-10-01.md`, `docs/IMPLEMENTATION_PLAN_2026-10-01.md` (IMP-00…IMP-17). Stato aggiornamento ereditato dal checkout precedente.
- [x] IMP-00 baseline (2026-10-01): worktree `C:\Users\marco\Documents\GitHub\PhyrexianArena-imp-00`, branch `improvement/imp-00-baseline` da `origin/Dev` (`29316afa`). `origin/main...origin/Dev`: 15/35 commit esclusivi; contenuti applicativi/lockfile coincidono, unica differenza rilevata checklist. Node v24.18.0 e npm 11.16.0 rispettano gli engines. Quality web/Expo riusata dalla CI verde sul medesimo SHA (`36708327345`, 30-09-2026); nessun test locale ripetuto. Report audit/piano copiati dal checkout preesistente; root e sue modifiche conservati. Nessun DB/deploy. Baseline pronta per IMP-01.
- [x] IMP-01 — Next 16.3.8, @next/env 16.3.8, eslint-config-next 16.3.8. Audit web/Expo zero vulnerabilità; quality web, build e budget passano; quality Expo e audit passano. E2E Playwright locale usa il build candidato con URL/anon key di staging, senza backend Supabase locale o credenziali produzione. E2E web: 8 passati, 10 skip per scenari senza gruppo/account; authenticated smoke staging sintetico aggiunto sotto IMP-09.
- [x] IMP-02 — `.github/workflows/dependency-audit.yml` schedulato/manuale, matrix Dev/main, artifact JSON e soglia high/critical; `scripts/dependency-audit.mjs` distingue advisory da errori registry e salva i report prima di fallire. 6 unit test e audit locale web/Expo zero vulnerabilità. La prova GitHub schedule/manuale resta successiva all’integrazione nel branch predefinito.
- [x] IMP-03 — runner atomico in `scripts/selfhosted-db-core.mjs`/`scripts/selfhosted-db.mjs`: una sessione psql/transazione, advisory lock, retry idempotente/checksum mismatch, wrapper esterni storici rimossi soltanto dal payload. Guard mismatch corretto e verificato: `psql --single-transaction -v ON_ERROR_STOP=1` fallisce prima del corpo. 7 unit test e 5 scenari d'integrazione passati via SSH sulla VM Dokploy, DB staging servito da `STAGING_SUPABASE_DOMAIN` e mappato al compose `supabase-dev`: successo/retry/checksum diverso, rollback SQL, rollback errore registro, perdita connessione+retry, concorrenza. Verifica read-only finale: 0 schemi e 0 record temporanei di test. Nessuna migrazione applicata al DB per IMP-03. Review ha rafforzato guard comandi transazionali/psql e commenti annidati, regressione rosso/verde e 13 test complessivi staging passati.
- [x] IMP-04 — export paginato e completo, helper server-only, limiti di righe/byte/tempo, ordinamento stabile, controllo concorrenza e retry su mutazione; route mantiene schema v1, Bearer, scope utente, no-store e rate limit. 13 test helper + 5 API; integrazione PostgREST staging con 1.001 mazzi, ID esatti e cleanup verificato. Documentati limiti/non-snapshot in `docs/ACCOUNT_EXPORT.md`.
- [x] IMP-05 — runtime API segnala `database`/`fallback` e logga solo codice errore. Note IT/EN 9.0.4 e raccomandazione 9.0.4 applicate tramite migrazione additiva su staging; verifica SSH checksum riuscita; minimo supportato resta 8.1. Test API 7 e typecheck.
- [x] IMP-06a — publisher idempotente, verifica tag/commit, APK/checksum/SBOM, rifiuto collisioni, retry asset interrotti e pubblicazione solo dopo verifica; workflow e checklist aggiornati. 8 test GitHub API mock + APK originale CI 9.0.4 verificato (digest uguale a quello pubblico). Nessun upload/pubblicazione effettuati; prova API reale e integrazione asset mancanti nella release pubblica restano non autorizzate.
- [x] IMP-07 — aggregazioni server-side in RPC a snapshot singola senza cap API; route la chiama dopo autorizzazione admin, UI marca unavailable senza mostrare zeri come attività reale. Migrazione `20261001103000` applicata allo staging via SSH; 3 test API; asserzioni DB sintetiche 10.001+ accessi/notifiche/sessioni eseguite in transazione rollback; privilegi reali anon/authenticated `EXECUTE=0`, service_role `EXECUTE=1`. Nessun indice aggiunto.
- [x] IMP-08 — manifest deterministico di 88 migrazioni con SHA-256 dei byte originali, incluso nello standalone; RPC server-only e UI distingue checksum verificato/diverso, non verificata storico, applicata fuori checkout e indisponibile. Migrazione `20261001110000` applicata su staging; 3 test API + 3 test stati, test CRLF/LF; build Next e manifest standalone verificati. Privilegi staging anon/authenticated `EXECUTE=0`, service_role `EXECUTE=1`. Nessun backfill storico. Review: bootstrap registro 20261001105900 aggiunto per DB nuovi, applicato staging; RPC vuota verificata in schema fixture con rollback. Quality rigenera manifest prima della verifica per checkout LF/CRLF.
- [ ] IMP-03/08 — investigazione checksum storico staging: divergenza di fine riga, non SQL. Il blob origin/Dev LF coincide esattamente con il record remoto; attributo LF mirato e checkout canonico ripristinati per Archidekt, manifest rigenerato. Una migrazione più vecchia 20260728073639 rimane discordante e non viene alterata. Evidenza precedente: checksum storico staging discordante per `20260930071738_archidekt_live_game_sync_requests.sql`: record remoto `9e8ba02985df31a9f50768d7008d7e6e5d0f0089063bdd1f343414d8f3140eda`, file corrente `60fe8d7992d9b7e10883334b9c7314012b983de8f7ccbfc9e71ebb1f53447078`. Il runner ha rifiutato il corpo senza mutazioni; la UI lo rende mismatch. Nessun backfill/overwrite o riesecuzione.
- [x] Target staging corretto: `.env.local` contiene già SSH in `SELFHOSTED_DEV_*`; `SUPABASE_URL`/`STAGING_SUPABASE_DOMAIN` puntano a `supabase-staging.phyrexianarena.dpdns.org`, servito dal compose remoto `supabase-dev`. Auth health HTTP 200. La risorsa Dokploy separata `supabase-staging` è inattiva e non serve quel dominio.
- [ ] IMP-09 — E2E web locale con backend staging: 8 passati, 10 skip; account Auth sintetico temporaneo ha verificato Archidekt/profile e responsive (4/4), cleanup staging verificato. Axe login desktop/mobile 2/2 e landing senza violazioni serie/critiche. Sul sito staging 4 test passano e 2 snapshot non corrispondono al sito servito; baseline non aggiornata. Build Android debug Dev riuscita e installata come `com.phyrexianarena.app.dev` senza toccare app standard; manuale su Pixel_9: login quick game, setup Commander 4 giocatori, avvio arena; variazione vita Player 2 da 40 a 39 e timer confermati visivamente. Preparati Maestro login/creazione partita/danno/salvataggio e archivio/ripristino con fixture sintetiche, preflight package Dev e guard DB/API/site staging. Maestro CLI non disponibile: flussi nativi non eseguiti. Workflow emulator opzionale manuale (3 quick game), YAML validato; variabile STAGING_SUPABASE_URL/secret STAGING_SUPABASE_ANON_KEY GitHub mancanti, job non eseguito né obbligatorio.
- [ ] IMP-10/11 — web: tre esecuzioni consecutive desktop/mobile (12/12) per partita, coda persistita dopo reload, retry e conflitti multi-client, archivio/ripristino; cleanup gruppi/account verificato. Causa del client fermo a 38: Kong non risolveva realtime-dev.supabase-realtime; aggiunto alias soltanto al Compose staging e ricreato Realtime. Subscription reale SUBSCRIBED e convergenza a 37 confermate. Axe login/wizard/tavolo/archivio senza serious/critical. Test tastiera ha rilevato focus perso alla chiusura dialogo: ModalOverlay ripristina il trigger, dialogo fine partita accetta Escape; E2E corretto 4/4. Perdita risposta finalize + reload verificata, SQL conferma esattamente 2 partite per 2 flussi; risposta 401 simulata conserva coda e riprende su retry (non equivale a revoca reale del token). TalkBack/device al PM. Semantica danno invariata.
- [x] IMP-12 — drill manuale completo staging riuscito (222cd7b63bd2): nuova copia rclone crypt, dump + Storage con xattrs + ruoli senza password + owner/grant scaricati e verificati SHA-256; clone su volumi nuovi/rete interna senza porte pubblicate. 57 tabelle identiche allo snapshot, 2 login Auth, REST read/write autorizzati e diniego cross-user, Storage HTTP 200/hash uguale e diniego privato. Restore 22,93s, totale 38,51s; cleanup stack/volumi/cloud/fixture e dati sensibili locali verificato. Report artifacts/recovery/imp12-222cd7b63bd2.json. Config/segreti recuperati dalla VM esistente: non prova perdita totale VM. Backup automatico invariato per richiesta PM; formato attuale senza xattrs/ruoli/ACL non equivale al pacchetto manuale verificato (limite documentato). 3 test parser; suite script 18/18.
- [x] IMP-13 — estratti DeckPerformancePanel (profilo), ArenaDeckSummary (arena) e LiveGameModalTitle (live): stato/query/Realtime/coda rimangono ai proprietari originali; typecheck/lint e build web passati. E2E profilo/archivio e partita desktop/mobile passati prima dell'estensione offline/conflitti; validazione desktop/mobile completata con offline/conflitti e archivio.
- [x] IMP-14a — `docs/BRANCH_RELEASE_WORKFLOW.md` documenta feature→Dev, ancestry Dev→main, hotfix back-merge e revert con nuova versione. `gh api` read-only: Dev/main richiedono web+expo, vietano force-push/cancellazione, PR non imposto dalla protezione. Confronto storico IMP-00: 15 commit main/35 Dev esclusivi, contenuti app/lockfile equivalenti con checklist diversa. Simulazione merge-tree con indice temporaneo riuscita: unica risoluzione riguarda tre record checklist conclusi su Dev; albero risultante identico a Dev, nessun fix perso. GitHub permette merge commit; branch condivisi invariati.
- [ ] IMP-15 — worktree PhyrexianArena-imp-fdroid, branch improvement/fdroid-904 da origin/fdroid-prep 1254d80 (sorgente precedente 9.0.1, non 8.0.0). Fix comuni archivio/Archidekt e versione 9.0.4/90004 nel commit locale 3125ada; metadata pin nel 7f50e81. Expo quality, readiness, audit produzione zero, export Android e budget 7.73/12 MiB passati. Sentry/push/image-picker assenti dal grafo; conservate patch riproducibilità/autolinking sorgente. Native unsigned arm64 build riuscita (10m38s, poi 3m17s dopo fix callback nascosta archivio); sorgente finale f12b7de, pin metadata committato 053e916 e pin sorgente f12b7de0c2cb60a7c9d6721245ecae1397ea9347. APK unsigned verificata: package/versione/arm64 corretti, SHA256 71b05cdb..., dex senza Sentry/notifications/imagepicker; artifact locale artifacts/apk/21life-fdroid-9.0.4-unsigned.apk. Scanner binario fdroidserver 2.4.5 sullo stesso APK eseguito con exit 0; recipe Linux/build/scanner sorgente e riproducibilità restano da verificare; nessun push/tag/release/MR.
- [ ] IMP-16 — candidato verificato: web quality 289 + script 18; Expo quality 249; audit produzione web/Expo zero, Next 50 pagine e 2.82/18 MiB; Android export 9.18/12 MiB; iOS readiness e export JS 9.5 MB passati (non build/firma iOS). E2E autenticati desktop/mobile e drill IMP-12 reali passati. PR #144 verso Dev, CI web/expo/CodeQL verdi su 75f3ce0; nuove modifiche operative richiedono CI successiva. Device/TalkBack al PM; Expo doctor locale 19/21 (DNS exp.host e sette patch SDK), non attribuito alle modifiche.
- [ ] IMP-17 — nessuna operazione su produzione autorizzata/eseguita: niente migrazioni, deploy, promozione, tag o release pubblica.
- [ ] Programma IMP-00–17 in corso sul worktree `C:\Users\marco\Documents\GitHub\PhyrexianArena-imp-00`, branch `improvement/imp-00-baseline` da `origin/Dev` (`29316afa`). Fermarsi prima di mutazioni DB/deploy produzione; preservati i documenti e le modifiche preesistenti della worktree principale.
- [x] Il preflight E2E ora usa il dominio/app staging o la configurazione pubblica di staging caricata da `.env.local`; i test locali non usano il backend locale.
- [ ] Expo doctor: 19/21 check; 7 dipendenze Expo con patch indietro e check schema remoto fallito per DNS `exp.host` (EAI_AGAIN). Nessuna modifica Expo introdotta.

- [x] Release 9.0.4 produzione: codice Dev riallineato a main, versione 90004, migrazione Archidekt verificata su Supabase Dokploy, web 9.0.4 pronto, APK firmato su Obtainium e IPA unsigned pubblicata con checksum.
- [x] Wizard live game: indicatore di attesa Archidekt sul partecipante selezionato, con stato differito per app offline/non aggiornata; qualità Expo, bundle Android e CI superati, integrato su Dev via PR #141.

- [x] Production hotfix 9.0.3: match history, wordmark Cinzel e archivio mazzi rilasciati con migrazione e APK.

- [x] Android 9.0.2 production: support x86_64 alongside arm64-v8a; release published through Obtainium.

- [x] iPad: pre-caricamento immagini limitato a 4 operazioni parallele su iOS; Android invariato.

- [x] Hotfix 9.0.1 Android: durata, premi giocatore e mazzo corretti e release produzione pubblicata.

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

- [x] Verifica candidato 01-10-2026: quality web 289 test + 17 script (1 integrazione PostgREST esclusa dalla suite ordinaria, già eseguita separatamente), quality Expo 249 test; audit web/Expo zero, build Next 50 pagine, budget web 2.82/18 MiB e Obtainium readiness verdi. Archivio Expo: callback Details nascosta corretta, puntava a route inesistente e falliva typed routes.

- [x] Ruling: Dev locale punta a uno storico F-Droid (032ca2e), non è antenato del candidato origin/Dev; non viene resettato né fuso alla cieca. Il lavoro è sul feature worktree da origin/Dev, PR draft #144 verso Dev; nessun reset locale.
