# Dual-Mode Editor — Design Spec

**Date:** 2026-06-03
**Status:** Approved for planning
**Scope:** v2 of `video-edit-claude` — add an animated/synthetic video mode alongside the existing recorded-video editor.

---

## 1. Problem

Today the editor handles exactly one workflow: trim and caption a recorded video (Upload → Cortes → Transcrição → Hook → Render). Product launch and social-media use cases also need synthetic videos built entirely from motion graphics — animated UI cards, captions, narration — with no real footage. The reference for that style is `docs/references/SENDKIT-PH-PROMPT.md` (Sendkit Product Hunt video, Remotion 4.x + ElevenLabs TTS, 10 scenes, ~46s).

We need both workflows to coexist in the same app without dragging either into compromises.

## 2. Goals

- Add a second authoring mode ("animated") that produces Sendkit-style motion-graphics videos.
- User picks the mode on the first screen; each mode has its own wizard.
- Brand identity (logo + palette) is reusable across animated videos via stored brand kits.
- Audio narration is generated automatically by calling ElevenLabs from the backend.
- Each animated render outputs one orientation (16:9 or 9:16) chosen by the user.
- Reuse the existing render runner, job model, and SSE protocol — no protocol changes.

## 3. Non-Goals (v2)

- Live frame-perfect preview before render.
- LLM-assisted script generation from a product description.
- Remixable scene library / arbitrary scene reorder.
- Automatic brand-kit extraction from a URL.
- Mixing recorded footage and animated scenes in the same timeline.
- Folloni-style (Higgsfield / 2D-illustrated generative) videos.
- Rendering both orientations in a single job.

## 4. User-Visible Flow

### 4.1 Mode selector (new screen, before existing wizard)
Two cards: **"Editar gravação"** and **"Gerar animado"**. Selecting one routes to the matching wizard.

### 4.2 Recorded wizard (unchanged)
Upload → Cortes → Transcrição → Hook → Render. Existing code path remains.

### 4.3 Animated wizard (new, 5 steps)
1. **Brand Kit** — dropdown of saved kits. "Novo kit" opens a modal CRUD (name, logo upload, color pickers for foreground/background/accent/muted/card/border, font selection from a fixed list). Default fallback values come from the Sendkit MD palette.
2. **Script** — 11 textareas, one per scene (10 main + Scene 6b email-preview narration). Each labelled with scene name. Footer shows live character count and an estimated ElevenLabs cost. Soft warning above 2,500 chars; hard block above `TTS_MAX_CHARS_PER_JOB` (default 4,000).
3. **Áudio** — single button "Gerar narração". Backend calls ElevenLabs for each scene, caches by SHA-256 of `(voice_id, settings, text)`, returns durations measured by ffprobe. UI shows per-scene status (queued / generating / done / failed) and an HTML5 audio player per finished file plus a "Regenerar esta cena" button.
4. **Revisão** — read-only summary: brand kit chosen, scene scripts, scene durations, total length. Radio selector for orientation (16:9 or 9:16). "Renderizar" button.
5. **Render** — existing SSE progress UI; on completion shows download link to the MP4.

## 5. Architecture

### 5.1 Discriminator
Every recipe JSON saved under `jobs/<id>/recipe.json` carries two top-level fields:
```json
{ "recipeVersion": 1, "kind": "recorded" | "animated", ... }
```
The render dispatcher reads `kind` and routes to the matching Remotion composition. There is no unified schema beyond these two fields and `fps`/`width`/`height`; the rest of each payload is mode-specific.

### 5.2 Frontend (`web/`)
- New `steps/ModeSelect.tsx`. App routes to `RecordedWizard` or `AnimatedWizard` based on store.
- `state.ts` extended:
  ```ts
  type Mode = "recorded" | "animated";
  type Store = {
    mode: Mode | null;
    recordedState: RecordedState;
    animatedState: AnimatedState;
  };
  ```
- `AnimatedWizard` is a new `Stepper` with five steps (`BrandStep`, `ScriptStep`, `AudioStep`, `ReviewStep`, `RenderStep`). Step components live under `web/src/steps/animated/`.
- Brand kit form validated with `zod`; same schema imported by both modal and store.

### 5.3 Backend (`api/`)
New routes:
- `GET /brand-kits` — list all kits (returns `[{ slug, name, ... }]`).
- `POST /brand-kits` — create kit (multipart for logo). Server derives `slug` from `name` (kebab-case, deduped); returns the created kit including its slug.
- `PUT /brand-kits/{slug}` — update kit (replaces fields; logo optional).
- `DELETE /brand-kits/{slug}` — delete kit. Returns 409 if any existing job references it.
- `POST /tts/generate` — body `{ jobId, scripts: [{ key, text }] }`. Returns `[{ key, file, seconds, frames }]`.
- `POST /jobs/animated` — body `{ brandKitSlug, scripts, orientation }`. Creates job, builds animated recipe, dispatches Remotion render via the existing render runner.

Existing `/render` endpoint reads `kind` from the recipe and selects the composition; no protocol change. Existing SSE channel reused as-is.

`models.py` adds pydantic `AnimatedRecipe`, `BrandKit`, `Scene`, `ScriptInput`, all sharing the `recipeVersion` field. Errors validated at the route boundary.

### 5.4 Pipeline (`pipeline/`)
- `pipeline/tts.py` — new. Client wraps the ElevenLabs HTTP API:
  - Reads `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_FALLBACK_VOICE_ID` from env.
  - Per script: compute hash of `(voice_id, settings, text)`. If `jobs/<id>/audio/<hash>.mp3` exists, reuse it. Otherwise call ElevenLabs.
  - Retry policy: 3 attempts on 429/5xx with exponential backoff (1s, 3s, 9s).
  - On failure of primary voice ID, fall back to the secondary voice ID once, then fail.
  - After each MP3 is on disk, call `ffprobe` to read `nb_frames` / `duration` (mirroring how `recipe.py` handles recorded video) and return both seconds and integer frames.
- `pipeline/animated_recipe.py` — new. Given brand kit + scripts + measured durations, compute the per-scene timing:
  - Per scene: `durationInFrames = ceil(audioDurationSeconds * fps) + 5` (the 5-frame padding rule from the MD §"Process to Recreate").
  - Scenes concatenate sequentially: scene N's `fromFrame` = scene N-1's `fromFrame + durationInFrames`. Scene 6b is inserted between scenes 6 and 7 (same order as the MD).
  - Output: list of `{ id, fromFrame, durationInFrames, sceneProps }` where `sceneProps` carries the brand-kit-merged theme and scene-specific copy.
  - Background-music timing: starts at frame 45 (1.5s @ 30fps), volume 0.15, plays to end.
- `pipeline/recipe.py` — unchanged; owns recorded mode only.

### 5.5 Remotion (`remotion/`)
`Root.tsx` registers four compositions:
- `Recorded16x9` (existing `Main16x9`)
- `Recorded9x16` (existing `Vertical9x16`)
- `Animated16x9` (new)
- `Animated9x16` (new)

New subtree `remotion/src/animated/`:
- `AnimatedRoot.tsx` — receives the animated recipe, wraps with `BrandThemeProvider`, renders scenes in a `<Series>`.
- `scenes/Scene01Intro.tsx` ... `Scene10CTA.tsx` plus `Scene06bEmailPreview.tsx`. Each scene receives its props (text, durations) and theme via context.
- `components/` — primitives shared across scenes: `BrowserWindow`, `SpringIn`, `FadeOut`, `MetricCard`, `ToolCard`, `Sparkline`.
- `theme/brand.ts` — function `brandKitToTheme(kit)` that produces the theme object; fallback to Sendkit-MD defaults for fields the kit does not specify.

### 5.6 Brand kit shape
File: `brand/kits/<slug>/kit.json`. Logo lives next to it as `logo.png`.
```json
{
  "version": 1,
  "name": "Aventos",
  "logo": "logo.png",
  "colors": {
    "bg": "#f5f5f0",
    "card": "#ffffff",
    "border": "#e2e2dc",
    "foreground": "#262622",
    "muted": "#757568",
    "accent": "#16a34a",
    "accentLight": "rgba(22,163,74,0.12)"
  },
  "fonts": {
    "body": "Inter",
    "headline": "Instrument Serif"
  }
}
```

## 6. Error handling and observability

- ElevenLabs failures after retries: SSE emits `error` event with a human-readable message naming the failing scene; UI surfaces a "Tentar novamente" button.
- Missing `ELEVENLABS_API_KEY` at API startup: server logs the misconfig and `/tts/generate` returns 503 with a clear message.
- All job stages append structured lines to `jobs/<id>/log.txt` (timestamp + stage + outcome).
- TTS cost guard: backend rejects requests whose total characters exceed `TTS_MAX_CHARS_PER_JOB`.

## 7. Environment

```
ELEVENLABS_API_KEY=...               # required, validated at API startup
ELEVENLABS_VOICE_ID=gJx1vCzNCD1EQHT212Ls
ELEVENLABS_FALLBACK_VOICE_ID=FGY2WhTYpPnrIDTdsKH5
TTS_MAX_CHARS_PER_JOB=4000
```

## 8. Testing strategy

- `pipeline/tts.py`: unit tests with mocked HTTP client cover retry/backoff, cache hit, cache miss, fallback voice, hard failure.
- `pipeline/animated_recipe.py`: unit tests assert generated timing for known input durations (golden test).
- `api/`: route smoke tests for `/brand-kits` CRUD, `/tts/generate`, `/jobs/animated`.
- `remotion/src/animated/__tests__/`: per-scene render of frame 0, middle, and last frame without throwing; snapshot of the `Series` JSON for `AnimatedRoot` given a fixture recipe.
- `web/src/__tests__/`: state machine of the animated wizard (advance gating, validation), brand-kit form zod validation, char-counter logic.
- All new tests follow the project's existing pytest + vitest conventions.

## 9. Risks and mitigations

| Risk | Mitigation |
|---|---|
| ElevenLabs rate limits or downtime block all animated renders. | Retry + fallback voice + cache by hash + clear SSE error so the user can retry just the affected scene. |
| Brand colors degrade contrast (e.g. accent on bg) and break readability. | Theme function validates minimum contrast; falls back to Sendkit default for failing fields and surfaces a warning in the Brand Kit form. |
| Scene timing drifts because ffprobe duration ≠ encoded length. | Use `nb_frames` when present (same pattern as `recipe.py`); add 5-frame padding per scene. |
| Recipe schema needs to change later. | `recipeVersion: 1` on every JSON from day one; migrator can read/upgrade old jobs. |
| ElevenLabs cost runaway on a misuse. | Soft warning above 2,500 chars + hard `TTS_MAX_CHARS_PER_JOB` block at backend. |
| Remotion composition registration drift breaks render. | Render dispatcher resolves composition by `kind` + orientation through a single map; covered by smoke test. |

## 10. Out of scope (reaffirmed)

- Live preview before render.
- LLM script generation.
- Remixable scene library.
- URL-based brand extraction.
- Mixed recorded + animated timelines.
- Higgsfield/Folloni-style generative pipelines.
- Both orientations in one render.

## 11. Open questions

None blocking implementation. Items to revisit in v3 are tracked under §10.
