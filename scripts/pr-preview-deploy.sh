#!/usr/bin/env bash
# Deploy one app as a per-PR preview Worker and emit its URL.
#
#   pr-preview-deploy.sh <app> <pr-number>
#
# Run from the app directory. Uses wrangler.pr.toml, which carries no routes, so
# a preview cannot claim a production hostname even if the name were wrong.
set -euo pipefail

app="${1:?app required}"
pr="${2:?pr number required}"
name="pr-${pr}-pumpos-${app}"

echo "Deploying $app preview for PR #$pr as $name"

# Tee so the output is still visible in the job log while we parse it.
output="$(npx wrangler deploy -c wrangler.pr.toml --name "$name" 2>&1 | tee /dev/stderr)"

# wrangler prints the workers.dev URL it published to; take the last one.
url="$(printf '%s\n' "$output" | grep -oE 'https://[a-z0-9.-]+\.workers\.dev' | tail -1 || true)"

if [ -z "$url" ]; then
  echo "::error title=PR preview::Deployed $name but could not determine its URL from wrangler output."
  exit 1
fi

echo "url=$url" >> "${GITHUB_OUTPUT:-/dev/null}"
echo "Preview for $app: $url"
