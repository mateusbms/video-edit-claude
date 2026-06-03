import React from "react";
import { AbsoluteFill, Series } from "remotion";
import { z } from "zod";
import { AnimatedRecipeSchema } from "../schema";

export const AnimatedRoot: React.FC<z.infer<typeof AnimatedRecipeSchema>> = (recipe) => {
  return (
    <AbsoluteFill style={{ backgroundColor: recipe.brand.colors.bg }}>
      <Series>
        {recipe.scenes.map((s) => (
          <Series.Sequence key={s.id} durationInFrames={s.durationInFrames}>
            <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
              <div style={{ color: recipe.brand.colors.foreground, fontSize: 48 }}>
                {s.id}: {s.text.slice(0, 60)}
              </div>
            </AbsoluteFill>
          </Series.Sequence>
        ))}
      </Series>
    </AbsoluteFill>
  );
};
