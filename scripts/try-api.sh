#!/usr/bin/env bash
# Walks through everything the server can do today, printing each request and
# its response. Run it with the stack up:
#
#   npm run docker:up
#   bash scripts/try-api.sh
#
# Pass an email to use a different account:
#   bash scripts/try-api.sh someone@example.com

set -u

API="${API_URL:-http://localhost:4000}/api/v1"
EMAIL="${1:-alice@poker.test}"
PASSWORD="${PASSWORD:-password123}"

# Labels go to stderr so `$(call ...)` captures only the JSON body.
blue()  { printf '\n\033[1;34m%s\033[0m\n' "$*" >&2; }
grey()  { printf '\033[0;90m%s\033[0m\n' "$*" >&2; }
green() { printf '\033[0;32m%s\033[0m\n' "$*" >&2; }
red()   { printf '\033[0;31m%s\033[0m\n' "$*" >&2; }

# Pretty-print JSON when python is available, otherwise print it raw.
pretty() {
  if command -v python >/dev/null 2>&1; then
    python -c 'import sys,json; print(json.dumps(json.load(sys.stdin), indent=2, ensure_ascii=False))' 2>/dev/null \
      || cat
  else
    cat
  fi
}

field() {
  python -c "import sys,json; d=json.load(sys.stdin); print(d$1)" 2>/dev/null
}

call() {
  local method="$1" path="$2" body="${3:-}" auth="${4:-}"
  local args=(-s -X "$method" "$API$path")
  [ -n "$body" ] && args+=(-H 'Content-Type: application/json' -d "$body")
  [ -n "$auth" ] && args+=(-H "Authorization: Bearer $auth")
  grey "$method $path${body:+  $body}"
  curl "${args[@]}"
}

blue "0. Is the server up?"
if ! curl -sf -m 3 "${API%/api/v1}/health" >/dev/null 2>&1; then
  red "Cannot reach ${API%/api/v1}. Start it with: npm run docker:up"
  exit 1
fi
curl -s "${API%/api/v1}/health/ready" | pretty

blue "1. Log in"
LOGIN=$(call POST /auth/login "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
echo "$LOGIN" | pretty

TOKEN=$(echo "$LOGIN" | field "['data']['tokens']['accessToken']")
REFRESH=$(echo "$LOGIN" | field "['data']['tokens']['refreshToken']")

if [ -z "$TOKEN" ]; then
  red "Login failed. Register first:"
  grey "curl -X POST $API/auth/register -H 'Content-Type: application/json' \\"
  grey "  -d '{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"displayName\":\"Your Name\"}'"
  exit 1
fi
green "Signed in."

blue "2. Who am I?"
call GET /auth/me "" "$TOKEN" | pretty

blue "3. Wallet"
call GET /wallet "" "$TOKEN" | pretty

blue "4. Deposit 2500 chips (simulated)"
call POST /wallet/deposit '{"amount":2500}' "$TOKEN" | pretty

blue "5. Withdraw 1000 chips"
call POST /wallet/withdraw '{"amount":1000}' "$TOKEN" | pretty

blue "6. Withdraw more than the balance — must be refused"
# Inside the validator's allowed range, so this exercises the balance guard
# rather than failing schema validation first.
call POST /wallet/withdraw '{"amount":900000}' "$TOKEN" | pretty

blue "7. Deposit below the minimum — must fail validation"
call POST /wallet/deposit '{"amount":5}' "$TOKEN" | pretty

blue "8. Transaction history"
call GET "/wallet/transactions?limit=5" "" "$TOKEN" | pretty

blue "9. Request without a token — must be refused"
call GET /wallet | pretty

blue "10. Rotate the refresh token"
ROTATED=$(call POST /auth/refresh "{\"refreshToken\":\"$REFRESH\"}")
echo "$ROTATED" | pretty

blue "11. Reuse the old refresh token — must be refused"
call POST /auth/refresh "{\"refreshToken\":\"$REFRESH\"}" | pretty

blue "12. Twenty concurrent withdrawals against a balance that cannot cover them"
grey "The balance guard lives inside a single atomic update, so exactly as many"
grey "should succeed as the balance allows, and it must never go negative."

BEFORE=$(call GET /wallet "" "$TOKEN" | field "['data']['chips']")
grey "balance before: $BEFORE"

TMP=$(mktemp -d)
for i in $(seq 1 20); do
  curl -s -X POST "$API/wallet/withdraw" \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    -d '{"amount":1000}' -o "$TMP/$i.json" &
done
wait

OK=$(grep -l '"ok":true' "$TMP"/*.json 2>/dev/null | wc -l | tr -d ' ')
NO=$(grep -l '"ok":false' "$TMP"/*.json 2>/dev/null | wc -l | tr -d ' ')
AFTER=$(call GET /wallet "" "$TOKEN" | field "['data']['chips']")
rm -rf "$TMP"

grey "succeeded: $OK    refused: $NO"
grey "balance after:  $AFTER"

EXPECTED=$((BEFORE - OK * 1000))
if [ "$AFTER" = "$EXPECTED" ] && [ "$AFTER" -ge 0 ]; then
  green "Correct: $BEFORE - ($OK x 1000) = $AFTER, never negative."
else
  red "WRONG: expected $EXPECTED, got $AFTER — chips were lost or created."
fi

blue "Done."
grey "Not built yet: tables, gameplay, chat, friends, leaderboard."
