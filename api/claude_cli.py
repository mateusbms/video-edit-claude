"""Roda o binário `claude` em modo headless (`-p`) como subprocesso.

O CLI usa a assinatura do usuário (OAuth/keychain) — sem API key, sem SDK. Ele
não lê nem escreve nada do job: recebe tudo pelo prompt e devolve JSON pela
stdout. Rodamos de um cwd neutro (diretório temporário) para não carregar o
`.claude/` do repo, com as ~40 skills de marketing vendorizadas (~27k tokens de
contexto medidos numa chamada trivial da raiz).

Verificado no CLI 2.1.128. Não usar `--bare`: sob ela a autenticação passa a
exigir ANTHROPIC_API_KEY, exatamente o que este desenho evita.
"""

import json
import re
import shutil
import subprocess
import tempfile

_FENCE_RE = re.compile(r"^\s*```(?:json)?\s*\n(.*?)\n\s*```\s*$", re.DOTALL)


class ClaudeCLIError(RuntimeError):
    """Falha genérica do CLI (is_error, ou envelope que não parseia)."""


class ClaudeCLINotFound(ClaudeCLIError):
    """`claude` não está no PATH."""


class ClaudeCLITimeout(ClaudeCLIError):
    """O CLI passou do timeout."""


class ClaudeCLIParseError(ClaudeCLIError):
    """A stdout do CLI não é o envelope JSON esperado."""


def _strip_fences(text: str) -> str:
    m = _FENCE_RE.match(text.strip())
    return m.group(1).strip() if m else text.strip()


def run_claude(prompt: str, timeout: int = 180) -> str:
    """Chama `claude -p <prompt> --output-format json` e devolve o `result`.

    Levanta ClaudeCLINotFound / ClaudeCLITimeout / ClaudeCLIParseError /
    ClaudeCLIError conforme a falha. Nunca deixa exceção crua vazar.
    """
    # shutil.which respeita PATHEXT no Windows (o npm instala claude.ps1/.cmd,
    # não .exe) — mesma armadilha já corrigida em api/render.py::_npx.
    exe = shutil.which("claude")
    if not exe:
        raise ClaudeCLINotFound("binário `claude` não encontrado no PATH")

    cmd = [exe, "-p", prompt, "--output-format", "json", "--allowed-tools", ""]

    with tempfile.TemporaryDirectory() as neutral_cwd:
        try:
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout,
                cwd=neutral_cwd,
            )
        except subprocess.TimeoutExpired as e:
            raise ClaudeCLITimeout(f"claude excedeu {timeout}s") from e

    try:
        envelope = json.loads(proc.stdout)
    except (json.JSONDecodeError, TypeError) as e:
        raise ClaudeCLIParseError(
            f"stdout do claude não é JSON: {proc.stdout[:500]!r}"
        ) from e

    if envelope.get("is_error"):
        raise ClaudeCLIError(f"claude retornou is_error: {envelope.get('result', '')[:500]}")

    return _strip_fences(str(envelope.get("result", "")))
