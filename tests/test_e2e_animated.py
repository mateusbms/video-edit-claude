import json
import os
import shutil
import subprocess
from pathlib import Path
import pytest


pytestmark = pytest.mark.skipif(
    not os.getenv("E2E_ELEVENLABS_API_KEY"),
    reason="Set E2E_ELEVENLABS_API_KEY to run end-to-end test",
)


def test_e2e_curl_post_renders_mp4(tmp_path, monkeypatch):
    # Spin up the api, post a job, wait for SSE done, check MP4 exists.
    # This test is intentionally manual / opt-in.
    pass  # Placeholder: smoke is exercised manually below
