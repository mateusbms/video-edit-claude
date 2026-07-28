# Corte otimizado — hardware (VideoToolbox) + downscale 1080p

**Data:** 2026-07-27
**Motivo:** o passo de cortes é lento. Medido: re-encode do source (HEVC 4K 2160×3840) por
software (libx264, preset medium) roda a ~0,27× do tempo real — 36,98s para 10s de vídeo,
~7,5 min no clipe de 121s. O render final é **1080p**, então o 4K é desperdício.

**Decisão (aprovada):** "1080p + hardware, bitrate generoso". Medido ~8× mais rápido
(4,65s para 10s). Sem perda prática no vídeo final (o render já era 1080p).

## Mudança

Em `cut_segments` (usada por `stage_cut` E `stage_refine`):
1. **Decode em hardware:** `-hwaccel videotoolbox` antes de `-i` (em macOS com VT disponível).
2. **Downscale pra caber em 1920 no lado maior** (só reduz, nunca amplia), preservando aspecto
   e orientação: 2160×3840 → 1080×1920; 3840×2160 → 1920×1080; ≤1920 → sem escala.
3. **Encode em hardware:** `h264_videotoolbox -b:v 10M` (1080p, qualidade alta). Fallback fora do
   macOS / sem VT: `libx264 -preset veryfast -crf 20`.
4. Áudio: `-c:a aac` explícito.

A escala é calculada no chamador a partir das dimensões já no probe (`stage_cut` usa `probe.json`;
`stage_refine` usa `trimmed.probe.json` — que após o 1º corte já é 1080p, então não re-escala).

## Comportamento / trade-offs

- `source.mp4` (4K original) **nunca é tocado** — 4K sempre recuperável recortando de novo.
- `trimmed.mp4` passa a ser 1080p (~90MB vs ~380MB). Preview e render final ficam mais leves.
- Qualidade do vídeo final: **inalterada** (o render sempre foi 1080p).
- Redes: Instagram/TikTok/Reels têm teto de 1080p; publicar 4K seria descartado por elas de
  qualquer forma. YouTube 4K exigiria o *render* sair em 4K (mudança separada, fora de escopo).

## Helpers (testáveis)

- `build_scale_filter(width, height, max_long_edge=1920) -> str | None` (puro): retorna
  `"scale=W:H"` (W/H pares) ou `None` se o lado maior ≤ `max_long_edge` (não amplia).
- `_vt_available() -> bool` (cacheado): `sys.platform == "darwin"` e `h264_videotoolbox` em
  `ffmpeg -encoders`. Monkeypatchável nos testes.
- `_decode_args()` / `_video_encoder_args()`: montam os args conforme `_vt_available()`.

## Testes (TDD)

- `build_scale_filter`: 2160×3840→"scale=1080:1920"; 3840×2160→"scale=1920:1080";
  1920×1080→None; 1080×1920→None; 1280×720→None (sem upscale); dims sempre pares.
- `cut_segments` (monkeypatch `subprocess.Popen` + `_vt_available`): com VT=True o comando tem
  `-hwaccel videotoolbox` e `-c:v h264_videotoolbox`; com VT=False tem `-c:v libx264`; o `-vf`
  inclui a string de escala quando passada.
- Integração existente (`test_stage_cut_reports_progress`, `test_cut_after_ingest`): continuam
  verdes (sample 320×240 → sem escala; VT emite `-progress` normalmente).

## Fora de escopo

- Render final em 4K (é o render, não o corte).
- Corte sem re-encode (stream copy) — perde precisão de quadro; a precisão atual é desejada.
- Tornar bitrate/resolução configuráveis por UI (pode virar env depois).
