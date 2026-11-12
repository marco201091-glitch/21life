# 21Life — Piano esecutivo Dev: priorità 1–6 dell'audit

Data: 12 novembre 2026, Europe/Rome. Specifica PM: «facciamo fino al punto 6 incluso. su dev ovviamente», con piano autosufficiente per il successivo agente esecutore.

## Mandato e avvio automatico al passaggio di agente

Questa sessione prepara il piano, senza implementarlo. Al successivo passaggio a un agente incaricato dell'esecuzione, il mandato già espresso dal PM è eseguire **tutto questo documento**, in sequenza, senza richiedere una nuova assegnazione per ogni ticket. Non aspettare che il PM ripeta lo scope. Non interpretare il vecchio piano del 1 ottobre, che richiedeva un ticket alla volta, come un limite a questo mandato più recente.

Leggere AGENTS.md, la skill project-development-workflow, questo documento e la sezione `DEV26` all'inizio di `.agents/PROJECT_CHECKLIST.md`. Iniziare dal primo ticket non verificato. Il registro unico degli stati rimane PROJECT_CHECKLIST; questo documento è la specifica, non un secondo registro di avanzamento.

Lavorare fino a codice, verifiche e integrazione su **Dev**, non fermarsi al piano o alla prima PR. Completare le attività indipendenti anche se una verifica esterna è bloccata. Se manca realmente una credenziale, un servizio o un dispositivo indispensabile, registrare prova del blocco e lavoro residuo senza inventare PASS; una richiesta mirata al PM è ammessa solo dopo aver esaurito le alternative sicure autorizzate. Nessun piano può garantire l'assenza di imprevisti, ma le scelte di prodotto e il perimetro ordinario sono già decisi qui.

## 1. Perimetro vincolante

I sei punti sono quelli della tabella sintetica richiesta dal PM, non le prime sei righe della precedente matrice ICE.

| Punto PM | Risultato da consegnare | Ticket |
|---|---|---|
| 1 | Ambiente riproducibile, dipendenze valutate e rate limit corretto | DEV26-00, 01, 02 |
| 2 | Backup automatico recuperabile e prova di restore isolata Dev | DEV26-03 |
| 3 | Test reali dei percorsi critici e stato sincronizzazione affidabile | DEV26-04, 05 |
| 4 | Analytics completi e campione/denominatore comprensibili | DEV26-06, 07 |
| 5 | Rivincita, preset del tavolo, recap condivisibile | DEV26-08, 09, 10 |
| 6 | Refactoring delle principali pagine e logica condivisa | DEV26-11, 12 |

Esclusi: Discord, nuove leghe, power rating/predizioni, versionamento decklist, AI, pubblicazione store, promozione main/F-Droid, nuove release/tag, modifica del modello economico, redesign generale. CSP/token storage/proxy erano raccomandazioni ulteriori dell'audit: non entrano automaticamente in questa tranche; preservare le difese esistenti e documentare eventuali problemi incontrati senza allargare lo scope.

### Autorizzazioni operative e limiti

- Autorizzati nell'esecuzione: worktree/branch temporanei da origin/Dev, modifiche e test web/mobile/backend/ops richiesti, installazioni locali nel worktree, fixture sintetiche, nuove migrazioni additive applicate **solo Dev**, push/PR/merge verso Dev dopo gate verdi. Usare i tool/CLI già disponibili; non richiedere nuovamente conferma per queste operazioni ordinarie.
- Sono consentiti test SSH sulla risorsa Dev e creazione/rimozione di stack, reti e volumi temporanei **identificati come propri del drill**. La VM è condivisa: nessun restart del daemon Docker, reboot, modifica firewall globale, prune o pulizia generica.
- Non modificare dati reali dei playgroup. Fixture con ID univoci e cleanup verificato; rollback dove possibile.
- Nessun accesso necessario ai dump di produzione; nessuna modifica a produzione, main, fdroid-prep, schedule/retention/servizi produzione o secret condivisi. Non utilizzare vecchie autorizzazioni di rilascio per questa tranche.
- Nessun deploy remoto o build EAS a pagamento da avviare: la consegna è integrazione verificata Dev, build locali/CI e APK Dev locale di collaudo se il tooling è disponibile. Un eventuale deploy automatico già collegato al push di Dev va identificato prima del merge e registrato; non modificare i trigger per occultarlo e non eseguire deploy di produzione.
- Ruling PM successivo: versione candidata 9.3.0, Android versionCode/iOS buildNumber 90300; preservare identificatori e storage. Nessun tag/pubblicazione autorizzato.
- Non inviare recap, email, push o messaggi a persone/canali reali. La condivisione è un'azione volontaria dell'utente; nei test intercettare il trasporto.

## 2. Baseline e prove già disponibili, da riconfermare

HEAD osservato: Dev `bac40b9c55b61bedd0b6f9902bf955c0069c1f35`. I riferimenti origin possono essere obsoleti: eseguire fetch prima di scegliere la base. Non assumere che bac40b9c sia ancora il punto finale.

Worktree primario già modificato dal PM in MERGE_FAILURES, PROJECT_CHECKLIST e RELEASE_PREBUILD_CHECKLIST; documento di evidenze audit non ancora tracciato. Preservare tutto. Non resettare, stashare o includere modifiche altrui nei commit della tranche.

Evidenze dell'11 novembre: 389 test web passati/2 saltati e 352 Expo passati, ma con Node 24.18.0 sotto requisito 24.21.0 e Vitest installato 3.2.7 anziché 5.0.3. Next installato 16.3.5/lock16.4.2, Expo57.0.24/lock57.0.32. Non riutilizzare questi esiti come certificazione della nuova baseline. Audit npm allora: web5/Expo9 nodi moderate, zero high/critical; non significa cinque/nove advisory distinti né esposizione runtime accertata.

Riferimenti reali da riutilizzare:

- Rate limit: `lib/api-rate-limit.ts`, `tests/lib/api-rate-limit.test.ts` e route auth.
- Backup: `ops/supabase-backup.sh`, `scripts/backup-package.mjs`, `scripts/run-staging-recovery-drill.mjs`, `scripts/qa/staging-recovery-drill.py`, `docs/OFFSITE_BACKUP_SETUP.md`.
- Sync: `lib/live-game-service.ts`, `lib/live-game-offline.ts`, `expo/lib/live-game-offline.ts`, `expo/components/live-game/recovery-panel.tsx`, `expo/lib/live-game-telemetry.ts`.
- Analytics: `expo/lib/personal-analytics-query.ts`, `lib/global-analytics-query.ts`, `lib/arena-analytics-bundle.ts`, migrazioni che definiscono le RPC correnti, `expo/lib/win-rate.ts`, `expo/lib/deck-ranking-visibility.ts`.
- Tavolo: `app/table/[id]/page.tsx`, `components/live-game/web-live-game.tsx`, `expo/app/table/[id]/index.tsx`, `expo/app/table/[id]/play.tsx`.
- Profilo: `app/profile/page.tsx`, `expo/app/(tabs)/profile.tsx`.
- Recap: `expo/lib/arena-session-export.ts`, `expo/lib/live-game-recap-share.ts` e re-export web.
- Test: `tests/e2e/live-game-complete-flow.spec.ts`, `tests/e2e/life-feedback.spec.ts`, `tests/e2e/staging-archive.spec.ts`, `expo/e2e/`, `.github/workflows/android-device-e2e.yml`.

Correzione esplicita dell'audit preliminare: **la rivincita mobile esiste già**, con `handleRematchSameDecks`, `handleRematchReselect` e recap. Non implementare un doppione. Ricontrollare anche il web e migliorare esclusivamente i gap dimostrati.

## 3. Protocollo comune di esecuzione

1. Verificare istruzioni correnti, stati e disponibilità dell'ambiente; leggere le guide Next installate prima di scrivere codice Next, skill Supabase per backend/auth e Postgres best practices per SQL. Verificare documentazione ufficiale aggiornata quando si implementano API di librerie.
2. Fetch origin; creare worktree pulito con branch `improvement/dev26-foundation` da origin/Dev. Non riutilizzare node_modules del primario tramite junction: è la sorgente del drift da eliminare. Node locale conforme senza sostituire globalmente l'installazione del PM.
3. Ordine: 00→01→02→03→04→05→06→07→08→09→10→11→12. Le estrazioni minime indispensabili per una feature sono ammesse prima di 11, ma il refactoring strutturale resta una fase distinta. Se 03 ha un blocco infrastrutturale, procedere sui ticket indipendenti, mantenendolo aperto.
4. Commit atomici per ticket; usare PR coerenti a gruppi: A=00–03, B=04–07, C=08–10, D=11–12. Dopo ogni merge, ripartire dal nuovo origin/Dev verificato. Se una PR diventa troppo ampia, dividerla senza cambiare lo scope.
5. Non abbassare coverage/budget, disabilitare gate o aggiornare snapshot per nascondere regressioni. Per un nuovo file puro aggiungere test delle invarianti; per layout verificare il comportamento effettivo, non test della sola forma del sorgente.
6. In PowerShell attivare `$ErrorActionPreference='Stop'` e `$PSNativeCommandUseErrorActionPreference=$true`. Controllare anche exit_code e successo API. Dopo errore di merge leggere stato remoto, aggiornare MERGE_FAILURES e fermare operazioni dipendenti.
7. Prima di ogni build leggere MERGE_FAILURES e RELEASE_PREBUILD_CHECKLIST; applicare i gate pertinenti alla build Dev. Una build locale candidata non richiede che una PR sia già merged, ma SHA e albero devono essere registrati; una consegna da Dev richiede riconciliazione finale con il remoto.
8. Aggiornare PROJECT_CHECKLIST dopo ogni ticket: stato, branch/SHA, file, comandi/esiti, ambiente, migrazioni/checksum, residui e azione successiva. Non segnare completato se manca una verifica obbligatoria.
9. Evidenze grandi e dati privati in `artifacts/dev26/` ignorato; report pubblico finale in `docs/DEV26_COMPLETION_REPORT.md`, senza segreti, dump, token, dati identificativi dei playgroup o percorsi di chiavi.
10. Se un gap è già risolto sul Dev più recente, provarlo con test equivalenti e documentare il riuso; non introdurre cambi cosmetici per simulare attività.

## DEV26-00 — Baseline riproducibile

**Scopo:** rendere attendibili tutte le verifiche successive.

- Inventariare versioni effettive/dichiarate di Node/npm, Next, Expo, React Native, TypeScript e Vitest; registrare anche SHA e hash dei due lockfile.
- Usare `.node-version` e `packageManager`; se quella patch Node non è disponibile verificare una versione che rispetti engines e matrice attuale, documentando la scelta, senza rilassare engines. Scaricare solo da distribuzioni ufficiali se necessario.
- Installare con `npm ci` root ed Expo, usando cache esistente dove utile; verificare postinstall e assenza di drift. Niente `npm install` casuale o `npm audit fix --force`.
- Aggiungere un controllo riutilizzabile della toolchain: versione Node/npm compatibile, pacchetti critici installati corrispondenti ai rispettivi lock, lock mancanti/corrotti, messaggio di ripristino concreto. Integrarlo prima dei controlli ordinari e nella CI in posizione compatibile con l'installazione. Non bloccare `npm ci` perché node_modules non esiste ancora.
- Eseguire baseline quality web/Expo; classificare ogni failure preesistente e correggere quelle indispensabili a ottenere gate affidabili nello scope. Non considerare un fallimento preesistente un PASS.

**Accettazione:** installazione pulita riuscita; versioni reali coerenti; il controllo intercetta drift simulato e passa sull'ambiente corretto; baseline quality verde. Build dopo i pre-build gate. Record con numeri reali, non i conteggi storici.

## DEV26-01 — Dipendenze e supply chain

**Dipende da:** 00.

- Eseguire audit produzione e completo su entrambi i grafi, salvando JSON prima dell'esito nonzero. Per ciascun advisory distinto riportare catena, runtime/build/test, input controllabile e rimedio disponibile.
- Applicare patch/minor compatibili e override circoscritti quando ufficialmente supportati e verificati. Niente major Expo/React/Next/ESLint come effetto collaterale; un major necessario richiede progetto separato, non va mascherato come patch.
- Mantenere la matrice Expo Doctor, lockfile, policy di patch e controlli SHA esistenti. Nessuna proroga o aggiunta di eccezioni per rendere verde il gate.
- Dopo modifiche, clean install e gate audit/quality pertinenti. Se restano moderate senza fix compatibile: descrivere esposizione, alternativa e follow-up; il gate high/critical non deve essere aggirato. Un high/critical residuo blocca la relativa consegna finché non risolto o già mitigato da una policy valida effettivamente verificata.

**Accettazione:** zero high/critical non mitigati secondo policy corrente; nessun nuovo advisory introdotto senza spiegazione; tutte le moderate mappate; compatibilità SDK verificata. Non promettere zero segnalazioni quando il rimedio sicuro non esiste.

## DEV26-02 — Rate limit con contratto rigoroso

**Dipende da:** 00. File: lib/api-rate-limit.ts e test API/security esistenti.

- Introdurre parsing discriminato valido/invalido della risposta effettiva di `check_api_rate_limit`; confermare il contratto SQL prima di cambiarlo.
- Richiedere `allowed` booleano, contatori finiti/non negativi e campi compatibili con il contratto. Rifiutare null, array, oggetti incompleti, stringhe, NaN/Infinity e valori incoerenti.
- Una risposta invalida segue esattamente la policy già usata per errore RPC: deny con retry60 per bucket failClosed; comportamento fail-open già previsto per gli altri. Nessun cambio arbitrario di soglie, status HTTP o contratto dei client.
- Log strutturato con codice tecnico, senza risposta grezza, bucket sensibile, token o dati personali.

**Accettazione:** test realistici sul percorso `consumeRateLimit`, non solo costanti: allowed/denied validi; tutte le risposte malformate con entrambe le policy; client assente; errore e throw RPC; Retry-After; route login/export protette. Smoke Dev con fixture controllata e nessun lockout di utenti reali.

## DEV26-03 — Backup completo e restore da pacchetto automatico

**Dipende da:** 00. Lavoro ops eseguito esclusivamente Dev/clone isolato.

### Contratto del pacchetto

- Versionare manifest e schema del pacchetto; mantenere leggibili i backup legacy, distinguendo esplicitamente capacità legacy e complete.
- Includere dump, dati Storage con xattr/ownership necessari, ruoli senza password e ricostruzione di owner/grant, comprese ACL delle estensioni non coperte dal dump. Non assumere che `--no-owner --no-privileges` basti.
- Accompagnare il pacchetto con inventario di versioni immagini/config e riferimenti al materiale di recupero cifrato (Auth/JWT/Compose/credenziali). Segreti solo nel deposito privato autorizzato; mai nel repository o report pubblico. Le password dei ruoli escluse dal dump devono essere recuperabili dal deposito, non dalla sola VM originale.
- Checksum per tutti i componenti richiesti, verifica dopo upload/download, scrittura atomica marker. No marker di successo completo se manca una componente.
- Preservare schedule e retention di produzione. Eseguire il medesimo generatore di pacchetto aggiornato su Dev in modalità one-shot; se Dev ha uno schedule già esistente, aggiornarlo solo se separato e senza cambiare frequenza/retention. Non creare automazioni remote non necessarie alla prova.

### Prova obbligatoria

1. Target Dev verificato via env/hostname/Compose; controllo preventivo spazio e isolamento. Non stampare env.
2. Fixture sintetiche: due utenti, ruoli distinti, partita con snapshot storico, oggetto Storage privato con hash e file/metadati rilevanti.
3. Generare il backup con il percorso automatico, non un pacchetto manuale più ricco; scaricarlo dal remote cifrato con checksum.
4. Ripristinare su volumi nuovi, rete interna, nomi univoci, nessuna porta pubblica, SMTP/push disabilitati. Copiare il materiale di recupero autorizzato prima di iniziare: durante il restore non leggere configurazioni o segreti dai container sorgente. Questo dimostra indipendenza dalla sorgente, ma un clone sulla stessa VM non prova perdita totale dell'host.
5. Verificare schema, record fixture, owner/grant, login Auth, lettura/scrittura REST autorizzata, diniego cross-user/anon, download Storage uguale all'hash, diniego privato e recupero degli xattr necessari.
6. Testare pacchetto incompleto/corrotto: fail-closed prima di dichiarare restore riuscito. Identificare inconsistenze DB/Storage da acquisizione non atomica; fallire se manca un oggetto referenziato. Documentare la strategia scelta per copia coerente o rilevamento delle discrepanze.
7. Cleanup solo di risorse e fixture create, con verifica finale; conservare prove private in caso di failure, senza cancellare la fonte del backup.

**Accettazione:** generatore automatico e lettore coerenti, prova completa PASS dal pacchetto scaricato, tempi misurati e limiti dichiarati. Se una VM nuova è già disponibile e separata usarla; non acquistare risorse. In assenza, chiudere il drill isolato ma lasciare esplicito `prova perdita totale VM non eseguita`, senza SLA/RPO/RTO certificati. La modifica produzione resta fuori scope.

## DEV26-04 — Test dei percorsi realmente critici

**Dipende da:** 00, 02. Estendere suite esistenti, non creare un framework parallelo.

| Scenario | Asserzione obbligatoria |
|---|---|
| Partita 4 giocatori, due client | stessi valori e versione dopo mutazioni concorrenti, nessuna perdita/duplicazione |
| Offline → mutazioni → reload/riavvio → online | coda persistita, recupero e convergenza; journal non cancellato prima dell'ack |
| Risposta persa dopo commit mutazione/finalizzazione | retry con medesimo operation ID, un solo effetto e una sola partita salvata |
| Batch parzialmente riconosciuto | operazioni già applicate non riapplicate; rimanenti mantenute |
| Sessione scaduta/401 | coda conservata, istruzione comprensibile, ripresa dopo nuova autenticazione |
| Due schede e cambio account | nessuna applicazione del journal all'utente/gruppo sbagliato |
| Storage pieno/non disponibile | errore esplicito, nessuna falsa promessa di salvataggio locale, stato in memoria preservato |
| Modifica risultato/deck e cancellazione mazzo | storico/snapshot preservati, analytics ricalcolati, nessuna associazione inventata |
| Input reale | click/long press/drag, tastiera e reduced motion non cambiano la semantica |

- Web: Playwright desktop e mobile; fixture dedicate, integrazione con backend CI isolato e smoke Dev selettivo. Almeno il percorso rete/ripresa/finalizzazione va dimostrato con due client reali.
- Android: usare tooling/emulatore esistente e Maestro; provare processo terminato/riaperto, rotazione, apertura tastiera e interazione danno, non solo chiamate dirette alle callback. Dev package separato dalla produzione.
- Rendere obbligatorio in PR il nucleo deterministico Android sul backend CI isolato, senza credenziali Dev condivise o accesso ai secret da fork. Separare in un workflow manuale soltanto le prove realmente infrastrutturali. Prima dimostrare tre esecuzioni consecutive verdi del nuovo nucleo sullo stesso candidato; nessun bypass per instabilità.
- iOS: bundle obbligatorio; simulatore solo se disponibile. Non dichiarare test fisici iPad/iPhone effettuati senza dispositivo. Conservare orientamento danni e differenze F-Droid.

**Accettazione:** scenari documentati con evidenze, regressioni pertinenti effettivamente rosse prima del fix quando riproducibili; E2E nucleo verdi. Verifiche device non disponibili restano distinte dalle prove automatiche effettuate.

## DEV26-05 — Sincronizzazione visibile e journal robusto

**Dipende da:** 04 per la rete di sicurezza; riusare Recovery Center e telemetria.

- Un modello di stato unico per presentazione web/mobile: sincronizzato; modifiche in attesa; sincronizzazione in corso; offline con modifiche pendenti; autenticazione richiesta; errore persistente; salvataggio locale non disponibile.
- Mostrare stato testuale e quantità di operazioni pendenti. I dettagli tecnici restano nel pannello di supporto. Screen reader: aggiornamenti polite aggregati, non annuncio a ogni tap.
- `Sincronizzato` solo dopo conferma server di creazione, mutazioni e finalizzazione/cancellazione necessarie. Rete online non implica sync riuscito. Non bloccare l'uso locale già supportato perché manca la rete.
- Retry conserva gli operation ID e non cancella dati. Scarto distruttivo solo da comando separato già confermato dall'utente, mai automaticamente dopo 401, timeout o conflitto.
- Rafforzare journal web: errori/quota gestiti, formato versionato, parsing rigoroso e migrazione compatibile. Scope account/gruppo con migrazione delle chiavi esistenti solo dopo verifica ownership; non cancellare dati ambigui, presentarli come recupero da verificare. Preservare outbox e shadow copy mobile.
- Estendere telemetria esistente con codici errore sanitizzati e tempi/anzianità coda utili, evitando contenuti partita, nomi, token e sistemi di tracking esterni nuovi. Metriche aggregabili per versione/piattaforma; documentare retention esistente.

**Accettazione:** ogni stato provato dai test; rete ripristinata con token invalido non mostra successo; persistenza fallita visibile; no regressioni sul recupero esistente; IT/EN e accessibilità. Nessun nuovo pannello duplicato.

## DEV26-06 — Completezza e costo degli analytics

**Dipende da:** 00, 04. Skill SQL/Supabase obbligatorie.

- Mappare tutte le chiamate alle RPC fatti personali/globali, agli aggregati arena e ai dettagli storici, con shape e consumatori. Determinare cap reale della Data API Dev senza modificare globalmente il cap.
- Per dashboard introdurre RPC aggregate additive v2 con risposta a oggetto JSON e contratto versionato. Usare aggregazioni server-side per gli indicatori realmente visualizzati; dettagli storici in pagine keyset ordinate da chiave stabile e tie-breaker univoco. Non limitarsi ad alzare max_rows.
- Riutilizzare aggregati arena già corretti. Preservare snapshot storici, mazzi occasionali, ospiti, esclusioni demo/admin previste, filtri bracket/periodo, pareggi e semantica delle classifiche.
- Output esplicito per assenza dati ed errore: niente zeri fabbricati o fallback silenzioso a risultati parziali. Timeout/limiti provocano errore riconoscibile.
- RPC personali: self/admin secondo contratto attuale; globali service-only dietro autorizzazione admin. Test cross-user, guest, anon e authenticated. Privilegi espliciti, search_path controllato, nessun service_role nel client.
- Cache coerente con account/gruppo/filtro/versione contratto; invalidare dopo finalizzazione, modifica risultato, archiviazione e azioni deck pertinenti. Nessuna cache globale di dati privati condivisa tra utenti.
- Migrazioni nuove additive con nomi generati dagli strumenti previsti, mai modifica di SQL già applicato. Vecchie RPC restano disponibili ai client supportati; nuovi client richiedono schema v2 e segnalano backend incompatibile senza usare un fallback potenzialmente troncato.

**Prova dati:** almeno 10.001 partecipazioni sintetiche distribuite tra gruppi/utenti, oltre il cap effettivo; confronto esatto con SQL indipendente per numeratori/denominatori, filtri temporali, deck cancellati/snapshot, occasionali, ospiti e pareggi. Verificare anche 0, 1 e soglie di pagina, date uguali e modifica concorrente.

**Performance:** misurare prima/dopo sullo stesso dataset, hardware e protocollo; conservare EXPLAIN (ANALYZE, BUFFERS), righe lette, payload e p50/p95. Obiettivo: risposta completa e payload dashboard non lineare nel numero di partite (può crescere con le entità raggruppate); nessuna regressione p95 >20% rispetto a baseline comparabile senza causa risolta. Non promettere una latenza assoluta senza misurazione. Indici solo motivati dal piano, niente Redis/microservizi introdotti.

**Accettazione:** confronti esatti PASS, permessi reali verificati in Dev, vecchi client compatibili, nuova UI mai apparentemente completa su dataset parziale, report misure e cleanup.

## DEV26-07 — Campione e significato delle statistiche

**Dipende da:** 06.

- Rendere visibili periodo, partite totali, vittorie e pareggi; tooltip o testo di aiuto IT/EN: win rate = vittorie / partite con vincitore; i pareggi sono esclusi dal denominatore.
- Conservare soglia provvisoria esistente di cinque partite e toggle di inclusione. Etichetta `Campione ridotto` sotto soglia; non chiamare una soglia di cinque partite prova di affidabilità statistica.
- Se tutte le partite sono pareggi o non ci sono partite: UI `—`/`nessuna partita decisiva`, senza classificare come sconfitte; non cambiare il valore interno storico senza verificare consumatori e contratto.
- Mostrare la dimensione del tavolo quando il contesto la rende disponibile; non confrontare ingenuamente il 25% di un tavolo da quattro con il 50% di un duello. Nessun Elo, intervallo predittivo o nuovo modello statistico in questa tranche.

**Accettazione:** equivalenza web/mobile dei valori; casi 0, tutte patte, 1W1L1D=50%, 4/5/6 partite; campione coerente con filtro e aggiornato dopo modifica di un risultato.

## DEV26-08 — Rivincita coerente, riusando ciò che esiste

**Dipende da:** 04, 05.

- Verificare per prima cosa la rivincita già implementata mobile e l'equivalente web. Conservarne UI e semantica corrette; completare solo gap di parità/robustezza.
- Fine partita → recap → `Rivincita con stessi mazzi` / `Scegli altri mazzi` / chiudi. Stessi mazzi mantiene partecipanti, posti, deck e vite iniziali; azzera danni, counters, eliminazioni, timer, log e vincitore; genera nuovo ID e nuove mutation ID.
- `Scegli altri mazzi` mantiene i partecipanti nel setup e richiede conferma dei deck. Deck non più disponibili, membership cambiata o partecipante occupato portano al setup con spiegazione, mai sostituzione silenziosa.
- Doppio tap non crea due partite. Una rivincita non può sovrascrivere il journal di una partita precedente ancora da sincronizzare: archiviarlo nell'outbox affidabile o disabilitare l'avvio spiegando il motivo finché il dato non è al sicuro. Non perdere offline le identità dei mazzi occasionali.

**Accettazione:** due partite distinte, un solo risultato per partita, statistiche corrette; stessi mazzi/reselezione/guest/occasionali; doppio tap; rete assente e finalizzazione pendente; parità web/mobile provata.

## DEV26-09 — Preset del tavolo: decisioni prodotto già fissate

**Dipende da:** 05, 08.

- Preset **locali per account e playgroup**, massimo 10; niente sync cloud, tabella DB o condivisione pubblica in questa tranche. Informare che sono salvati sul dispositivo.
- Dati v1: id, nome, schemaVersion, accountId, groupId, updatedAt, ordine e participantKey dei posti, riferimenti deck con distinzione guest/occasionali, vite iniziali e preferenze layout già supportate. Niente token o stato della partita.
- Comandi nel setup live web/mobile: `Salva preset`, `Carica preset`, rinomina, elimina con conferma; nome trim1–40 caratteri, duplicato case-insensitive non ammesso nello stesso account/gruppo, al massimo10. Non aggiungere una nuova schermata di impostazioni generale.
- Caricamento precompila e apre conferma, **non avvia una partita**. Risolvere membership e deck rispetto al catalogo attuale. Segnalare e lasciare da scegliere ogni riferimento mancante/archiviato/non autorizzato. Non salvare duplicati di mazzi occasionali durante il caricamento.
- Non salvare vite correnti/counters/timer/cronologia come preset. Non esporre preset di account A ad account B. Storage indisponibile: errore visibile e setup corrente preservato.
- Web storage/browser e mobile AsyncStorage tramite adapter; parsing rigoroso, nomi escaped, schema futuro non riconosciuto non sovrascritto.

**Accettazione:** CRUD, persistenza dopo riavvio, isolamento utenti/gruppi, limite10, nome invalido/duplicato, deck eliminato e guest rimosso, nessun avvio involontario, touch/tastiera/lettore schermo, IT/EN.

## DEV26-10 — Recap del playgroup condivisibile su richiesta

**Dipende da:** 06, 07. Riutilizzare export/recap esistenti; non confondere recap partita e riepilogo periodo.

- Nello storico/analytics del gruppo, azione `Condividi riepilogo`; periodo predefinito ultimi7giorni di calendario incluso oggi nel fuso del dispositivo, alternativa ultimi30giorni. Inviare gli estremi ISO corretti come intervallo [inizio, fine) e mostrare date/fuso nell'anteprima. Test cambio DST e limite di mezzanotte.
- Contenuto v1 testuale: nome gruppo, periodo, partite concluse, numero partecipanti distinti, mazzi/comandanti più giocati (massimo3 con conteggi), vittorie/pareggi e durata mediana se disponibile. Dati insufficienti indicati come tali; niente danni o durate inventati per record manuali.
- Anteprima obbligatoria prima della condivisione: il gruppo è privato e l'utente decide se esportare i nomi. Default alias anonimi coerenti per giocatori, toggle esplicito `Includi nomi dei giocatori`; non includere email, user ID, codici invito, note private, link/token di accesso o dati di altri gruppi.
- Web: Web Share se disponibile, fallback copia testo/download .txt; mobile: share sheet nativo. Cancellazione non è errore e non viene dichiarata pubblicazione; la copia deve confermare soltanto se riuscita. Nessun invio automatico, cron, push, email o Discord.
- Calcolo completo dal contratto analytics affidabile, altrimenti export non disponibile con motivo; evitare chiamate a provider carte per costruire testo.

**Accettazione:** 0 partite, una partita, pareggi, ospiti, deck cancellati, periodi ai confini/DST, ranking deterministico a pari conteggio, anonimizzazione coerente e parità web/mobile. Test dei payload reali con trasporto intercettato; nessun messaggio inviato durante le prove.

## DEV26-11 — Refactoring dei quattro proprietari principali

**Dipende da:** 04–10. Separare commit meccanici da cambi di comportamento.

**Priorità esplicita PM, 12 novembre:** il punto6 richiede lavoro approfondito. Non è un'attività cosmetica finale né una voce sacrificabile per accelerare la consegna. L'esecutore deve completare i sottopassi seguenti e dimostrare una riduzione dell'accoppiamento e delle responsabilità, oltre alla dimensione dei file. Lo stack resta TypeScript/Next/Expo/PostgreSQL: nessuna migrazione Python/FastAPI.

### 11a — Diagnosi e progetto dei confini

- Prima delle estrazioni, rilevare nei target: componenti/funzioni, stato locale e derivato, effect, query, subscription, comandi remoti, persistenza, autorizzazioni e dipendenze. Individuare logiche duplicate web/mobile e cicli di import. Usare AST/tool disponibili quando utile, senza adottare una piattaforma di analisi nuova.
- Produrre `docs/DEV26_ARCHITECTURE.md`: mappa attuale, responsabilità target, diagramma delle dipendenze e tabella con un proprietario per ogni risorsa. Specificare chi crea/aggiorna/distrugge subscription, journal, timer e listener e cosa avviene al cambio account/gruppo.
- Stabilire il contratto delle feature prima di estrarle: input/output, stati di caricamento/errore, operazioni ammesse, invalidazione e side effect. Mappare ogni percorso critico ai test esistenti/nuovi. Non richiedere approvazione ordinaria del documento: revisionarlo contro codice e test e procedere.
- Responsabilità attese: route compositiva; controller di feature per coordinamento; servizi/query per accesso dati; adapter per piattaforma; dominio puro per regole; componenti per presentazione/interazioni. Evitare layer aggiuntivi quando una funzione o un modulo di feature bastano.

### 11b — Estrazione progressiva per feature

- Tavolo web: separare catalogo/membership, storico/editor, analytics e inviti/gestione gruppo; route compone sezioni e controller senza eseguire direttamente tutte le operazioni.
- Profilo web: separare caricamento/catalogo mazzi, import e modifica, aggregazioni/filtri, premi e presentazione. Riutilizzare componenti già estratti in interventi precedenti.
- Partita web/mobile: separare setup, lifecycle della partita, sincronizzazione/recovery, comandi utente, finalizzazione/rivincita e dialoghi/presentazione. Il controller non deve diventare il nuovo contenitore di tutta la schermata.
- Una feature per commit o piccolo gruppo coerente; prima caratterizzazione del comportamento, poi estrazione, poi verifica del percorso coinvolto. Evitare due implementazioni temporanee che possano essere eseguite insieme.
- Spostare lo stato vicino al suo proprietario. Lo stato puramente derivato non va duplicato in useState con effect di riallineamento; mantenerlo derivato quando semanticamente equivalente. Per stati realmente mutuamente esclusivi usare discriminated union/reducer locale se riduce stati impossibili, senza imporre una libreria di state machine.
- Rimuovere effect superflui, closure obsolete, richieste concorrenti non cancellate/ignorate dopo cambio contesto e listener duplicati, quando dimostrati. Ogni correzione di comportamento ha commit e test distinti dall'estrazione meccanica.

### 11c — Confini applicati automaticamente

- Aggiungere controlli di import tramite strumenti esistenti o script mirato: nessuna dipendenza dominio→UI/piattaforma; nessun servizio dati→componente; niente import web→runtime Expo o native→runtime Next; nessun ciclo nuovo tra moduli di feature estratti.
- I componenti di presentazione estratti non creano client Supabase, subscription o journal; le operazioni passano da contratti tipizzati. Componenti realmente container devono essere identificati come tali nella mappa, non etichettati presentazionali.
- Non usare `any`, cast concatenati, eslint-disable estesi, barrel universali o context globale per aggirare i confini. Gli adapter possono dipendere da SDK concreti; non creare interfacce generiche prive di un'esigenza reale.
- Controllare che nuove dipendenze non includano librerie native nei bundle web/server e che il dominio non porti segreti/config runtime nei client. Verifica automatica del grafo e build/export effettivi.

### 11d — Prova della qualità strutturale

- Nel documento architetturale confrontare prima/dopo: dimensione entrypoint/moduli, dipendenze tra feature, cicli, proprietari di query/subscription/journal, regole condivise e duplicazioni rimosse. Non usare il numero dei file creati come indicatore di successo.
- Eseguire una revisione finale esplicita delle responsabilità: simulare dove si modificherebbero una regola del win rate, una voce del recap, un errore sync e un campo del setup. Ciascun cambiamento deve avere un punto di intervento individuabile e non richiedere modifiche simultanee in schermate monolitiche o duplicazione della regola tra client.
- Per ciascun target verificare mount/unmount ripetuti, cambio gruppo/account, risposta tardiva, navigazione indietro e doppio invio. Provare che non aumentano subscription, timer o comandi remoti dopo rimontaggi.
- Confrontare UI e interazioni prima/dopo nei viewport esistenti, incluso tablet ruotato e movimento ridotto. Testare col componente/controller reale; mock della sola rete/storage ai confini quando possibile, non riscrivere gli hook React nei nuovi test per renderli verdi.
- Il ticket resta aperto se il codice è soltanto spostato in un hook/componente enorme, se la route conserva le responsabilità estratte, se rimangono due proprietari della stessa risorsa o se le dipendenze vietate non sono controllate.

Target obbligatori: `app/table/[id]/page.tsx`, `app/profile/page.tsx`, `components/live-game/web-live-game.tsx`, `expo/app/table/[id]/play.tsx`. Esaminare anche `expo/app/table/[id]/index.tsx` per il setup condiviso, evitando estrazioni massive prive di beneficio.

- Estrarre controller/hook per catalogo e caricamento, stato editor, query/invalidation, sync/recovery e setup; componenti di presentazione per sezioni autonome (partecipanti, storico, analytics, recap, dialoghi).
- Ogni subscription/query/journal deve avere un solo proprietario. Cleanup idempotente, dipendenze hook corrette, callback stabili dove utili. Nessun hook condizionale o singleton di stato privato tra utenti.
- Contratti tipizzati espliciti; evitare un unico context universale o centinaia di props che ricreino il monolite. Separare presentazione da accesso Supabase senza creare layer vuoti.
- Conservare URL, query key, permessi, formato dati, ordine delle azioni, stile, dialoghi e focus. Preservare animazioni vite e movimento ridotto, dimensioni/rotazioni phone/tablet, comportamento tastiera.
- Obiettivo di organizzazione: ciascun entrypoint dei quattro target <=800 righe non vuote, moduli nuovi di norma <=500. Non spostare 3.000 righe in un unico figlio e non comprimere il codice. Una sezione dichiarativa più lunga è ammissibile solo con motivazione concreta e responsabilità unica documentata.

**Accettazione:** mappa prima/dopo responsabilità e ownership; nessun nuovo file monolitico; quality/E2E critici invariati; screenshot comparativi desktop/phone/tablet senza modifiche visuali involontarie; nessun aumento immotivato del bundle; nessun cambiamento SQL o semantica partita nei commit di sola estrazione.

## DEV26-12 — Dominio comune e consegna finale Dev

**Dipende da:** 11.

### Dominio condiviso

- Trattare questa estrazione come seconda metà obbligatoria del punto6, non come follow-up facoltativo. Prima migrare i contratti e le regole pure identificati in11a, poi eliminare la duplicazione effettiva e verificare tutti i consumatori. Documentare il perimetro lasciato negli adapter e il motivo.
- Creare `packages/domain` come modulo privato locale, senza pubblicazione registry; scegliere integrazione alias/workspace minima compatibile con Next, TypeScript, Vitest e Metro effettivi. Un workspace npm completo non è obbligatorio: non rifare i due lockfile per ragioni estetiche.
- Migrare prima le regole pure già condivise: win-rate, participant-keys, deck-ranking-visibility, contratti preset/recap e trasformazioni analytics pure necessarie. Migrare motore live/history se il grafo di import è puro e coperto; mantenere adapter/re-export compatibili per tutti i percorsi esistenti.
- Il dominio non importa React, React Native, Next, Expo, Supabase client, storage, variabili runtime o alias `@/` specifici di un client. Import interni relativi o alias del pacchetto controllati. Vietato importare il runtime mobile dal web attraverso il nuovo pacchetto.
- Bloccare dipendenze vietate con un controllo leggero e testare lo stesso contratto su web/mobile. Mantenere implementazione unica delle regole migrate; wrapper solo di compatibilità.
- Configurare tracing standalone Next, Metro e resolver test quando necessario; verificarlo con build/export reali, non soltanto typecheck. Non eliminare i re-export finché esistono consumer supportati.

### Verifica finale obbligatoria

Prima leggere i due documenti pre-build e confermare sorgente/ambiente. Eseguire sull'ultimo candidato:

```powershell
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
npm run quality
npm --prefix expo run quality
npm --prefix expo run doctor:ci
npm run build
npm run verify:build-budget
npm run test:e2e
npm --prefix expo run android:bundle:check
npm --prefix expo run verify:bundle-budget
npm run expo:ios:ready
npm run expo:ios:bundle:check
```

Integrare anche test nuovi di script/SQL e nucleo Android nel percorso quality/CI pertinente, senza lasciare script cruciali fuori da tutti i gate. Le env dei comandi devono essere esplicitamente Dev/CI isolate: non caricare per errore il backend produzione. Fixture E2E deterministiche e nessun test unitario dipendente da provider live.

- Ripetere audit web/Expo secondo policy; clean install finale almeno una volta dopo l'ultimo cambio dipendenze/config.
- Testare integrazioni SQL e completezza/permessi sullo schema Dev con cleanup. Applicare solo migrazioni nuove necessarie tramite `node scripts/selfhosted-db.mjs apply dev <file.sql>` e verificare checksum/privilegi con SQL read-only sul medesimo target; niente supabase status come health remoto.
- Eseguire APK Dev locale/emulatore se disponibile. Nessuna firma di produzione. L'export Android non sostituisce una prova di installazione; registrare precisamente ciò che è stato fatto.
- Controlli richiesti GitHub verdi prima del merge di ciascuna PR; lettura dello stato PR obbligatoria. Non avviare monitoraggio prolungato di release remote non richieste. La verifica dei check di PR necessaria all'integrazione è parte del mandato.
- Verificare origin/Dev finale, commit di merge e contenuto atteso, worktree di consegna pulito; confermare che differenze tra candidato testato e merge siano assenti o esclusivamente metadata, altrimenti rieseguire i controlli pertinenti.
- Aggiornare code map nella skill workflow e documentazione tecnica/IT-EN delle nuove funzioni. Non portare nel commit modifiche PM estranee del checkout primario.
- Per chiudere il punto6 allegare `docs/DEV26_ARCHITECTURE.md`, misure strutturali prima/dopo, esito controlli dei confini e dei quattro percorsi di manutenzione11d. Tutti i sottopassi11a–11d e il dominio condiviso devono risultare verificati nella checklist; i soli test verdi non dimostrano che l'architettura sia migliorata.

**Rapporto finale:** per ciascun punto1–6 riportare implementazione, prova, SHA e limiti; stato DB Dev, PR/merge, misure analytics/restore, screenshot e comandi. Separare `implementato`, `verificato`, `integrato Dev`, `non distribuito`. Non dichiarare la tranche integralmente completata con gate rossi o ticket obbligatori pendenti.

## 4. Ripresa, blocchi e rollback

- Alla ripresa leggere PROJECT_CHECKLIST, verificare worktree e remoto; proseguire dal primo sottopasso non provato. Non ripetere migrazioni, fixture o operazioni remote già confermate.
- Un problema ambientale non autorizza a cambiare target in produzione, rilassare il controllo o ricreare risorse condivise. Tentare una soluzione locale/CI/clone isolato; registrare l'evidenza se non disponibile.
- Rollback codice con revert dei commit della tranche su Dev dopo verifica delle dipendenze, mai reset/force push. Non includere cambi estranei nel revert.
- Database: aggiunte compatibili con vecchi client; non eliminare RPC/colonne e non riscrivere storia delle migrazioni. In caso di failure runtime disabilitare il nuovo consumer o usare un errore esplicito; niente fallback silenzioso a dati incompleti. Correzioni SQL tramite nuova migrazione, non esecuzione automatica di down distruttivi.
- Backup: mantenere lettura legacy e precedente versione dello script, nessuna cancellazione degli ultimi backup validi. Drill fallito conserva l'evidenza privata; cleanup non deve rimuovere risorse con ownership incerta.
- Al completamento, risposta al PM breve: `Fatto` + punti1–6 completati + link al report + eventuali limiti concreti. Non richiedere una nuova specifica per i ticket già descritti.
