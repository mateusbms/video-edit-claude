import errno
import json
from pathlib import Path

import pytest

from api.jobs import (
    _tem_conteudo_lista, allowed_file_path, get_state, job_summary_minimo,
    ProjetoNaoEncontradoError, suggest_hook,
)
from api.models import ProbeOut


def _write(p: Path, data):
    p.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")


def test_get_state_para_slug_inexistente_levanta(tmp_path):
    """Um slug cujo diretório nunca existiu não pode receber um estado
    default confiante — as rotas de leitura (GET /jobs/{slug}, POST /cut,
    POST /suggest) traduzem isso para 404 (pendência 4 do handoff)."""
    with pytest.raises(ProjetoNaoEncontradoError):
        get_state("v1", tmp_path)


def test_get_state_diretorio_existente_mas_vazio(tmp_path):
    """Diretório existe (por exemplo, criado por init_job) mas sem nenhum
    artefato ainda: estado default, sem levantar."""
    (tmp_path / "v1").mkdir()
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
    input_root = tmp_path / "input"
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

    resumo = job_summary_minimo(job_dir, input_root, output_root)

    assert resumo is not None
    assert resumo.slug == "A1"
    assert resumo.has_transcript is True


class TestTemConteudoLista:
    """has_overlays/has_suggestions passam a significar "tem conteúdo", não
    só "o arquivo existe" — overlays.json/suggestions.json podem existir
    vazios sem que haja nada a perder ali (pendência 4 do handoff)."""

    def test_arquivo_ausente_e_false(self, tmp_path):
        assert _tem_conteudo_lista(tmp_path / "overlays.json") is False

    def test_lista_vazia_e_false(self, tmp_path):
        p = tmp_path / "overlays.json"
        _write(p, [])
        assert _tem_conteudo_lista(p) is False

    def test_lista_com_item_e_true(self, tmp_path):
        p = tmp_path / "overlays.json"
        _write(p, [{"id": "ov_a"}])
        assert _tem_conteudo_lista(p) is True

    def test_json_invalido_e_true(self, tmp_path):
        """Na dúvida, avisar: um arquivo ilegível não pode virar "sem
        conteúdo" silenciosamente."""
        p = tmp_path / "overlays.json"
        p.write_text("{{{ isto não é json", encoding="utf-8")
        assert _tem_conteudo_lista(p) is True


def test_get_state_variacao_expoe_recut(tmp_path, monkeypatch):
    from pipeline.job import init_job, write_json, load_json
    from api.jobs import get_state
    jobs = tmp_path / "jobs"; jobs.mkdir()
    # matriz apta (trimmed + transcript)
    m = init_job(jobs, "corpo")
    (m.dir / "trimmed.mp4").write_bytes(b"c"); write_json(m.dir / "transcript.json", [])
    mc = load_json(m.dir / "job.config.json"); mc["papel"] = "matriz"; write_json(m.dir / "job.config.json", mc)
    # variação com hook_source e hook_linhas
    v = init_job(jobs, "corpo-h1")
    (v.dir / "hook_source.mp4").write_bytes(b"h")
    vc = load_json(v.dir / "job.config.json")
    vc.update({"papel": "normal", "origem_matriz": "corpo", "hook_linhas": 2})
    write_json(v.dir / "job.config.json", vc)

    st = get_state("corpo-h1", jobs)
    assert st.has_hook_source is True
    assert st.hook_linhas == 2
    assert st.matriz_disponivel is True


def test_get_state_variacao_com_matriz_excluida(tmp_path):
    from pipeline.job import init_job, write_json, load_json
    from api.jobs import get_state
    jobs = tmp_path / "jobs"; jobs.mkdir()
    v = init_job(jobs, "corpo-h1")
    (v.dir / "hook_source.mp4").write_bytes(b"h")
    vc = load_json(v.dir / "job.config.json")
    vc.update({"papel": "normal", "origem_matriz": "corpo"})  # matriz "corpo" não existe
    write_json(v.dir / "job.config.json", vc)

    st = get_state("corpo-h1", jobs)
    assert st.has_hook_source is True
    assert st.matriz_disponivel is False
