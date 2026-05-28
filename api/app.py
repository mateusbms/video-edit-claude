from fastapi import FastAPI

app = FastAPI(title="Video Edit Local UI")


@app.get("/api/health")
def health():
    return {"status": "ok"}
