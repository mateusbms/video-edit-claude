import { Composition } from "remotion";
import { Main16x9 } from "./Main16x9";
import { Vertical9x16 } from "./Vertical9x16";
import { AnimatedRoot } from "./animated/AnimatedRoot";
import { zEditRecipe, AnimatedRecipeSchema, type TEditRecipe } from "./schema";
import { formatMetadata, type FormatKey } from "./recipe-metadata";
import { sampleRecipe, defaultAnimatedRecipe16x9, defaultAnimatedRecipe9x16 } from "./sample-recipe";

const calc = (format: FormatKey) => ({ props }: { props: TEditRecipe }) =>
  formatMetadata(zEditRecipe.parse(props), format);

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Recorded16x9"
        component={Main16x9}
        defaultProps={sampleRecipe}
        schema={zEditRecipe}
        calculateMetadata={calc("main16x9")}
        durationInFrames={1}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="Recorded9x16"
        component={Vertical9x16}
        defaultProps={sampleRecipe}
        schema={zEditRecipe}
        calculateMetadata={calc("vertical9x16")}
        durationInFrames={1}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="Animated16x9"
        component={AnimatedRoot}
        schema={AnimatedRecipeSchema}
        defaultProps={defaultAnimatedRecipe16x9}
        durationInFrames={1}
        fps={30}
        width={1920}
        height={1080}
        calculateMetadata={({ props }) => ({
          durationInFrames: props.scenes.reduce((a, s) => a + s.durationInFrames, 0),
        })}
      />
      <Composition
        id="Animated9x16"
        component={AnimatedRoot}
        schema={AnimatedRecipeSchema}
        defaultProps={defaultAnimatedRecipe9x16}
        durationInFrames={1}
        fps={30}
        width={1080}
        height={1920}
        calculateMetadata={({ props }) => ({
          durationInFrames: props.scenes.reduce((a, s) => a + s.durationInFrames, 0),
        })}
      />
    </>
  );
};
