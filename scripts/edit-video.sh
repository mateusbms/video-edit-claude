#!/usr/bin/env bash
set -euo pipefail

# Uso:
#   scripts/edit-video.sh <stage> <slug> [src]
# stages: ingest | cut | transcribe | recipe | render
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Ferramentas locais (sem Homebrew): Node em .tools/, ffmpeg/ffprobe em bin/
NODE_BIN="$(find "$ROOT/.tools" -maxdepth 2 -type d -name bin -path '*node*' 2>/dev/null | head -1)"
export PATH="$ROOT/bin:${NODE_BIN:-}:$PATH"

STAGE="${1:?stage obrigatório}"
SLUG="${2:?slug obrigatório}"
SRC="${3:-}"
PY="$ROOT/.venv/bin/python"
JOB="$ROOT/jobs/$SLUG"

case "$STAGE" in
  ingest|cut|transcribe|recipe)
    if [ "$STAGE" = "ingest" ]; then
      "$PY" -m pipeline.cli ingest --slug "$SLUG" --src "$SRC"
    else
      "$PY" -m pipeline.cli "$STAGE" --slug "$SLUG"
    fi
    ;;
  render)
    # publicar artefatos para o Remotion
    cp "$ROOT/brand/brand.json" "$ROOT/remotion/src/brand.json"
    mkdir -p "$ROOT/remotion/public"
    cp "$JOB/trimmed.mp4" "$ROOT/remotion/public/trimmed.mp4"
    mkdir -p "$ROOT/output"
    cd "$ROOT/remotion"
    npx remotion render Main16x9 "$ROOT/output/$SLUG-16x9.mp4" --props="$JOB/edit-recipe.json"
    npx remotion render Vertical9x16 "$ROOT/output/$SLUG-9x16.mp4" --props="$JOB/edit-recipe.json"
    echo "render ok -> output/$SLUG-16x9.mp4 e output/$SLUG-9x16.mp4"
    ;;
  *)
    echo "stage inválido: $STAGE" >&2; exit 1;;
esac
