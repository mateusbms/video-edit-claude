from api.render import parse_progress


def test_parse_progress_encoded():
    assert parse_progress("Encoded 310/664") == ("encoded", 310, 664)


def test_parse_progress_rendered():
    assert parse_progress("Rendered 200/664, time remaining: 0s") == ("rendered", 200, 664)


def test_parse_progress_irrelevant_line():
    assert parse_progress("hello world") is None
