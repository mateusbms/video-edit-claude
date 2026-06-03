import { useAppStore } from "../../state";
import { SCRIPT_KEYS } from "../../types";
import { estimateCostUsd } from "../../util/ttsCost";

const LABELS: Record<string, string> = {
  s01: "Intro", s02: "Signups", s03: "Pain", s04: "Agitation",
  s05: "Relief", s06: "Templates", s06b: "Email preview",
  s07: "Automation", s08: "Metrics", s09: "Mic drop", s10: "CTA",
};

export function ScriptStep({ onNext }: { onNext: () => void }) {
  const scripts = useAppStore((s) => s.animatedState.scripts);
  const setAnimatedState = useAppStore((s) => s.setAnimatedState);

  const total = Object.values(scripts).reduce((a, t) => a + (t?.length ?? 0), 0);
  const cost = estimateCostUsd(total);
  const allFilled = SCRIPT_KEYS.every((k) => (scripts[k] ?? "").trim().length > 0);

  return (
    <div style={{ padding: 32 }}>
      <h2>Script</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {SCRIPT_KEYS.map((k) => (
          <label key={k} style={{ display: "block" }}>
            <div style={{ fontSize: 13, color: "#757568", marginBottom: 4 }}>
              {LABELS[k]} ({k})
            </div>
            <textarea
              value={scripts[k] ?? ""}
              onChange={(e) =>
                setAnimatedState((st) => ({
                  ...st,
                  scripts: { ...st.scripts, [k]: e.target.value },
                }))
              }
              rows={2}
              style={{ width: "100%", padding: 8, fontFamily: "inherit" }}
            />
            <div style={{ fontSize: 11, color: "#999", textAlign: "right" }}>
              {(scripts[k] ?? "").length} chars
            </div>
          </label>
        ))}
      </div>
      <div style={{
        marginTop: 16, padding: 12,
        background: total > 2500 ? "#fff8e6" : "#f5f5f0",
        borderRadius: 8, fontSize: 14,
      }}>
        Total: <strong>{total}</strong> chars · custo estimado ~${cost.toFixed(2)}
        {total > 2500 && <span style={{ color: "#b45309" }}> (alerta de custo acima de 2.500)</span>}
      </div>
      <div style={{ marginTop: 24 }}>
        <button onClick={onNext} disabled={!allFilled}>Próximo</button>
      </div>
    </div>
  );
}
