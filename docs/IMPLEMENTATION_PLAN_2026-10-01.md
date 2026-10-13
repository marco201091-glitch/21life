# 21Life — Piano esecutivo dei miglioramenti

Data: 1 ottobre 2026. Origine: [audit](AUDIT_2026-10-01.md).

Questo documento specifica il lavoro futuro: non certifica che sia stato implementato. È pensato per sessioni brevi, anche con un LLM meno capace: una sottoattività per volta, modifiche circoscritte, risultati verificabili. Nessun piano elimina tutti gli imprevisti; le condizioni di arresto servono a evitare che un esecutore inventi soluzioni quando mancano informazioni.

**Registro unico di avanzamento:** `.agents/PROJECT_CHECKLIST.md`. Non aggiungere qui stati correnti o una seconda checklist. Usare gli ID `IMP-00`…`IMP-17` nel registro; i sottopassi complessi possono avere suffissi `a`, `b`, `c`.

## 1. Istruzioni da copiare all'LLM esecutore

```text
Lavora sul piano docs/IMPLEMENTATION_PLAN_2026-10-01.md per 21Life.
Leggi AGENTS.md, la skill project-development-workflow e
.agents/PROJECT_CHECKLIST.md. Leggi il ticket assegnato e le sue dipendenze.

Ticket assegnato: IMP-XX (sostituire con un ID reale).

Prima di modificare: verifica branch, stato del worktree, file reali e contratto
attuale. Non assumere che la situazione dell'audit sia ancora attuale.
Se il ticket è già risolto, dimostralo con codice/test e registra l'evidenza.
Realizza soltanto quel ticket o il suo sottopasso assegnato.
Mantieni compatibilità dei client supportati e differenze standard/F-Droid.
Non abbassare soglie, eliminare test o cambiare snapshot per nascondere errori.
Esegui le verifiche indicate e registra i risultati reali nella checklist.
Se manca un ambiente necessario, prepara il lavoro verificabile e indica il
test rimasto da eseguire: non dichiararlo completato o superato.

Non eseguire deploy, pubblicazioni o modifiche al database di produzione
senza l'autorizzazione pertinente; riutilizza quelle già presenti nella sessione.
Non chiedere conferma per normali modifiche locali comprese nel ticket.
Alla fine lascia file modificati, test, limiti e prossimo passo nella checklist.
Rispondi: fatto + riepilogo conciso. Non iniziare un altro ticket di tua iniziativa.
```

Per riprendere: «Riprendi IMP-XX dalla checklist; verifica quanto è già fatto, completa il primo sottopasso incompleto e non ripetere operazioni remote già concluse». Il PM può invece autorizzare esplicitamente più ticket in sequenza.

## 2. Regole comuni

1. La richiesta originaria è di **pianificazione**. Questo documento non autorizza ora l'esecuzione dei ticket. Quando il PM assegna un ticket di implementazione, procedere nel suo ambito senza nuove conferme di routine.
2. Nuovo sviluppo da `origin/Dev`, su branch dedicato. Non partire dal vecchio `Dev` locale senza confrontarlo con il remoto. Non cambiare branch sopra modifiche altrui: usare un worktree se necessario.
3. Conservare i documenti di audit/piano già non committati. Non eseguire `reset --hard`, pulizie ricorsive o force push per ottenere un albero pulito.
4. Prima di codice Next.js, leggere la guida pertinente in `node_modules/next/dist/docs/`. Percorsi già presenti: `01-app/01-getting-started/18-upgrading.md`, `01-app/02-guides/testing/playwright.md` e `vitest.md`.
5. Per database/auth usare le skill Supabase e, per SQL, Postgres best practices. Consultare documentazione della versione effettiva prima di implementare; non aggiornare Supabase/Postgres come effetto collaterale.
6. Migrazioni nuove e additive; non modificare quelle già applicate. Conservare supporto 8.1+ finché il PM non cambia esplicitamente il minimo. Non rinominare RPC, colonne o valori esistenti in questi ticket.
7. Per la VM usare SSH e il runner del repository. L'assenza di Docker locale non blocca il backend remoto. I test SQL di CI possono usare una stack locale **isolata della CI**, non rappresentano la VM.
8. Le modifiche di produzione richiedono autorizzazione esplicita, come stabilito da `AGENTS.md`. Preparare prima patch, SQL, test Dev e rollback. Non stampare `.env.local`, token, dati utente o chiavi nei log.
9. Ogni PR contiene un problema coerente. Se cambiano insieme runner, UI, release e database, la suddivisione è troppo grande.
10. Testare con dati sintetici e account dedicati. Un mock dimostra il contratto dell'app, non RLS, lock, rollback o comportamento PostgREST: questi richiedono test di integrazione reali.
11. Non spostare i fallimenti in `continue-on-error`. Separare errore del codice da ambiente indisponibile; entrambi vanno riportati, ma nessuno equivale a PASS.
12. Dopo il lancio di una build/deploy remoto, applicare il workflow del progetto: confermare soltanto l'avvio. Il monitoraggio fino al completamento va richiesto/autorizzato dal PM; registrare poi l'esito disponibile prima della chiusura del rilascio.

### Contratto di completamento di un ticket

Nel registro riportare: ID e sottopasso; branch/SHA; file cambiati; decisioni; comandi realmente eseguiti e risultato; ambiente; migrazioni applicate con checksum se pertinenti; limitazioni; prossimo comando o azione. Distinguere **implementato**, **verificato in Dev**, **rilasciato**. Un file SQL scritto non è una migrazione applicata.

Formato suggerito per una voce, senza creare nuovi registri:

```text
IMP-XX — stato: implementato / verifica pendente / completato
Branch/SHA: ...
Modifiche: ...
Verifiche: comando → exit code/esito, ambiente, data
Operazioni remote: nessuna / target e risultato
Resta: ...
Ripresa: ...
```

## 3. Ordine e dipendenze

| Ordine | Ticket | Obiettivo | Dipende da |
| --- | --- | --- | --- |
| 1 | IMP-00 | Preparazione e baseline | — |
| 2 | IMP-01 | Patch Next.js | 00 |
| 3 | IMP-02 | Audit dipendenze programmato | 01 |
| 4 | IMP-03 | Runner migrazioni atomico | 00 |
| 5 | IMP-04 | Export completo e paginato | 00 |
| 6 | IMP-05 | Runtime aggiornamenti e note | 03; pubblicazione disponibile per la promozione runtime |
| 7 | IMP-06 | Release ripetibile e completa | 00 |
| 8 | IMP-07 | Metriche operative aggregate | 03 |
| 9 | IMP-08 | Stato reale delle migrazioni | 03, 07 |
| 10 | IMP-09 | Test mobile autenticati e archivio | 00 |
| 11 | IMP-10 | Test offline e conflitti | 09 |
| 12 | IMP-11 | Accessibilità dei flussi critici | 09 |
| 13 | IMP-12 | Ripristino completo da off-site | 03 |
| 14 | IMP-13 | Refactoring incrementale UI | 09, 10, 11; E2E web verdi |
| 15 | IMP-14 | Promozione Dev/main coerente | 00; prima del rilascio |
| 16 | IMP-15 | Riallineamento F-Droid | 14; fix comuni stabilizzati |
| 17 | IMP-16 | Validazione integrata | Ticket inclusi nella release |
| 18 | IMP-17 | Rilascio e verifiche finali | 05, 06, 14, 16 + autorizzazioni |

La patch di sicurezza può seguire una release dedicata: non deve attendere refactoring, F-Droid o l'intero programma. Per una release parziale, IMP-16/17 verificano tutti e soli i ticket inclusi; il programma resta aperto per gli altri.

## 4. Ticket esecutivi

### IMP-00 — Preparazione senza alterare la baseline

**Leggere:** `AGENTS.md`, checklist, audit, `package.json`, `expo/package.json`, `.github/workflows/quality.yml`.

**Passi:**

1. Eseguire `git status --short`, `git branch --show-current`, `git worktree list`, `git fetch origin --prune`.
2. Confrontare `git diff --name-status origin/main origin/Dev` e `git rev-list --left-right --count origin/main...origin/Dev`. I numeri del 1 ottobre sono storici, non risultati attuali.
3. Creare un branch `improvement/<ticket>-<nome>` da `origin/Dev` in un worktree pulito se quello corrente contiene altro lavoro. Registrare il percorso effettivo; eseguire tutti i comandi successivi lì.
4. Verificare Node/npm con `node --version`, `npm --version` rispetto agli `engines`; installare da lockfile solo se le dipendenze del worktree mancano o non corrispondono.
5. Eseguire quality web/Expo oppure riutilizzare una baseline recente solo se codice, lockfile e ambiente corrispondono. Registrare i problemi preesistenti.

**Accettazione:** branch corretto, modifiche precedenti conservate, ambiente identificato, test iniziali noti. **Arresto:** conflitti con lavoro altrui o target ambiente ambiguo; non scegliere produzione come default.

### IMP-01 — Correggere la dipendenza Next.js

**File:** `package.json`, `package-lock.json`; nessun cambio Expo previsto.

1. Ripetere `npm audit --omit=dev --json`; leggere l'advisory vigente. Nell'audit: Next 16.3.5, fix dalla 16.3.6, proposta npm 16.3.8. Non fissare automaticamente queste versioni se il ticket viene eseguito più avanti.
2. Leggere la guida locale di upgrade. Scegliere una patch corretta della linea 16.3 e verificarne la disponibilità; aggiornare `next` esatto e `eslint-config-next` coerente. Esaminare la PR #128 se esiste ancora; non importarne tutti gli altri aggiornamenti per comodità.
3. Aggiornare il lockfile con npm della versione prevista. Non usare `npm audit fix --force`, `--legacy-peer-deps` o aggiornamenti major.
4. Verificare diff del lockfile: ogni dipendenza cambiata deve essere spiegabile dall'aggiornamento.

**Test:** audit produzione web, `npm run quality`, `npm run build`, `npm run verify:build-budget`, E2E web isolati. Leggere il resoconto CI sulla PR quando disponibile.

**Accettazione:** advisory eliminato, nessuna nuova incompatibilità, build/login/live invariati. **Recupero:** se fallisce, correggere o revertire il commit nel branch; non ridistribuire una versione vulnerabile come rollback definitivo. Nuove vulnerabilità indipendenti si registrano separatamente.

### IMP-02 — Audit automatico anche senza push

**File nuovi proposti:** `.github/workflows/dependency-audit.yml`. **Riferimenti:** `quality.yml`, `.github/dependabot.yml`.

1. Creare workflow con `schedule` giornaliero e `workflow_dispatch`, permessi `contents: read`, timeout e concorrenza definiti; riusare SHA delle action e versione Node del workflow esistente.
2. Eseguire una matrice esplicita per `main` e `Dev`, checkout del ramo indicato, `npm ci` e audit produzione web/Expo. Non richiedere segreti applicativi. Ricordare che il workflow schedulato deve esistere sul branch predefinito per attivarsi.
3. Salvare report JSON come artifact anche sul fallimento; distinguere registry irraggiungibile da advisory. Conservare l'exit code effettivo del comando, non quello di una stampa successiva.
4. Fallire su vulnerabilità high/critical; includere nel report anche moderate/low. Documentare che gli avvisi usano le notifiche GitHub già configurate. Nessun invio email/Slack aggiunto senza richiesta.

**Test:** workflow validato; caso pulito, advisory simulato e registry indisponibile nel codice di gestione esito. Esecuzione manuale quando autorizzata. **Accettazione:** un advisory emerso dopo l'ultimo push è rilevabile senza nuova modifica al codice; i due rami e le due directory risultano distinguibili.

### IMP-03 — Atomicità del runner migrazioni

**File:** `scripts/selfhosted-db.mjs`, `docs/SUPABASE_OPERATIONS.md`. **Nuovi proposti:** helper importabile in `scripts/lib/`, test sotto `tests/operations/`, harness di integrazione isolato. Separare in **03a implementazione**, **03b integrazione/CI**, **03c prova Dev**.

**Contratto:** per una versione esistono solo due esiti validi: schema precedente senza nuovo record, oppure schema aggiornato con record/checksum corretto. Retry identico = no-op; checksum diverso = errore senza mutazioni.

1. Separare costruzione del payload/validazione dall'avvio CLI, affinché importare il modulo nei test non esegua SSH.
2. Inventariare le migrazioni attuali: individuare comandi che chiudono transazioni, comandi non transazionali e metacomandi psql. Non trattare `BEGIN` di PL/pgSQL come `BEGIN` SQL tramite una regex generica. Se ci sono incompatibilità, risolvere il formato del runner prima di utilizzarlo; non modificare i file storici per aggirarle.
3. Costruire **una sola sessione psql e una sola transazione** per lock, bootstrap registro, lettura checksum, eventuale SQL e inserimento record. Usare un advisory lock transazionale costante del progetto/database, acquisito prima del controllo: anche versioni diverse non devono eseguire DDL concorrente.
4. Usare `ON_ERROR_STOP=1`, `-X` e una modalità che applichi realmente la transazione all'input (per esempio `--single-transaction -f -`, da verificare con la versione psql effettiva). Non conservare quattro chiamate SSH separatamente transazionali.
5. Eseguire la condizione no-op nella stessa sessione sotto lock. Non eseguire il corpo SQL se il checksum coincide. In caso di mismatch, errore prima del corpo. Validare/quotare i valori; niente SQL costruito da input non validato.
6. Calcolare SHA-256 sugli stessi byte inviati/esaminati dal runner e mantenere la convenzione dei checksum storici. Non normalizzare CRLF/LF retroattivamente. Documentare il formato per i nuovi file e rilevare mismatch invece di aggiornare il registro.
7. Mantenere revoche su `app_private`; introdurre timeout di connessione/lock e messaggi senza segreti. Se SSH si interrompe dopo il commit, esito locale = incerto: verificare registro e ripetere in modo idempotente, non assumere rollback.

**Matrice obbligatoria su DB isolato:** successo; secondo avvio identico; checksum diverso; errore SQL a metà; errore sull'inserimento nel registro dopo il DDL; due processi della stessa versione; due versioni concorrenti; timeout sul lock; perdita di connessione prima e dopo il commit. Schema e registro vanno interrogati realmente dopo ogni caso. Un test sul testo generato non basta.

**Accettazione:** tutti i casi rispettano il contratto, nessun record doppio, lock rilasciato al termine; CI ripetibile. Nella CI creare un target di test esplicito per l'harness, senza cambiare la CLI pubblica `apply <dev|production>` o introdurre fallback a produzione. Solo dopo 03b applicare una migrazione Dev prevista dal piano. **Recupero:** errore atomico → nessun intervento manuale; stato storico dubbio → inventario read-only, senza backfill automatico.

### IMP-04 — Esportazione completa dell'account

**File:** `app/api/auth/export-account/route.ts`; nuovo helper server-only `lib/account-export.ts`; nuovi test API/helper. Separare **04a contratto e paginatore**, **04b integrazione route**, **04c test PostgREST**.

**Contratto da conservare:** autenticazione Bearer server, filtro sull'utente autenticato, rate limit, struttura JSON `schemaVersion: 1`, `no-store`, nessun token/push token aggiunto. L'export multi-query non è una snapshot transazionale: non promettere consistenza point-in-time che il codice non garantisce.

1. Elencare ogni raccolta della route e la sua chiave univoca leggendo lo schema reale: decks, memberships, ownedGroups, participations, notifications, accessLogs, invitations, matches. Profilo e preferenze restano letture singole. Non assumere una colonna `id` per tutte le tabelle senza verificarla.
2. Implementare lettura a cursore con ordinamento univoco stabile sulla chiave immutabile; pagina richiesta 500 righe. Proseguire finché una pagina è **vuota**, non finché è più corta di 500: il server può imporre un limite inferiore. Verificare avanzamento del cursore e impedire loop.
3. Le colonne usate soltanto come cursore (per esempio `access_logs.id`) devono essere selezionate internamente e rimosse dal JSON se non erano pubblicate prima. Riordinare l'output per i campi storici della route con tie-break univoco, dove necessario.
4. Per inviti applicare sempre il filtro «invitato oppure invitante = utente». Per matches raccogliere tutti gli ID delle partecipazioni, deduplicare e dividerli in gruppi da 100. Paginare anche dentro ciascun gruppo, perché il cap server può essere inferiore a 100.
5. Limitare la concorrenza a due collezioni/gruppi in parallelo. Se una pagina fallisce, l'intero export fallisce: non restituire un JSON parziale con 200. Prevedere timeout e un budget esplicito di righe/byte configurabile; al superamento rispondere con errore chiaro, mai tagliare silenziosamente.
6. Acquisire timestamp iniziale/finale. Verificare conteggi e riferimenti; se le collezioni cambiano in modo rilevabile durante la lettura, ritentare l'export completo una volta e poi restituire 409 con invito a riprovare. Non dichiarare che conteggi uguali escludano qualsiasi modifica concorrente. Documentare il limite residuo; una snapshot rigorosa richiederebbe una soluzione DB dedicata, fuori da questo fix.
7. Nei dati stabili il risultato deve essere completo indipendentemente dal limite API. Non cambiare il significato di «matches dell'utente» o includere dati di altri utenti per completare l'export.

**Test:** 0, 1, 500, 501, 1.000, 1.001 e 2.501 righe; cap simulato 100 e 37; timestamp uguali; ID duplicati; due utenti distinti; inviti nei due ruoli; errore alla terza pagina; cursore fermo; limite byte; mutazione concorrente rilevabile. Integrazione su PostgREST isolato con >1.000 record e confronto ID esatti, non solo conteggi. Test 401/429/503 e assenza di campi sensibili.

**Accettazione:** niente omissioni/duplicati su dataset stabile; nessuna lettura cross-account; fallimenti espliciti; vecchio contratto consumabile. **Recupero:** revert del codice senza migrazioni; mantenere visibile il limite noto fino al fix.

### IMP-05 — Aggiornamenti consigliati e note runtime

**File:** `app/api/app-config/route.ts`, `lib/version-policy.ts`, test in `tests/lib/version-policy.test.ts`, nuovo test API, `docs/releases/`, nuova migrazione dati generata via CLI.

1. Leggere la versione effettivamente pubblicata e la riga runtime in Dev. Non usare sempre 9.0.4: è il valore dell'audit.
2. Preparare una migrazione additiva per modificare soltanto versione raccomandata, note IT/EN pertinenti e `updated_at`. Conservare minimo 8.1.0, feature flag, messaggi manutenzione e note precedenti. Non riscrivere la vecchia migrazione di creazione tabella.
3. Rendere il rilascio runtime esplicito nella checklist release: non consigliare un APK prima che sia disponibile. Se in produzione la raccomandata è già più nuova, fermare l'aggiornamento invece di retrocederla.
4. Testare `?version=8.0.0` → unsupported; 8.1/8.2 → update_available quando inferiori alla raccomandata; versione raccomandata → supported; versione successiva → supported. Preservare il fatto che `currentVersion` nella route è il parametro client, non sempre la versione backend.
5. Provare config mancante e errore DB: il fallback non deve dichiarare falsamente di aver letto il runtime. Definire un'indicazione diagnostica server e testare l'attuale comportamento pubblico.
6. Applicare/verificare Dev con runner corretto. Preparare i valori precedenti per un rollback dati mirato. Applicare produzione soltanto nel ticket IMP-17 autorizzato.

**Accettazione:** versione raccomandata installabile, note corrette, nessun innalzamento involontario del minimo, test policy/API verdi. Nella verifica pubblica tenere conto di `max-age=300` e `stale-while-revalidate=3600`; verificare anche la riga DB, senza giudicare immediatamente fallita la modifica da una risposta in cache.

### IMP-06 — Pubblicazione release idempotente e allegati

**File:** `.github/workflows/android-release-candidate.yml`, `scripts/verify-obtainium-readiness.mjs`, `docs/OBTAINIUM_RELEASE_CHECKLIST.md`. **Nuovi proposti:** helper pubblicazione e verifica asset in `scripts/`. Leggere PR #117 prima di duplicarla.

**Asset standard obbligatori:** APK, relativo `.apk.sha256`, SBOM web, SBOM Android della stessa build/versione. IPA: opzionale fino alla decisione PM su canale e formato; la sua assenza non va nascosta dichiarandola pubblicata.

1. Separare generazione, pubblicazione e verifica. Prima di chiamare GitHub, controllare esistenza e dimensione di tutti gli asset, hash dell'APK, validità JSON degli SBOM, versione/package/firma attesi con i verificatori esistenti.
2. Se la release non esiste, crearla inizialmente draft; caricare e verificare gli allegati prima di pubblicarla. Se esiste, verificarne tag e commit e completare gli asset mancanti.
3. Stesso nome/stesso contenuto = no-op. Stesso nome/contenuto diverso = errore con confronto digest; non usare `--clobber` indiscriminatamente e non sostituire un APK pubblico firmato senza decisione PM. Errore rete/API non equivale a «release inesistente».
4. Dopo upload verificare elenco, dimensioni e digest; riscaricare checksum e APK per confronto quando necessario. I quattro file devono appartenere alla stessa build. Gli SBOM non devono essere rigenerati da un checkout diverso e spacciati per quelli della build pubblicata.
5. Gestire fallimenti parziali con retry idempotente; workflow non verde prima della verifica finale. Conservare note curate ed evitare di sovrascrivere testo estraneo nella release esistente.
6. Per 9.0.4: cercare prima gli artifact originali della build; se non disponibili, registrare la mancanza. Si può derivare il checksum dall'APK originale verificato; non si può ricostruire con certezza un SBOM storico arbitrariamente.
7. Correggere la checklist con evidenza e data; verificare se l'IPA sia disponibile altrove, senza assumere che «non allegata a questa release» significhi «inesistente ovunque».

**Test:** GitHub mock per release nuova/esistente, asset uguale/diverso, 404 reale, 403, timeout e upload interrotto. Prova end-to-end solo in repository o draft di test autorizzato. **Accettazione:** secondo avvio non altera asset già corretti; file mancanti sono rilevati; nessuna pubblicazione incompleta marcata riuscita.

### IMP-07 — Aggregazioni operative complete

**File:** `app/api/admin/operations/route.ts`, nuova migrazione RPC, nuovi test API/SQL. Scoprire il consumer con `rg 'clientAdoption30d|liveGameSync14d' app components` prima di cambiare il contratto.

1. Scrivere fixture e output atteso per accessi 30 giorni, delivery 24 ore, sync 14 giorni. Copiare esattamente il significato attuale: `appVersions` conta accessi per versione, non utenti unici; non cambiare le formule nel refactoring.
2. Creare una RPC che restituisca aggregazioni JSON in una singola query/snapshot, con timestamp di riferimento comune. Eseguire somme/count/max nel database, non scaricare righe fino a un cap arbitrario.
3. RPC richiamata solo dal server dopo controllo amministratore. Preferire `SECURITY INVOKER` con `EXECUTE` revocato a PUBLIC/anon/authenticated e concesso a service_role; verificare realmente i privilegi del ruolo e delle tabelle. Non passare la chiave service_role al browser.
4. Riutilizzare indici esistenti sui timestamp. Aggiungerne uno solo dopo EXPLAIN su dati sintetici realistici e prova del beneficio; nessuna modifica indiscriminata degli indici.
5. Conservare i campi JSON usati dalla UI. Impostare completezza vera solo su aggregazione riuscita; errore/timeout = unavailable, mai zero attività inventato. Gestire dataset vuoto e divisione per zero.
6. Applicare prima la migrazione Dev, poi il client della RPC. Se in rollout manca la RPC, mostrare indisponibilità diagnostica; non tornare silenziosamente a statistiche troncate.

**Test reali:** 0, 1.001 e 10.001+ record; bordi delle finestre; null dove consentiti; confronto con query di riferimento; chiamata anon/authenticated negata; service role ammessa; route non-admin 403. Registrare latenza su dataset e ambiente dichiarati, senza inventare SLO.

**Accettazione:** conteggi esatti oltre cap API; shape retrocompatibile; autorizzazione verificata. **Recupero:** lasciare RPC additiva e disattivare il consumo nuovo o fare rollback codice; non eliminare tabelle/dati di telemetria.

### IMP-08 — Diagnostica migrazioni attese/applicate

**File:** `scripts/verify-operations-migration.mjs`, route operations, helper/generatore manifest nuovi, migrazione RPC di lettura registro, UI amministrativa trovata tramite ricerca.

1. Generare un manifest deterministico da nomi/versioni/checksum delle migrazioni. Il build deve includerlo anche in standalone. Verificare che i byte usati siano gli stessi della convenzione del runner; niente hash di SQL normalizzato se il registro usa file originali.
2. Usare una RPC server-only con privilegi minimi per leggere il registro `app_private`, senza esporre lo schema tramite Data API. Restituire solo metadati necessari; nessuna funzione che permetta di applicare SQL dalla dashboard.
3. Distinguere: applied+checksum uguale, checksum diverso, attesa ma non registrata, registrata ma non nel checkout, registro indisponibile.
4. **Caso legacy essenziale:** molte migrazioni precedono il runner. Un record mancante significa «non verificata nel registro», non necessariamente «mai applicata». Non rieseguire migrazioni né riempire automaticamente la storia. Documentare eventuale baseline storica solo dopo confronto esplicito dello schema e revisione.
5. Mantenere compatibilità con `expectedLatestMigration`; aggiungere dettaglio amministrativo e stato unavailable se la lettura fallisce. Adeguare il verificatore CI al manifest, non eliminare il controllo.

**Test:** tutti gli stati sopra, CRLF/LF, ordine deterministico, bundle standalone, diniego RPC a utenti ordinari, DB senza registro. **Accettazione:** la UI distingue «atteso» da «verificato applicato» e non genera falsi allarmi certi sulla storia legacy.

### IMP-09 — Test mobile autenticati e archivio

**File:** `expo/e2e/`, `expo/scripts/e2e-android-preflight.mjs`, `expo/package.json`, workflow E2E nuovo; modifiche UI limitate a selettori stabili/accessibilità. Leggere `expo/e2e/README.md`.

Separare **09a dati e preflight**, **09b flussi**, **09c CI**.

1. Preparare ambiente test isolato, due account sintetici, playgroup e mazzi. Seed idempotente e cleanup limitato agli ID del test. Nessun utilizzo dell'account demo pubblico o di produzione.
2. Verificare il package della variante installata: lo YAML attuale usa il package standard; il test Dev deve usare quello effettivo. Passare credenziali tramite ambiente, senza inserirle negli YAML/artifact.
3. Scrivere Maestro per login, apertura arena, creazione partita, variazione vita, salvataggio e presenza nello storico. Aspettare stati osservabili, non sleep fissi lunghi.
4. Aggiungere archiviazione/ripristino mazzo: escluso dal selettore attivo, presente nell'archivio, storico invariato, nuovamente selezionabile dopo ripristino.
5. Aggiungere job Android emulator con build Dev e servizi test raggiungibili dall'emulatore. Documentare rete host/emulatore. Salvare screenshot/log sul fallimento dopo redazione dei dati sensibili.
6. Stabilizzare almeno tre esecuzioni consecutive prima di proporre il nuovo check come obbligatorio; non rinominare i check protetti `web`/`expo`.

**Accettazione:** scenari eseguiti realmente su emulatore, log di successo e failure artifact funzionante, nessun test saltato per credenziali mancanti nel job che deve validarli. **Arresto:** manca emulatore/backend isolato → flussi preparati ma ticket non verificato; non sostituire con il solo export del bundle.

### IMP-10 — Offline, riavvio e conflitti fra client

**File:** `expo/tests/lib/live-game-offline.test.ts`, `live-game-sync-policy.test.ts`, `expo/e2e/`, `tests/e2e/`; leggere i servizi/policy condivisi prima di fissare aspettative.

1. Documentare la semantica attuale delle mutazioni (ID, versione, replay, finalizzazione). Non presumere che due scritture concorrenti siano somme: l'oracolo del test deve derivare dal contratto del dominio.
2. Scenario A: client connesso → disconnessione → modifiche vita → chiusura/riapertura app → coda ancora presente → riconnessione → stato finale corretto, coda vuota, nessuna mutazione applicata due volte.
3. Scenario B: due sessioni indipendenti sulla stessa partita, mutazioni sovrapposte, conflitto/version mismatch, convergenza al risultato previsto dal contratto. Usare due emulatori oppure emulatore più browser realmente connessi alla stessa stack test.
4. Scenario C: salvataggio finale e retry dopo perdita di risposta → una sola partita nello storico. Scenario D: token scaduto/sessione revocata → errore gestito e dati locali pendenti conservati dove previsto, senza loop infinito.
5. Verificare lo stato server, quello dei due client e la coda locale; lo screenshot di «Synced» da solo non basta. Isolare tutte le fixture.

**Accettazione:** casi ripetibili, nessun dato perso o duplicato secondo il contratto, timeout deterministici; unit test e prove integrate entrambi presenti. **Recupero:** eventuali bug emersi diventano fix circoscritti con test rosso/verde, non riscrittura del motore live.

### IMP-11 — Accessibilità verificabile

**File:** schermate login, wizard live, tavolo, archivio; test E2E web/mobile. Aggiungere strumenti di test solo se non già disponibili.

1. Elencare controlli interattivi dei quattro flussi. Verificare nome, ruolo, stato, focus e messaggi di errore; mantenere IT/EN.
2. Web: tastiera completa, focus nei dialoghi e restituzione al trigger, errori associati ai campi, nomi dei pulsanti icona. Aggiungere controlli automatici Playwright con strumento accessibilità compatibile e verificato.
3. Mobile: controllare TalkBack, etichette dei pulsanti vita, ordine di lettura, testi ingranditi e target tocco. Non aggiungere etichette duplicate dove esistono già.
4. Provare dimensioni ridotte e tema scuro; registrare una prova manuale perché l'analizzatore automatico non dimostra usabilità con screen reader.

**Accettazione:** flussi principali completabili da tastiera/screen reader; nessuna nuova violazione seria/critica negli scenari automatizzati; problemi preesistenti espliciti. **Recupero:** revert del singolo cambio UI che altera l'interazione; niente ridisegno palette o navigazione non richiesto.

### IMP-12 — Ripristino reale dalla copia off-site

**File:** `ops/supabase-backup.sh`, `scripts/restore-drill-dev-supabase.mjs`, `scripts/verify-dev-supabase-backup.mjs`, `docs/OFFSITE_BACKUP_SETUP.md`, `docs/SUPABASE_OPERATIONS.md`. Separare **12a formato e verifiche**, **12b ambiente isolato**, **12c esercitazione**.

1. Documentare il pacchetto reale: dump, Storage, manifest e `SHA256SUMS`. Il drill attuale richiede `<dump>.sha256`: aggiungere supporto al formato off-site invece di assumere che i due formati coincidano.
2. Inventariare cosa non è nel dump: ruoli globali, segreti Auth/JWT, configurazione servizi e chiavi rclone. Il dump attuale usa `--no-owner --no-privileges`: il recupero di grant/ownership deve avere una procedura distinta e verificata. Non dichiarare un backup PostgreSQL singolo come backup di tutto il cluster.
3. Scaricare una copia realmente dal remote cifrato, verificarne checksum e provenienza e usare solo directory di test controllate. Un marker di upload recente non prova ripristinabilità.
4. Predisporre stack isolata con versioni compatibili, volumi nuovi, domini non pubblici e outbound email/push disattivato. Non puntare Dev condiviso o servizi produttivi al dump ripristinato. Dati reali, se necessari, restano confinati e non finiscono nei log.
5. Ripristinare DB e Storage, ripristinare/configurare privilegi e servizi, verificare utenti sintetici di controllo: login tramite servizio Auth reale, SELECT/INSERT autorizzati, letture cross-user negate, oggetto Storage scaricabile e hash identico. Non modificare password di utenti reali per la prova.
6. Confrontare tabelle, policy, grant, campioni/count e riferimenti Storage. Il dump e il tar sono acquisiti in momenti distinti: controllare orfani/mancanze e documentare la strategia di consistenza. Se la prova richiede indisponibilità per una snapshot coerente, preparare la procedura e chiedere la finestra al PM prima dell'esecuzione.
7. Misurare età del backup e tempo completo di ripristino; proporre RPO/RTO sulla base della misura, senza dichiarare obiettivi rispettati se non concordati. Conservare report privo di dati personali e cleanup solo delle risorse create dal drill.
8. Programmare il drill trimestrale in ambiente dedicato solo dopo una prova riuscita e limiti di risorse definiti. Un fallimento deve lasciare evidenza e istruzioni, non cancellarla nel cleanup.

**Accettazione:** recupero dalla copia esterna con applicazione/Auth/Storage funzionanti e autorizzazioni testate, non solo «73 tabelle presenti». **Arresto:** mancano chiavi, spazio o isolamento → non iniziare il restore; nessuna prova su volumi produttivi. Preparazione locale e documentazione possono continuare.

### IMP-13 — Scomporre le schermate senza cambiarne il comportamento

**File di partenza:** `app/table/[id]/page.tsx`, `app/profile/page.tsx`, `components/live-game/web-live-game.tsx`. Destinazioni proposte: componenti nelle directory di feature esistenti; hook solo se hanno una responsabilità chiara.

1. Prima PR: mappa di sezioni, stato e query; identificare blocchi indipendenti. Non spostare tutto per rispettare una soglia arbitraria di righe.
2. **13a profilo:** estrarre una sezione presentazionale per commit (card/lista/pannello). Props tipizzate, nessuna modifica a fetch, ordinamento o traduzioni.
3. **13b arena:** estrarre pannelli di storico/statistiche mantenendo stessa sorgente dei dati e stessi filtri. Non introdurre una query duplicata per ogni componente estratto.
4. **13c live:** estrarre controlli/modal presentazionali; lasciare inizialmente proprietario unico di stato, effetti, Realtime e coda offline. Solo in un secondo passaggio estrarre hook con cleanup testato.
5. A ogni estrazione eseguire typecheck/lint, test mirati e flusso E2E interessato. Confrontare richieste/re-render/subscription prima e dopo su uno scenario ripetibile; l'obiettivo è non peggiorare, non promettere accelerazioni non misurate.
6. Aggiornare la mappa del codice nella skill workflow se cambiano responsabilità architetturali. Non riscrivere insieme il client Expo; per logica pura già condivisa conservare la fonte unica esistente.

**Accettazione:** UI, ordinamenti, filtri, salvataggio e offline invariati; moduli con responsabilità leggibili; nessun nuovo `any` per aggirare i confini. **Recupero:** ogni estrazione revertibile da sola. Fallimento snapshot inatteso → indagare, non aggiornare automaticamente le immagini attese.

### IMP-14 — Regole di promozione e sincronizzazione rami

**File nuovo proposto:** `docs/BRANCH_RELEASE_WORKFLOW.md`; riferimenti nella checklist e nella skill workflow solo per descrivere il processo concordato.

1. Confrontare antenati e contenuti attuali; documentare branch remoti e locali obsoleti. Non fare reset, rebase o force push dei branch condivisi.
2. Regola proposta: feature PR verso Dev possono usare squash; promozione Dev→main con merge che preserva ancestry; hotfix da main riportato su Dev con merge di ritorno. Non risquashare ogni promozione di un ramo longevo.
3. Verificare se le impostazioni GitHub consentono merge commit. Se richiedono una modifica di governance, presentare al PM la singola decisione concreta prima di cambiarle; non rimuovere protezioni per far passare un merge.
4. Per la divergenza storica attuale preparare una PR di riconciliazione. Se il codice è identico, dimostrarlo; se ci sono conflitti, risolverli per contenuto e rieseguire i gate. Non usare `ours`/`theirs` sull'intero repository per nascondere differenze.
5. Checklist promozione: diff applicativo, versioni, migrazioni, flag, asset, CI. Recuperare una release precedente con nuovo commit/revert, mai riscrivere un tag già pubblico.

**Accettazione:** simulazione o PR di promozione senza perdita di fix; processo ripetibile, `web`/`expo` ancora protetti; rami locali non necessari lasciati intatti salvo richiesta di pulizia. Questo ticket non autorizza il merge pubblico da solo.

### IMP-15 — F-Droid con fix comuni aggiornati

**File:** `fdroid/metadata/com.phyrexianarena.app.yml`, configurazione/plugin Expo, package e lockfile Expo della variante, `docs/FDROID_RELEASE_READINESS.md`, `docs/FDROID_OFFICIAL_SUBMISSION.md`.

1. In un worktree da `origin/fdroid-prep`, preparare matrice standard/F-Droid: versione, archivio mazzi, sync Archidekt, login email, Google, push, Sentry, ABI, build da sorgente e metadata. Separare differenze volute da arretrati.
2. Portare i fix funzionali comuni uno alla volta dal ramo stabilizzato. Non fare merge indiscriminato di dipendenze che reintroduce moduli esclusi.
3. Conservare Google/push/Sentry dove previsti nello standard, esclusi realmente dal grafo/build F-Droid secondo le regole della variante. Un flag runtime falso da solo non prova l'assenza di librerie nel binario.
4. Allineare versione/versionCode e metadata a un commit sorgente verificato. Conservare riproducibilità e build da sorgente; controllare la recipe corrente prima di copiare comandi storici.
5. Verificare quality, `npm run verify:fdroid`, bundle Android con env F-Droid impostate in PowerShell e rimosse dopo il test. Eseguire scanner/build/riproducibilità nell'ambiente F-Droid disponibile e registrare ciò che è stato realmente provato.
6. Per la variante standard ripetere verifica loghi/configurazione e smoke Google/push/Sentry, così una modifica condivisa non ne rimuove accidentalmente le funzionalità.

**Accettazione:** feature comuni coerenti, esclusioni integre, recipe e sorgente corrispondenti, verifiche binarie documentate. Invio/aggiornamento della MR ufficiale soltanto se richiesto; non confondere preparazione locale con accettazione dello store.

### IMP-16 — Validazione integrata del candidato

1. Elencare ticket inclusi, commit e nuove migrazioni. Congelare il candidato durante la verifica; qualunque modifica successiva invalida solo i controlli pertinenti, da ripetere.
2. Eseguire quality web/Expo, audit produzione, build web/budget, bundle Android/budget, readiness Obtainium. Se coinvolto iOS, aggiungere `npm --prefix expo run ios:ready` e `npm --prefix expo run ios:bundle:check`; export JS non equivale a build/firma iOS.
3. Eseguire E2E web e mobile in ambiente isolato, test SQL reali delle nuove RPC e del runner, export >1.000 record, diagnostica migrazioni. Verificare vecchi client supportati sui percorsi coinvolti.
4. Confrontare fixture prima/dopo: nessuna perdita partite, archivio, membri o inviti. Ripetere solo controlli interessati dalle modifiche, senza installare aggiornamenti estranei durante la validazione.
5. Preparare rollback codice/configurazione e ordine SQL→app. Migrazioni additive possono restare se si torna al codice precedente; documentare eccezioni. Non usare drop distruttivi come rollback automatico.

**Accettazione:** ogni gate ha evidenza e ambiente; nessun test critico saltato; limiti residui dichiarati al PM. Non riutilizzare il numero «507 test» come risultato di questa futura esecuzione.

### IMP-17 — Rilascio autorizzato e chiusura

1. Preparare una scheda concreta: commit candidato, versione/build, ticket inclusi, evidenze IMP-16, SQL esatto con checksum, asset attesi, rollback e target. Riutilizzare autorizzazioni già date; se manca quella per produzione, richiederla su questa scheda pronta.
2. Verificare backup valido e compatibilità. Applicare solo le migrazioni autorizzate tramite runner corretto, target `production` esplicito; confermare in read-only checksum/oggetti/privilegi. Non rieseguire lo storico per «mettere in pari» il registro.
3. Promuovere/taggare/pubblicare secondo le azioni autorizzate. Avviare build/deploy e rispettare la regola di comunicazione del workflow; non monitorare automaticamente se non richiesto.
4. Quando gli esiti sono disponibili, verificare readiness con commit/versione, asset reali con checksum, versione consigliata e note; pubblicare la raccomandata soltanto dopo disponibilità dell'aggiornamento. Questi controlli sono parte della chiusura quando il PM ne autorizza l'esecuzione.
5. Verificare export su account di prova, dashboard amministrativa, compatibilità e funzioni principali con test non distruttivi concordati. Una GET health verde non dimostra completamento di tutti i ticket.
6. Chiudere nel registro solo gli ID realmente implementati, verificati e, ove previsto, rilasciati. Mantenere espliciti F-Droid/store, IPA o drill ancora pendenti; allegare link della release e dei job verificati.

**Accettazione finale:** i sei problemi prioritari dell'audit hanno evidenza di soluzione, i sei ambiti strutturali hanno i rispettivi gate soddisfatti, documentazione e realtà pubblicata coincidono. Se la release è parziale, dichiarare completata la release e non l'intero programma.

## 5. Comandi di verifica riutilizzabili

Eseguire dalla root del **worktree corretto**, uno alla volta, controllando l'exit code. Questi sono comandi esistenti; nomi di script nuovi nei ticket sono proposte da implementare, non comandi già disponibili.

```powershell
git status --short
git diff --check
npm run quality
npm --prefix expo run quality
npm run audit:production
npm --prefix expo run audit:production
npm run build
npm run verify:build-budget
npm --prefix expo run android:bundle:check
npm --prefix expo run verify:bundle-budget
npm run verify:obtainium -- --release
```

E2E che scrivono dati: eseguire soltanto dopo aver verificato ambiente e credenziali sintetiche; leggere il preflight prima di lanciarli. Il comando Maestro va eseguito nella directory Expo o con `npm --prefix expo run test:e2e:android` e dispositivo dedicato. Non lanciare un E2E autenticato contro produzione usando automaticamente `.env.local`.

Migrazioni: scoprire la sintassi con il CLI Supabase installato, creare il file tramite `migration new`, poi applicare il **file reale revisionato** con `node scripts/selfhosted-db.mjs apply dev <percorso-file>`. I segnaposto non sono comandi da copiare letteralmente. Produzione segue esclusivamente IMP-17.

## 6. Gestione degli imprevisti

| Situazione | Azione dell'esecutore |
| --- | --- |
| Test fallisce dopo il cambio | Riprodurre e correggere nel ticket; niente riduzione della copertura o skip |
| Test era già rosso | Registrare evidenza baseline; separare fix preesistente, senza attribuirlo al ticket |
| Credenziali/strumento/ambiente mancano | Completare preparazione indipendente; indicare esattamente quale verifica manca |
| Schema/file differisce dal piano | Cercare la definizione attuale; adattare nomi mantenendo il contratto, documentare |
| Per rispettare il piano serve cambiare il contratto prodotto | Preparare opzioni e chiedere al PM la decisione, senza scegliere silenziosamente |
| Checksum migrazione diverso | Fermare apply; confrontare file/registro, mai sovrascrivere checksum |
| Asset pubblico diverso da quello locale | Fermare upload sostitutivo; mostrare versioni/hash senza segreti |
| Richiesta di produzione senza autorizzazione | Preparare patch/verifiche/rollback, poi chiedere autorizzazione mirata secondo AGENTS.md |
| Contesto LLM quasi esaurito | Aggiornare la checklist con sottopasso, evidenza e ripresa; non dichiarare finito |

## 7. Copertura dell'audit e riferimenti

| Voce audit | Ticket che la chiudono |
| --- | --- |
| Next.js e audit continuo | 01, 02 |
| Atomicità migrazioni | 03 |
| Export account | 04 |
| Configurazione aggiornamenti | 05, 17 |
| Asset e pubblicazione | 06, 17 |
| Metriche complete | 07 |
| Stato effettivo migrazioni | 08 |
| Test UI/mobile e offline | 09, 10, 11 |
| Schermate monolitiche | 13 |
| Storia/promozione rami | 14 |
| F-Droid | 15 |
| Ripristino off-site | 12 |

Fonti tecniche consultate per i vincoli: [lock PostgreSQL](https://www.postgresql.org/docs/current/explicit-locking.html) e [psql](https://www.postgresql.org/docs/current/app-psql.html) per lock/transazioni; [Supabase range](https://supabase.com/docs/reference/javascript/range) per paginazione e ordinamento. Durante l'implementazione consultare le versioni effettivamente installate. Il changelog Supabase remoto non era accessibile durante la stesura: va riletto prima di introdurre API nuove; il piano non richiede aggiornamenti della stack.
