import { useAppStore } from "./state";
import { ModeSelect } from "./steps/ModeSelect";
import { RecordedWizard } from "./RecordedWizard";
import { AnimatedWizard } from "./AnimatedWizard";

export type StepProps = {
  slug: string; setSlug: (s: string) => void;
  next: () => void; back: () => void;
};

export const App = () => {
  const mode = useAppStore((s) => s.mode);
  if (mode === null) return <ModeSelect />;
  if (mode === "recorded") return <RecordedWizard />;
  return <AnimatedWizard />;
};
