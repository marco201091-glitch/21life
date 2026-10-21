# Analisi notifiche Android — 21 ottobre 2026

Obiettivo PM: analizzare cosa serve per ricevere nel centro notifiche Android gli avvisi di partita completata. Questo documento non autorizza implementazione, creazione credenziali, migrazioni, build o deploy.

## Evidenze e limiti

- Sorgenti standard confrontati con main remoto `23b23fe8e4163bf7628f66465e68a17101064304`, verificato tramite git ls-remote; checkout primario Dev precedente, con modifiche PM da preservare.
- Produzione interrogata il 21 ottobre via SSH in transazione READ ONLY: push_tokens 0; notification_delivery_attempts 0; 94 match_completed negli ultimi 30 giorni, ultima 17 ottobre; notification_preferences 0. L'assenza di preferenze applica i default true: non dimostra un errore di salvataggio delle preferenze.
- main non configura android.googleServicesFile, non contiene il plugin expo-notifications nella configurazione Expo e non predispone Firebase nella pipeline esaminata. La dipendenza expo-notifications è presente.
- Il listener nasconde eccezioni native; ignora anche status/error di apiPost, che restituisce un risultato senza necessariamente lanciare. Non riprova su AppState active né gestisce esplicitamente rotazione token.
- Le impostazioni mostrano preferenze applicative, non salute della registrazione push. Anche il caricamento fallito può lasciare visibili i default true.
- Il mittente salva l'inbox prima di inviare; con dedupe_key, un successivo tentativo per la stessa notifica esce senza ritentare la push. Non conserva ticket Expo e non legge receipts; il valore sent attuale significa accettato da Expo.
- Le richieste match-completed nei flussi manuale e live sono fire-and-forget. Nel recupero live la voce outbox viene eliminata senza verificare la richiesta notifiche. Un salvataggio riuscito non garantisce la creazione dell'avviso.
- Il logout non rimuove il token dal server: appena abilitate le push va affrontata l'associazione dispositivo/account.
- fdroid-prep ha un listener solo Realtime e vieta expo-notifications nel controllo readiness. Non dispone delle push Android in background.
- Non sono stati letti log del telefono del PM né ispezionate le credenziali nella console Firebase/EAS. Non è provata l'eccezione precisa di quel dispositivo e non è dimostrata l'assenza di un progetto Firebase già esistente. La configurazione nativa mancante è un difetto concreto coerente con zero registrazioni.

## Interventi e ordine

| Priorità | Intervento | Risultato verificabile |
|---|---|---|
| P0 | Verificare progetto Firebase esistente, proprietà/accesso al progetto EAS 7106d709-b1a4-4fb5-a978-3465793a2015 e credenziali FCM v1 | Progetto Firebase e credenziale server coerenti con l'app, senza generare chiavi duplicate |
| P0 | Configurare Firebase Android e plugin expo-notifications solo nelle varianti standard/Dev | APK contiene risorse Firebase valide; F-Droid resta senza Firebase/Expo push |
| P0 | Correggere registrazione e stato nelle impostazioni | Token salvato e stato registrato solo dopo API 200; errori leggibili e sanificati |
| P0 | Gestire logout e cambio account | Nessun avviso dell'account precedente dopo logout completato online |
| P0 | Prova reale di registrazione e ricezione con APK candidato | Avviso visibile a schermo bloccato e app in background, apertura gruppo corretta |
| P1 | Conservare ticket e controllare receipts Expo | Distinzione accettazione Expo/esito provider; rimozione token non validi |
| P1 | Rendere persistenti e ritentabili gli invii | Errore temporaneo non perde la push; retry non duplica l'inbox |
| P1 | Rendere affidabile evento partita completata | Invio notifiche recuperabile anche dopo interruzione di rete o uscita dalla schermata |

### 1. Configurazione e build

File: expo/app.config.js, expo/app.json se necessario, .github/workflows/android-release-candidate.yml, scripts/build-apk-production.bat e scripts/build-apk-dev.bat; verificare i wrapper effettivamente invocati prima di modificare.

- Registrare/verificare package com.phyrexianarena.app e, per test Dev separati, com.phyrexianarena.app.dev. Usare il file Google corrispondente al package; preservare firma esistente e identità EAS.
- Separare google-services.json (configurazione client con identificativi pubblici) dalla chiave privata service account FCM v1. Solo la prima entra nella build; la seconda va configurata in EAS e mai inserita in APK, repository o variabili EXPO_PUBLIC.
- Condizionare plugin expo-notifications e googleServicesFile per variante. Non richiedere credenziali FCM alle build iOS o F-Droid.
- Aggiungere gate build standard che fallisca se manca la configurazione Firebase o il package è errato. Controllare manifest/risorse dell'APK e configurazione Dev/standard/F-Droid, non solo JSON sorgente.
- Usare il certificato reale Obtainium nelle eventuali restrizioni API Android; non assumere una firma Google Play.
- Non serve spostare le build su EAS: la pipeline Gradle esistente può restare, mentre Expo richiede credenziali FCM per il proprio servizio push.

### 2. Registrazione, permessi e account

File: expo/components/app-notification-listener.tsx, nuovo expo/lib/push-registration.ts, expo/app/(tabs)/notification-settings.tsx, expo/contexts/auth-context.tsx, app/api/push-tokens/route.ts e copie IT/EN esistenti.

- Separare preferenza utente, permesso OS e registrazione riuscita. Messaggi semplici: permesso disattivato, registrazione in corso, attive su questo dispositivo, registrazione non riuscita. Nessun token o dettaglio credenziale visibile.
- Creare canale Android prima della richiesta permessi; inviare il channelId coerente dal server. Non alterare le scelte di canale già impostate dall'utente.
- Controllare status/error di apiPost; retry limitato dopo errore di rete, ritorno in foreground e azione esplicita Riprova. Non riproporre automaticamente il dialogo permessi a ogni resume.
- Gestire aggiornamento token, lingua, reinstallazione e cambio utente; prevenire registrazioni concorrenti della vecchia sessione dopo logout.
- Aggiungere DELETE autenticata per il token del solo dispositivo/utente corrente; eseguirla prima di cancellare la sessione. Definire esplicitamente il comportamento offline: una revoca remota non è garantibile senza rete. Per garanzia forte serve legame server alla sessione attiva, da progettare e testare.
- Registrare errori sanificati, senza token, body notifiche o segreti. F-Droid deve esporre chiaramente il limite alle notifiche interne e non tentare la registrazione FCM.

### 3. Invio server affidabile

File: lib/push-notifications-server.ts, app/api/notifications/match-completed/route.ts; migrazione additiva e worker da definire nella specifica esecutiva.

- Per la prima prova usare la tabella push_tokens esistente: non è necessaria una migrazione per ottenere il primo token.
- Conservare ticket ID Expo e riferimenti a notifica/destinatario/token in una coda privata; leggere receipts con un worker pianificato. Non interpretare ticket ok come prova di visualizzazione Android, né receipt ok come lettura dell'utente.
- Conservare gli stati di telemetria compatibili con i client esistenti; differenziare queued/accettato/esito provider senza rompere gli aggregati admin.
- Ritentare rete, HTTP429/5xx con backoff e limite; classificare payload errato/credenziali come problemi da correggere, non retry infinito. MessageTooBig oggi è erroneamente classificato retryable.
- Invalidare DeviceNotRegistered anche quando emerge nei receipts; loggare gli errori di accesso alla tabella token anziché farli sembrare assenza dispositivi.
- Separare deduplicazione inbox e consegna push: creazione unica dell'avviso, retry della consegna persistita. Non rispedire automaticamente lo storico precedente alla registrazione.
- Rispettare limiti e batch Expo, timeout HTTP, preferenze applicative e locale; identificare eventuale autenticazione aggiuntiva Expo già configurata prima dell'integrazione.
- Per affidabilità completa collegare la creazione dell'evento alla finalizzazione server della partita dopo i partecipanti, con outbox transazionale e vincolo univoco. Conservare l'endpoint dei vecchi client come percorso compatibile idempotente. Evitare un trigger sul solo INSERT matches, perché i partecipanti possono ancora non esistere.
- La soluzione minima può prima gestire gli esiti delle chiamate client e conservare un evento da ritentare. La garanzia contro chiusura/crash tra commit DB e chiamata HTTP richiede comunque emissione server transazionale.

### 4. Verifiche di accettazione

Test automatizzati mirati: permesso negato; errore nativo; registrazione API500/rete; resume senza richieste duplicate; cambio account; cancellazione autorizzata del solo token corrente; preferenze disattivate; zero token; errori Expo; ticket/receipt; retry senza duplicati; due dispositivi; evento partita manuale/live/recuperata; variante F-Droid senza Firebase. Estendere tests/lib/push-notifications-server.test.ts e introdurre test del servizio registrazione e delle route.

Sul telefono fisico, APK standard firmata: registrazione visibile in DB, partita di prova con account registrati, ricezione in foreground/background/schermo bloccato, tap sul gruppo corretto; permessi negati poi riattivati dalle impostazioni, rete interrotta/ripristinata, logout/cambio account e aggiornamento dell'APK senza reinstallazione. Distinguere chiusura normale da Arresto forzato Android: non promettere push dopo force-stop. Provare anche inviti e fine stagione perché condividono il mittente. Non usare Expo Go o l'emulatore F-Droid come prova della push standard.

## Vincoli e dipendenze per il rilascio

- Implementazione futura in worktree isolato dal checkout PM; target standard main, sincronizzazione Dev secondo workflow; F-Droid deve mantenere la propria implementazione senza servizi Google. Nessuna decisione di introdurre UnifiedPush compresa in questo intervento.
- Prima di codice Next leggere le guide installate richieste da AGENTS.md. Prima di build/merge/deploy applicare MERGE_FAILURES e RELEASE_PREBUILD_CHECKLIST.
- Il blocco dipendenze Expo registrato il 21 ottobre (policy scaduta il 19 ottobre, 20 high su due advisory) resta un gate di rilascio: serve risoluzione o decisione PM esplicita sul trattamento, senza bypass implicito.
- Migrazione della coda/worker e finalizzazione server richiedono progettazione SQL e review RLS/grant; produzione solo con autorizzazione PM esplicita. Nessuna modifica DB necessaria per completare questa analisi.
- Nuova APK obbligatoria per la configurazione nativa Firebase. Deploy backend necessario per le correzioni server; un aggiornamento web da solo non modifica l'APK installata.
- Prima dipendenza esterna: accesso/proprietà Firebase/EAS e disponibilità credenziali. Non chiedere all'utente di incollare chiavi in chat. Confermare inoltre versione/canale dell'APK sul telefono prima della prova fisica.

## Fonti ufficiali

- https://docs.expo.dev/push-notifications/fcm-credentials/ — configurazione client Firebase e chiave server FCM v1/EAS.
- https://docs.expo.dev/push-notifications/sending-notifications/ — ticket, receipts, errori, limiti e retry.

Esito: causa infrastrutturale compatibile con i dati osservati; lavoro minimo = configurazione nativa + registrazione verificabile + tutela logout + nuova APK + prova fisica. Lavoro completo = anche receipts/coda retry e generazione affidabile dell'evento di fine partita. Nessuna stima oraria affidabile prima di verificare accessi e credenziali esistenti.
