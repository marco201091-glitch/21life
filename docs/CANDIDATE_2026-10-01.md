# Candidato Dev e preparazione del rilascio

Codice candidato: `2653614b190224189c27e96b15439fe7256e25de`, PR #144 verso
Dev, integrata con squash `5d60de2bea047fcbc5fdabcf9ee859841974ec9a`. Versione attuale 9.0.4 / 90004, minimo supportato 8.1. La release pubblica
9.0.4 esiste già: non spostare il suo tag né sostituire APK o asset esistenti.
Una nuova release standard deve usare una nuova versione/build, quindi un
nuovo candidato verificato; questa scheda non autorizza la pubblicazione.

## Contenuti ed evidenze

IMP-01–08: patch Next 16.3.8, audit schedulato, runner SQL atomico, export
paginato, policy runtime, publisher idempotente, aggregazioni operative e
diagnostica migrazioni. IMP-09–11: fixture autenticata staging, test web di
archivio/live/offline/conflitti/finalizzazione e accessibilità, flussi Maestro
preparati. IMP-12: recupero manuale off-site realmente eseguito. IMP-13–14:
estrazioni presentazionali e simulazione della riconciliazione dei rami.

Quality web: 289 test; script: 18 test; Expo: 249 test. Audit produzione
web/Expo: zero. Next: 50 pagine, budget 2.82/18 MiB. Export Android standard:
9.18/12 MiB; iOS readiness/export JS passati, senza attestare build o firma iOS.
E2E autenticati desktop/mobile: tre passate consecutive e regressioni mirate,
cleanup verificato. Export reale oltre 1.000 record e runner/RPC verificati
su staging. La checklist contiene riferimenti alle esecuzioni CI e limiti.

Drill `222cd7b63bd2`: 57 tabelle uguali allo snapshot, due login Auth,
letture/scritture REST e diniego cross-user, Storage recuperato con hash uguale
e diniego privato. Restore 22,93 s; totale 38,51 s. Nuovi volumi e rete interna,
nessuna porta pubblicata; cleanup verificato. Configurazione e credenziali dei
servizi provengono dalla VM esistente, quindi non è una simulazione di perdita
totale della VM. Nessuna modifica ai backup automatici.

## SQL revisionato, già applicato soltanto su staging

I file reali sono sotto `supabase/migrations/`; i digest descrivono i byte
applicati, non una normalizzazione del testo.

| File | SHA-256 |
| --- | --- |
| 20261001090317_recommend_v9_0_4_runtime_update.sql | 87c0f0c12e22a07678f95b2c407749f2a678292e3d6e3dc6acc1dae278198a7c |
| 20261001103000_admin_operations_aggregates.sql | 3b235451ab815370343bb19c0db3eb0ee208d2374e43d6505ca3331a09f953bc |
| 20261001105900_migration_registry_bootstrap.sql | a5162af410f6a08e1f9eec392d4ae9583461e22085d34dd65961f470396760f2 |
| 20261001110000_admin_migration_registry_read.sql | d93d392ef7a3fecb978c717c845af7b16deb131db957ace87e8fb6f8afae1ec8 |

Prima di un'applicazione production autorizzata: inventario read-only del
registro e della riga runtime, copia privata dei valori precedenti, verifica
di una copia di recupero completa. Applicare i file mancanti nell'ordine sopra
con `node scripts/selfhosted-db.mjs apply production <file-reale>`, poi
verificare checksum/oggetti/privilegi sul medesimo target SSH. Non rieseguire
lo storico né sovrascrivere checksum discordanti. Le RPC amministrative devono
restare non eseguibili da anon/authenticated ed eseguibili da service_role.
La raccomandazione 9.0.4 si riferisce all'APK già disponibile; una futura
raccomandazione diversa richiede SQL e note propri, dopo disponibilità dell'APK.

## Ordine e recupero

La PR #144 è stata integrata su Dev dopo i check richiesti. Per una successiva promozione
pubblica, riconciliare main/Dev preservando ancestry secondo
`BRANCH_RELEASE_WORKFLOW.md`; preparare la PR di promozione e chiedere
autorizzazione sul candidato finale. main/Dev richiedono storia lineare: il
merge con ancestry richiede approvazione della modifica di questa sola policy,
preservando web/expo e le altre protezioni. Schema additivo prima dell'applicazione.
Rollback: revert del codice sul branch e nuova versione se già pubblicata;
lasciare registro/RPC additive, senza drop o cancellazione di telemetria.
Ripristinare la raccomandazione precedente solo con i valori salvati e se
necessario. Un fallback API è segnalato esplicitamente.

Gli asset di una nuova release standard sono APK firmata con la chiave
permanente, checksum APK, SBOM web e Android della stessa versione/tag; nessuna
IPA unsigned deve essere descritta come release iOS firmata. Il publisher
rifiuta collisioni e pubblica solo dopo verifica dei byte.

## Limiti residui

Prove device/TalkBack al PM. Job Maestro manuale non eseguito; CLI
locale assente, variabile/secret staging GitHub ora configurati. Expo doctor locale: 19/21, DNS
`exp.host` e sette patch SDK consigliate; non aggiornate durante il congelamento
del candidato. Checksum storico `20260728073639` discordante, senza backfill.

Backup automatico escluso dal PM: tar semplice non conserva gli xattrs
richiesti da Storage 1.60.4 e il pacchetto non contiene ruoli/grant. Il drill
manuale corretto non attesta il recupero degli attuali pacchetti automatici.

F-Droid: PR draft #145 verso fdroid-prep; 9.0.4/90004, source pin
`f12b7de0c2cb60a7c9d6721245ecae1397ea9347`, APK unsigned arm64 e scanner binario
fdroidserver 2.4.5 verificati. SHA-256 APK:
`71b05cdb3649de9660883da7fe15d0a25991b295e9ae9c577e342458c214056e`.
Rebuild Windows dopo clean: APK byte per byte identica.
La recipe Linux e l'accettazione ufficiale restano separate dalle verifiche
locali; nessun aggiornamento della MR GitLab o tag pubblico effettuato.

IMP-17 richiede ancora autorizzazione esplicita per target produzione,
promozione pubblica e pubblicazione. Lo stato unico resta
`.agents/PROJECT_CHECKLIST.md`.


## Esito audit dei due rami e proposta di promozione web

Esecuzione reale `36868928257`: Dev web/Expo zero; main web una critical Next,
Expo zero. Il workflow ha conservato i report di entrambi i rami e ha bloccato
main con exit 2. Advisory:
<https://github.com/advisories/GHSA-vcvr-r3jv-pc5j>. La dipendenza è segnalata;
l'esito audit non è una prova di sfruttabilità dei percorsi dell'applicazione.
Il fix 16.3.8 è già integrato su Dev; il follow-up #147 rende l'audit indipendente
dall'età del codice analizzato e usa una variabile matrix dedicata.

Il primo intervento production proposto è una promozione **web e schema**, senza
nuovo tag o sostituzione dell'APK 9.0.4 disponibile. Richiede autorizzazione PM:
quattro migrazioni della tabella sopra, backup manuale completo verificato,
PR Dev→main con ancestry, deploy web Dokploy production e monitoraggio richiesto.
Per permettere questa PR, disabilitare esclusivamente `required_linear_history`
su main/Dev, conservando controlli web/expo e tutte le altre protezioni; anche
questa modifica di governance richiede la decisione esplicita PM. Un rilascio
APK successivo resta una nuova versione/build con verifiche proprie.

## Aggiornamento 2026-10-05

Il PM ha successivamente autorizzato promozione web/schema, backup verificato, quattro migrazioni e rimozione del solo vincolo storia lineare; eseguiti con PR #149 e deploy main 1c319233. Sono autorizzate anche due eccezioni audit della CLI Expo con scadenza 19 ottobre escluso; non equivalgono ad audit zero. Questo documento conserva il candidato storico del 1 ottobre; record corrente ed evidenze in RELEASE_2026-10-05.md. Nessun tag/APK esistente sostituito.
