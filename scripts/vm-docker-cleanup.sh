#!/usr/bin/env bash
set -euo pipefail
trap 'logger -t phyrexian-docker-cleanup "failed at line $LINENO"' ERR

# Host-only maintenance. Never prune volumes: self-hosted Supabase data lives there.
exec 9>/run/lock/phyrexian-docker-cleanup.lock
flock -n 9 || exit 0

logger -t phyrexian-docker-cleanup 'start'

# Supavisor may leave Erlang JIT crash/profile dumps in /tmp. They are not
# database or application data and can otherwise accumulate in container layers.
while IFS= read -r container_id; do
  image=$(docker inspect --format '{{.Config.Image}}' "$container_id")
  case "$image" in
    supabase/supavisor:*)
      docker exec "$container_id" find /tmp -maxdepth 1 -type f -name 'jit-*.dump' -mtime +1 -print -delete
      ;;
  esac
done < <(docker ps --quiet)

# Gradle builds run on developer workstations, not on this VM. Remove cache
# entries that have been inactive for 30 days, but never interfere with a build
# if one is started manually for diagnostics.
if ! pgrep -f 'GradleDaemon|org\.gradle\.launcher|gradlew' >/dev/null; then
  while IFS= read -r -d '' gradle_cache; do
    find "$gradle_cache" -xdev -depth -mindepth 1 -mtime +30 -delete
  done < <(find /home /root -xdev -type d -path '*/.gradle/caches' -prune -print0 2>/dev/null)
fi

docker container prune -f --filter 'until=168h'
# Only dangling images: retain tagged images for rollback.
docker image prune -f --filter 'until=168h'
docker network prune -f --filter 'until=168h'
# Keep a short cache window for a same-day rollback/redeploy without retaining days of layers.
docker builder prune -af --filter 'until=12h'
journalctl --vacuum-time=7d
apt-get clean
logger -t phyrexian-docker-cleanup 'done'
