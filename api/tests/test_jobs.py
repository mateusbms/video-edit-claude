import errno
import json
from pathlib import Path

from api.jobs import get_state, job_summary_minimo, suggest_hook, allowed_file_path
from api.models import ProbeOut


def _write(p: Path, data):
    p.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")


def test_get_state_empty(tmp_path):
    s = get_state("v1", tmp_path)
    assert s.slug == "v1"
    assert s.probe is None
    assert s.has_trimmed is False


def test_get_state_after_artifacts(tmp_path):
    job = tmp_path / "v1"
    job.mkdir()
    _write(job / "probe.json", {"width": 1920, "height": 1080, "fps": 30.0, "duration": 10.0})
    (job / "trimmed.mp4").write_bytes(b"x")
    _write(job / "transcript.json", [])
    s = get_state("v1", tmp_path)
    assert s.probe == ProbeOut(width=1920, height=1080, fps=30.0, duration=10.0)
    assert s.has_trimmed is True
    assert s.has_transcript is True


def test_suggest_hook_takes_first_sentence():
    transcript = [
        {"text": "Por que isso funciona? Eu vou contar.", "start": 0.0, "end": 2.5, "words": []},
    ]
    h = suggest_hook(transcript)
    assert h.title == "Por que isso funciona?"


def test_suggest_hook_empty():
    h = suggest_hook([])
    assert h.title == ""


def test_allowed_file_path_blocks_traversal(tmp_path):
    job = tmp_path / "v1"; job.mkdir()
    assert allowed_file_path(job, "trimmed.mp4") == (job / "trimmed.mp4").resolve()
    assert allowed_file_path(job, "../etc/passwd") is None
    assert allowed_file_path(job, "source.mp4") is None  # source não é exposto


def test_job_summary_minimo_nao_levanta_quando_um_stat_racha_depois_da_listagem(
    tmp_path, monkeypatch
):
    """B-teste: o teste da rodada anterior levantava FileNotFoundError sem
    errno. O pathlib não engole isso — quem estourava era o p.is_file() da
    comprehension de `arquivos`, capturado pelo `except OSError` em volta do
    próprio iterdir(); `arquivos` ficava vazio e nenhum stat chegava a rodar
    no arquivo transitório. `_tamanho_seguro`/`_mtime_seguro` nunca eram
    exercitados, e o teste continuava passando mesmo revertido para
    `p.stat()` cru.

    Corrigido para a corrida real: o primeiro stat daquele nome (o que
    `is_file()` usa para listar) funciona normalmente — o arquivo entra em
    `arquivos` —, e só a partir do segundo stat (o que `_tamanho_seguro`/
    `_mtime_seguro` usam para ler tamanho/mtime) é que
    FileNotFoundError(errno.ENOENT, ...) estoura — a mesma corrida real de
    stage_refine substituindo trimmed.refined.mp4 entre listar e ler.
    """
    job_dir = tmp_path / "jobs" / "A1"
    job_dir.mkdir(parents=True)
    (job_dir / "transcript.json").write_text("[]", encoding="utf-8")
    (job_dir / "trimmed.refined.mp4").write_bytes(b"y")
    output_root = tmp_path / "output"
    output_root.mkdir()

    original_stat = Path.stat
    chamadas: dict[str, int] = {}

    def _stat_racha_a_partir_da_segunda_chamada(self, *args, **kwargs):
        if self.name == "trimmed.refined.mp4":
            chamadas[self.name] = chamadas.get(self.name, 0) + 1
            if chamadas[self.name] >= 2:
                raise FileNotFoundError(errno.ENOENT, "sumiu entre listar e ler (refine concorrente)")
        return original_stat(self, *args, **kwargs)

    monkeypatch.setattr(Path, "stat", _stat_racha_a_partir_da_segunda_chamada)

    resumo = job_summary_minimo(job_dir, output_root)

    assert resumo is not None
    assert resumo.slug == "A1"
    assert resumo.has_transcript is True
