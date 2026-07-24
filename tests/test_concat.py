from pipeline.concat import build_concat_filter


def test_build_concat_filter_two_inputs():
    f = build_concat_filter(2, 1920, 1080, 30)
    assert f.count("scale=1920:1080") == 2
    assert "[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]" in f


def test_build_concat_filter_three_inputs():
    f = build_concat_filter(3, 1280, 720, 25)
    assert f.count("aresample=async=1") == 3
    assert "concat=n=3:v=1:a=1[v][a]" in f
