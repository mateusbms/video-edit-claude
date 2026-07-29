import json
import subprocess
import types

import pytest

from api import claude_cli
from api.claude_cli import (
    ClaudeCLIError,
    ClaudeCLINotFound,
    ClaudeCLITimeout,
    run_claude,
)


def _fake_run(stdout: str):
    def run(cmd, **kwargs):
        return types.SimpleNamespace(stdout=stdout, stderr="", returncode=0)
    return run


@pytest.fixture(autouse=True)
def _claude_on_path(monkeypatch):
    # por padrão, finge que o binário existe
    monkeypatch.setattr(claude_cli.shutil, "which", lambda name, path=None: "/usr/bin/claude")


def test_success_envelope_extracts_result(monkeypatch):
    env = json.dumps({"is_error": False, "result": '[{"id":"sug_01"}]'})
    monkeypatch.setattr(claude_cli.subprocess, "run", _fake_run(env))
    assert run_claude("prompt") == '[{"id":"sug_01"}]'


def test_is_error_raises(monkeypatch):
    env = json.dumps({"is_error": True, "result": "boom"})
    monkeypatch.setattr(claude_cli.subprocess, "run", _fake_run(env))
    with pytest.raises(ClaudeCLIError):
        run_claude("prompt")


def test_strips_markdown_fences(monkeypatch):
    inner = "```json\n[{\"id\":\"sug_01\"}]\n```"
    env = json.dumps({"is_error": False, "result": inner})
    monkeypatch.setattr(claude_cli.subprocess, "run", _fake_run(env))
    assert run_claude("prompt") == '[{"id":"sug_01"}]'


def test_invalid_envelope_raises(monkeypatch):
    monkeypatch.setattr(claude_cli.subprocess, "run", _fake_run("not json at all"))
    with pytest.raises(ClaudeCLIError):
        run_claude("prompt")


def test_missing_binary_raises_not_found(monkeypatch):
    monkeypatch.setattr(claude_cli.shutil, "which", lambda name, path=None: None)
    with pytest.raises(ClaudeCLINotFound):
        run_claude("prompt")


def test_timeout_raises(monkeypatch):
    def run(cmd, **kwargs):
        raise subprocess.TimeoutExpired(cmd, kwargs.get("timeout", 180))
    monkeypatch.setattr(claude_cli.subprocess, "run", run)
    with pytest.raises(ClaudeCLITimeout):
        run_claude("prompt", timeout=1)
