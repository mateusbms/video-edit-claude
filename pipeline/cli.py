import argparse
from pathlib import Path

from pipeline.job import init_job
from pipeline.stages import stage_ingest, stage_cut, stage_transcribe, stage_recipe


def main() -> None:
    parser = argparse.ArgumentParser(description="Pipeline de análise de vídeo")
    parser.add_argument("stage", choices=["ingest", "cut", "transcribe", "recipe"])
    parser.add_argument("--slug", required=True)
    parser.add_argument("--jobs-root", default="jobs")
    parser.add_argument("--src", help="caminho do vídeo (estágio ingest)")
    args = parser.parse_args()

    job = init_job(args.jobs_root, args.slug)
    if args.stage == "ingest":
        if not args.src:
            parser.error("--src é obrigatório no estágio ingest")
        stage_ingest(job, args.src)
        print(f"[ingest] ok -> {job.dir/'probe.json'}")
    elif args.stage == "cut":
        stage_cut(job)
        print(f"[cut] ok -> {job.dir/'cuts.json'} + trimmed.mp4")
    elif args.stage == "transcribe":
        stage_transcribe(job)
        print(f"[transcribe] ok -> {job.dir/'transcript.json'}")
    elif args.stage == "recipe":
        stage_recipe(job)
        print(f"[recipe] ok -> {job.dir/'edit-recipe.json'}")


if __name__ == "__main__":
    main()
