import { useAppStore } from "./state";
import { ModeSelect } from "./steps/ModeSelect";
import { RecordedWizard } from "./RecordedWizard";
import { AnimatedWizard } from "./AnimatedWizard";

export type StepProps = {
  slug: string; setSlug: (s: string) => void;
  next: () => void; back: () => void;
  // rótulo do botão "Próximo" do rodapé; usado no último passo da matriz
  // ("Concluir" em vez de "Próximo →" — spec 2026-08-01-variacoes-de-hook)
  nextLabel?: string;
};

export const App = () => {
  const mode = useAppStore((s) => s.mode);
  if (mode === null) return <ModeSelect />;
  if (mode === "recorded") return <RecordedWizard />;
  return <AnimatedWizard />;
};
