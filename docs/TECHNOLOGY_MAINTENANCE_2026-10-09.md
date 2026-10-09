# Manutenzione tecnologica 21Life 9.1.0 — 9 ottobre 2026

## Consegna

Manutenzione implementata nel worktree isolato `21life-rebranding`, branch `chore/technology-maintenance-9.1`, dalla baseline Dev `bbfbaa6`. Versione applicativa mantenuta a **9.1.0 / 90100**. Il checkout del PM è stato preservato. Nessuna pubblicazione del sito, promozione main, modifica di database/configurazioni production o aggiornamento dei container remoti.

I sorgenti delle animazioni sono nel commit `e40fd32`; il precedente candidato manutenzione `0b98a45` ha superato anche la build APK nativa. Web finale costruito dal commit pulito `b8f630a`; APK ed export iOS da `e40fd32` (codice native identico nei commit successivi). APK SHA-256 `612dea6a785a7ca41b91daa805985b8bcf812eb4f76b5e61bedb8a435e137bc5`, firma locale verificata; non firma store/EAS.

## Aggiornamenti eseguiti

| Area | Risultato verificato nel lockfile/configurazione |
| --- | --- |
| Expo | SDK 57.0.27; otto dipendenze allineate alla matrice; Babel preset 57.0.14 |
| Web | Next, env e configurazione ESLint Next 16.4.0 |
| Librerie condivise | Supabase JS 2.117.3, React Query 5.104.1; aggiornamenti compatibili di form, UI e strumenti |
| Monitoraggio | Sentry web 10.76.2; native 7.11.0 previsto dallo SDK |
| Test | Vitest e coverage-v8 5.0.3, web e mobile |
| Runtime | Node 24.21.0 in contratto, CI, EAS e Docker; immagine Docker fissata anche per digest |
| Build mobile | EAS CLI 24.12.1 esatta via npx; nessuna dipendenza EAS CLI locale |

React rimane nella combinazione di ciascuna piattaforma: 19.3.0 web, 19.2.3 mobile con RN 0.86.3. I minor nativi proposti fuori matrice sono stati provati, rilevati da Expo e riallineati. Nessun `audit fix --force`.

La migrazione Vitest elimina **due segnalazioni critical** della catena precedente Vitest/tinypool, oltre alle moderate osservate. La diversa pipeline di mapping/trasformazione della coverage cambia le percentuali anche sui medesimi sorgenti e test; Vitest 3.2 utilizzava già un mapper AST. Baseline misurata prima delle modifiche applicative, comprendente tutti i **103 file web e 100 mobile iniziali**, con quattro metriche per file. Nuovo gate impedisce regressioni per file, metriche non valide e scomparsa di file. Soglie aggregate riallineate alla misura nuova, senza escludere file per recuperare percentuali. Review indipendente ha verificato corrispondenza completa tra baseline e report. L'equivalenza numerica Windows/Linux resta da confermare in CI.

## Correzioni funzionali e pipeline

- Login: un invio prima della hydration poteva usare il GET nativo del form e inserire credenziali nella query URL. Tutti i cinque form Auth ora dichiarano POST; il login abilita campi e pulsanti soltanto dopo hydration. Regressione riprodotta e corretta; controlli desktop/mobile anche con JavaScript disattivato.
- Inglese predefinito anche in browser italiano; preferenza italiana salvata rispettata e attributo HTML `lang` sincronizzato. Selettore EN prima di IT.
- Domini di build centralizzati: produzione nuova predefinita, rollback legacy esplicitamente selezionabile. Gate rifiuta domini misti, varianti Dev in produzione, HTTP e host somiglianti. Il runner produzione locale conserva gli endpoint della configurazione selezionata.
- `expo-doctor` ora blocca qualsiasi errore, compreso drift patch; nessuna esenzione silenziosa. Tooling config Expo tollera il contesto parziale senza perdere identificativi nativi.
- Sentry: rimossa opzione plugin non supportata; variabile effettiva disabilita upload soltanto in Dev. Produzione richiede upload, anche nella ricetta IPA unsigned; readiness iOS verifica la politica reale.
- Corretta posizione di `.node-version` nel workflow audit con checkout in sottodirectory. Aggiunto gate critical comprendente dipendenze di sviluppo/build in CI e audit programmato.
- Script APK interrompono il flusso anche su errore nello stop Gradle o pulizia cache. Build Dev include ARM64 e x86_64. Runner E2E aggiunge wizard per tutte le dimensioni e filtro classifiche.

Review indipendente: zero Critical, due Important, entrambi corretti (path Node dell'audit e override Sentry nella ricetta unsigned). Corretta anche la documentazione obsoleta sul doctor. La successiva protezione hydration è stata verificata direttamente tramite regressione e flussi browser.

## Animazioni in partita

Feedback web/mobile distingue gain e loss, intensita proporzionata e limitata, halo verde o rosso native, pulsazione del solo numero e delta che sfuma/flette verso alto o basso. Totale reale aggiornato immediatamente, delta netto dei tocchi ravvicinati visibile per 2,2 secondi. Nome e centro del totale rimangono fermi. Nessuna dipendenza aggiunta; trasformazioni/opacita, native sul thread UI. Movimento ridotto interrompe animazioni native gia attive e conserva feedback statico; web rispetta sistema e preferenza della partita rapida. Scadenza non viene cancellata cambiando preferenza.

Quattro test nuovi della logica RED→GREEN verificano limiti, invalidi, burst misti, cancellazione e nuova finestra; review indipendente senza nuove regressioni, migliorato anche il posizionamento del delta precedentemente instabile.

Sei E2E finali desktop/mobile passati: feedback normale, sistema con movimento ridotto e preferenza app salvata. Il test ha riprodotto un problema di hit testing dei controlli ruotati con la disattivazione generica delle transizioni: preferenza ora applicata solo al feedback vita, regressione verde. Sei screenshot Android nuovi verificano gain, burst, loss, movimento ridotto e scadenza. Nessun benchmark FPS o dispositivo iOS fisico dichiarato.

## Verifiche eseguite

| Verifica | Esito |
| --- | --- |
| Quality web | lint, TypeScript, 323 test, security, manifest, knip passati |
| Quality mobile | lint, TypeScript, 264 test, coverage, asset/logo, knip passati; helper nuovo al 100%, baseline portata a 101 file senza abbassare le precedenti |
| Script | 41 test passati, inclusi casi negativi di gate/coverage/domains |
| Integrazione PostgREST | 1 test reale Dev: export completo di 1.001 mazzi, cleanup verificato |
| Browser pubblico | 14 test desktop/mobile passati; accessibilità e screenshot inclusi |
| Browser autenticato | 12 test desktop/mobile passati: login, Archidekt, responsive/iPad, partita/offline/Realtime/finalizzazione, archivio, wizard e classifiche |
| API autenticata | 33/33 controlli contro la build locale aggiornata e il backend Dev |
| Provider reali | Scryfall search/art/CMC, EDHREC e import Archidekt passati; fixture rimossa |
| Build web | build ottimizzata e 51 pagine; JavaScript 2,75/18 MiB |
| Export mobile | Android e iOS completati; Android 7,60/12 MiB |
| Esposizione advisory nel bundle | mappe complete Android 3.045 e iOS 3.000 moduli: nessuna sorgente braces/node-forge |
| Expo doctor | 21/21 passato, con DNS verificato per il solo processo |
| Gate iOS/iPad | passato, versione e profili coerenti |
| Animazioni browser | 6/6 test finali; 32 scenari browser distinti complessivi |
| Android nativo | APK Dev standalone 9.1.0/90100, ARM64+x86_64, firma locale verificata; sei controlli manuali startup/guest/40→41/undo/redo e tre flussi Auth reali passati |

Il test UIAutomator arena non riesce a ottenere lo stato idle per il timer della partita: quel tentativo resta fallito, le sei verifiche arena sono manuali con screenshot, non automazione dichiarata. Login password nativo, sessione dopo force-stop e logout sono stati eseguiti tramite UIAutomator/ADB con account sintetico poi rimosso e verificato.

Il resolver Windows non risolveva `exp.host`. Due resolver DNS HTTPS indipendenti hanno concordato l'indirizzo; il solo processo doctor ha usato tale risoluzione mantenendo HTTPS e tutti i controlli. Nessuna modifica DNS persistente o bypass del gate. A resolver standard resta il problema esterno da risolvere sulla workstation.

I primi E2E sul server Next dev hanno evidenziato anche navigazioni prima della hydration e attese di compilazione a freddo. La verifica conclusiva usa la build ottimizzata locale aggiornata, non il Dev remoto precedente: le 26 verifiche browser di manutenzione sono state eseguite fra suite pubblica e fixture autenticata. Fixture separate e account sintetici rimossi; finalizzazione produce esattamente due partite per due flussi, senza duplicati. La suite quality salta per impostazione il test PostgREST, eseguito separatamente con esito positivo.

## Debito residuo e decisioni

Audit web produzione **zero**. Audit completo web: **5 high, zero critical**, nella catena lint/braces. Mobile: **20 high, zero critical**, propagazione dei due advisory già noti braces e node-forge. Eccezione Expo non ampliata né rinnovata: scadenza invariata **19 ottobre 2026, 00:00 Europe/Rome**. Aggiornate soltanto versioni dei nodi già approvati e rimosso un nodo obsoleto. Assenza dal bundle riduce l'esposizione applicativa osservata, ma lascia il rischio degli strumenti di compilazione/firma. Fonti: advisory [braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), [node-forge](https://github.com/advisories/GHSA-86w9-cpqp-85rv).

Override Expo conservati con responsabilità al manutentore del tooling: Metro 0.84.5 coincide con il pacchetto wrapper Expo; rimuoverlo quando la matrice SDK aggiornata risolve da sola la stessa famiglia coerente. `decode-uri-component` 0.5.0 conserva la correzione del precedente advisory di parsing; `uuid` 11.1.1 conserva l'allineamento transitivo esistente. Rimozione subordinata a risoluzione upstream compatibile, confronto lockfile, doctor, quality ed export nativo; nessun override aggiunto per mascherare advisory.

ESLint 10.12 provato: fallimento reale `react/display-name`, `context.getFilename` rimosso e peer React/import/a11y limitati alla v9. Ripristinata e verificata 9.39.5. Questo resta debito reale: ESLint 9 è fuori supporto; aggiornare appena plugin/Next supportano la v10, senza disabilitare regole per ottenere verde. [Supporto ufficiale ESLint](https://eslint.org/version-support/).

TypeScript 7 rinviato: parser TypeScript ESLint corrente richiede TS <6.1. Sentry web 11 e Babel/native major rinviati a un ciclo di migrazione dedicato; non richiesti per correggere le vulnerabilità riscontrate. Vincoli e prove sono conservati in `artifacts/technology-maintenance/`.

## Supabase self-hosted e OAuth produzione

Inventario SSH di Dev e production eseguito in sola lettura. Confronto con il Compose ufficiale versionato `self-hosted/v0.8.2` indicato dalla documentazione; non è un elenco di aggiornamenti già autorizzati o collaudati.

| Servizio | VM osservata | Riferimento ufficiale |
| --- | --- | --- |
| PostgreSQL | 17.6.1.136 | 17.6.1.136 |
| Auth | 2.189.0 | 2.196.0 |
| PostgREST | 14.12 | 14.17 |
| Realtime | 2.102.3 | 2.134.10 |
| Storage | 1.60.4 | 1.74.0 |
| Edge runtime | 1.74.0 | 1.76.2 |
| Meta | 0.96.6 | 0.99.0 |
| Supavisor | 2.9.5 | 2.9.12 |
| Gateway | Kong 3.9.1 | Envoy 1.39.1 |
| Studio | 2026.07.07 | 2026.09.07 |
| imgproxy | 3.30.1 | 3.31.4 |

Il riferimento cambia anche gateway e configurazione delle chiavi: copiarlo sopra Dokploy non è un normale bump di immagini. Preparare snapshot e prova di restore, diff Compose/env e note di migrazione, candidato separato Dev; ripetere Auth/password/OAuth/refresh, RLS/RPC, Storage, Realtime e backup. Production solo dopo autorizzazione specifica e rollback verificato. PostgreSQL non richiede qui un salto major. Riferimenti: [guida Docker](https://supabase.com/docs/guides/self-hosting/docker), [Compose versionato](https://raw.githubusercontent.com/supabase/supabase/self-hosted/v0.8.2/docker/docker-compose.yml).

Google è abilitato in produzione e la allow-list contiene lo schema nativo storico. Production usa ancora i vecchi domini: quelli nuovi devono entrare nel cutover, compreso il callback autorizzato in Google e le URL Supabase. Questo inventario **non dimostra un login Google completo in produzione**. Al lancio servono prova reale web/Android, callback, persistenza e rinnovo sessione. Il limite OAuth Dev accettato dal PM resta distinto da tale requisito; nessuna credenziale personale utilizzata.

## Evidenze e integrazione

Log e report senza chiavi private in `artifacts/technology-maintenance/`; runtime locale verificato tramite SHA-256 ufficiale. Nessuna modifica al Node globale della workstation. Server ed emulatore temporanei chiusi dopo le verifiche. Scansione client web/APK/log: zero corrispondenze con token privati. Il candidato va integrato su Dev tramite PR e CI Linux; nessun merge o deploy di produzione eseguito durante questa manutenzione.
