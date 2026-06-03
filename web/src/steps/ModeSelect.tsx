import type React from "react";
import { useAppStore } from "../state";

export function ModeSelect() {
  const setMode = useAppStore((s) => s.setMode);
  return (
    <div style={{ display: "flex", gap: 24, padding: 48 }}>
      <button onClick={() => setMode("recorded")} style={cardStyle}>
        <h2>Editar gravação</h2>
        <p>Suba seu vídeo, corte silêncios, transcreva e gere captions.</p>
      </button>
      <button onClick={() => setMode("animated")} style={cardStyle}>
        <h2>Gerar animado</h2>
        <p>Produza um vídeo de produto estilo Sendkit usando seu brand kit.</p>
      </button>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  flex: 1, padding: 32, borderRadius: 16, border: "1px solid #e2e2dc",
  background: "#fff", cursor: "pointer", textAlign: "left",
};
