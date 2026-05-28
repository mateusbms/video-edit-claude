from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from api.routes import router

app = FastAPI(title="Video Edit Local UI")
app.include_router(router)


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
