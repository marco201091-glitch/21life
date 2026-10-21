# 9.1.3 — candidato Dev

## Scopo

Preparazione autorizzata dal PM il 21 ottobre 2026, esclusivamente su Dev. Branch di lavoro feat/dev-9.1.3 da origin/Dev 0eec444. Versioni web/mobile9.1.3, Android/iOS90103. Nessuna promozione main, release pubblica o modifica DB produzione.

## Sicurezza dipendenze

Non prorogata la deroga scaduta il 19 ottobre. Sono applicate correzioni locali deterministiche alle versioni ufficiali ancora vulnerabili:

- braces3.0.3: rifiuta nesting oltre128 livelli (graffe e parentesi) prima di costruire alberi che esauriscono lo stack ricorsivo. Pattern ordinari invariati; input oltre il limite ora falliscono intenzionalmente.
- node-forge1.4.0: controllo del numero di elementi DigestAlgorithm annidati, come proposta upstream PR1152; mantiene la verifica delle firme regolari e rifiuta la struttura malformata.

scripts/security/dependency-patches.json registra file originali/corretti, SHA-256 e trasformazioni. expo postinstall applica le correzioni a tutte le copie nel lockfile; file/versioni inattesi bloccano l'installazione. L'audit verifica i byte installati oltre a advisory, versioni e grafo esatti; mantiene il report npm grezzo e distingue mitigatedAdvisories dalle vecchie eccezioni. Un npm audit puro continua a riportare20high: il database npm conosce le versioni, non le nostre patch. Nessuna versione falsificata o finding nascosto. Tornare a pacchetti ufficiali corretti e rimuovere patch appena disponibili, dopo verifica compatibilità.

Verifiche: regressioni prima rosse e poi verdi; idempotenza e tampering; installazione npm ci pulita. Suite upstream forge v1.4.0 fa385f92440879601240020f158bed68e444e83a con rsa.js corretto:828pass/4pending. Nel solo harness upstream è rimosso describe.only da tests/unit/jsbn.js, che altrimenti eseguiva soltanto5test. Nessuna modifica del codice di produzione upstream oltre alla patch rsa.

Fonti: https://github.com/advisories/GHSA-vfj7-8cjw-p6xm ; https://github.com/advisories/GHSA-86w9-cpqp-85rv ; https://github.com/digitalbazaar/forge/pull/1152 . Non si dichiara che upstream abbia rilasciato una correzione ufficiale.

## Notifiche

- Registrazione nativa condivisa con le impostazioni: stato reale del dispositivo distinto dalle preferenze utente, esiti API controllati, riprova manuale, ripresa foreground, rotazione token e retry iniziale limitato. Nessun dettaglio di credenziali nel messaggio utente.
- Il candidato token è salvato prima del POST: un esito di rete incerto resta revocabile. Il logout online attende la revoca; in caso di rete/API fallita conserva la sessione e mostra un errore, consentendo un nuovo tentativo. Web, ExpoGo e F-Droid non accedono alle API native durante il logout.
- Revoca server per sessione con lock transazionale e marker persistente: un POST ritardato non può ricreare una registrazione dopo logout. Le chiamate usano il session_id del bearer già verificato da Supabase. Gli account autenticati non possono aggirare la revoca scrivendo direttamente push_tokens; i vecchi client che usano l'API restano compatibili.
- La creazione dell'avviso di partita avviene nel DB all'inserimento del partecipante registrato, nella stessa transazione. Non dipende dalla chiamata HTTP finale del client. L'endpoint precedente resta idempotente per i vecchi client. Non viene inviato retroattivamente lo storico.
- Un trigger sull'inbox accoda tutti i tipi di avviso ai dispositivi già registrati, rispettando le preferenze. Il worker ricontrolla account/preferenze, usa lease e SKIP LOCKED, timeout8s, batch50 con concorrenza5, retry invio limitati e backoff. Dopo un ticket accettato interroga le receipts senza rispedire. Le righe scadono dopo24ore.
- DeviceNotRegistered elimina solo il token ancora associato allo stesso account. Payload errati e credenziali non valide richiedono correzione, non retry infiniti.
- Consegna almeno una volta: una risposta HTTP persa dopo accettazione Expo può produrre una duplicazione. Una receipt positiva conferma accettazione dal provider, non visualizzazione o lettura sul telefono. Un messaggio già consegnato al provider prima del logout non è revocabile.

## DB Dev

Applicate tramite runner SSH e verificate:

- 20261021145111_reliable_push_delivery.sql: coda RLS/service-role-only, trigger inbox/partecipanti, claim con lease.
- 20261021150824_push_session_revocation.sql: session_id dispositivo, marker di revoca privato, RPC registrazione/revoca service-only e revoca scrittura diretta autenticata.

Attributi Git preservano i byte dei file SQL registrati. Test riutilizzabili su Dev, con ROLLBACK di tutte le fixture:

- tests/operations/push-delivery-transaction.sql: evento partita senza HTTP, queue, dedupe, lease, preferenze e grant.
- tests/operations/push-session-revocation.sql: POST tardivo dopo logout, nuovo login, cancellazione non definitiva, RPC e scrittura diretta.

## Configurazione Firebase

Il plugin notifiche è incluso solo nelle varianti standard/Dev. Il plugin di prebuild Android e i runner BAT rifiutano configurazione assente, package errato o chiave privata service-account. iOS e F-Droid non richiedono Firebase Android.

GOOGLE_SERVICES_FILE_DEV: percorso assoluto del google-services.json per com.phyrexianarena.app.dev.
GOOGLE_SERVICES_FILE: percorso assoluto del file per com.phyrexianarena.app.
GitHub release standard: secret GOOGLE_SERVICES_JSON_BASE64, decodificato in RUNNER_TEMP. La chiave privata FCM v1 va su EAS per lo stesso progetto Firebase/EAS, mai nell'APK o in variabili EXPO_PUBLIC. Verificare certificato reale della firma Obtainium nelle eventuali restrizioni API.

Verificati soli nomi dei secret GitHub: configurazione Google assente. Nessun file Firebase trovato nel repository locale, nessun browser connesso disponibile per controllare le console. Progetto EAS esistente7106d709-b1a4-4fb5-a978-3465793a2015; accesso/proprietà/credenziale FCM restano da verificare. Non sono stati creati progetti o credenziali.

## Attivazione worker (necessaria prima di considerare operative le push)

1. Configurare PUSH_DELIVERY_SECRET sul backend Dev (casuale, almeno32caratteri); EXPO_ACCESS_TOKEN solo se il progetto Expo richiede enhanced push security.
2. Dopo deploy backend Dev, copiare scripts/run-push-worker.mjs in /opt/21life/run-push-worker.mjs e unit/timer ops/systemd/21life-push-delivery@.* in /etc/systemd/system.
3. Creare /etc/21life/push-dev.env, proprietario root/modo0600, con PUSH_DELIVERY_BASE_URL=https://dev.21life.win e lo stesso PUSH_DELIVERY_SECRET; nessuna variabile produzione.
4. Abilitare solo 21life-push-delivery@dev.timer. Verificare un'invocazione200, numero processato e stato timer, senza stampare header/env.
5. Eseguire APK candidata sul telefono: token in DB, partita manuale/live e recupero offline, ricezione foreground/background/schermo bloccato, tap gruppo, permessi disabilitati/riabilitati, logout/cambioaccount. Non promettere ricezione dopo Arresto forzato Android.

Le unit sono predisposte, non installate né avviate. Senza worker la coda non viene consumata. La migrazione da sola non rende operative le push.

## Gate residui

Accessi/configurazione Firebase/EAS, secret client GitHub, attivazione worker dopo deploy Dev e test fisico. APK nativa non compilabile utilmente senza questi prerequisiti. F-Droid conserva soltanto le notifiche interne; non comprende un nuovo trasporto alternativo a Google. Nessuna attestazione di consegna fisica eseguita.
