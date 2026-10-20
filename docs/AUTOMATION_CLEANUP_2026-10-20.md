# Pulizia domini e automazioni — 20 ottobre 2026

Autorizzazione PM: «sistema tutto, pulisci anche branch inattivi e file locali non più utilizzati», dopo audit read-only. Modifiche locali del PM preservate; nessun dato applicativo, chiave, tag o APK/IPA pubblicato eliminato.

## Operazioni remote applicate e verificate

- VM: monitor produzione aggiornato a `https://app.21life.win/api/health`, endpoint produzione e Dev HTTP200. Esecuzione del monitor riuscita, stato `healthy`. Script verificati con `bash -n` prima della sostituzione e confronto esatto dopo.
- Backup: mittente predefinito aggiornato a `noreply@21life.win`, dominio Resend verificato. Backup e cron conservati. Vecchio backup non referenziato del monitor rimosso, copia locale conservata.
- Sentry: display names `21Life Web`/`21Life Mobile`; slug/DSN/storico preservati. Workflow errori web/mobile abilitati per `production`, frequenza 60 minuti; email/monitor conservati. Workflow Seer PR inattivo disabilitato. Il filtro web esclude URL Dev/Test/localhost anche quando i vecchi SDK li marcano come production. Readback API conferma ambiente, filtri, azioni e stato.
- Dokploy: rimosso soltanto alias `dev.phyrexianarena.dpdns.org`; `dev.21life.win` conservato e ready HTTP200. Nessun dominio legacy produzione ritirato: serve ancora agli utenti installati.
- GitHub: chiuse PR #165/#172 (major native non compatibili con SDK57: gesture-handler ~2.32.0, view-shot5.1.0) e #200 (tipi Node26 con runtime24). Branch remoti eliminati con lease sullo SHA osservato; snapshot/ref/bundle di recupero conservati. Le altre dieci PR dipendenze restano utili, non eliminate per il solo fallimento CI.

## Modifiche versionate

Sentry web server/edge/client e mobile derivano l'ambiente dal dominio configurato, distinguendo Dev/Test dai build production. Helper condiviso sotto `expo/lib`, riesportato dal web. Canonical/fallback app e Test aggiornati ai domini21Life, con origini OAuth legacy esplicite preservate. Link User-Agent aggiornati.

Ulteriore riscontro: Dokploy main non aveva Sentry configurato, mentre Dev sì. Aggiunti DSN pubblico e flag enabled all'ambiente e ai buildArgs main, con readback esatto, senza inserire auth token o avviare deploy. Dockerfile aggiornato per trasferire i due valori pubblici al builder; `enabled=false` resta il default. L'attivazione nel bundle produzione richiede il prossimo build approvato.

Monitor consolidato in `ops/vm-health-alert.sh`; copia obsoleta `scripts/vm-health-alert.sh` rimossa e riferimento documentale aggiornato. Mittente backup aggiornato anche nei sorgenti. Il cron continua a usare `/opt/scripts/vm-health-alert.sh`, distribuito dal sorgente ops.

Dependency audit: push controlla solo il branch modificato, cron/manuale entrambi Dev/main; sicurezza invariata. Dependabot ignora tipi Node>=25 e major delle due librerie native vincolate all'SDK; init/analyze CodeQL raggruppati per aggiornamenti coerenti.

## Pulizia locale applicata

13 branch inattivi rimossi, 11 già integrati per ancestry e 2 con commit esclusivi archiviati prima della rimozione. I branch esclusivi erano `docs/21life-production-domains` e `fix/profile-favorite-mastery`; non dichiarati integrati. Local main aggiornato a origin/main senza toccare il checkout Dev modificato dal PM. Dev/main/fdroid-prep conservati.

Rimossi 190 file, 181143704 byte logici, da output superati `artifacts/audit-9.1.0-20261009`, `dev-9.1.0`, `rebranding`, `site-motion`, `website-seo-preview`, e scaffolding root `app.json` contenente soltanto `{"expo":{}}`. Nessun processo Node associato alle vecchie preview osservato. Conservati sorgenti sito/ultima bozza, APK, materiale review F-Droid, documenti storici e modifiche PM.

Recupero esterno al repo: `C:/Users/marco/Documents/21life-recovery-20261020/` con bundle branch locali/remoti, manifest SHA256 e ZIP dei file rimossi. Ogni file ZIP confrontato per dimensione e SHA256 prima della cancellazione. Target assoluti controllati entro repo, rifiutati reparse point/junction. Evidenze operative private in `artifacts/domain-audit-20261020/`.

## Blocco sicurezza da mantenere visibile

La policy Expo è scaduta il19ottobre; nessuna proroga o riduzione dei gate applicata. Report20ottobre: web0, Expo20pacchetti high riconducibili ai due advisory approvati in precedenza. Verificati registry npm e fonti ufficiali: latest braces3.0.3 e node-forge1.4.0, entrambi ancora vulnerabili; gli advisory [braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) e [node-forge](https://github.com/advisories/GHSA-86w9-cpqp-85rv) non indicano versioni corrette. Un downgrade automatico Expo44 suggerito da npm non è una soluzione compatibile.

L'integrazione/deploy del fix SDK e canonical resta subordinata ai controlli obbligatori: non aggirare le protezioni per questa pulizia. Le correzioni remote del monitor e dei filtri email Sentry sono già applicate indipendentemente dal deploy.

## Verifiche del candidato

Dipendenze installate dai lockfile senza modificarli; verifiche con Node24.21.0, Vitest5.0.3. Web349test passati+1skip, mobile314test passati, 41testscript passati. Lint/typecheck web e mobile superati; coverage aggregate e ratchet103file web/101mobile superati; security verification, manifest91migrazioni, knip dependencies e assetlogo superati. YAML Dependabot/workflow validi e `git diff --check` pulito. Test OAuth e Sentry verificati prima in fallimento e poi in successo. Review indipendente senza problemi importanti; riferimento documentale segnalato corretto.

Audit fresco del candidato conferma exit2, web0 ed Expo20high. Eccezione non rinnovata, audit e protezioni invariati. Nessun build/release/deploy lanciato; nessuna modifica delle versioni pubblicate. Merge e riallineamento remoto main/Dev restano pendenti fino al superamento dei gate di sicurezza.
