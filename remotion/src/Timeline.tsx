import { AbsoluteFill, Sequence } from "remotion";
import { theme } from "./theme";
import { segmentDuration } from "./timeline-utils";
import { SourceClip } from "./components/SourceClip";
import { CaptionLayer } from "./components/CaptionLayer";
import { OverlayLayer } from "./components/OverlayLayer";
import type { TEditRecipe } from "./schema";

export const Timeline: React.FC<{ recipe: TEditRecipe }> = ({ recipe }) => {
  let offset = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: theme.colors.bg }}>
      {recipe.segments.map((seg, i) => {
        const dur = segmentDuration(seg);
        const from = offset;
        offset += dur;
        return (
          <Sequence key={i} from={from} durationInFrames={dur}>
            {seg.type === "clip" ? (
              <SourceClip
                seg={seg}
                sourceWidth={recipe.source.width}
                sourceHeight={recipe.source.height}
              />
            ) : null /* card removido (Fase B); scene: v2 */}
          </Sequence>
        );
      })}
      <CaptionLayer captions={recipe.captions} style={recipe.captionStyle} />
      <OverlayLayer overlays={recipe.overlays} />
    </AbsoluteFill>
  );
};
