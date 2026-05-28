import pytest

@pytest.fixture
def ffprobe_json():
    return """
    {
      "streams": [
        {"codec_type": "audio", "channels": 2},
        {"codec_type": "video", "width": 1920, "height": 1080, "r_frame_rate": "30000/1001"}
      ],
      "format": {"duration": "140.5"}
    }
    """
