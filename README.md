# Video Edit Claude

Automated video editing and animated video generation with AI-powered transcription and synthesis.

## Animated mode

Animated mode generates short-form vertical or horizontal videos with spoken audio, using brand kits for visual styling. The system synthesizes speech via ElevenLabs, builds a Remotion composition with slides tied to audio, and renders to MP4.

**Required environment variables:**
- `ELEVENLABS_API_KEY` — API key for text-to-speech synthesis

**Optional environment variables:**
- `ELEVENLABS_VOICE_ID` — Voice ID for TTS (default: gJx1vCzNCD1EQHT212Ls)
- `ELEVENLABS_FALLBACK_VOICE_ID` — Fallback voice if primary is unavailable (default: FGY2WhTYpPnrIDTdsKH5)
- `TTS_MAX_CHARS_PER_JOB` — Character limit per job (default: 4000)

**Create a brand kit:**

```bash
curl -X POST http://localhost:8000/brand-kits \
  -F "name=My Brand" \
  -F "colors_bg=#ffffff" \
  -F "colors_card=#f5f5f5" \
  -F "colors_border=#e0e0e0" \
  -F "colors_foreground=#000000" \
  -F "colors_muted=#808080" \
  -F "colors_accent=#2563eb" \
  -F "colors_accentLight=#dbeafe" \
  -F "fonts_body=Inter" \
  -F "fonts_headline=Poppins" \
  -F "logo=@logo.png"
```

**Submit an animated job:**

```bash
curl -X POST http://localhost:8000/jobs/animated \
  -H "Content-Type: application/json" \
  -d '{
    "brandKitSlug": "my-brand",
    "orientation": "16x9",
    "scripts": [
      {"key": "intro", "text": "Welcome to our service."},
      {"key": "feature", "text": "Here is what makes us special."}
    ]
  }'
```

**Output:** The rendered MP4 is saved to `jobs/<job-id>/final.mp4`.
