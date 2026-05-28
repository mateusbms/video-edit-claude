from pathlib import Path


def test_root_returns_placeholder_when_no_build(client):
    """Sem api/static/index.html, a raiz mostra a mensagem placeholder."""
    idx = Path("api/static/index.html")
    if idx.exists():
        # ambiente tem build — pular
        return
    r = client.get("/")
    assert r.status_code == 200
    assert "UI ainda não buildada" in r.text


def test_api_routes_not_overridden_by_spa_fallback(client):
    """/api/health continua respondendo JSON, não o SPA fallback."""
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}
