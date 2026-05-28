from pipeline.probe import parse_ffprobe, VideoMeta


def test_parse_ffprobe_extracts_video_stream(ffprobe_json):
    meta = parse_ffprobe(ffprobe_json)
    assert isinstance(meta, VideoMeta)
    assert meta.width == 1920
    assert meta.height == 1080
    assert meta.duration == 140.5
    assert abs(meta.fps - 29.97) < 0.01
