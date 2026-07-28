"""O estilo de legenda que o preview recebe tem que ser o que o render usa.

O preview desenha a legenda com as mesmas regras do CaptionLayer para quebrar
linha no mesmo lugar. Isso só funciona se a FONTE for a mesma: com um brand kit
de `fonts.body: "Poppins"` e `caption_font: ""`, o render usava Poppins e o
preview a fonte padrão do sistema — métricas diferentes, quebra diferente.
"""

import json
from dataclasses import asdict

import pytest

from api.jobs import get_state, update_caption_style
from api.models import BrandKit, CaptionStyleParams
from pipeline.job import init_job, write_json
from pipeline.recipe import build_recipe, resolve_caption_style


@pytest.fixture
def kits_root(tmp_path, monkeypatch):
    from api import brand_kits_store

    root = tmp_path / "kits"
    root.mkdir()
    monkeypatch.setattr(brand_kits_store, "KITS_ROOT", root)
    return root


def _kit(kits_root, slug: str, body: str, accent: str = "#00ff00") -> None:
    from api.brand_kits_store import save_kit

    save_kit(BrandKit(
        slug=slug, name=slug, logo="",
        colors={"bg": "#000000", "card": "#111111", "border": "#222222",
                "foreground": "#eeeeee", "muted": "#888888",
                "accent": accent, "accentLight": "#ccffcc"},
        fonts={"body": body, "headline": "Anton"},
    ))


def _job_com_kit(jobs_root, slug: str, kit_slug: str, **config):
    job = init_job(jobs_root, slug)
    job.config.brand_kit_slug = kit_slug
    for k, v in config.items():
        setattr(job.config, k, v)
    write_json(job.dir / "job.config.json", asdict(job.config))
    return job


class TestCaptionStyleResolvido:
    def test_preview_recebe_a_fonte_do_brand_kit(self, tmp_path, kits_root):
        _kit(kits_root, "marca", body="Poppins")
        _job_com_kit(tmp_path, "j1", "marca", caption_font="")
        state = get_state("j1", tmp_path)
        assert state.captionStyleResolved["fontFamily"] == "Poppins"

    def test_o_cru_continua_cru(self, tmp_path, kits_root):
        """captionStyle segue sendo o do job.config: "" significa "segue a marca".
        Se virasse "Poppins", qualquer ajuste de tamanho gravaria a fonte no job
        e ele deixaria de acompanhar o brand kit."""
        _kit(kits_root, "marca", body="Poppins")
        _job_com_kit(tmp_path, "j2", "marca", caption_font="")
        state = get_state("j2", tmp_path)
        assert state.captionStyle["fontFamily"] == ""

    def test_escolha_do_usuario_vence_a_marca(self, tmp_path, kits_root):
        _kit(kits_root, "marca", body="Poppins")
        _job_com_kit(tmp_path, "j3", "marca", caption_font="Anton")
        assert get_state("j3", tmp_path).captionStyleResolved["fontFamily"] == "Anton"

    def test_sem_brand_kit_cai_no_padrao(self, tmp_path, kits_root):
        init_job(tmp_path, "j4")
        assert get_state("j4", tmp_path).captionStyleResolved["fontFamily"] == "Inter"

    def test_kit_inexistente_nao_quebra(self, tmp_path, kits_root):
        _job_com_kit(tmp_path, "j5", "sumiu", caption_font="")
        assert get_state("j5", tmp_path).captionStyleResolved["fontFamily"] == "Inter"

    def test_preview_e_render_resolvem_igual(self, tmp_path, kits_root):
        """A prova que importa: o dicionário do preview é idêntico ao que vai
        para a recipe."""
        _kit(kits_root, "marca", body="Poppins", accent="#ff0055")
        _job_com_kit(tmp_path, "j6", "marca", caption_font="", caption_color="",
                     caption_highlight="", caption_font_size=92, caption_bottom=327)
        state = get_state("j6", tmp_path)

        from pipeline.recipe import brand_of_kit
        recipe = build_recipe(
            width=1080, height=1920, fps=30.0, trimmed_duration=1.0, words=[],
            hook={"title": "t"},
            caption_style=state.captionStyle,
            brand=brand_of_kit("marca"),
        )
        assert recipe["captionStyle"] == state.captionStyleResolved

    def test_update_caption_style_nao_grava_o_resolvido(self, tmp_path, kits_root):
        """Salvar só o tamanho não pode congelar a fonte da marca no job."""
        _kit(kits_root, "marca", body="Poppins")
        _job_com_kit(tmp_path, "j7", "marca", caption_font="")
        update_caption_style("j7", tmp_path, CaptionStyleParams(fontSize=92, bottom=327))
        cfg = json.loads((tmp_path / "j7" / "job.config.json").read_text(encoding="utf-8"))
        assert cfg["caption_font"] == ""


class TestResolveCaptionStylePuro:
    def test_ordem_de_precedencia(self):
        brand = {"colors": {"foreground": "#111111", "accent": "#222222"},
                 "fonts": {"body": "Poppins"}}
        assert resolve_caption_style({"fontFamily": "Anton"}, brand)["fontFamily"] == "Anton"
        assert resolve_caption_style({"fontFamily": ""}, brand)["fontFamily"] == "Poppins"
        assert resolve_caption_style({}, None)["fontFamily"] == "Inter"

    def test_defaults_numericos(self):
        r = resolve_caption_style(None, None)
        assert r["fontSize"] == 48 and r["bottom"] == 120
