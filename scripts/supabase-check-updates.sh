#!/usr/bin/env bash
# Read registry manifests without pulling images or restarting Supabase.
set -euo pipefail

COMPOSE_PROJECT=${COMPOSE_PROJECT:-supabaseproduction-supabase-cxfqcz}
ids=$(docker ps --filter "label=com.docker.compose.project=$COMPOSE_PROJECT" --format '{{.ID}}')
[[ -n "$ids" ]] || { echo "No running containers for $COMPOSE_PROJECT" >&2; exit 1; }
declare -A checked=()
changed=0
unknown=0
for container in $ids; do
  image=$(docker inspect --format '{{.Config.Image}}' "$container")
  image_id=$(docker inspect --format '{{.Image}}' "$container")
  identity="$image@$image_id"
  [[ -z "${checked[$identity]:-}" ]] || continue
  checked[$identity]=1
  local_digests=$(docker image inspect --format '{{json .RepoDigests}}' "$image_id")
  if ! manifest=$(timeout 30s docker buildx imagetools inspect "$image" 2>/dev/null); then
    echo "UNKNOWN $image: registry query failed"
    unknown=$((unknown + 1))
    continue
  fi
  remote_digest=$(awk '/^Digest:/ { print $2; exit }' <<< "$manifest")
  if [[ ! "$remote_digest" =~ ^sha256:[a-f0-9]{64}$ || "$local_digests" == '[]' || "$local_digests" == 'null' ]]; then
    echo "UNKNOWN $image: digest unavailable"
    unknown=$((unknown + 1))
  elif [[ "$local_digests" == *"@$remote_digest\""* ]]; then
    echo "CURRENT $image"
  else
    echo "REVIEW $image: registry digest differs from running image ($remote_digest)"
    changed=$((changed + 1))
  fi
done
printf 'Supabase check: %s images, %s require review, %s unknown; no changes applied.\n' "${#checked[@]}" "$changed" "$unknown"
(( unknown == 0 ))
