import type { CaptionLine } from "../types";
import { activeLineIndex } from "../util";

export const CaptionOverlay: React.FC<{
  lines: CaptionLine[];
  currentTime: number;
  style?: { fontSize: number; bottom: number; color: string; highlightColor: string; fontFamily: string };
  scale?: number;
}> = ({ lines, currentTime, style, scale = 1 }) => {
  const li = activeLineIndex(lines, currentTime);
  if (li < 0) return null;
  const line = lines[li];
  return (
    <div className="absolute inset-x-0 bottom-0 flex justify-center pointer-events-none"
      style={{ marginBottom: style ? style.bottom * scale : undefined }}>
      <p className="bg-black/70 px-3 py-1 rounded font-semibold max-w-[90%] text-center"
        style={{
          fontSize: style ? style.fontSize * scale : undefined,
          color: style?.color || "#fff",
          fontFamily: style?.fontFamily || undefined,
        }}>
        {line.words.map((w, wi) => {
          const active = currentTime >= w.start && currentTime < w.end;
          return (
            <span key={wi} data-active={active}
              style={active ? { color: style?.highlightColor || "#22c55e" } : undefined}>
              {w.word}
              {wi < line.words.length - 1 ? " " : ""}
            </span>
          );
        })}
      </p>
    </div>
  );
};
