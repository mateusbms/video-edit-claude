import type { CaptionLine } from "../types";
import { activeLineIndex } from "../util";

// Espelho visual de remotion/src/components/CaptionLayer.tsx: mesma largura
// máxima, peso, sombra e espaçamento entre palavras — senão o preview quebra
// linha num ponto e o render noutro. Tudo em px do frame-alvo, multiplicado
// por `scale` para virar px de tela.
const WORD_GAP_PX = 12; // igual ao marginRight do CaptionLayer

export const CaptionOverlay: React.FC<{
  lines: CaptionLine[];
  currentTime: number;
  style?: { fontSize: number; bottom: number; color: string; highlightColor: string; fontFamily: string };
  scale?: number;
}> = ({ lines, currentTime, style, scale = 1 }) => {
  const li = activeLineIndex(lines, currentTime);
  if (li < 0) return null;
  const line = lines[li];
  const color = style?.color || "#ffffff";
  const highlight = style?.highlightColor || "#22c55e";
  return (
    <div className="absolute inset-x-0 bottom-0 flex justify-center pointer-events-none"
      style={{ marginBottom: style ? style.bottom * scale : undefined }}>
      <p
        className="text-center"
        style={{
          maxWidth: "80%",
          fontSize: style ? style.fontSize * scale : undefined,
          fontFamily: style?.fontFamily || undefined,
          fontWeight: 800,
          lineHeight: 1.2,
          color,
          textShadow: "0 4px 16px rgba(0,0,0,0.6)",
        }}
      >
        {line.words.map((w, wi) => {
          const active = currentTime >= w.start && currentTime < w.end;
          return (
            <span key={wi} data-active={active}
              style={{
                color: active ? highlight : color,
                transform: active ? "scale(1.08)" : "scale(1)",
                display: "inline-block",
                marginRight: WORD_GAP_PX * scale,
              }}>
              {w.word}
            </span>
          );
        })}
      </p>
    </div>
  );
};
