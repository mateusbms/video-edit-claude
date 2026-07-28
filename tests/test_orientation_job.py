import json

import pytest

from api.jobs import get_state, update_orientation
from pipeline.job import init_job


def _write_probe(job_dir, width, height):
    (job_dir / "probe.json").write_text(
        json.dumps({"width": width, "height": height, "fps": 30.0,
                    "duration": 10.0, "nb_frames": 300}),
        encoding="utf-8",
    )


class TestOrientationPadrao:
    def test_job_novo_com_fonte_vertical_resolve_9x16(self, tmp_path):
        job = init_job(tmp_path, "v1")
        _write_probe(job.dir, 2160, 3840)
        assert get_state("v1", tmp_path).orientation == "9x16"

    def test_job_novo_com_fonte_horizontal_resolve_16x9(self, tmp_path):
        job = init_job(tmp_path, "h1")
        _write_probe(job.dir, 1280, 720)
        assert get_state("h1", tmp_path).orientation == "16x9"

    def test_sem_probe_cai_no_16x9(self, tmp_path):
        init_job(tmp_path, "sem")
        assert get_state("sem", tmp_path).orientation == "16x9"

    def test_config_novo_nasce_com_orientation_vazia(self, tmp_path):
        init_job(tmp_path, "novo")
        cfg = json.loads((tmp_path / "novo" / "job.config.json").read_text(encoding="utf-8"))
        assert cfg["orientation"] == ""


class TestConfigLegado:
    def test_config_sem_a_chave_orientation_carrega_e_auto_detecta(self, tmp_path):
        """Jobs criados antes desta feature não têm a chave — não podem quebrar."""
        job_dir = tmp_path / "legado"
        job_dir.mkdir(parents=True)
        (job_dir / "job.config.json").write_text(
            json.dumps({
                "silence_threshold_db": -30.0, "min_silence": 0.5, "padding": 0.1,
                "min_segment": 0.3, "whisper_model": "base", "language": "pt",
                "hook_card_frames": 140, "max_caption_chars": 24, "max_caption_gap": 0.6,
                "brand_kit_slug": "", "caption_font_size": 92, "caption_bottom": 327,
                "caption_color": "", "caption_highlight": "#fcfcfc",
                "caption_font": "Plus Jakarta Sans",
            }),
            encoding="utf-8",
        )
        _write_probe(job_dir, 2160, 3840)
        assert get_state("legado", tmp_path).orientation == "9x16"


class TestUpdateOrientation:
    def test_grava_a_escolha_e_ela_vence_o_probe(self, tmp_path):
        job = init_job(tmp_path, "v2")
        _write_probe(job.dir, 2160, 3840)  # fonte vertical
        update_orientation("v2", tmp_path, "16x9")
        assert get_state("v2", tmp_path).orientation == "16x9"

    def test_persiste_no_arquivo(self, tmp_path):
        init_job(tmp_path, "v3")
        update_orientation("v3", tmp_path, "9x16")
        cfg = json.loads((tmp_path / "v3" / "job.config.json").read_text(encoding="utf-8"))
        assert cfg["orientation"] == "9x16"

    def test_preserva_os_outros_campos(self, tmp_path):
        job = init_job(tmp_path, "v4")
        job.config.caption_font_size = 92
        from dataclasses import asdict
        from pipeline.job import write_json
        write_json(job.dir / "job.config.json", asdict(job.config))
        update_orientation("v4", tmp_path, "9x16")
        cfg = json.loads((tmp_path / "v4" / "job.config.json").read_text(encoding="utf-8"))
        assert cfg["caption_font_size"] == 92
        assert cfg["orientation"] == "9x16"

    def test_rejeita_valor_invalido(self, tmp_path):
        init_job(tmp_path, "v5")
        with pytest.raises(ValueError):
            update_orientation("v5", tmp_path, "banana")

    def test_string_vazia_e_valida_significa_voltar_ao_auto(self, tmp_path):
        job = init_job(tmp_path, "v6")
        _write_probe(job.dir, 2160, 3840)
        update_orientation("v6", tmp_path, "16x9")
        update_orientation("v6", tmp_path, "")
        assert get_state("v6", tmp_path).orientation == "9x16"


class TestInvalidacaoDaRecipe:
    """Trocar a orientação torna a edit-recipe.json obsoleta: ela carrega o
    `formats` de quando foi gerada e o render escolhe a composição pelo estado
    atual do job. Mesmo padrão de stage_refine."""

    def _recipe(self, job_dir):
        return job_dir / "edit-recipe.json"

    def test_trocar_a_orientacao_apaga_a_recipe(self, tmp_path):
        job = init_job(tmp_path, "i1")
        _write_probe(job.dir, 2160, 3840)  # auto = 9x16
        self._recipe(job.dir).write_text("{}", encoding="utf-8")
        update_orientation("i1", tmp_path, "16x9")
        assert not self._recipe(job.dir).exists()

    def test_voltar_ao_auto_tambem_apaga_se_a_efetiva_mudar(self, tmp_path):
        job = init_job(tmp_path, "i2")
        _write_probe(job.dir, 2160, 3840)
        update_orientation("i2", tmp_path, "16x9")
        self._recipe(job.dir).write_text("{}", encoding="utf-8")
        update_orientation("i2", tmp_path, "")  # volta para 9x16
        assert not self._recipe(job.dir).exists()

    def test_reafirmar_a_mesma_orientacao_preserva_a_recipe(self, tmp_path):
        """Clicar de novo no rádio já selecionado não pode custar um /recipe."""
        job = init_job(tmp_path, "i3")
        _write_probe(job.dir, 2160, 3840)
        update_orientation("i3", tmp_path, "9x16")
        self._recipe(job.dir).write_text("{}", encoding="utf-8")
        update_orientation("i3", tmp_path, "9x16")
        assert self._recipe(job.dir).exists()

    def test_escolher_explicitamente_o_que_o_probe_ja_dizia_preserva(self, tmp_path):
        job = init_job(tmp_path, "i4")
        _write_probe(job.dir, 2160, 3840)  # auto = 9x16
        self._recipe(job.dir).write_text("{}", encoding="utf-8")
        update_orientation("i4", tmp_path, "9x16")  # efetiva não muda
        assert self._recipe(job.dir).exists()

    def test_sem_recipe_em_disco_nao_quebra(self, tmp_path):
        job = init_job(tmp_path, "i5")
        _write_probe(job.dir, 2160, 3840)
        update_orientation("i5", tmp_path, "16x9")
        assert not self._recipe(job.dir).exists()
