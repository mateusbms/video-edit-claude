import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from api.routes import router
from api.brand_kits_routes import router as brand_kits_router
from api.tts_routes import router as tts_router
from api.animated_routes import router as animated_router

REQUIRED_ENV = ["ELEVENLABS_API_KEY"]
for _var in REQUIRED_ENV:
    if not os.getenv(_var):
        raise RuntimeError(f"Missing required env var: {_var}")

ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "gJx1vCzNCD1EQHT212Ls")
ELEVENLABS_FALLBACK_VOICE_ID = os.getenv("ELEVENLABS_FALLBACK_VOICE_ID", "FGY2WhTYpPnrIDTdsKH5")
TTS_MAX_CHARS_PER_JOB = int(os.getenv("TTS_MAX_CHARS_PER_JOB", "4000"))

app = FastAPI(title="Video Edit Local UI")
app.include_router(router)
app.include_router(brand_kits_router)
app.include_router(tts_router)
app.include_router(animated_router)


@app.get("/health")
@app.get("/api/health")
def health():
    return {"status": "ok"}


_STATIC = Path("api/static")
if (_STATIC / "assets").exists():
    app.mount("/assets", StaticFiles(directory=_STATIC / "assets"), name="assets")


@app.get("/")
def root():
    idx = _STATIC / "index.html"
    if idx.exists():
        return FileResponse(idx)
    return HTMLResponse(
        "<h1>UI ainda não buildada</h1><p>Rode <code>scripts/ui.sh</code>.</p>",
        status_code=200,
    )


@app.get("/{path:path}")
def spa_fallback(path: str):
    """Qualquer rota não-API cai no index.html (SPA routing)."""
    if path.startswith("api/"):
        return HTMLResponse("not found", status_code=404)
    idx = _STATIC / "index.html"
    if idx.exists():
        return FileResponse(idx)
    return HTMLResponse("UI não buildada", status_code=404)
