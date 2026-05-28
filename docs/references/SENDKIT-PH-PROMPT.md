# Sendkit Product Hunt Video — Replication Prompt

> Referência do modo "vídeo do zero" (sintético / motion-graphics), planejado para a v2.
> Use este prompt com Claude para recriar o vídeo de introdução de produto do Sendkit usando Remotion.

---

## Tech Stack

- **Remotion 4.x** (React + TypeScript)
- **Fonts**: `@remotion/google-fonts` → **Inter** (weights: 400, 500, 600, 700) and **Instrument Serif** (weight: 400)
- **TTS**: ElevenLabs API
- **Background music**: Royalty-free from Pixabay

## Video Settings

| Property | Value |
|----------|-------|
| Resolution | 1920×1080 (16:9 landscape) |
| FPS | 30 |
| Total duration | 1389 frames (~46.3 seconds) |

---

## Voice Narration (ElevenLabs)

| Setting | Value |
|---------|-------|
| Voice ID | `gJx1vCzNCD1EQHT212Ls` |
| Fallback voice (free) | Laura — `FGY2WhTYpPnrIDTdsKH5` |
| Model | `eleven_multilingual_v2` |
| Stability | 0.3 |
| Similarity boost | 0.8 |
| Style | 0.8 |
| Speaker boost | true |

Generate one MP3 per scene with these settings. Name them `v4-s01.mp3` through `v4-s10.mp3` (plus `v4-s06b.mp3`).

## Background Music

- **File**: `background2.mp3` (royalty-free from Pixabay)
- **Volume**: 0.15 (very low, under the narration)
- **Starts at**: frame 45 (1.5 seconds into the video)
- Plays for the entire remaining duration

---

## Narration Script (per scene)

| Scene | Audio file | Narration text |
|-------|-----------|----------------|
| 1 — Intro | v4-s01.mp3 | "Introducing Sendkit. AI-native email infrastructure." |
| 2 — Signups | v4-s02.mp3 | "You just launched your SaaS. Users are signing up." |
| 3 — Pain | v4-s03.mp3 | "But nothing happens. No welcome email. No first steps. They signed up and forgot you exist." |
| 4 — Agitation | v4-s04.mp3 | "Setting up email infrastructure takes days. Multiple tools. Endless configuration." |
| 5 — Relief | v4-s05.mp3 | "Or... you just tell Sendkit what you need." |
| 6 — Templates | v4-s06.mp3 | "Seven emails. Created in seconds." |
| 6b — Email preview | v4-s06b.mp3 | (Narration describing the welcome email being shown — e.g. "Pixel-perfect. Personalized. Ready to send.") |
| 7 — Automation | v4-s07.mp3 | "Your automation goes live. Every signup gets the right email, at the right time." |
| 8 — Metrics | v4-s08.mp3 | "They engage. They convert. They pay." |
| 9 — Mic drop | v4-s09.mp3 | "From zero to a complete email stack. Under five minutes." |
| 10 — CTA | v4-s10.mp3 | "Try free at sendkit.dev" |

---

## Scene-by-Scene Breakdown

### Scene 1: Intro
- **Frames**: 0–138 (138 frames)
- **Content**: Sendkit logo (100×100, rounded 22px) springs in from scale 0 → 1. Title "Introducing Sendkit" in Instrument Serif 76px. Subtitle "AI-native email infrastructure" in Inter 28px, muted color.
- **Animation**: Logo springs at frame 2, title at frame 8 (slides up 30px), subtitle at frame 18 (slides up 15px). Fade out starts at frame 126 (opacity → 0, scale → 0.96 over 12 frames).

### Scene 2: Signups Pouring In
- **Frames**: 138–233 (95 frames)
- **Content**: BrowserWindow component (700px wide, URL: "yourapp.com/dashboard"). Dashboard header with green badge "X new signups today" counting up to 12. Five signup notification rows stagger in from the right.
- **Signups**: Sarah K (sarah@acme.co, green), James M (james@startup.io, blue), Alex R (alex@company.com, purple), Maria D (maria@design.co, orange), Tom A (tom@agency.dev, green)
- **Animation**: Browser springs at frame 3 (scale 0.9→1). Each row enters every 10 frames starting at frame 8, sliding in 120px from right. Fade out at frame 83.

### Scene 3: Pain — No Emails Sent
- **Frames**: 233–427 (194 frames)
- **Two phases**:
  - **Phase 1 (frames 0–95)**: Same BrowserWindow (900px wide) but with "Users leaving" red badge. The same 5 signup rows progressively fade out and slide right (grayscale filter increases). Desaturation builds over time.
  - **Phase 2 (from frame 95)**: Giant red "0" (160px, Inter bold 700) springs in with "emails sent" (24px, muted) below it. Then italic Instrument Serif 38px text in muted color: "They signed up... and forgot you exist." (appears at frame 125 with slide up 15px).
- **Fade out**: frame 182.

### Scene 4: Agitation — Complexity
- **Frames**: 427–579 (152 frames)
- **Content**: Header text "Days of setup" (28px, weight 600) + "Multiple tools. Endless configuration." (22px, muted). Six floating tool cards (200px wide, padding 16px 20px, rounded 12px, white bg, shadow `0 4px 20px rgba(0,0,0,0.06)`) scattered with rotation. Each card has a colored dot (8px) at top + label (15px, weight 600) + unique content. All connected by messy dashed SVG lines (strokeWidth 1.5, dasharray 8, 60% opacity):
  - Email API (blue, x:-320 y:-180 rot:-6) — shows `POST /v1/send` in mono font
  - Template Builder (purple, x:80 y:-200 rot:4) — shows skeleton wireframe blocks
  - Automation Tool (orange, x:-200 y:-20 rot:-3) — shows SVG circle→line→circle flow
  - Analytics Dashboard (green, x:180 y:-40 rot:5) — shows mini bar chart
  - SMTP Config (red, x:-280 y:140 rot:-8) — shows Host/Port form fields
  - DNS Setup (purple, x:120 y:160 rot:7) — shows TXT/CNAME/MX tags
- **Animation**: Cards stagger in every 12 frames (scale 0.3→1). Connection lines fade in between frames 50–100. Fade out at frame 140.

### Scene 5: Relief — Just Tell Sendkit
- **Frames**: 579–696 (117 frames)
- **Content**: Large card (760px wide) with Sendkit logo + name + green "MCP" badge. Typewriter effect types: "Create a 7-day onboarding email sequence for my SaaS" (frames 10–50). After frame 52, three animated thinking dots appear (cycling green/gray).
- **Fade out**: frame 105.

### Scene 6: Templates Created
- **Frames**: 696–822 (126 frames)
- **Content**: Seven template cards in a vertical list (600px wide), each with green checkmark:
  1. Day 1 — Welcome aboard
  2. Day 2 — Getting started
  3. Day 3 — Tips for your first week
  4. Day 4 — What others are building
  5. Day 5 — A feature you'll love
  6. Day 6 — Your journey so far
  7. Day 7 — We'd love feedback
- **Animation**: Cards alternate sliding in from left (-200px) and right (+200px) every 8 frames. Green badge "7 templates · 1 prompt" appears at frame 70. Fade out at frame 114.

### Scene 6b: Email Preview
- **Frames**: 822–946 (124 frames)
- **Content**: A pixel-perfect welcome email card (620px wide, padding 40px 24px). Contains:
  - Sendkit logo (28px height, rounded 4px)
  - Heading (28px, bold): "Welcome to Sendkit! 🎉"
  - Body paragraph 1 (16px, #333): "Hey, I'm Paulo — I built Sendkit. Thanks for signing up!"
  - Body paragraph 2 (16px, #333): "Quick context on what you just got: Sendkit handles your transactional emails, campaigns, and automations in one place. Your free plan comes with **3,000** emails/month. No credit card needed."
  - Intro to steps (16px): "To start sending, you just need three things:"
  - Three numbered setup steps in cream (#f5f5f0) rounded cards:
    1. **"Add your sending domain"** — "You'll set up DKIM, SPF, and DMARC. Takes about 5 minutes."
    2. **"Create an API key"** — "Go to Settings → API Keys. You'll need this for the SDK or SMTP."
    3. **"Send your first email"** — "Use the REST API, SMTP, or pick one of our 10 SDKs."
  - Black pill CTA button (#1a1a19 bg, white text, rounded 50px, 15px font): "Set up my domain →"
  - Signature (16px, #333): "Talk soon," / **"Paulo Castellano"** (bold) / "Founder, Sendkit" (14px, #888)
- **Animation**: Staggered content reveal — each section fades in and slides up 15px, spaced 8 frames apart (logo at frame 10, heading at 18, body at 26, steps intro at 34, each step at 38/44/50, CTA at 50, signature at 58). Fade out at frame 112.

### Scene 7: Automation Flow
- **Frames**: 946–1107 (161 frames)
- **Content**: Vertical automation flow with five cards (300px wide, padding 14px 20px, rounded 12px, white bg, shadow `0 4px 16px rgba(0,0,0,0.05)`). Each card has a colored dot (8px), bold title (16px, weight 700), and two skeleton bars (80% width 7px height, then 55% width 7px height, cream bg). Connected by animated dashed lines:
  1. New signup (blue dot)
  2. Welcome email (green dot)
  3. Wait 2 days (orange dot)
  4. Getting started (green dot)
  5. Opened? (purple dot)
- After the last card, SVG branches split into two dashed paths: green "Yes → nurture" (left) and red "No → re-engage" (right).
- **Badge**: "Automation live" (20px, weight 700, green) with pulsing green dot (12px, glows with `boxShadow`), greenLight background, padding 14px 32px, rounded 24px, shadow `0 4px 16px rgba(22, 163, 74, 0.2)`. Positioned absolute top-right corner (top: 40, right: 60). Appears with first card (frame 5) with spring scale 0.5→1.
- **Animation**: Cards start at frame 5, each card+line pair takes 20 frames (cards at frames 5, 25, 45, 65, 85). Lines start 10 frames after their card. Cards spring scale 0.8→1, slide up 15px. Dashed lines (3px wide, 40px tall) animate with marching ants (`backgroundPosition` animated with frame). Branch SVG lines appear at frame 100, branch labels at frame 115. Fade out at frame 149.

### Scene 8: Metrics Payoff
- **Frames**: 1107–1211 (104 frames)
- **Content**: Headline in Instrument Serif 44px: "Turn signups into paying customers". Three horizontal metric cards (280px each):
  - **Conversions** (green dot): "+32%" (36px, bold, green) with animated sparkline SVG (stroke draws in via strokeDasharray/offset)
  - **Revenue** (blue dot): Counts up from $0 to $12,400 (36px, bold, blue) + "from email" label (14px, muted)
  - **Customers** (purple dot): Counts up from 0 to 847 (36px, bold, purple) + 5 overlapping avatar circles (26px, -8px margin overlap, 80% opacity, colors: blue/green/purple/orange/green, 2px white border)
- **Animation**: Headline springs at frame 2. Cards stagger at frames 10, 16, 22 (scale 0.3→1). Numbers count up between frames 18–55. Fade out at frame 92.

### Scene 9: Mic Drop
- **Frames**: 1211–1312 (101 frames)
- **Content**: Subtitle in Inter 24px weight 500 muted: "from zero to a complete email stack". Main text in Instrument Serif 100px weight 400 foreground: "Under 5 minutes".
- **Animation**: Main text springs at frame 4 (scale 0.7→1). Subtitle fades in and slides up 15px at frame 14. Fade out at frame 89.

### Scene 10: CTA
- **Frames**: 1312–1389 (77 frames)
- **Content**: Sendkit logo (80×80, rounded 18px). Instrument Serif 64px: "try free at sendkit.dev". Green animated underline under "sendkit.dev" (grows from 0% to 100% width).
- **Animation**: Logo springs at frame 2. Text slides up at frame 8. Underline animates at frame 16. **No fade out** — holds until end.

---

## Visual Design System

### Colors
```
bg:          #f5f5f0  (warm cream)
card:        #ffffff
border:      #e2e2dc  (olive)
foreground:  #262622
muted:       #757568
green:       #16a34a
greenLight:  rgba(22, 163, 74, 0.12)   — badge/tag backgrounds
greenGlow:   rgba(22, 163, 74, 0.25)   — glow effects
blue:        #2563eb
blueLight:   rgba(37, 99, 235, 0.10)
orange:      #ea580c
orangeLight: rgba(234, 88, 12, 0.10)
purple:      #7c3aed
purpleLight: rgba(124, 58, 237, 0.10)
red:         #dc2626
redLight:    rgba(220, 38, 38, 0.10)
pinkBlob:    rgba(255, 182, 193, 0.25) — background blob top-right
peachBlob:   rgba(255, 218, 185, 0.2)  — background blob bottom-left
```

### Fonts
- **Body**: Inter (via `@remotion/google-fonts/Inter`) — weights 400, 500, 600, 700
- **Headlines/emotional text**: Instrument Serif (via `@remotion/google-fonts/InstrumentSerif`) — weight 400
- **Monospace** (code snippets): `'SF Mono', 'Fira Code', 'Cascadia Code', monospace`

### Background
- Cream (#f5f5f0) with a subtle grid pattern (60px spacing, border color at 90 hex alpha, 60% opacity)
- Pink radial gradient blob (top-right corner, 700px diameter, 25% alpha, blur 40px)
- Peach radial gradient blob (bottom-left corner, 700px diameter, 20% alpha, blur 40px)

### Cards
- White background, olive border (1px solid #e2e2dc), rounded 12–14px
- Shadow: `0 25px 60px rgba(0,0,0,0.08), 0 8px 20px rgba(0,0,0,0.04)`

### BrowserWindow Component
- macOS-style with three dots (red #ff5f57, yellow #ffbd2e, green #28c840)
- URL bar centered in cream pill with olive border
- Rounded 14px corners

### Animation Defaults
- **Spring**: damping 10, stiffness 150, mass 0.8, overshootClamping false
- **Fade out**: Last 12 frames of each scene → opacity 0, scale 0.96
- **Stagger**: 8–15 frames between items

---

## Process to Recreate

1. **Generate audio**: Use the ElevenLabs API with the voice settings above and the narration script. Save as `v4-s01.mp3` through `v4-s10.mp3` + `v4-s06b.mp3`.
2. **Measure durations**: Use `ffprobe` to get each audio file's duration in seconds, multiply by 30 (fps) to get frames. Add 5 frames padding.
3. **Adjust scene timings**: The frame values above are based on our specific audio durations. Recalculate your `from` and `durationInFrames` values based on your audio files.
4. **Build scenes**: Follow the scene descriptions above. All UI is built in React (no screenshots).
5. **Add background music**: Place your background music at `public/audio/music/background2.mp3`, volume 0.15, starting at frame 45.
6. **Assets needed**: Sendkit logo at `public/images/sendkit-logo-dark.png` (square, dark version).

---

## Key Design Principles

- **No screenshots** — all UI is animated React components
- **Storytelling arc**: Pain → Solution → Payoff (not a feature list)
- **Audio-first timing**: Generate audio → measure → build scenes around audio
- **Every card is unique**: Tool cards have distinct internal visuals matching their function
- **Subtle background**: Grid visible but not dominant
- **Spring animations**: Everything uses springs, never linear easing
