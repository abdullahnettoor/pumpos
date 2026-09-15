#!/usr/bin/env bash
# Post (or update) the single sticky comment listing this PR's preview URLs.
#
# Sticky rather than one comment per push: a PR with twenty pushes should not
# have twenty preview comments.
set -euo pipefail

marker="<!-- pumpos-pr-preview -->"
body="$marker"$'\n'"### Preview deploys"$'\n\n'

any=false
rows=""
[ -n "${CONSOLE_URL:-}" ] && rows+="| Console | <${CONSOLE_URL}> |"$'\n' && any=true
[ -n "${MOBILE_URL:-}" ] && rows+="| Mobile | <${MOBILE_URL}> |"$'\n' && any=true
[ -n "${MARKETING_URL:-}" ] && rows+="| Marketing | <${MARKETING_URL}> |"$'\n' && any=true

if [ "$any" = false ]; then
  body+="_No app in this PR needs a preview._"$'\n'
else
  body+="| Surface | URL |"$'\n'"| --- | --- |"$'\n'"$rows"
  body+=$'\n'"Built from this PR's head. Torn down when the PR closes."$'\n'
fi

existing="$(gh api "repos/${GITHUB_REPOSITORY}/issues/${PR}/comments" \
  --jq "[.[] | select(.body | startswith(\"$marker\"))] | .[0].id // empty")"

if [ -n "$existing" ]; then
  gh api -X PATCH "repos/${GITHUB_REPOSITORY}/issues/comments/${existing}" -f body="$body" >/dev/null
  echo "Updated preview comment $existing"
else
  gh api -X POST "repos/${GITHUB_REPOSITORY}/issues/${PR}/comments" -f body="$body" >/dev/null
  echo "Created preview comment"
fi
