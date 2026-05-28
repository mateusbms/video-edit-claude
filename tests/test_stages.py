import json
from pipeline.job import init_job, write_json, load_json
from pipeline.stages import stage_recipe


def test_stage_recipe_writes_edit_recipe(tmp_path):
    job = init_job(tmp_path / "jobs", "v1")
    write_json(job.dir / "probe.json", {"width": 1920, "height": 1080, "fps": 30, "duration": 2.0})
    write_json(job.dir / "transcript.json",
               [{"text": "ola", "start": 0.0, "end": 0.5,
                 "words": [{"word": "ola", "start": 0.0, "end": 0.5}]}])
    hook = {"title": "Hook", "subtitle": "x"}
    write_json(job.dir / "hook.json", hook)

    stage_recipe(job)

    recipe = load_json(job.dir / "edit-recipe.json")
    assert recipe["segments"][0]["title"] == "Hook"
    assert recipe["captions"][0]["fromFrame"] == job.config.hook_card_frames
