# Evidenze audit tecnico e strategico — 11 novembre 2026

Report completo consegnato nella conversazione PM. Nessuna correzione applicativa o operazione remota eseguita.

## Perimetro

- Checkout HEAD `bac40b9c55b61bedd0b6f9902bf955c0069c1f35`, versione 9.2.0.
- Lettura architettura web/mobile, API auth/admin, persistenza offline, analytics SQL, backup, CI e documentazione operativa.
- Working tree iniziale: modifiche PM a MERGE_FAILURES, PROJECT_CHECKLIST e RELEASE_PREBUILD_CHECKLIST, preservate.
- Ref locali origin/main...origin/Dev: 2/4 commit esclusivi; diff contenuti limitato a sei file ops/site-click-counters, 97 inserimenti. Nessun fetch: non attestazione dello stato remoto corrente.

## Verifiche eseguite

- `npm test -- --reporter=dot`: exit 0, 102 file passati/1 skipped; 389 test passati/2 skipped.
- `npm --prefix expo test -- --reporter=dot`: exit 0, 82 file/352 test passati; verifica loghi passata.
- Entrambi usano Vitest installato 3.2.7, mentre entrambi i lockfile richiedono 5.0.3: risultati diagnostici, non certificazione lockfile.
- Node effettivo 24.18.0, engines >=24.21.0 <25.
- Next installato 16.3.5 contro lock 16.4.2; Expo installato 57.0.24 contro lock 57.0.32.
- `npm audit --omit=dev --json`: exit 1, web 5 moderate/0 high/0 critical.
- `npm --prefix expo audit --omit=dev --json`: exit 1, Expo 9 moderate/0 high/0 critical. Nodi coinvolti non equivalgono ad advisory distinti o vulnerabilità runtime dimostrate.
- `git ls-files` per env/keystore/chiavi: solo .env.example tra i pattern controllati; log storico per .env.local/pem/jks senza risultati. Controllo mirato, non secret scan esaustivo.

## Evidenze prioritarie

- Moduli UI: app/table/[id]/page.tsx 4446 righe; app/profile/page.tsx 3843; expo/app/table/[id]/play.tsx 2233; components/live-game/web-live-game.tsx 1795.
- next.config.js: CSP Report-Only, script unsafe-inline, connect-src https:/wss:, nessun report endpoint nella policy.
- expo/lib/auth-persistence.ts: sessioni persistenti e verifier PKCE in AsyncStorage; SecureStore per preferenza remember-me.
- lib/api-rate-limit.ts: risposta RPC non oggetto accettata anche per bucket failClosed; IP da header senza verifica locale della catena proxy in lib/turnstile-server.ts.
- ops/supabase-backup.sh: pg_dump no-owner/no-privileges e tar Storage senza xattrs; backup e drill manuale non equivalenti; docs/OFFSITE_BACKUP_SETUP.md esplicita limiti di perdita totale VM.
- RPC get_personal_analytics_facts/get_global_analytics_facts restituiscono fatti non aggregati; lettura client senza paginazione nel percorso expo/lib/personal-analytics-query.ts. Troncamento effettivo non verificato.
- lib/live-game-offline.ts: journal web localStorage per groupId, setItem senza catch locale; mobile dispone di copia shadow/outbox in expo/lib/live-game-offline.ts.
- expo/tests/components/edit-match-modal.test.ts: hook React e componenti nativi sostituiti; test utili ma non rappresentativi di layout/ciclo vita nativo.
- .github/workflows/android-device-e2e.yml: smoke nativo solo workflow_dispatch, distinto dai gate ordinari.

## Limiti

Nessun build, clean install, lint/typecheck completo, pentest, benchmark, ispezione VM/DB live, conferma CI remota o prova device. Nessuna attestazione RLS completa, SLA o conformità normativa. Analisi concorrenti da fonti ufficiali consultate online: getlifetap.com, playgroup.gg/faqs, playgroup.gg/support, guildpactapp.com, magic.wizards.com/en/products/companion-app.
