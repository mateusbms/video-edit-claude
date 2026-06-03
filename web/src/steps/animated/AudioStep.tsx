import { useEffect, useState } from "react";
import { useAppStore } from "../../state";
import { generateTts, TtsResult } from "../../animatedApi";
import { SCRIPT_KEYS } from "../../types";

export function AudioStep({ onNext }: { onNext: () => void }) {
  const state = useAppStore((s) => s.animatedState);
  const setAnimatedState = useAppStore((s) => s.setAnimatedState);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (state.previewJobId === null) {
      setAnimatedState((s) => ({ ...s, previewJobId: crypto.randomUUID() }));
    }
  }, []);

  const generate = async () => {
    setBusy(true); setError(null);
    try {
      const scripts = SCRIPT_KEYS
        .filter((k) => (state.scripts[k] ?? "").length > 0)
        .map((k) => ({ key: k, text: state.scripts[k] }));
      const results = await generateTts({
        jobId: state.previewJobId!,
        scripts,
      });
      setAnimatedState((s) => ({ ...s, audioResults: results }));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const regenerateOne = async (key: string) => {
    setBusy(true); setError(null);
    try {
      const results = await generateTts({
        jobId: state.previewJobId!,
        scripts: [{ key, text: state.scripts[key] }],
      });
      setAnimatedState((s) => ({
        ...s,
        audioResults: (s.audioResults ?? []).map((r) =>
          r.key === key ? results[0] : r
        ),
      }));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: 32 }}>
      <h2>Áudio</h2>
      {state.audioResults === null ? (
        <button onClick={generate} disabled={busy}>
          {busy ? "Gerando..." : "Gerar narração"}
        </button>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {state.audioResults.map((r) => (
            <li key={r.key} style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 12 }}>
              <strong style={{ width: 60 }}>{r.key}</strong>
              <span style={{ width: 60 }}>{r.seconds.toFixed(1)}s</span>
              <audio controls src={r.file} />
              <button onClick={() => regenerateOne(r.key)} disabled={busy}>
                Regenerar
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p style={{ color: "red" }}>{error}</p>}
      <div style={{ marginTop: 24 }}>
        <button
          onClick={onNext}
          disabled={
            state.audioResults === null ||
            state.audioResults.length !== SCRIPT_KEYS.length
          }
        >
          Próximo
        </button>
      </div>
    </div>
  );
}
