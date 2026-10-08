# Secret e variabili nella migrazione 21Life

Inventario read-only del 2026-10-08. Nessun valore segreto incluso.

## Aggiornamenti al completamento della migrazione

- Env locali web/Expo: URL sito/API/backend, email mittente/supporto, domini staging/produzione e configurazione build. Conservare vecchi endpoint per client installati.
- Dokploy Dev e successivamente produzione: env runtime, buildArgs e buildSecrets; registrare snapshot prima della modifica e verificare la configurazione pubblica del build risultante.
- GitHub: secret e variabili repository/environment, non soltanto nomi hardcoded nei workflow. Supabase anon keys non cambiano per la sola rinomina del dominio se il backend rimane lo stesso.
- VM: Auth site URL/redirect, SMTP, backup, monitor e notifiche. Dev usa email applicative Resend custom; SMTP Auth attuale è un servizio di test, non va scambiato per posta di produzione.
- Expo/EAS, Google OAuth, Sentry e F-Droid/GitLab: verificare configurazioni esterne prima di dichiarare eliminati tutti i riferimenti correnti.
- Nessuna rotazione di firma Android, service role, JWT o password DB per la sola rinomina del brand. Nessuna revoca del token Cloudflare precedente richiesto dal PM come backup.

## Evidenze e classificazione

| Area | Evidenza | Azione |
|---|---|---|
| GitHub repository | 12 secret: firma Android, backup GPG, Sentry, Supabase Dev/prod | Conservare i secret usati; verificare la passphrase backup anche nel percorso di recupero manuale |
| GitHub Preview/Production | Nessun secret o variabile environment | Nessuna pulizia richiesta |
| GitHub vars | STAGING_SUPABASE_URL e chiave pubblica GPG | URL da cambiare soltanto quando è pronto il nuovo endpoint; GPG conservata |
| Dokploy Dev email | RESEND_FROM_EMAIL e NEXT_PUBLIC_SUPPORT_EMAIL aggiornati a noreply/support@21life.win | Salvati e verificati; effettivi al prossimo deploy |
| Resend | 21life.win verified; vecchio dominio ancora verified | Nuovo dominio pronto per invio; preservare il precedente durante transizione |
| Local VERCEL_OIDC_TOKEN | Zero riferimenti nel codice tracciato; hosting attuale Dokploy | Candidato obsoleto locale, rimuovere dopo snapshot/fine migrazione |
| Local XAI_API_KEY, SOURCE_DB_URL, TEST_USER_* | Zero riferimenti nei sorgenti operativi tracciati | Verificare eventuali strumenti/manuali esterni, poi rimuovere solo configurazione inutilizzata; nessuna revoca automatica presso provider |
| Local SUPABASE_ACCESS_TOKEN | Non consumato dal codice; self-hosting via SSH | Candidato non necessario per operazioni correnti; verificare eventuale uso CLI manuale |
| GOOGLE_CLIENT_ID/SECRET, GITLAB_TOKEN, SELFHOSTED_PRODUCTION_* | Nessun match statico diretto o nomi composti dinamicamente | Non classificare come obsoleti: integrazioni/operazioni esterne e runner generico |
| Vecchio e nuovo token Cloudflare | Attivi con scope differenti; vecchio conservato dal PM | Usare il nuovo per migrazione; preservare backup precedente |

## Blocchi correnti

- Ricezione support@21life.win: entrambi i token restituiscono403 per Cloudflare Email Routing. PM carta bianca: destinazione scelta Marco201091@gmail.com. Occorrono i permessi Addresses/Rules; destinatario eventualmente da verificare tramite Cloudflare.
- PR174 draft: check Expo fallisce nell'audit produzione (22high,1critical), prima dei test; nessun merge tentato e nessun bypass. La causa non è accertata oltre il report dipendenze: servono advisory/artifact prima di scegliere aggiornamenti.
- Canonical/env produzione e backend nuovi non ancora commutati. Nessun deploy web o release mobile avviati.

La sola assenza di un riferimento testuale non prova che un secret sia eliminabile. La rimozione finale richiede prova del consumatore ritirato, snapshot dei valori recuperabili e verifica dei flussi che restano attivi.
