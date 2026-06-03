# Animated mode — production checklist

- [ ] `ELEVENLABS_API_KEY` set in production env
- [ ] At least one brand kit exists in `brand/kits/`
- [ ] `output/` directory is writable
- [ ] `jobs/` directory is writable
- [ ] Disk has headroom (audio + MP4 per job ~ 20-50 MB)
- [ ] Remotion cache warmed (`npx remotion compositions` once)
- [ ] SSE endpoint reachable from the deployed frontend
