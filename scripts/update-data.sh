#!/usr/bin/env bash
# Baixa times, elencos e lineups da API pública do CBLOW e grava data/cblow.json.
# A API não libera CORS, por isso o site usa este snapshot (atualizado pelo GitHub Action).
set -euo pipefail

API="https://api.cblow.xyz"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

get() { curl -fsS --retry 3 -m 30 "$API$1"; }

get /teams > "$TMP/teams.json"
get /matches > "$TMP/matches.json"
get /rules > "$TMP/rules.json"

mkdir -p "$TMP/t" "$TMP/m"
for slug in $(jq -r '.[].slug' "$TMP/teams.json"); do
  get "/teams/$slug" > "$TMP/t/$slug.json"
done
for id in $(jq -r '.[] | select(.status == "finalizada") | .id' "$TMP/matches.json"); do
  get "/matches/$id" > "$TMP/m/$id.json"
done

# Partidas não finalizadas entram sem detalhes (servem só para mostrar a próxima partida)
jq -n \
  --slurpfile teams <(jq -s '.' "$TMP"/t/*.json) \
  --slurpfile done <(jq -s '.' "$TMP"/m/*.json) \
  --slurpfile all "$TMP/matches.json" \
  --slurpfile rules "$TMP/rules.json" \
  '{
    updatedAt: (now | todate),
    rules: $rules[0].text,
    teams: $teams[0],
    matches: ($all[0] | map(. as $m | ($done[0] | map(select(.id == $m.id)) | .[0]) // $m))
  }' > "$ROOT/data/cblow.json.tmp"

# Só troca o arquivo se algo além do updatedAt mudou (evita commits vazios no Action)
if [[ -f "$ROOT/data/cblow.json" ]] && \
   diff -q <(jq -S 'del(.updatedAt)' "$ROOT/data/cblow.json") <(jq -S 'del(.updatedAt)' "$ROOT/data/cblow.json.tmp") > /dev/null; then
  rm "$ROOT/data/cblow.json.tmp"
  echo "sem mudanças"
  exit 0
fi
mv "$ROOT/data/cblow.json.tmp" "$ROOT/data/cblow.json"
echo "ok: $(jq '.teams | length' "$ROOT/data/cblow.json") times, $(jq '[.matches[] | select(.games)] | length' "$ROOT/data/cblow.json") partidas finalizadas"
