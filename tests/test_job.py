from pipeline.job import init_job, write_json, load_json, JobConfig


def test_init_job_creates_dir_and_default_config(tmp_path):
    job = init_job(tmp_path / "jobs", "meu-video")
    assert (job.dir).exists()
    assert job.config.silence_threshold_db == -30.0
    assert job.config.min_silence == 0.5


def test_write_and_load_json_roundtrip(tmp_path):
    p = tmp_path / "x.json"
    write_json(p, {"a": 1})
    assert load_json(p) == {"a": 1}
