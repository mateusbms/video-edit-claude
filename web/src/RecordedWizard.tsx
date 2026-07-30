import React, { useEffect, useState } from "react";
import { Stepper } from "./components/Stepper";
import { ProjectsScreen } from "./ProjectsScreen";
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
  // Um projeto novo ainda não tem slug, mas também não é "estar na lista".
  // Este estado não é persistido de propósito: recarregar a página no meio de
  // um projeto sem vídeo nenhum volta para a lista, que é o lugar certo.
  const [criando, setCriando] = useState(false);

  useEffect(() => { saveState({ slug, step }); }, [slug, step]);

  const next = () => setStep((s) => Math.min(5, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  const voltarParaLista = () => { setCriando(false); setSlug(""); setStep(0); };

  if (!slug && !criando) {
    return (
      <ProjectsScreen
        onOpen={(s) => { setSlug(s); setStep(0); }}
        onNew={() => { setCriando(true); setStep(0); }}
      />
    );
  }

  const Steps: React.ComponentType<StepProps>[] = [UploadStep, CutsStep, TranscriptStep, HookStep, OverlaysStep, RenderStep];
  const Current = Steps[step];

  return (
    <main className="min-h-screen p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-semibold">Edit Local</h1>
        <button onClick={voltarParaLista} className="px-3 py-1 bg-zinc-800 rounded text-sm">
          ← Projetos
        </button>
      </div>
      <Stepper step={step} onJump={setStep} />
      <Current slug={slug} setSlug={setSlug} next={next} back={back} />
    </main>
  );
}
