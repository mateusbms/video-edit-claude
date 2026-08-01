import asyncio
import json
import os
import shutil
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, StreamingResponse

from pydantic import ValidationError

from api import render as render_mod
from api.claude_cli import (
    ClaudeCLIError, ClaudeCLINotFound, ClaudeCLITimeout, run_claude,
)
from api.jobs import (
    allowed_file_path, ArquivoEmUsoError, cut_result, delete_job,
    delete_source, get_state, _job_dir_seguro, job_summary, job_summary_minimo,
    list_jobs, ProjetoNaoEncontradoError, suggest_hook, tem_trabalho,
    update_brand_kit, update_caption_style, update_config,
    update_hook_card_frames, update_orientation, update_title,
    update_whisper_model,
)
from api.suggest_prompt import build_prompt
from api.models import (
    CaptionStyleParams, CutParams, CutResult,
    Hook, JobSummary, OrientationParams, OverlayParams, RefineParams,
    SuggestDefaults, Suggestion, TitleParams, TranscribeParams,
)
from api.progress import run_with_progress
from api.sse import sse_event
from pipeline.job import init_job, load_json, write_json
from pipeline.orientation import FORMAT_KEYS
from pipeline.silence import Segment
from pipeline.stages import stage_cut, stage_ingest, stage_recipe, stage_refine, stage_transcribe

router = APIRouter(prefix="/api")


def _roots() -> tuple[Path, Path, Path]:
    return (
        Path(os.environ.get("JOBS_ROOT", "jobs")),
        Path(os.environ.get("INPUT_ROOT", "input")),
        Path(os.environ.get("OUTPUT_ROOT", "output")),
    )


def _dir_do_job(slug: str, jobs_root: Path) -> Path:
    """Único jeito de montar o caminho do job nas rotas: via _job_dir_seguro.

    Travessia (slug que resolve para fora de jobs_root) vira o mesmo 404 de
    "não existe" — nas leituras e nas escritas. Não exige que o diretório
    exista: quem precisa disso checa por conta própria (ou deixa o arquivo
    ausente virar 404 naturalmente)."""
    alvo = _job_dir_seguro(slug, Path(jobs_root))
    if alvo is None:
        raise HTTPException(status_code=404, detail="projeto não encontrado")
    return alvo


@router.get("/jobs")
def read_jobs() -> list[JobSummary]:
    """Projetos salvos, para a tela de lista."""
    jobs_root, input_root, output_root = _roots()
    return list_jobs(jobs_root, input_root, output_root)


@router.post("/jobs")
async def create_job(
    files: list[UploadFile] = File(...),
    slug: str = Form(default="job"),
    overwrite: bool = Form(default=False),
):
    jobs_root, input_root, output_root = _roots()
    input_root.mkdir(parents=True, exist_ok=True)
    if not files:
        raise HTTPException(status_code=400, detail="envie ao menos um arquivo")

    # Antes de gravar qualquer byte: subir um vídeo por cima de um projeto com
    # trabalho apaga o corte, a transcrição e os textos dele (stage_ingest). A
    # guarda vive aqui, e não só no diálogo da tela, para que a sobrescrita
    # silenciosa seja impossível por qualquer caminho.
    if not overwrite:
        job_dir = _job_dir_seguro(slug, jobs_root)
        if job_dir is None:
            raise HTTPException(status_code=400, detail="nome inválido")
        # tem_trabalho() também entra no try: se ela estourar (em vez de
        # devolver um bool limpo), é o mesmo "não sei" do comentário abaixo —
        # não pode virar 500 nem liberar a sobrescrita, tem que cair no
        # mesmo fallback conservador.
        try:
            existente = (
                (
                    job_summary(job_dir, input_root, output_root)
                    or job_summary_minimo(job_dir, input_root, output_root)
                )
                if tem_trabalho(job_dir)
                else None
            )
        except Exception:
            # tem_trabalho() já tinha confirmado (antes deste bloco, quando
            # ela não levanta) que há algo a perder — daqui para baixo só
            # existem dois desfechos possíveis: recusar com 409, ou (quando
            # job_summary/job_summary_minimo concordam, sem levantar, que o
            # trabalho sumiu numa corrida com um DELETE concorrente) deixar o
            # upload seguir. Uma exceção (aqui ou em tem_trabalho) NÃO é esse
            # segundo caso: é "não sei", e "não sei" não pode virar "pode
            # sobrescrever" — foi assim que uma PermissionError isolada em
            # output/<slug>-16x9.mp4 (um arquivo que tem_trabalho nem toca)
            # bastava para apagar transcript.json/overlays.json em silêncio
            # (achado B). Por isso o fallback é um resumo mínimo com o que já
            # se sabe (o slug), não None.
            existente = JobSummary(slug=slug)
        if existente is not None:
            raise HTTPException(status_code=409, detail=existente.model_dump())

    paths: list[str] = []
    for i, f in enumerate(files):
        suffix = Path(f.filename or "").suffix or ".mp4"
        upload_path = input_root / f"{slug}-part{i}{suffix}"
        with upload_path.open("wb") as out:
            shutil.copyfileobj(f.file, out)
        paths.append(str(upload_path))
    job = init_job(jobs_root, slug)
    try:
        stage_ingest(job, paths)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"ingest falhou: {e}")
    state = get_state(slug, jobs_root)
    return {"slug": slug, "probe": state.probe.model_dump() if state.probe else None}


@router.get("/jobs/{slug}")
def read_job(slug: str):
    """Um slug que nunca existiu não pode receber um estado default confiante
    (200 com tudo em False) — vira 404, como os DELETEs e o PUT /title."""
    jobs_root, _, output_root = _roots()
    try:
        state = get_state(slug, jobs_root)
    except ProjetoNaoEncontradoError:
        raise HTTPException(status_code=404, detail="projeto não encontrado")
    state.has_render_16x9 = (output_root / f"{slug}-16x9.mp4").exists()
    state.has_render_9x16 = (output_root / f"{slug}-9x16.mp4").exists()
    return state.model_dump()


@router.delete("/jobs/{slug}")
def remove_job(slug: str):
    """Apaga o projeto e as partes de upload que geraram o source em input/.
    O render exportado em output/ é mantido."""
    jobs_root, input_root, _ = _roots()
    try:
        apagou = delete_job(slug, jobs_root, input_root)
    except ArquivoEmUsoError as e:
        raise HTTPException(status_code=409, detail=str(e))
    if not apagou:
        raise HTTPException(status_code=404, detail="projeto não encontrado")
    return {"ok": True}


@router.delete("/jobs/{slug}/source")
def remove_source(slug: str):
    """Apaga o vídeo original e as partes de upload que o geraram, para
    liberar espaço."""
    jobs_root, input_root, _ = _roots()
    try:
        apagou = delete_source(slug, jobs_root, input_root)
    except ProjetoNaoEncontradoError:
        raise HTTPException(status_code=404, detail="projeto não encontrado")
    except ArquivoEmUsoError as e:
        raise HTTPException(status_code=409, detail=str(e))
    if not apagou:
        raise HTTPException(
            status_code=404,
            detail="este projeto não tem vídeo original nem cópias de upload para liberar",
        )
    return {"ok": True}


@router.put("/jobs/{slug}/orientation")
def put_orientation(slug: str, params: OrientationParams):
    """update_orientation cria o projeto implicitamente para um slug novo
    (fora do escopo do 404 de slug inexistente) — a única forma de
    ProjetoNaoEncontradoError chegar aqui é um slug de travessia (guard
    central de api.jobs), daí o 404."""
    jobs_root, *_ = _roots()
    try:
        update_orientation(slug, jobs_root, params.orientation)
        orientation = get_state(slug, jobs_root).orientation
    except ProjetoNaoEncontradoError:
        raise HTTPException(status_code=404, detail="projeto não encontrado")
    return {"ok": True, "orientation": orientation}


@router.put("/jobs/{slug}/title")
def put_title(slug: str, params: TitleParams):
    """Alinhado com os dois DELETEs: um slug que não existe responde 404 em
    vez de criar o projeto (ver ProjetoNaoEncontradoError em update_title)."""
    jobs_root, *_ = _roots()
    try:
        update_title(slug, jobs_root, params.title)
    except ProjetoNaoEncontradoError:
        raise HTTPException(status_code=404, detail="projeto não encontrado")
    return {"ok": True}


@router.post("/jobs/{slug}/cut")
def run_cut(slug: str, params: CutParams):
    jobs_root, *_ = _roots()
    # stage_cut é o único leitor do source.mp4. Sem ele o ffmpeg estoura no meio
    # do stream SSE, com erro ilegível — e o projeto pode legitimamente não ter
    # mais o original, depois do "Liberar espaço". Recusa antes de gravar nada.
    #
    # get_state roda antes de qualquer coisa ser criada: um slug que nunca
    # existiu vira 404, não o 409 confiante de "não sobrou vídeo" (que
    # pressupõe um projeto real sem source).
    try:
        state = get_state(slug, jobs_root)
    except ProjetoNaoEncontradoError:
        raise HTTPException(status_code=404, detail="projeto não encontrado")
    if not state.has_source:
        if state.has_trimmed:
            detail = ("o vídeo original deste projeto foi apagado para liberar espaço; "
                       "a detecção de pausas não é mais possível aqui — resta o corte manual "
                       "sobre o vídeo já cortado")
        else:
            # sem source e sem trimmed.mp4: não existe corte manual a prometer —
            # não sobrou vídeo nenhum para trabalhar neste projeto.
            detail = ("o vídeo original deste projeto foi apagado para liberar espaço, e "
                      "este projeto não tem nenhum corte salvo — não dá para detectar "
                      "pausas nem cortar manualmente aqui: não sobrou vídeo para trabalhar")
        raise HTTPException(status_code=409, detail=detail)
    try:
        update_config(slug, jobs_root, params)
    except ProjetoNaoEncontradoError:
        raise HTTPException(status_code=404, detail="projeto não encontrado")
    job = init_job(jobs_root, slug)

    def work(progress_cb):
        stage_cut(job, progress_cb=progress_cb)
        resultado = cut_result(job.dir)
        return resultado.model_dump() if resultado else None

    return StreamingResponse(run_with_progress(work), media_type="text/event-stream")


@router.get("/jobs/{slug}/cuts")
def read_cuts(slug: str) -> CutResult | None:
    """Estado do corte para o passo 2 remontar. `null` = ainda não cortou."""
    jobs_root, *_ = _roots()
    return cut_result(_dir_do_job(slug, jobs_root))


@router.post("/jobs/{slug}/refine")
def run_refine(slug: str, params: RefineParams):
    jobs_root, *_ = _roots()
    job = init_job(jobs_root, slug)
    remove = [Segment(r.start, r.end) for r in params.remove]
    if not remove:
        raise HTTPException(status_code=400, detail="nenhum trecho para remover")

    def work(progress_cb):
        new_dur = stage_refine(job, remove, progress_cb=progress_cb)
        # o mtime novo vai junto: o trimmed.mp4 foi reescrito no mesmo caminho e
        # o preview precisa de uma URL diferente para não reusar o cache antigo
        trimmed = job.dir / "trimmed.mp4"
        return {
            "trimmed_duration": new_dur,
            "trimmed_mtime": trimmed.stat().st_mtime if trimmed.exists() else 0.0,
        }

    return StreamingResponse(run_with_progress(work), media_type="text/event-stream")


@router.get("/jobs/{slug}/transcript")
def get_transcript(slug: str):
    jobs_root, *_ = _roots()
    p = _dir_do_job(slug, jobs_root) / "transcript.json"
    if not p.exists():
        raise HTTPException(status_code=404, detail="transcript inexistente")
    return load_json(p)


@router.put("/jobs/{slug}/transcript")
def put_transcript(slug: str, lines: list[dict]):
    jobs_root, *_ = _roots()
    p = _dir_do_job(slug, jobs_root) / "transcript.json"
    write_json(p, lines)
    return {"ok": True}


@router.get("/jobs/{slug}/overlays")
def get_overlays(slug: str):
    jobs_root, *_ = _roots()
    p = _dir_do_job(slug, jobs_root) / "overlays.json"
    if not p.exists():
        return []
    return load_json(p)


@router.put("/jobs/{slug}/overlays")
def put_overlays(slug: str, overlays: list[OverlayParams]):
    jobs_root, *_ = _roots()
    p = _dir_do_job(slug, jobs_root) / "overlays.json"
    write_json(p, [o.model_dump() for o in overlays])
    return {"ok": True}


@router.get("/jobs/{slug}/suggestions")
def get_suggestions(slug: str):
    jobs_root, *_ = _roots()
    p = _dir_do_job(slug, jobs_root) / "suggestions.json"
    if not p.exists():
        return []
    return load_json(p)


@router.put("/jobs/{slug}/suggestions")
def put_suggestions(slug: str, suggestions: list[Suggestion]):
    jobs_root, *_ = _roots()
    p = _dir_do_job(slug, jobs_root) / "suggestions.json"
    write_json(p, [s.model_dump() for s in suggestions])
    return {"ok": True}


@router.post("/jobs/{slug}/suggest")
def run_suggest(slug: str):
    """Gera suggestions.json chamando o `claude` local (sem API key).

    Síncrono: o `claude -p` não reporta progresso. O backend é dono do arquivo —
    monta o prompt, recebe texto, valida como list[Suggestion], e só então grava.
    Uma geração ruim nunca destrói a anterior (a gravação vem depois da validação).

    get_state roda antes de qualquer checagem: um slug que nunca existiu vira
    404, não o 409 confiante de "sem transcrição" (que pressupõe um projeto
    real sem transcrição gravada).
    """
    jobs_root, *_ = _roots()
    job_dir = _dir_do_job(slug, jobs_root)

    try:
        state = get_state(slug, jobs_root)
    except ProjetoNaoEncontradoError:
        raise HTTPException(status_code=404, detail="projeto não encontrado")

    tpath = job_dir / "transcript.json"
    if not tpath.exists():
        raise HTTPException(status_code=409, detail="sem transcrição: transcreva antes de gerar sugestões")
    transcript = load_json(tpath)

    hook = load_json(job_dir / "hook.json") if (job_dir / "hook.json").exists() else {}
    defaults = (
        load_json(job_dir / "suggest-defaults.json")
        if (job_dir / "suggest-defaults.json").exists()
        else SuggestDefaults().model_dump()
    )
    fps = state.probe.fps if state.probe else 30.0

    prompt = build_prompt(transcript, hook, defaults, fps=fps, orientation=state.orientation)

    try:
        raw = run_claude(prompt)
    except ClaudeCLINotFound as e:
        raise HTTPException(status_code=503, detail=f"claude não encontrado no PATH: {e}")
    except ClaudeCLITimeout as e:
        raise HTTPException(status_code=504, detail=f"claude excedeu o tempo: {e}")
    except ClaudeCLIError as e:
        raise HTTPException(status_code=502, detail=f"claude falhou: {e}")

    try:
        data = json.loads(raw)
        suggestions = [Suggestion(**s) for s in data]
    except (json.JSONDecodeError, ValidationError, TypeError) as e:
        raise HTTPException(status_code=422, detail=f"resposta do claude fora do schema: {e}")

    dumped = [s.model_dump() for s in suggestions]
    write_json(job_dir / "suggestions.json", dumped)
    return dumped


@router.get("/jobs/{slug}/suggest-defaults")
def get_suggest_defaults(slug: str):
    jobs_root, *_ = _roots()
    p = _dir_do_job(slug, jobs_root) / "suggest-defaults.json"
    if not p.exists():
        return SuggestDefaults().model_dump()
    return load_json(p)


@router.put("/jobs/{slug}/suggest-defaults")
def put_suggest_defaults(slug: str, defaults: SuggestDefaults):
    jobs_root, *_ = _roots()
    p = _dir_do_job(slug, jobs_root) / "suggest-defaults.json"
    write_json(p, defaults.model_dump())
    return {"ok": True}


@router.get("/jobs/{slug}/hook")
def get_hook(slug: str):
    jobs_root, *_ = _roots()
    job_dir = _dir_do_job(slug, jobs_root)
    p = job_dir / "hook.json"
    if p.exists():
        d = load_json(p)
        return Hook(
            title=d["title"],
            subtitle=d.get("subtitle", ""),
            duration_frames=d.get("duration_frames", 90),
            x=d.get("x", 0.5), y=d.get("y", 0.16),
            fontSize=d.get("fontSize", 84), fontFamily=d.get("fontFamily", ""),
            color=d.get("color", ""), anchor=d.get("anchor", "center"),
        ).model_dump()
    tpath = job_dir / "transcript.json"
    if tpath.exists():
        return suggest_hook(load_json(tpath)).model_dump()
    return Hook(title="", subtitle="").model_dump()


@router.put("/jobs/{slug}/hook")
def put_hook(slug: str, hook: Hook):
    jobs_root, *_ = _roots()
    write_json(_dir_do_job(slug, jobs_root) / "hook.json", hook.model_dump())
    update_hook_card_frames(slug, jobs_root, hook.duration_frames)
    return {"ok": True}


@router.put("/jobs/{slug}/caption-style")
def put_caption_style(slug: str, style: CaptionStyleParams):
    """update_caption_style cria o projeto implicitamente para um slug novo
    (fora do escopo do 404 de slug inexistente) — só um slug de travessia
    (guard central de api.jobs) levanta ProjetoNaoEncontradoError aqui."""
    jobs_root, *_ = _roots()
    try:
        update_caption_style(slug, jobs_root, style)
    except ProjetoNaoEncontradoError:
        raise HTTPException(status_code=404, detail="projeto não encontrado")
    return {"ok": True}


@router.put("/jobs/{slug}/brand-kit")
def put_brand_kit(slug: str, body: dict):
    """Mesmo raciocínio de put_caption_style: só travessia vira 404 aqui."""
    jobs_root, *_ = _roots()
    try:
        update_brand_kit(slug, jobs_root, body.get("slug", ""))
    except ProjetoNaoEncontradoError:
        raise HTTPException(status_code=404, detail="projeto não encontrado")
    return {"ok": True}


@router.post("/jobs/{slug}/recipe")
def run_recipe(slug: str):
    jobs_root, *_ = _roots()
    job = init_job(jobs_root, slug)
    try:
        stage_recipe(job)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"recipe falhou: {e}")
    return {"ok": True}


@router.get("/jobs/{slug}/files/{name}")
def get_file(slug: str, name: str):
    jobs_root, _, output_root = _roots()
    job_dir = _dir_do_job(slug, jobs_root)
    p = allowed_file_path(job_dir, name)
    if p and p.exists():
        return FileResponse(p, media_type="video/mp4", filename=name)
    if name in {f"{slug}-16x9.mp4", f"{slug}-9x16.mp4"}:
        op = output_root / name
        if op.exists():
            return FileResponse(op, media_type="video/mp4", filename=name)
    raise HTTPException(status_code=404, detail="arquivo não disponível")


# ---------- SSE ----------


def _build_remotion_env() -> dict:
    """PATH com bin/ (ffmpeg) + .tools/node*/bin (node)."""
    env = os.environ.copy()
    extras = [str(Path("bin").resolve())]
    node_bin = next(Path(".tools").glob("node-*/bin"), None)
    if node_bin:
        extras.append(str(node_bin.resolve()))
    env["PATH"] = os.pathsep.join(extras + [env.get("PATH", "")])
    return env


@router.post("/jobs/{slug}/transcribe")
def run_transcribe(slug: str, params: TranscribeParams):
    jobs_root, *_ = _roots()
    update_whisper_model(slug, jobs_root, params.model_size, params.language)
    job = init_job(jobs_root, slug)

    def work(progress_cb):
        stage_transcribe(job, progress_cb=progress_cb)
        return {"ok": True}

    async def gen():
        yield sse_event("progress", {"stage": "loading_model"})
        async for chunk in run_with_progress(work):
            yield chunk

    return StreamingResponse(gen(), media_type="text/event-stream")


def _publish_remotion_assets(slug: str, jobs_root: Path) -> Path:
    """Copia trimmed.mp4 e brand.json para o projeto Remotion."""
    remotion_dir = Path("remotion")
    pub = remotion_dir / "public"
    pub.mkdir(parents=True, exist_ok=True)
    shutil.copy(jobs_root / slug / "trimmed.mp4", pub / "trimmed.mp4")
    shutil.copy("brand/brand.json", remotion_dir / "src" / "brand.json")
    return remotion_dir


# orientação -> (composição Remotion, sufixo do arquivo de saída)
ORIENTATION_TO_FORMAT = {
    "16x9": ("Recorded16x9", "16x9"),
    "9x16": ("Recorded9x16", "9x16"),
}


def _assert_recipe_matches_orientation(props_path: Path, orientation: str) -> None:
    """409 se a recipe em disco foi gerada para outra orientação.

    A composição vem do estado do job, mas a recipe carrega o `formats` de
    quando foi gerada — se divergirem, o Remotion estoura sem explicar. Recipes
    legadas (sem a chave `orientation`) trazem os dois formatos e contam como
    compatíveis.
    """
    try:
        recipe = load_json(props_path)
    except Exception:
        return  # arquivo ilegível: deixa o Remotion reclamar do conteúdo
    if not isinstance(recipe, dict):
        return
    recipe_orientation = recipe.get("orientation") or ""
    if recipe_orientation and recipe_orientation != orientation:
        raise HTTPException(
            status_code=409,
            detail=(
                f"a recipe foi gerada para {recipe_orientation} e o job está em "
                f"{orientation}; rode /recipe novamente antes de renderizar"
            ),
        )


@router.post("/jobs/{slug}/render")
async def run_render(slug: str):
    jobs_root, _, output_root = _roots()
    output_root.mkdir(parents=True, exist_ok=True)
    job_dir = _dir_do_job(slug, jobs_root)
    props_path = (job_dir / "edit-recipe.json").resolve()
    if not props_path.exists():
        raise HTTPException(status_code=409, detail="edit-recipe.json não existe; rode /recipe antes")

    # renderiza só a orientação efetiva do job, não uma lista vinda do body
    orientation = get_state(slug, jobs_root).orientation
    _assert_recipe_matches_orientation(props_path, orientation)
    composition, suffix = ORIENTATION_TO_FORMAT[orientation]
    jobs_to_run = [(FORMAT_KEYS[orientation], composition, f"{slug}-{suffix}.mp4")]

    remotion_dir = _publish_remotion_assets(slug, jobs_root)
    output_root_abs = output_root.resolve()
    env = _build_remotion_env()

    async def gen():
        for fmt_key, composition, out_name in jobs_to_run:
            out_path = output_root_abs / out_name
            try:
                proc = await render_mod.run_remotion(composition, out_path, props_path, remotion_dir, env)
            except Exception as e:
                yield sse_event("error", {"detail": str(e)})
                return
            # A saída inteira vai para disco. O painel de erro só cabe as últimas
            # linhas, e o stack trace do Remotion tem altura suficiente para
            # empurrar a mensagem de verdade para fora dessa janela — foi o que
            # aconteceu num "retornou 1" e deixou o erro sem causa visível.
            log_path = job_dir / "render.log"
            tail = render_mod.ErrorTail()
            with log_path.open("w", encoding="utf-8", errors="ignore") as log_file:
                while True:
                    raw = await proc.stdout.readline()
                    if not raw:
                        break
                    line = raw.decode(errors="ignore").strip()
                    if not line:
                        continue
                    log_file.write(line + "\n")
                    p = render_mod.parse_progress(line)
                    if p:
                        kind, n, total = p
                        yield sse_event("progress",
                                        {"format": fmt_key, "kind": kind, "n": n, "total": total})
                    else:
                        tail.add(line)
            rc = await proc.wait()
            if rc != 0:
                yield sse_event("error", {
                    "detail": f"render {fmt_key} retornou {rc}",
                    "log": tail.render(log_path),
                })
                return
            yield sse_event("progress",
                            {"format": fmt_key, "kind": "encoded", "n": 1, "total": 1, "done_format": True})
        yield sse_event("done", {"ok": True})

    return StreamingResponse(gen(), media_type="text/event-stream")


@router.get("/jobs/{slug}/still")
async def get_still(slug: str, frame: int = 0):
    """A checagem de edit-recipe.json vem antes de get_state, na mesma ordem
    de run_render: um slug sem diretório nunca tem recipe, então o 409
    "recipe ausente" já cobre esse caso sem get_state (que agora levanta
    ProjetoNaoEncontradoError para um diretório inexistente) precisar rodar
    primeiro — esta rota não está na lista de 404 de slug inexistente."""
    jobs_root, _, output_root = _roots()
    props_path = (_dir_do_job(slug, jobs_root) / "edit-recipe.json").resolve()
    if not props_path.exists():
        raise HTTPException(status_code=409, detail="recipe ausente")
    orientation = get_state(slug, jobs_root).orientation
    composition, suffix = ORIENTATION_TO_FORMAT[orientation]
    _assert_recipe_matches_orientation(props_path, orientation)

    remotion_dir = _publish_remotion_assets(slug, jobs_root)
    env = _build_remotion_env()

    out = (output_root / f".still-{slug}-{suffix}-{frame}.png").resolve()
    proc = await render_mod.run_remotion_still(composition, out, frame, props_path, remotion_dir, env)
    if proc.returncode != 0 or not out.exists():
        raise HTTPException(status_code=500, detail="still falhou")
    return FileResponse(out, media_type="image/png")
