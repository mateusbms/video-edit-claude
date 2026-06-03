#!/usr/bin/env bash
set -euo pipefail

# Requires server running locally + a seeded brand kit named 'demo'
curl -s -X POST http://localhost:8000/jobs/animated \
  -H 'Content-Type: application/json' \
  -d '{
    "brandKitSlug":"demo",
    "scripts":[
      {"key":"s01","text":"Introducing Smoke."},
      {"key":"s02","text":"Step two."},
      {"key":"s03","text":"Step three."},
      {"key":"s04","text":"Step four."},
      {"key":"s05","text":"Step five."},
      {"key":"s06","text":"Step six."},
      {"key":"s06b","text":"Step six b."},
      {"key":"s07","text":"Step seven."},
      {"key":"s08","text":"Step eight."},
      {"key":"s09","text":"Step nine."},
      {"key":"s10","text":"Try at example.com"}
    ],
    "orientation":"16x9"
  }'
