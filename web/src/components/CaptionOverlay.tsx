import type { CaptionLine } from "../types";
import { activeLineIndex } from "../util";

export const CaptionOverlay: React.FC<{ lines: CaptionLine[]; currentTime: number }> = ({
  lines, currentTime,
}) => {
  const li = activeLineIndex(lines, currentTime);
  if (li < 0) return null;
  const line = lines[li];
  return (
    <div className="absolute inset-x-0 bottom-4 flex justify-center pointer-events-none">
      <p className="bg-black/70 text-white px-3 py-1 rounded text-lg font-semibold max-w-[90%] text-center">
        {line.words.map((w, wi) => {
          const active = currentTime >= w.start && currentTime < w.end;
          return (
            <span key={wi} data-active={active}
              className={active ? "text-emerald-400" : undefined}>
              {w.word}
              {wi < line.words.length - 1 ? " " : ""}
            </span>
          );
        })}
      </p>
    </div>
  );
};
