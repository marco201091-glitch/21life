# Valutazione manutenzione tecnologica — 2026-10-09

Richiesta PM: valutare aggiornamenti che evitino debito tecnico. Google OAuth Dev può restare non predisposto; requisito di rilascio è il funzionamento in produzione. Questa è una valutazione, non un aggiornamento eseguito.

Raccomandazione: mantenere l'architettura attuale e adottare aggiornamenti piccoli, coerenti e verificabili. Non emergono motivi per riscrivere l'app o cambiare framework/database. Priorità al disallineamento Expo, alle dipendenze vulnerabili e alla riproducibilità delle build; major di tooling in un ciclo successivo.

## Evidenze

Sorgente `../21life-rebranding`, Dev `bbfbaa6`, pulita. Consultati manifest, lockfile attraverso npm, override, Dockerfile, gate doctor, pipeline e Dependabot. `npm outdated --json --ignore-scripts` eseguito sui due progetti; `expo install --check` in CI mode, senza installazione, segnala otto scostamenti patch. Evidenza `artifacts/audit-9.1.0-20261009/technology.json`.

| Area | Attuale | Candidato da valutare | Priorità e verifica |
| --- | --- | --- | --- |
| Expo | SDK 57.0.24 | SDK 57.0.27, stessa major | Alta: allineare pacchetti alla matrice SDK, export e build nativa |
| Node | locale/CI 24.18.0; Docker famiglia 24 con digest | 24.21.0 LTS indicata dal sito ufficiale | Media: uniformare runtime e digest verificato, senza salto major |
| Next | 16.3.8 | 16.4.0 nel registry | Media: changelog, Next/env/eslint-config coerenti, build/E2E; non necessario soltanto per il numero versione |
| Supabase JS | 2.116.0 su web e mobile | 2.117.3 nel registry | Media: allineare entrambi, verificare Auth/refresh/storage/RLS/realtime |
| React Query | 5.103.2 | 5.104.1 | Media: verificare invalidazione/cache e riconnessione |
| Sentry | web 10.75.1, mobile 7.11.0 | web 10.76.2, mobile 7.13.0 entro le major attuali | Media: prima chiarire errore upload EAS e configurazione; verificare symbolication |
| Test/lint/compiler | Vitest 3.2.7, ESLint 9.39.5, TS 6.0.3 | Registry mostra major più recenti | Successiva: migrazioni separate, non insieme al cutover domini |

Le versioni candidate sono disponibilità osservate oggi, non compatibilità già attestata. `wanted` npm indica il range del manifest; non sostituisce la matrice Expo né le note di rilascio.

### Allineamento Expo consigliato

`expo install --check` richiede:

| Pacchetto | Installato | Atteso |
| --- | --- | --- |
| @expo/ui | 57.0.19 | ~57.0.22 |
| expo | 57.0.24 | ~57.0.27 |
| expo-asset | 57.0.18 | ~57.0.19 |
| expo-constants | 57.0.19 | ~57.0.21 |
| expo-linking | 57.0.10 | ~57.0.12 |
| expo-notifications | 57.0.20 | ~57.0.22 |
| expo-router | 57.0.22 | ~57.0.25 |
| expo-sharing | 57.0.21 | ~57.0.22 |

React 19.2.3 e RN 0.86.3 vanno mantenuti nella combinazione prevista dallo SDK finché la nuova matrice non ne richieda altri. Non forzare React 19.3 web anche sul mobile soltanto per avere numeri uguali. Verificare `babel-preset-expo`, override Metro/worklets/Reanimated e peer dependency nel medesimo lotto, senza presumere che l'ultimo npm sia il valore corretto. [Procedura ufficiale Expo](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/).

### Sicurezza: correggere la promessa del precedente audit

Le 21 high osservate sono la propagazione di due advisory, non 21 difetti indipendenti. Gli advisory di [node-forge](https://github.com/advisories/GHSA-86w9-cpqp-85rv) e [braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) riportano oggi **nessuna versione corretta**. Non si può garantire la loro eliminazione con un normale aggiornamento, né usare `npm audit fix --force` come soluzione automatica.

Lotto dedicato: aggiornare gli upstream compatibili dove utile, controllare se eliminano i percorsi vulnerabili, verificare l'effettiva esposizione del tooling nel processo di build e se il codice entra nel bundle mobile. Per ciò che resta, valutare una mitigazione sostenibile o una nuova eccezione motivata, circoscritta e con scadenza; evitare fork/patch locali senza test e proprietario della manutenzione. La policy attuale scade il **19 ottobre 2026, 00:00 Europe/Rome**. Nessun rinnovo effettuato. Non attestata durante questa valutazione l'assenza delle librerie nel bundle finale.

### Debito nella pipeline

- `scripts/expo-doctor-ci.mjs` accetta scostamenti patch come non bloccanti: utile in freeze, ma occorre dar loro proprietario/scadenza e riallineare regolarmente. La quality verde non implica `expo install --check` verde.
- Expo contiene override espliciti Metro, uuid e decode-uri-component: mantenerne motivo e condizione di rimozione. Non cancellarli in blocco; non lasciarli permanenti senza verifica.
- Web engines ammette Node 20, mentre mobile/CI sono su 24: stringere e uniformare il contratto dopo verifica degli ambienti reali. Node 20 risulta EOL, Node 24 LTS. [Ciclo ufficiale Node](https://nodejs.org/en/about/previous-releases).
- Docker ha un digest bloccato: buona riproducibilità, ma l'aggiornamento Node richiede aggiornare e verificare anche quel digest, non soltanto la workstation.
- `npx eas-cli` non è bloccato a una versione nei comandi npm: rendere riproducibile la versione usata da sviluppatori e CI. Lo stesso lotto deve chiarire SentryUpload e distinguere credenziali/firma preview da production.
- Prova nativa: prevedere APK x86_64 di test per l'emulatore e APK ARM64 di release dallo stesso SHA, oppure device ARM64. Non sostituire la prova APK con i soli test JS.
- Dependabot settimanale su Dev è già presente per npm, Actions e Docker: migliorare i gruppi mobile perché gli aggiornamenti Expo vengano valutati insieme alla matrice SDK. Non serve introdurre un secondo bot concorrente.
- Domini/env sono ripetuti fra gate, workflow e configurazioni: esplicitare una fonte e verifiche condivise per Dev/production, preservando callback/link storici. È più utile al cutover che una migrazione di framework.
- Web forza Webpack; non è da solo prova di debito. Valutare Turbopack soltanto con compatibilità Sentry/config e vantaggio misurato, dopo la release. [Convenzioni Next 16](https://nextjs.org/docs/app/guides/upgrading/version-16).

## Sequenza raccomandata

1. **Manutenzione del candidato 9.1.0 su Dev:** lotto Expo coerente, seguito da quality web/mobile, check Expo, audit, export e build delle ABI richieste. Non mescolare aggiornamenti major o modifica dell'infrastruttura. Se il rischio o il tempo compromettono il cutover, separare il lotto dalla release e conservare esplicitamente i follow-up.
2. **Sicurezza e pipeline:** trattare advisory/override/scadenza, pin EAS e configurazione Sentry, aggiornamento Node 24 coerente. Ogni lotto con diff autonomo, source SHA e rollback/revert chiaro.
3. **Manutenzione web condivisa:** Next 16.4 e patch/minor di Supabase JS, Query e UI dopo lettura changelog; ripetere i flussi realistici già costruiti nell'audit. Non modificare i contratti Auth per rendere verde un upgrade.
4. **Ciclo successivo:** valutare major Vitest/ESLint/TypeScript/Sentry e ottimizzazioni solo per benefici concreti. Conservare compatibilità Expo. Nessuna migrazione major Postgres o aggiornamento indiscriminato del Compose Supabase insieme ai domini.

Per Supabase self-hosted/Dokploy occorre una valutazione separata delle immagini effettive, note di upgrade, backup/restore e compatibilità fra servizi prima di proporre versioni server: l'ultima versione del client npm non indica quella del backend. Questa valutazione non ha interrogato né modificato l'infrastruttura production.

## Requisito OAuth aggiornato dal PM

Il callback custom Dev non autorizzato resta un fatto riprodotto ma **non blocca la release da solo**, dato che il PM accetta Dev non predisposto. Non consente di inferire che production funzioni: al lancio verificare callback Google sul nuovo backend, allow-list del sito e dello schema nativo standard, login completo web/Android, persistenza e rinnovo della sessione. Non cambiare client ID/secret o schemi production in questa valutazione.

## Esito della valutazione

Raccomandati piccoli lotti di manutenzione; nessuna riscrittura e nessun aggiornamento major prima della release senza un motivo verificato. Nessun package/lockfile/source app modificato, nessuna build o pubblicazione avviata. Il candidato resta pulito. L'implementazione richiederà scegliere il lotto e verificare il candidato aggiornato: le versioni qui indicate non sono già state collaudate nel progetto.
