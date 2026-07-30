import { useRef } from "react";
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
  // Sem onDragBottom a legenda é só uma sobreposição visual (o padrão nos
  // passos Hook e Textos, onde ela é referência e não controle). Com ele, o
  // texto vira alça de arraste vertical e emite o `bottom` novo a cada
  // movimento; onDragEnd marca o fim do gesto, que é quando vale persistir.
  onDragBottom?: (bottom: number) => void;
  onDragEnd?: () => void;
  maxBottom?: number;
}> = ({ lines, currentTime, style, scale = 1, onDragBottom, onDragEnd, maxBottom }) => {
  // Arraste por delta: guarda onde o gesto começou e desloca a partir dali.
  // Posição absoluta exigiria saber a altura real do bloco para alinhar o
  // cursor com o texto; o delta não precisa disso.
  const drag = useRef<{ y: number; bottom: number } | null>(null);
  const li = activeLineIndex(lines, currentTime);
  if (li < 0) return null;
  const line = lines[li];
  const color = style?.color || "#ffffff";
  const highlight = style?.highlightColor || "#ffffff";
  const draggable = !!(onDragBottom && style);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!draggable || !style) return;
    e.preventDefault(); // senão o navegador inicia a seleção de texto
    drag.current = { y: e.clientY, bottom: style.bottom };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current || !onDragBottom) return;
    // (yInicial - yAtual) porque `bottom` cresce para cima e clientY para baixo;
    // dividir por scale converte px de tela em px do frame-alvo.
    const next = drag.current.bottom + (drag.current.y - e.clientY) / (scale || 1);
    const teto = maxBottom ?? Infinity;
    onDragBottom(Math.round(Math.max(0, Math.min(teto, next))));
  };
  const endDrag = (e: React.PointerEvent) => {
    if (!drag.current) return;
    drag.current = null;
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
    onDragEnd?.();
  };
  return (
    // aria-hidden: esta legenda é uma sobreposição visual do preview sobre o
    // <video>; o texto editável de verdade vive no passo de transcrição. Como
    // as palavras aqui são separadas só por marginRight (sem espaço real no
    // DOM, para bater com o CaptionLayer), expor isto a leitor de tela leria
    // as palavras coladas ("olámundo") — pior que não anunciar nada.
    <div className="absolute inset-x-0 bottom-0 flex justify-center pointer-events-none"
      aria-hidden="true"
      style={{ marginBottom: style ? style.bottom * scale : undefined }}>
      <p
        className={`text-center${draggable ? " pointer-events-auto cursor-ns-resize select-none" : ""}`}
        onPointerDown={draggable ? onPointerDown : undefined}
        onPointerMove={draggable ? onPointerMove : undefined}
        onPointerUp={draggable ? endDrag : undefined}
        onPointerCancel={draggable ? endDrag : undefined}
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
