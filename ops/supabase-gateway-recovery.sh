#!/usr/bin/env bash
# Recover only Docker's failed automatic start caused by a missing Swarm network.
set -euo pipefail
for container in supabase-kong supabase-dev-kong; do
  for attempt in $(seq 1 12); do
    state=$(docker inspect --format '{{.State.Status}}|{{.State.Error}}' "$container")
    if [[ "$state" == running\|* ]]; then break; fi
    # Respect intentionally stopped containers and other failure modes.
    if [[ "$state" != exited\|*network*not\ found* ]]; then
      printf 'No network recovery needed for %s (%s)\n' "$container" "$state"
      break
    fi
    if docker start "$container"; then
      printf 'Recovered %s after Swarm network startup\n' "$container"
      break
    fi
    if [[ "$attempt" -eq 12 ]]; then
      printf 'Swarm network recovery failed for %s\n' "$container" >&2
      exit 1
    fi
    sleep 10
  done
done
