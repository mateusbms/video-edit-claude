import { AbsoluteFill, OffthreadVideo, staticFile, useVideoConfig } from "remotion";
import type { TSegment } from "../schema";

type ClipSeg = Extract<TSegment, { type: "clip" }>;

const ASPECT_TOLERANCE = 0.1; // 10% — abaixo disso considera "mesmo formato"

export const SourceClip: React.FC<{ seg: ClipSeg; sourceWidth: number; sourceHeight: number }> = ({
  seg,
  sourceWidth,
  sourceHeight,
}) => {
  const { width, height } = useVideoConfig();
  const src = staticFile(seg.source);

  const sourceAspect = sourceWidth / sourceHeight;
  const outputAspect = width / height;
  const aspectMismatch = Math.abs(sourceAspect - outputAspect) / outputAspect;

  // Quando os aspects são próximos (ex.: landscape→landscape) usamos cover com focusX.
  if (aspectMismatch <= ASPECT_TOLERANCE) {
    const scale = Math.max(width / sourceWidth, height / sourceHeight);
    const scaledW = sourceWidth * scale;
    const scaledH = sourceHeight * scale;
    const maxOffsetX = Math.max(0, scaledW - width);
    const offsetX = -(maxOffsetX * seg.reframe.focusX);
    const offsetY = -(Math.max(0, scaledH - height) / 2);
    return (
      <AbsoluteFill style={{ overflow: "hidden", backgroundColor: "#000" }}>
        <OffthreadVideo
          src={src}
          trimBefore={seg.inFrame}
          trimAfter={seg.outFrame}
          style={{ position: "absolute", width: scaledW, height: scaledH, left: offsetX, top: offsetY }}
        />
      </AbsoluteFill>
    );
  }

  // Aspect diferente (vertical→landscape ou landscape→vertical): fit + blur.
  // Background: cobre o frame inteiro, com blur pesado.
  const bgScale = Math.max(width / sourceWidth, height / sourceHeight);
  const bgW = sourceWidth * bgScale;
  const bgH = sourceHeight * bgScale;
  const bgX = -(bgW - width) / 2;
  const bgY = -(bgH - height) / 2;

  // Foreground: caber dentro do frame, centralizado.
  const fgScale = Math.min(width / sourceWidth, height / sourceHeight);
  const fgW = sourceWidth * fgScale;
  const fgH = sourceHeight * fgScale;
  const fgX = (width - fgW) / 2;
  const fgY = (height - fgH) / 2;

  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: "#000" }}>
      <OffthreadVideo
        src={src}
        trimBefore={seg.inFrame}
        trimAfter={seg.outFrame}
        muted
        style={{
          position: "absolute",
          width: bgW,
          height: bgH,
          left: bgX,
          top: bgY,
          filter: "blur(40px) brightness(0.55) saturate(1.1)",
          transform: "scale(1.15)", // evita bordas brancas do blur
          transformOrigin: "center",
        }}
      />
      <OffthreadVideo
        src={src}
        trimBefore={seg.inFrame}
        trimAfter={seg.outFrame}
        style={{
          position: "absolute",
          width: fgW,
          height: fgH,
          left: fgX,
          top: fgY,
          borderRadius: 0,
        }}
      />
    </AbsoluteFill>
  );
};
