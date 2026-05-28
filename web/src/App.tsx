import { useEffect, useState } from "react";
import { Stepper } from "./components/Stepper";
import { loadState, saveState } from "./state";
import { UploadStep } from "./steps/UploadStep";
import { CutsStep } from "./steps/CutsStep";
import { TranscriptStep } from "./steps/TranscriptStep";
import { HookStep } from "./steps/HookStep";
import { RenderStep } from "./steps/RenderStep";

export type StepProps = {
  slug: string; setSlug: (s: string) => void;
  next: () => void; back: () => void;
};

export const App = () => {
  const initial = loadState();
  const [slug, setSlug] = useState(initial.slug);
  const [step, setStep] = useState(initial.step);

  useEffect(() => { saveState({ slug, step }); }, [slug, step]);

  const next = () => setStep((s) => Math.min(4, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  const Steps = [UploadStep, CutsStep, TranscriptStep, HookStep, RenderStep];
  const Current = Steps[step];

  return (
    <main className="min-h-screen p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-semibold mb-6">Edit Local</h1>
      <Stepper step={step} onJump={setStep} />
      <Current slug={slug} setSlug={setSlug} next={next} back={back} />
    </main>
  );
};
