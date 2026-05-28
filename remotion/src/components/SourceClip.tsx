import { AbsoluteFill, OffthreadVideo, staticFile, useVideoConfig } from "remotion";
import type { TSegment } from "../schema";

type ClipSeg = Extract<TSegment, { type: "clip" }>;

export const SourceClip: React.FC<{ seg: ClipSeg; sourceWidth: number; sourceHeight: number }> = ({
  seg,
  sourceWidth,
  sourceHeight,
}) => {
  const { width, height } = useVideoConfig();

  // escala para "cobrir" o frame de saída
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const scaledW = sourceWidth * scale;
  const scaledH = sourceHeight * scale;

  // foco horizontal: focusX em [0,1] sobre a largura escalada
  const maxOffsetX = Math.max(0, scaledW - width);
  const offsetX = -(maxOffsetX * seg.reframe.focusX);
  const offsetY = -(Math.max(0, scaledH - height) / 2);

  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: "#000" }}>
      <OffthreadVideo
        src={staticFile(seg.source)}
        trimBefore={seg.inFrame}
        trimAfter={seg.outFrame}
        style={{
          position: "absolute",
          width: scaledW,
          height: scaledH,
          left: offsetX,
          top: offsetY,
        }}
      />
    </AbsoluteFill>
  );
};
