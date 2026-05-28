from fastapi import FastAPI

from api.routes import router

app = FastAPI(title="Video Edit Local UI")
app.include_router(router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
