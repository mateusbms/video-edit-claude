import { Timeline } from "./Timeline";
import type { TEditRecipe } from "./schema";

export const Vertical9x16: React.FC<TEditRecipe> = (recipe) => {
  return <Timeline recipe={recipe} captionFontSize={64} captionBottom={320} />;
};
