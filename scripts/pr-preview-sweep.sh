#!/usr/bin/env bash
# Delete PR preview Workers (pr-<n>-pumpos-<app>) whose pull request is no
# longer open.
#
#   pr-preview-sweep.sh            delete every orphaned preview Worker
#   pr-preview-sweep.sh <pr>       delete one PR's preview Workers (on close)
#
# Needs CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID and GH_TOKEN (for `gh`).
#
# Why a sweep and not only the close event: GitHub does not run
# `pull_request` workflows for a PR with merge conflicts, and a stacked PR
# auto-closed by its base branch being deleted gets no close event either.
# Abandoned PRs are exactly the ones that end up conflicted, so their
# previews used to run forever (#252, #296, #104).
set -euo pipefail

# Delete one Worker. One that is already gone counts as done: the close-event
# run and the sweep can race for the same Worker (Cloudflare code 10090).
delete_worker() {
  echo "Deleting $1"
  local out
  if out=$(npx --yes wrangler@4 delete --name "$1" --force 2>&1); then
    echo "$out" | tail -1
    return 0
  fi
  if grep -q "10090" <<<"$out"; then
    echo "  $1 was already deleted"
    return 0
  fi
  echo "$out"
  return 1
}

if [[ $# -ge 1 ]]; then
  pr="$1"
  for app in console mobile marketing; do
    name="pr-${pr}-pumpos-${app}"
    # Not every PR deploys every app; a missing Worker is fine.
    delete_worker "$name"
  done
  exit 0
fi

: "${CLOUDFLARE_API_TOKEN:?}" "${CLOUDFLARE_ACCOUNT_ID:?}"

workers=$(curl -fsS \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/scripts" |
  jq -r '.result[].id | select(test("^pr-[0-9]+-pumpos-[a-z]+$"))')

open_prs=" $(gh pr list --state open --limit 500 --json number --jq '.[].number' | tr '\n' ' ') "

failed=0
for name in $workers; do
  pr=$(sed -E 's/^pr-([0-9]+)-.*/\1/' <<<"$name")
  if [[ "$open_prs" == *" $pr "* ]]; then
    echo "Keeping $name (PR #$pr is open)"
    continue
  fi
  delete_worker "$name" || failed=1
done
exit "$failed"
