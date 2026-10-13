#!/usr/bin/env bash
#
# 21Life - health alert della VM.
#
# Controlla disco, container, endpoint pubblici e freschezza del backup
# Supabase. Notifica solo al cambio di stato, non a ogni esecuzione: lo stato
# precedente e' in $STATE_FILE, quindi un problema persistente manda un solo
# messaggio finche' non si risolve (e uno solo quando si risolve).
#
# Canali di notifica: webhook se PHYREXIAN_HEALTH_WEBHOOK_URL e' configurato,
# altrimenti email via Resend. Le credenziali stanno in /etc/phyrexian-health-alert.env
# (0600 root), non in questo file.
#
set -euo pipefail

exec 9>/run/lock/phyrexian-health-alert.lock
flock -n 9 || exit 0

DISK_THRESHOLD_PERCENT=${DISK_THRESHOLD_PERCENT:-80}
BACKUP_MARKER=${BACKUP_MARKER:-/var/backups/phyrexianarena/last-success}
OFFSITE_BACKUP_MARKER=${OFFSITE_BACKUP_MARKER:-/var/backups/phyrexianarena/offsite-last-success}
BACKUP_MAX_AGE_HOURS=${BACKUP_MAX_AGE_HOURS:-30}
STATE_FILE=/run/phyrexian-health-alert.state
HEALTH_ENV=/etc/phyrexian-health-alert.env
MAIL_FROM=${MAIL_FROM:-21Life <noreply@21life.win>}

if [[ -r "$HEALTH_ENV" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$HEALTH_ENV"
  set +a
fi

failures=()

if [[ ! -r "$OFFSITE_BACKUP_MARKER" ]]; then
  failures+=("backup off-site: marker assente")
else
  offsite_age_seconds=$(( $(date -u +%s) - $(cat "$OFFSITE_BACKUP_MARKER" 2>/dev/null || echo 0) ))
  if (( offsite_age_seconds > BACKUP_MAX_AGE_HOURS * 3600 )); then
    failures+=("backup off-site fermo da $(( offsite_age_seconds / 3600 ))h")
  fi
fi

disk_percent=$(df --output=pcent / | tail -n 1 | tr -dc '0-9')
if (( disk_percent >= DISK_THRESHOLD_PERCENT )); then
  failures+=("disk ${disk_percent}%")
fi

unhealthy_count=$(docker ps --filter health=unhealthy --quiet | wc -l)
if (( unhealthy_count > 0 )); then
  failures+=("${unhealthy_count} unhealthy containers")
fi

for container in supabase-db supabase-pooler supabase-dev-db supabase-dev-pooler; do
  running=$(docker inspect --format '{{.State.Running}}' "$container" 2>/dev/null || printf 'false')
  if [[ "$running" != 'true' ]]; then
    failures+=("${container} stopped")
  fi
done

# Freschezza del backup: copre sia il fallimento dello script sia il caso in cui
# il cron non parta piu' del tutto, che un alert auto-segnalato non vedrebbe.
if [[ ! -r "$BACKUP_MARKER" ]]; then
  failures+=("backup Supabase: marker assente")
else
  backup_age_seconds=$(( $(date -u +%s) - $(cat "$BACKUP_MARKER" 2>/dev/null || echo 0) ))
  if (( backup_age_seconds > BACKUP_MAX_AGE_HOURS * 3600 )); then
    failures+=("backup Supabase fermo da $(( backup_age_seconds / 3600 ))h")
  fi
fi

for endpoint in \
  https://app.phyrexianarena.dpdns.org/api/health \
  https://dev.21life.win/api/ready
do
  status=$(curl --silent --show-error --output /dev/null --max-time 8 --write-out '%{http_code}' "$endpoint" || true)
  status=${status:-000}
  if [[ "$status" != '200' ]]; then
    failures+=("${endpoint#https://} HTTP ${status}")
  fi
done

current_state=healthy
if (( ${#failures[@]} > 0 )); then
  current_state="$(IFS='; '; printf '%s' "${failures[*]}")"
fi
previous_state=$(cat "$STATE_FILE" 2>/dev/null || true)
printf '%s' "$current_state" > "$STATE_FILE"

# Nessun cambiamento: esci senza notificare. Ripeti solo se siamo in allarme.
if [[ "$current_state" == "$previous_state" ]]; then
  [[ "$current_state" == 'healthy' ]] && exit 0
  exit 1
fi

if [[ "$current_state" == 'healthy' ]]; then
  message='VM health recovered'
  logger -t phyrexian-health-alert -p daemon.notice "$message"
else
  message="VM health warning: ${current_state}"
  logger -t phyrexian-health-alert -p daemon.warning "$message"
fi

if [[ -n "${PHYREXIAN_HEALTH_WEBHOOK_URL:-}" ]]; then
  escaped_message=${message//\\/\\\\}
  escaped_message=${escaped_message//\"/\\\"}
  curl --silent --show-error --fail --max-time 8 \
    --header 'Content-Type: application/json' \
    --data "{\"content\":\"${escaped_message}\"}" \
    "$PHYREXIAN_HEALTH_WEBHOOK_URL" >/dev/null || true
fi

if [[ -n "${RESEND_API_KEY:-}" && -n "${ALERT_EMAIL:-}" ]]; then
  subject="[ALERT] VM 21Life"
  [[ "$current_state" == 'healthy' ]] && subject="[OK] VM 21Life ripristinata"
  curl --silent --show-error --max-time 15 \
    --request POST https://api.resend.com/emails \
    --header "Authorization: Bearer $RESEND_API_KEY" \
    --header 'Content-Type: application/json' \
    --data "$(printf '{"from":"%s","to":"%s","subject":"%s","text":"%s"}' \
        "$MAIL_FROM" "$ALERT_EMAIL" "$subject" "$message")" \
    >/dev/null 2>&1 || true
fi

[[ "$current_state" == 'healthy' ]]
