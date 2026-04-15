#!/usr/bin/env bash
# Deploy HSK Passport to the production VPS.
#
# Invariant: the VPS working tree mirrors origin/master exactly. Any local
# drift on the VPS (modified tracked files, untracked files that should come
# from git) is discarded in favor of origin. The only state preserved across
# deploys is: the SQLite indexer DB, node_modules caches, and .env files.
#
# Usage:
#   ./scripts/deploy.sh                       # deploy current origin/master
#   ./scripts/deploy.sh --skip-frontend       # backend only (faster)
#   ./scripts/deploy.sh --skip-backend        # frontend only

set -euo pipefail

HOST="${DEPLOY_HOST:-root@75.119.153.252}"
REMOTE_DIR="${DEPLOY_DIR:-/opt/hsk-passport}"
FRONTEND_SERVICE="hsk-passport"
BACKEND_SERVICE="hsk-passport-api"
FRONTEND_URL="https://hskpassport.gudman.xyz"
API_GROUP_ID=25  # KYC_VERIFIED — non-empty on production

skip_frontend=0
skip_backend=0
for arg in "$@"; do
  case "$arg" in
    --skip-frontend) skip_frontend=1 ;;
    --skip-backend)  skip_backend=1 ;;
    *) echo "Unknown flag: $arg" >&2; exit 2 ;;
  esac
done

section() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }

section "Preflight: confirm local tree is clean and pushed"
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Error: working tree has uncommitted changes. Commit or stash first." >&2
  exit 1
fi
git fetch origin master --quiet
local_sha=$(git rev-parse HEAD)
remote_sha=$(git rev-parse origin/master)
if [[ "$local_sha" != "$remote_sha" ]]; then
  echo "Error: local HEAD ($local_sha) does not match origin/master ($remote_sha)." >&2
  echo "Push your branch first, or check out origin/master." >&2
  exit 1
fi
echo "Local HEAD matches origin/master: $local_sha"

section "Sync VPS working tree to origin/master"
ssh "$HOST" bash -s <<EOF
set -euo pipefail
cd "$REMOTE_DIR"
git fetch origin master
git reset --hard origin/master
# Remove untracked files that aren't gitignored (preserves .env, node_modules,
# build output, and the sqlite DB — all of which are in .gitignore).
git clean -fd
echo "VPS now at \$(git rev-parse HEAD)"
EOF

if [[ "$skip_backend" -eq 0 ]]; then
  section "Build and restart backend"
  ssh "$HOST" bash -s <<EOF
set -euo pipefail
cd "$REMOTE_DIR/backend"
npm ci --silent --omit=dev 2>&1 | tail -3 || npm install --silent --omit=dev 2>&1 | tail -3
npx tsc
systemctl restart $BACKEND_SERVICE
sleep 2
systemctl is-active $BACKEND_SERVICE
EOF
fi

if [[ "$skip_frontend" -eq 0 ]]; then
  section "Build and restart frontend"
  ssh "$HOST" bash -s <<EOF
set -euo pipefail
cd "$REMOTE_DIR/frontend"
npm ci --silent 2>&1 | tail -3 || npm install --silent 2>&1 | tail -3
npx next build --webpack 2>&1 | tail -5
systemctl restart $FRONTEND_SERVICE
sleep 3
systemctl is-active $FRONTEND_SERVICE
EOF
fi

section "Smoke test"
http_code=$(curl -s -o /dev/null -w '%{http_code}' "$FRONTEND_URL/")
echo "GET $FRONTEND_URL/ -> $http_code"
[[ "$http_code" == "200" ]] || { echo "Frontend not healthy"; exit 1; }

api_resp=$(curl -s "$FRONTEND_URL/api/stats/global")
echo "GET /api/stats/global -> $api_resp"
echo "$api_resp" | grep -q '"activeCredentials"' || { echo "API not healthy"; exit 1; }

group_resp=$(curl -s "$FRONTEND_URL/api/groups/$API_GROUP_ID/members")
group_count=$(echo "$group_resp" | grep -oE '"count":[0-9]+' | cut -d: -f2)
echo "GET /api/groups/$API_GROUP_ID/members -> count=$group_count"
[[ "$group_count" -ge 0 ]] || { echo "Group endpoint malformed"; exit 1; }

section "Deploy complete: $remote_sha"
