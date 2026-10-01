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
Non usarne l'esito come attestazione di recupero completo. L'off-site disponibile
contiene produzione; per il target autorizzato serve una copia off-site staging
e una stack dedicata prima di scaricare o ripristinare dati.

Il dump `--no-owner --no-privileges` non conserva ownership/grant. Restano fuori
ruoli globali, segreti JWT/Auth, configurazione Compose/Dokploy, chiavi rclone e
credenziali email/push. Conservarli nel deposito privato di recupero e ripristinarli
con una procedura distinta. DB e Storage sono acquisiti in istanti diversi:
il drill deve verificare oggetti mancanti/orfani, autorizzazioni cross-user e
download con hash uguale, oltre a login e scritture sintetiche. Non dichiarare
RPO/RTO prima di una prova completa cronometrata su volumi nuovi con outbound
email/push disabilitato. Nessun drill completo è stato eseguito in questa passata.
