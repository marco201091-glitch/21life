# Backup off-site gratuito

Usa un account Google dedicato e un remote `rclone crypt`: il cloud riceve file e nomi cifrati. Google Drive offre fino a 15 GB gratuiti, condivisi con Gmail e Foto; verifica prima lo spazio effettivo dell'account.

## Configurazione una tantum sulla VM

1. Installa rclone con il pacchetto della distribuzione.
2. Esegui `rclone config` e crea un remote Drive, ad esempio `pa-drive`. Su una VM senza browser completa l'autorizzazione OAuth da un computer con browser usando `rclone authorize drive` e incolla il token nella VM.
3. Sempre in `rclone config`, crea un remote `crypt` chiamato `pa-backup-crypt`, con remote sottostante `pa-drive:PhyrexianArenaBackups`; scegli cifratura standard di file e directory e una password lunga unica.
4. Verifica: `rclone lsd pa-backup-crypt:`.
5. Crea `/etc/phyrexian-backup-offsite.env`, permessi `0600 root`, con:

```sh
OFFSITE_RCLONE_DESTINATION=pa-backup-crypt:production
OFFSITE_RETENTION=7
```

6. Installa la nuova `ops/supabase-backup.sh`, eseguila una volta e verifica entrambi i marker:

```sh
sudo /usr/local/sbin/supabase-backup.sh
sudo cat /var/backups/phyrexianarena/last-success
sudo cat /var/backups/phyrexianarena/offsite-last-success
```

7. Controlla dal Drive che i file non siano leggibili e programma un ripristino di prova trimestrale in un database isolato.

## Recupero dopo perdita della VM

Conserva una copia privata di `rclone.conf` fuori dalla VM: contiene sia la
configurazione del remote cifrato sia l'accesso necessario per leggerlo. Per
l'installazione di produzione è archiviata in Google Drive in
`21LifeRecovery/rclone-production.conf`, con il checksum affiancato. Non
condividere questa cartella: equivale a una chiave di recupero dei backup.

Il job fallisce e invia un alert se la copia off-site configurata non riesce. Non impostare l'ambiente off-site finché il remote `crypt` non è stato verificato: senza configurazione il backup locale continua e registra un warning.

## Preparazione del drill (IMP-12)

Il verificatore accetta sia il formato Dev storico (`.dump` e archivio Storage
con i rispettivi `.sha256`) sia una directory off-site con `database.dump`,
`storage.tar.gz`, `SHA256SUMS` e `manifest.json`. Da root, usare
`node scripts/verify-dev-supabase-backup.mjs <directory-copia-staging>`.
Valida entrambi i digest, formato PGDMP e leggibilità del tar; rifiuta nomi
esterni alla directory, file mancanti e checksum duplicati. I test usano solo
fixture sintetiche. Nessun backup automatico è stato cambiato in questo lavoro.

Il runner `restore-drill-dev-supabase.mjs` ora legge entrambi i formati, ma
rimane una prova **solo PostgreSQL**: non ripristina Storage, Auth o grant.
Non usarne l'esito come attestazione di recupero completo. Il nuovo runner
`run-staging-recovery-drill.mjs` crea invece una copia staging nuova in un
sottopercorso off-site univoco; non legge i backup produzione preesistenti.

Il dump `--no-owner --no-privileges` non conserva ownership/grant. Restano fuori
ruoli globali, segreti JWT/Auth, configurazione Compose/Dokploy, chiavi rclone e
credenziali email/push. Conservarli nel deposito privato di recupero e ripristinarli
con una procedura distinta. DB e Storage sono acquisiti in istanti diversi:
il drill deve verificare oggetti mancanti/orfani, autorizzazioni cross-user e
download con hash uguale, oltre a login e scritture sintetiche. Non dichiarare
RPO/RTO prima di una prova completa cronometrata su volumi nuovi con outbound
email/push disabilitato. Gli esiti effettivi del drill sono registrati nella checklist del progetto.


## Drill manuale staging con Auth, REST e Storage

Dalla root del checkout con `.env.local` staging, eseguire:

```powershell
node scripts/run-staging-recovery-drill.mjs
```

Se il checkout isolato non contiene il file locale, impostare `E2E_ENV_ROOT`
al percorso del checkout principale. Il runner rifiuta target diversi dal
hostname staging e da Compose `supabase-dev`; usa solo SSH Dev e richiede
`sudo -n python3`, Docker, rclone crypt e almeno 2 GiB liberi sulla VM.

Crea due account/mazzi e un oggetto Storage temporanei. Acquisisce il dump con
snapshot DB esportato e confronta tutte le tabelle public/auth/storage prima
dei nuovi login. Il pacchetto manuale contiene database, Storage, ruoli globali
senza password e ownership/grant, tutti verificati con SHA-256 dopo upload e
download dal remote cifrato. DB e Storage non sono uno snapshot atomico comune.
I servizi recuperati usano volumi nuovi, una rete Docker interna senza porte
pubblicate né Traefik, SMTP disabilitato e nessun servizio push. La prova verifica
login, letture/scritture REST autorizzate, diniego cross-user e download Storage
con hash uguale, oltre al diniego dell'oggetto privato all'altro utente.

Il report pubblico senza credenziali è scritto in `artifacts/recovery/`.
Cleanup: stack e volumi del solo progetto del drill, solo sottopercorso cloud
univoco, account e bucket sintetici. In caso di successo cancella anche dump e
config sensibili locali, lasciando il report. In caso di errore conserva prove
private con permessi 0700 sotto `/var/tmp/21life-imp12-drill-<id>`.

La configurazione dei servizi e le password dei ruoli LOGIN vengono dal
Compose staging conservato sulla VM. Questo drill non simula la perdita totale
della VM o del deposito privato dei segreti; il dump dei ruoli esclude le password.
Le durate misurano questa esercitazione, non uno SLA di disaster recovery.
Non modifica cron, retention, configurazione o script del backup automatico.


Esito del 2026-10-01: drill `222cd7b63bd2` passato, 57 tabelle confrontate,
due login recuperati, REST e dinieghi cross-user verificati, Storage HTTP 200
con hash identico e diniego dell'oggetto privato. Restore 22,93 s, totale 38,51 s.
Report locale: `artifacts/recovery/imp12-222cd7b63bd2.json`.

Durante il drill, Storage 1.60.4 ha restituito HTTP 500 / ENODATA con un tar
privo degli attributi estesi. Il runner manuale usa GNU tar `--xattrs
--xattrs-include=*` sia in acquisizione sia in estrazione. L'attuale script
automatico `ops/supabase-backup.sh` usa tar semplice e non include ruoli/grant:
non è stato modificato, come richiesto dal PM. La sua copia non è quindi
attestata dal successo di questo pacchetto manuale; correggerla è un follow-up
separato esplicitamente escluso dal lavoro corrente.
