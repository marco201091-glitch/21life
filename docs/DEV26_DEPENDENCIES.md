# Dev26 — dipendenze e baseline 9.3.0

Verifica del 12 novembre 2026 sul grafo dei lockfile, dopo clean install root/Expo.

## Ambiente

Node24.21.0 ufficiale scaricato in tools locale ignorato, SHA256 confrontato con SHASUMS ufficiale; nessuna sostituzione globale dell'ambiente PM. Prima baseline con npm11.19.0 incluso nella distribuzione (compatibile con engines); verifica finale con npm11.16.0 installato soltanto nel prefisso locale ignorato per rispettare anche packageManager. Next16.4.2, Expo57.0.32 e Vitest5.0.3 sono quelli dei lockfile. `verify:toolchain` controlla il runtime e i pacchetti critici installati prima di quality.

## Advisory distinti

| Advisory | Catene coinvolte | Esposizione | Decisione |
|---|---|---|---|
| GHSA-3g3m-2fjr-6pw4, glob | Sentry bundler web; Expo fingerprint | Traversal filesystem dopo cancellazione del segnale; elaborazione filesystem/build, non endpoint applicativo individuato | moderate; versioni13 installate non corrette secondo intervallo registry. Il rimedio proposto coinvolge upgrade major: non forzato nella tranche |
| GHSA-g3hv-75wg-m249, minimatch | glob/Sentry; fingerprint; TypeScript ESLint | Amplificazione pattern e consumo CPU/memoria; pattern di tooling, nessun percorso da richiesta utente al matcher individuato | moderate; fix>=11.0.1 oltre la major10 richiesta dai consumer. Nessun override major privo di prova compatibilità |

Audit completo: web11 nodi moderate/0high/0critical; Expo9 moderate/0high/0critical. Produzione: web5/Expo9 moderate. Nodi propagati non equivalgono ad advisory distinti. Nessuna eccezione rinnovata, soglia modificata o downgrade SDK. Non si certifica assenza di altre vulnerabilità: esiti limitati al database advisory interrogato.

Eseguito aggiornamento mirato dei pacchetti TypeScript ESLint entro i range già dichiarati, con entrambi i lockfile aggiornati. Nessuna major delle piattaforme. L'audit produzione successivo mantiene web5/Expo9 moderate: i nodi transitori rimasti sono documentati, non soppressi.

JSON originali in artifacts/dev26/audit-full-{web,expo}.json e artifacts/dependency-audit/local/. Le dipendenze segnalate restano follow-up documentati: aggiornare quando esiste un rimedio compatibile o pianificare separatamente una major con test. La scelta non autorizza input non fidati ai glob del tooling.

## Expo Doctor

Il controllo iniziale ha fallito per EAI_AGAIN di exp.host. Ripetizione completa21/21 PASS con un fallback DNS limitato al processo, attivato solo su EAI_AGAIN/ENOTFOUND per quel dominio e risolto via DNS pubblico. Hostname HTTPS/TLS invariato, nessun IP sintetico, nessuna modifica a hosts/DNS di Windows e nessun check escluso. Bootstrap temporaneo e log in artifacts/dev26; non incorporato nella policy CI.
