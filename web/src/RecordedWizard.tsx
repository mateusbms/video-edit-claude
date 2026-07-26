import React, { useEffect, useState } from "react";
import { Stepper } from "./components/Stepper";
import { loadState, saveState } from "./state";
import { UploadStep } from "./steps/UploadStep";
import { CutsStep } from "./steps/CutsStep";
import { TranscriptStep } from "./steps/TranscriptStep";
import { HookStep } from "./steps/HookStep";
import { OverlaysStep } from "./steps/OverlaysStep";
import { RenderStep } from "./steps/RenderStep";
import type { StepProps } from "./App";

export function RecordedWizard() {
  const initial = loadState();
  const [slug, setSlug] = useState(initial.slug);
  const [step, setStep] = useState(initial.step);

  useEffect(() => { saveState({ slug, step }); }, [slug, step]);

  const next = () => setStep((s) => Math.min(5, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  const Steps: React.ComponentType<StepProps>[] = [UploadStep, CutsStep, TranscriptStep, HookStep, OverlaysStep, RenderStep];
  const Current = Steps[step];

  return (
    <main className="min-h-screen p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-semibold mb-6">Edit Local</h1>
      <Stepper step={step} onJump={setStep} />
      <Current slug={slug} setSlug={setSlug} next={next} back={back} />
    </main>
  );
}
