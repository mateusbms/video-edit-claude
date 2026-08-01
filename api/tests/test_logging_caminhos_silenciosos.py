"""Pendência 2 do handoff: caminhos que engolem erro por desenho (0
silencioso, melhor-esforço, config/probe ilegível) ganham `logger.warning`
sem mudar nenhum retorno. Ver docs/superpowers/specs/
2026-08-01-logging-caminhos-silenciosos-design.md.
"""

import logging
from pathlib import Path

from api.jobs import _apagar_partes_de_upload, _tamanho_seguro, job_summary


def test_tamanho_seguro_com_permission_error_devolve_zero_e_loga(
    tmp_path, monkeypatch, caplog
):
    alvo = tmp_path / "arquivo.mp4"
    alvo.write_bytes(b"x")

    original_stat = Path.stat

    def _stat_sem_permissao(self, *args, **kwargs):
        if self.name == "arquivo.mp4":
            raise PermissionError(13, "Permission denied")
        return original_stat(self, *args, **kwargs)

    monkeypatch.setattr(Path, "stat", _stat_sem_permissao)

    with caplog.at_level(logging.WARNING, logger="api.jobs"):
        assert _tamanho_seguro(alvo) == 0

    warnings = [r for r in caplog.records if r.levelno == logging.WARNING]
    assert len(warnings) == 1
    assert str(alvo) in warnings[0].message


def test_tamanho_seguro_com_file_not_found_devolve_zero_sem_logar(
    tmp_path, caplog
):
    """FileNotFoundError é o caso esperado (corrida com stage_refine) — não
    deve gerar warning."""
    alvo = tmp_path / "sumiu.mp4"  # nunca criado

    with caplog.at_level(logging.WARNING, logger="api.jobs"):
        assert _tamanho_seguro(alvo) == 0

    assert caplog.records == []


def test_apagar_partes_de_upload_loga_a_parte_orfa_e_apaga_as_demais(
    tmp_path, monkeypatch, caplog
):
    input_root = tmp_path / "input"
    input_root.mkdir()
    parte_travada = input_root / "A1-part0.mp4"
    parte_saudavel = input_root / "A1-part1.mp4"
    parte_travada.write_bytes(b"x")
    parte_saudavel.write_bytes(b"y")

    original_unlink = Path.unlink

    def _unlink_seletivo(self, *args, **kwargs):
        if self.name == "A1-part0.mp4":
            raise PermissionError(13, "Permission denied")
        return original_unlink(self, *args, **kwargs)

    monkeypatch.setattr(Path, "unlink", _unlink_seletivo)

    with caplog.at_level(logging.WARNING, logger="api.jobs"):
        _apagar_partes_de_upload("A1", input_root)

    assert parte_travada.exists()
    assert not parte_saudavel.exists()
    warnings = [r for r in caplog.records if r.levelno == logging.WARNING]
    assert len(warnings) == 1
    assert "A1-part0.mp4" in warnings[0].message


def test_job_summary_com_config_corrompido_devolve_none_e_loga(tmp_path, caplog):
    job_dir = tmp_path / "jobs" / "quebrado"
    job_dir.mkdir(parents=True)
    cfg_path = job_dir / "job.config.json"
    cfg_path.write_text("{{{ isto não é json", encoding="utf-8")
    input_root = tmp_path / "input"
    output_root = tmp_path / "output"
    output_root.mkdir()

    with caplog.at_level(logging.WARNING, logger="api.jobs"):
        assert job_summary(job_dir, input_root, output_root) is None

    warnings = [r for r in caplog.records if r.levelno == logging.WARNING]
    assert len(warnings) == 1
    assert str(cfg_path) in warnings[0].message
