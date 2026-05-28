import { Timeline } from "./Timeline";
import type { TEditRecipe } from "./schema";

export const Main16x9: React.FC<TEditRecipe> = (recipe) => {
  return <Timeline recipe={recipe} captionFontSize={48} captionBottom={120} />;
};
