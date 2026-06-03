import { useState } from "react";
import { useAppStore } from "../../state";
import { createAnimatedJob } from "../../animatedApi";
import { SCRIPT_KEYS } from "../../types";

export function ReviewStep({ onNext }: { onNext: () => void }) {
  const state = useAppStore((s) => s.animatedState);
  const setAnimatedState = useAppStore((s) => s.setAnimatedState);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalChars = Object.values(state.scripts).reduce(
    (a, t) => a + (t?.length ?? 0), 0
  );

  const setOrientation = (o: "16x9" | "9x16") =>
    setAnimatedState((s) => ({ ...s, orientation: o }));

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const scripts = SCRIPT_KEYS.map((k) => ({
        key: k, text: state.scripts[k] ?? "",
      }));
      const { jobId } = await createAnimatedJob({
        brandKitSlug: state.brandKitSlug!,
        scripts,
        orientation: state.orientation,
      });
      setAnimatedState((s) => ({ ...s, jobId }));
      onNext();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: 32 }}>
      <h2>Revisão</h2>
      <dl style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 12 }}>
        <dt>Brand kit</dt>
        <dd>{state.brandKitSlug ?? "(não selecionado)"}</dd>
        <dt>Total chars</dt>
        <dd>{totalChars}</dd>
        <dt>Cenas</dt>
        <dd>{SCRIPT_KEYS.filter(k => (state.scripts[k] ?? "").length > 0).length} de {SCRIPT_KEYS.length}</dd>
      </dl>
      <fieldset style={{ marginTop: 16 }}>
        <legend>Orientação</legend>
        <label>
          <input
            type="radio"
            name="orientation"
            checked={state.orientation === "16x9"}
            onChange={() => setOrientation("16x9")}
          /> 16:9 (1920×1080)
        </label>
        <label style={{ marginLeft: 16 }}>
          <input
            type="radio"
            name="orientation"
            checked={state.orientation === "9x16"}
            onChange={() => setOrientation("9x16")}
          /> 9:16 (1080×1920)
        </label>
      </fieldset>
      {error && <p style={{ color: "red" }}>{error}</p>}
      <div style={{ marginTop: 24 }}>
        <button onClick={submit} disabled={busy || !state.brandKitSlug}>
          {busy ? "Enviando..." : "Renderizar"}
        </button>
      </div>
    </div>
  );
}
