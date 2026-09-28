# Backup off-site gratuito

Usa un account Google dedicato e un remote `rclone crypt`: il cloud riceve file e nomi cifrati. Rclone usa un client OAuth dedicato e lo scope `drive.file`, limitato agli elementi creati dal client.

## Configurazione una tantum sulla VM

1. Installa una versione stabile recente di rclone. Mantieni `/usr/local/bin/rclone` aggiornato e conserva `/root/.config/rclone/rclone.conf` con permessi `0600`.
2. In Google Cloud abilita Drive API, configura Google Auth Platform come app esterna in produzione, dichiara lo scope `https://www.googleapis.com/auth/drive.file` e crea un client OAuth di tipo Desktop. Su una macchina con browser e la stessa versione di rclone, esegui `rclone authorize drive <client_id> <client_secret>`; trasferisci il token alla VM senza incollarlo in chat o log. Configura il remote Drive `pa-drive` con quel client e scope `drive.file`.
3. `drive.file` consente al client di vedere gli elementi che crea. Usa quindi una cartella nuova: `pa-drive:PhyrexianArenaBackupsOAuth`. Il remote `crypt` `pa-backup-crypt` punta a questa cartella e mantiene la chiave crittografica già configurata. I backup storici nella cartella precedente `21LifeBackups` restano intatti, ma questo client non li elenca né li gestisce.
4. Verifica: `rclone lsd pa-backup-crypt:`.
5. Crea `/etc/phyrexian-backup-offsite.env`, permessi `0600 root`, con:

```sh
OFFSITE_RCLONE_DESTINATION=pa-backup-crypt:production
OFFSITE_RETENTION=7
```

6. Esegui `/opt/scripts/supabase-backup.sh` una volta e verifica entrambi i marker:

```sh
sudo /usr/local/sbin/supabase-backup.sh
sudo cat /var/backups/phyrexianarena/last-success
sudo cat /var/backups/phyrexianarena/offsite-last-success
```

7. Controlla dal Drive che i file non siano leggibili e programma un ripristino di prova trimestrale in un database isolato.

## Recupero dopo perdita della VM

Conserva una copia privata di `rclone.conf` fuori dalla VM: contiene il client
OAuth, il token e la chiave per decifrare i backup. La copia corrente è in
`pa-drive:PhyrexianArenaRecoveryOAuth/rclone-production.conf`, con checksum nel
file `.sha256` affiancato. Non condividere questa cartella: equivale a una
chiave di recupero dei backup. La vecchia copia `21LifeRecovery` appartiene
alla configurazione precedente.

Il job fallisce e invia un alert se la copia off-site configurata non riesce. Non impostare l'ambiente off-site finché il remote `crypt` non è stato verificato: senza configurazione il backup locale continua e registra un warning.
