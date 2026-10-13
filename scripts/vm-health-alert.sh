#!/usr/bin/env bash
set -euo pipefail

exec 9>/run/lock/phyrexian-health-alert.lock
flock -n 9 || exit 0

DISK_THRESHOLD_PERCENT=${DISK_THRESHOLD_PERCENT:-80}
INODE_THRESHOLD_PERCENT=${INODE_THRESHOLD_PERCENT:-80}
BACKUP_MAX_AGE_HOURS=${BACKUP_MAX_AGE_HOURS:-30}
BACKUP_STATE_FILE=${BACKUP_STATE_FILE:-/var/backups/phyrexianarena/last-success}
STATE_FILE=/run/phyrexian-health-alert.state
WEBHOOK_ENV=/etc/phyrexian-health-alert.env
failures=()

disk_percent=$(df --output=pcent / | tail -n 1 | tr -dc '0-9')
if (( disk_percent >= DISK_THRESHOLD_PERCENT )); then
  failures+=("disk ${disk_percent}%")
fi

inode_percent=$(df --output=ipcent / | tail -n 1 | tr -dc '0-9')
if (( inode_percent >= INODE_THRESHOLD_PERCENT )); then
  failures+=("inodes ${inode_percent}%")
fi

if [[ -r "$BACKUP_STATE_FILE" ]]; then
  backup_epoch=$(cat "$BACKUP_STATE_FILE" 2>/dev/null || printf '0')
  backup_age_hours=$(( ($(date -u +%s) - backup_epoch) / 3600 ))
  if (( backup_age_hours > BACKUP_MAX_AGE_HOURS )); then
    failures+=("production backup ${backup_age_hours}h old")
  fi
else
  failures+=("production backup status missing")
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

for endpoint in \
  https://app.phyrexianarena.dpdns.org/api/ready \
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

if [[ -r "$WEBHOOK_ENV" ]]; then
  # shellcheck disable=SC1090
  source "$WEBHOOK_ENV"
fi
if [[ -n "${PHYREXIAN_HEALTH_WEBHOOK_URL:-}" ]]; then
  escaped_message=${message//\\/\\\\}
  escaped_message=${escaped_message//\"/\\\"}
  curl --silent --show-error --fail --max-time 8 \
    --header 'Content-Type: application/json' \
    --data "{\"content\":\"${escaped_message}\"}" \
    "$PHYREXIAN_HEALTH_WEBHOOK_URL" >/dev/null || true
fi

[[ "$current_state" == 'healthy' ]]
