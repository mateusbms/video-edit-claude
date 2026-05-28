from pipeline.silence import parse_silences, compute_kept_segments, Segment, build_select_expr


def test_parse_silences_pairs_starts_and_ends():
    stderr = (
        "[silencedetect @ 0x1] silence_start: 2.0\n"
        "[silencedetect @ 0x1] silence_end: 3.5 | silence_duration: 1.5\n"
        "[silencedetect @ 0x1] silence_start: 10.0\n"
        "[silencedetect @ 0x1] silence_end: 11.2 | silence_duration: 1.2\n"
    )
    silences = parse_silences(stderr)
    assert silences == [(2.0, 3.5), (10.0, 11.2)]


def test_compute_kept_segments_inverts_silences():
    silences = [(2.0, 3.5), (10.0, 11.2)]
    kept = compute_kept_segments(silences, duration=15.0, padding=0.0, min_segment=0.0)
    assert kept == [Segment(0.0, 2.0), Segment(3.5, 10.0), Segment(11.2, 15.0)]


def test_compute_kept_segments_drops_short_after_padding_merge():
    # silêncio curto entre duas falas some após padding e merge
    silences = [(2.0, 2.2)]
    kept = compute_kept_segments(silences, duration=10.0, padding=0.3, min_segment=0.3)
    assert len(kept) == 1
    assert kept[0].start == 0.0
    assert kept[0].end == 10.0


def test_compute_kept_segments_drops_tiny_segments():
    silences = [(0.0, 0.0), (0.1, 9.9)]  # sobra só [9.9, 10.0]
    kept = compute_kept_segments(silences, duration=10.0, padding=0.0, min_segment=0.3)
    assert kept == []


def test_build_select_expr_joins_segments():
    expr = build_select_expr([Segment(0.0, 2.0), Segment(3.5, 10.0)])
    assert expr == "between(t,0.000,2.000)+between(t,3.500,10.000)"
