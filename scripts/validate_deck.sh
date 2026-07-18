#!/usr/bin/env bash
# Deck gatekeeper. Validates Resources/deck_nb.json (falls back to the sample for schema demos).
# Checks: valid JSON, required fields, unique ids, unique prompts, truth <= 140 chars,
# difficulty in 1..3, forbidden trademark absent. Exits non-zero on any failure.
set -euo pipefail
DECK="${1:-Resources/deck_nb.json}"
[ -f "$DECK" ] || { echo "No $DECK yet — run /newcards to create it. (Validating sample instead.)"; DECK="Resources/deck_nb.sample.json"; }
command -v jq >/dev/null || { echo "jq required: brew install jq"; exit 1; }
jq empty "$DECK" || { echo "FAIL: invalid JSON"; exit 1; }

N=$(jq '.cards | length' "$DECK")
FAILS=0
check(){ local label="$1" expr="$2"; local bad; bad=$(jq -r "$expr" "$DECK");
  if [ -n "$bad" ]; then echo "FAIL: $label:"; echo "$bad" | sed 's/^/   /'; FAILS=$((FAILS+1)); else echo "OK:   $label"; fi; }

check "missing fields"      '.cards[] | select((.id and .category and .prompt and .truth and .difficulty) | not) | .id // "(no id)"'
check "duplicate ids"       '[.cards[].id] | group_by(.) | map(select(length>1)[0]) | .[]'
check "duplicate prompts"   '[.cards[].prompt | ascii_downcase] | group_by(.) | map(select(length>1)[0]) | .[]'
check "truth > 140 chars"   '.cards[] | select((.truth|length) > 140) | .id'
check "difficulty not 1-3"  '.cards[] | select(.difficulty < 1 or .difficulty > 3) | .id'
if grep -qi "kokkelimonk[e]" "$DECK"; then echo "FAIL: forbidden trademark found in deck"; FAILS=$((FAILS+1)); else echo "OK:   trademark check"; fi

echo "----"
echo "Cards: $N   |   Difficulty mix: $(jq -r '[.cards[].difficulty] | group_by(.) | map("\(.[0]): \(length)") | join("  ")' "$DECK")"
VERIFY=$(jq -r '.cards[] | select(.note == "VERIFY") | .id' "$DECK")
[ -n "$VERIFY" ] && { echo "VERIFY needed (check against ordbokene.no):"; echo "$VERIFY" | sed 's/^/   /'; }
[ "$FAILS" -eq 0 ] && echo "DECK VALID ✓" || { echo "DECK INVALID ✗ ($FAILS check(s) failed)"; exit 1; }
