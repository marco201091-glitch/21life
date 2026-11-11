#!/bin/bash
#
# 21Life - backup giornaliero del database Supabase di produzione.
#
# Cosa fa:
#   - dump del database in formato custom (ripristinabile con pg_restore)
#   - archivio dello Storage
#   - checksum SHA-256 e manifest dentro ogni backup
#   - conserva gli ultimi 7 backup completi
#   - copia il backup su un remote rclone cifrato, se configurato
#   - scrive marker distinti per backup locale e off-site
#   - invia un'email di alert se il backup fallisce
#
# Nessuna password e' contenuta in questo file: pg_dump e tar girano dentro i
# container e si autenticano localmente. L'unico segreto usato e' la chiave
# Resend per gli alert, letta da /etc/phyrexian-health-alert.env (0600 root).
#
set -euo pipefail

BACKUP_DIR=${BACKUP_DIR:-/var/backups/phyrexianarena}
RETENTION=${RETENTION:-7}
DB_CONTAINER=${DB_CONTAINER:-supabase-db}
STORAGE_CONTAINER=${STORAGE_CONTAINER:-supabase-storage}
HEALTH_ENV=${HEALTH_ENV:-/etc/phyrexian-health-alert.env}
OFFSITE_ENV=${OFFSITE_ENV:-/etc/phyrexian-backup-offsite.env}
MAIL_FROM=${MAIL_FROM:-21Life <noreply@21life.win>}

if [[ -r "$HEALTH_ENV" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$HEALTH_ENV"
  set +a
fi
if [[ -r "$OFFSITE_ENV" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$OFFSITE_ENV"
  set +a
fi

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
NAME="supabase-production-$STAMP"
WORK_DIR=""
OFFSITE_DESTINATION=${OFFSITE_RCLONE_DESTINATION:-}
OFFSITE_RETENTION=${OFFSITE_RETENTION:-$RETENTION}

alert() {
  local subject=$1 body=$2
  logger -t supabase-backup -p daemon.err "$body"
  if [[ -z "${RESEND_API_KEY:-}" || -z "${ALERT_EMAIL:-}" ]]; then
    logger -t supabase-backup -p daemon.warning "alert email non configurato: $HEALTH_ENV"
    return 0
  fi
  curl --silent --show-error --max-time 15 \
    --request POST https://api.resend.com/emails \
    --header "Authorization: Bearer $RESEND_API_KEY" \
    --header 'Content-Type: application/json' \
    --data "$(printf '{"from":"%s","to":"%s","subject":"%s","text":"%s"}' \
        "$MAIL_FROM" "$ALERT_EMAIL" "$subject" "$body")" \
    >/dev/null 2>&1 || true
}

last_success() {
  if [[ -r "$BACKUP_DIR/last-success" ]]; then
    date -u -d "@$(cat "$BACKUP_DIR/last-success")" '+%Y-%m-%d %H:%M UTC' 2>/dev/null || echo sconosciuto
  else
    echo mai
  fi
}

copy_offsite() {
  [[ -n "$OFFSITE_DESTINATION" ]] || {
    logger -t supabase-backup -p daemon.warning "backup off-site non configurato: $OFFSITE_ENV"
    return 0
  }
  command -v rclone >/dev/null || {
    echo 'rclone non installato' >&2
    return 1
  }
  [[ "$OFFSITE_DESTINATION" == *:* ]] || {
    echo 'OFFSITE_RCLONE_DESTINATION deve indicare un remote rclone' >&2
    return 1
  }
  (( OFFSITE_RETENTION >= 1 )) || {
    echo 'OFFSITE_RETENTION deve essere almeno 1' >&2
    return 1
  }

  rclone copy "$BACKUP_DIR/$NAME" "$OFFSITE_DESTINATION/$NAME" \
    --checksum --transfers 1 --checkers 4 --contimeout 15s --timeout 1m \
    --retries 2 --low-level-retries 2

  # Elimina solo directory con il nome prodotto da questo script.
  mapfile -t offsite_stale < <(
    rclone lsf --dirs-only "$OFFSITE_DESTINATION" \
      | sed -n 's#^\(supabase-production-[0-9TZ]*\)/$#\1#p' \
      | sort -r | tail -n "+$((OFFSITE_RETENTION + 1))"
  )
  for dir in "${offsite_stale[@]:-}"; do
    [[ "$dir" =~ ^supabase-production-[0-9]{8}T[0-9]{6}Z$ ]] || continue
    rclone purge "$OFFSITE_DESTINATION/$dir"
  done

  date -u +%s > "$BACKUP_DIR/offsite-last-success.tmp"
  chmod 0600 "$BACKUP_DIR/offsite-last-success.tmp"
  mv -- "$BACKUP_DIR/offsite-last-success.tmp" "$BACKUP_DIR/offsite-last-success"
}

finish() {
  local rc=$?
  # Rimuove solo la propria directory temporanea, e solo se e' davvero dentro
  # BACKUP_DIR: un percorso vuoto o inatteso non deve mai finire in un rm -rf.
  if [[ -n "$WORK_DIR" && "$WORK_DIR" == "$BACKUP_DIR"/.work.* ]]; then
    rm -rf -- "$WORK_DIR"
  fi
  if (( rc != 0 )); then
    alert "[ALERT] Backup Supabase fallito" \
      "Il backup $NAME e' fallito (exit $rc) su $(hostname). Ultimo backup riuscito: $(last_success)."
  fi
}
trap finish EXIT

install -d -m 0700 "$BACKUP_DIR"
chmod 0700 "$BACKUP_DIR"

WORK_DIR=$(mktemp -d "$BACKUP_DIR/.work.XXXXXX")

# 1. Dump del database.
#    Utente supabase_admin: e' il vero superuser del cluster. Con "postgres"
#    il dump non copre gli schemi di proprieta' di supabase_admin (vault e
#    altri), che restano fuori dal backup.
docker exec "$DB_CONTAINER" pg_dump -U supabase_admin -d postgres \
  --format=custom --no-owner --no-privileges > "$WORK_DIR/database.dump"

# 2. Archivio dello Storage.
docker exec "$STORAGE_CONTAINER" tar -C /var/lib/storage -czf - . > "$WORK_DIR/storage.tar.gz"

# 3. Integrita' e metadati.
(cd "$WORK_DIR" && sha256sum database.dump storage.tar.gz > SHA256SUMS)

db_bytes=$(stat -c %s "$WORK_DIR/database.dump")
printf '{"name":"%s","createdAt":"%s","databaseBytes":%s,"retention":%s}\n' \
  "$NAME" "$STAMP" "$db_bytes" "$RETENTION" > "$WORK_DIR/manifest.json"

chmod 0600 "$WORK_DIR"/*

# 4. Pubblicazione atomica: il backup diventa visibile solo se e' completo.
mv -- "$WORK_DIR" "$BACKUP_DIR/$NAME"
WORK_DIR=""

date -u +%s > "$BACKUP_DIR/last-success.tmp"
chmod 0600 "$BACKUP_DIR/last-success.tmp"
mv -- "$BACKUP_DIR/last-success.tmp" "$BACKUP_DIR/last-success"

# 5. Copia cifrata off-site. Un errore qui fa fallire il job e genera alert,
# pur mantenendo disponibile il backup locale appena pubblicato.
copy_offsite

# 6. Retention: conserva solo i backup completi piu' recenti.
mapfile -t stale < <(
  find "$BACKUP_DIR" -maxdepth 1 -type d -name 'supabase-production-*' -printf '%f\n' \
    | sort -r | tail -n "+$((RETENTION + 1))"
)
for dir in "${stale[@]:-}"; do
  [[ -n "$dir" ]] || continue
  rm -rf -- "$BACKUP_DIR/$dir"
done

kept=$(find "$BACKUP_DIR" -maxdepth 1 -type d -name 'supabase-production-*' | wc -l)
echo "[$(date -u '+%Y-%m-%d %H:%M UTC')] Backup completato: $NAME (db $(numfmt --to=iec "$db_bytes")) — conservati $kept/$RETENTION"
