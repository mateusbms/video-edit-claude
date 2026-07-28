from pipeline.orientation import (
    FORMAT_KEYS,
    FRAME_SIZES,
    frame_size,
    orientation_from_probe,
    resolve_orientation,
)


class TestOrientationFromProbe:
    def test_landscape_e_16x9(self):
        assert orientation_from_probe(1920, 1080) == "16x9"
        assert orientation_from_probe(1280, 720) == "16x9"

    def test_portrait_e_9x16(self):
        assert orientation_from_probe(1080, 1920) == "9x16"
        assert orientation_from_probe(2160, 3840) == "9x16"

    def test_quadrado_conta_como_16x9(self):
        assert orientation_from_probe(1000, 1000) == "16x9"


class TestResolveOrientation:
    def test_valor_configurado_vence_o_probe(self):
        probe = {"width": 2160, "height": 3840}  # vertical
        assert resolve_orientation("16x9", probe) == "16x9"

    def test_string_vazia_significa_auto(self):
        assert resolve_orientation("", {"width": 2160, "height": 3840}) == "9x16"
        assert resolve_orientation("", {"width": 1280, "height": 720}) == "16x9"

    def test_valor_invalido_cai_no_auto(self):
        assert resolve_orientation("banana", {"width": 2160, "height": 3840}) == "9x16"

    def test_sem_probe_cai_no_16x9(self):
        assert resolve_orientation("", None) == "16x9"
        assert resolve_orientation("", {}) == "16x9"

    def test_probe_com_dimensao_invalida_cai_no_16x9(self):
        assert resolve_orientation("", {"width": 0, "height": 1080}) == "16x9"
        assert resolve_orientation("", {"width": 1920, "height": -1}) == "16x9"


class TestFrameSize:
    def test_tamanhos_canonicos(self):
        assert frame_size("16x9") == (1920, 1080)
        assert frame_size("9x16") == (1080, 1920)

    def test_orientacao_desconhecida_cai_no_16x9(self):
        assert frame_size("banana") == (1920, 1080)

    def test_frame_sizes_tem_exatamente_as_duas_chaves(self):
        assert set(FRAME_SIZES) == {"16x9", "9x16"}


class TestFormatKeys:
    def test_mapeia_orientacao_para_a_chave_logica(self):
        assert FORMAT_KEYS["16x9"] == "main16x9"
        assert FORMAT_KEYS["9x16"] == "vertical9x16"

    def test_cobre_as_mesmas_orientacoes_que_frame_sizes(self):
        assert set(FORMAT_KEYS) == set(FRAME_SIZES)
