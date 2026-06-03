import React from "react";
import { AbsoluteFill, Audio, Series } from "remotion";
import { ThemeProvider } from "./theme/Provider";
import { Scene01Intro } from "./scenes/Scene01Intro";
import { Scene02Signups } from "./scenes/Scene02Signups";
import { Scene03Pain } from "./scenes/Scene03Pain";
import { Scene04Agitation } from "./scenes/Scene04Agitation";
import { Scene05Relief } from "./scenes/Scene05Relief";
import { Scene06Templates } from "./scenes/Scene06Templates";
import { Scene06bEmailPreview } from "./scenes/Scene06bEmailPreview";
import { Scene07Automation } from "./scenes/Scene07Automation";
import { Scene08Metrics } from "./scenes/Scene08Metrics";
import { Scene09MicDrop } from "./scenes/Scene09MicDrop";
import { Scene10CTA } from "./scenes/Scene10CTA";

const SCENE_MAP: Record<string, React.FC<any>> = {
  s01: Scene01Intro,
  s02: Scene02Signups,
  s03: Scene03Pain,
  s04: Scene04Agitation,
  s05: Scene05Relief,
  s06: Scene06Templates,
  s06b: Scene06bEmailPreview,
  s07: Scene07Automation,
  s08: Scene08Metrics,
  s09: Scene09MicDrop,
  s10: Scene10CTA,
};

export const AnimatedRoot: React.FC<any> = (recipe) => {
  return (
    <ThemeProvider value={recipe.brand}>
      <AbsoluteFill style={{ backgroundColor: recipe.brand?.colors?.bg }}>
        <Series>
          {recipe.scenes.map((s: any) => {
            const SceneComp = SCENE_MAP[s.id];
            return (
              <Series.Sequence key={s.id} durationInFrames={s.durationInFrames}>
                <SceneComp
                  text={s.text}
                  durationInFrames={s.durationInFrames}
                  audioSrc={s.audio}
                  productName={recipe.brand?.name}
                  logoSrc={`/brand/${recipe.brand?.slug}/logo.png`}
                />
              </Series.Sequence>
            );
          })}
        </Series>
        {recipe.musicSrc && recipe.musicStartFrame !== undefined && (
          <Audio
            src={recipe.musicSrc}
            startFrom={recipe.musicStartFrame}
            volume={recipe.musicVolume}
          />
        )}
      </AbsoluteFill>
    </ThemeProvider>
  );
};
