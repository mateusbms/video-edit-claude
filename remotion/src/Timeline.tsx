import { AbsoluteFill, Sequence } from "remotion";
import { theme } from "./theme";
import { segmentDuration } from "./timeline-utils";
import { HookCard } from "./components/HookCard";
import { SourceClip } from "./components/SourceClip";
import { CaptionLayer } from "./components/CaptionLayer";
import { OverlayLayer } from "./components/OverlayLayer";
import type { TEditRecipe } from "./schema";

export const Timeline: React.FC<{ recipe: TEditRecipe; captionFontSize: number; captionBottom: number }> = ({
  recipe,
  captionFontSize,
  captionBottom,
}) => {
  let offset = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: theme.colors.bg }}>
      {recipe.segments.map((seg, i) => {
        const dur = segmentDuration(seg);
        const from = offset;
        offset += dur;
        return (
          <Sequence key={i} from={from} durationInFrames={dur}>
            {seg.type === "card" ? (
              <HookCard title={seg.title} subtitle={seg.subtitle} />
            ) : seg.type === "clip" ? (
              <SourceClip
                seg={seg}
                sourceWidth={recipe.source.width}
                sourceHeight={recipe.source.height}
              />
            ) : null /* scene: v2 */}
          </Sequence>
        );
      })}
      <CaptionLayer captions={recipe.captions} fontSize={captionFontSize} bottom={captionBottom} />
      <OverlayLayer overlays={recipe.overlays} />
    </AbsoluteFill>
  );
};
