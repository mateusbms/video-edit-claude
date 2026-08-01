import React, { useEffect, useState } from "react";
import { Stepper } from "./components/Stepper";
import { ProjectsScreen } from "./ProjectsScreen";
import { loadState, saveState } from "./state";
import { getJob } from "./api";
import { UploadStep } from "./steps/UploadStep";
import { CutsStep } from "./steps/CutsStep";
import { TranscriptStep } from "./steps/TranscriptStep";
import { HookStep } from "./steps/HookStep";
import { OverlaysStep } from "./steps/OverlaysStep";
import { RenderStep } from "./steps/RenderStep";
import type { StepProps } from "./App";

// Matriz = projeto só do corpo (sem hook falado): o wizard fica curto — sem
// Hook (não há o que editar ainda) nem Render (a variação é quem renderiza).
// Textos aqui é o mesmo OverlaysStep, reaproveitado como último passo.
const NORMAL: [React.ComponentType<StepProps>[], readonly string[]] = [
  [UploadStep, CutsStep, TranscriptStep, HookStep, OverlaysStep, RenderStep],
  ["Upload", "Cortes", "Transcrição", "Hook", "Textos", "Render"],
];
const MATRIZ: [React.ComponentType<StepProps>[], readonly string[]] = [
  [UploadStep, CutsStep, TranscriptStep, OverlaysStep],
  ["Upload", "Cortes", "Transcrição", "Textos"],
];

export function RecordedWizard() {
  const initial = loadState();
  const [slug, setSlug] = useState(initial.slug);
  const [step, setStep] = useState(initial.step);
  // Um projeto novo ainda não tem slug, mas também não é "estar na lista".
  // Este estado não é persistido de propósito: recarregar a página no meio de
  // um projeto sem vídeo nenhum volta para a lista, que é o lugar certo.
  const [criando, setCriando] = useState(false);
  const [papel, setPapel] = useState<"normal" | "matriz">("normal");

  useEffect(() => { saveState({ slug, step }); }, [slug, step]);

  // papel vem do servidor (sobrevive a reload no meio de uma matriz).
  useEffect(() => {
    if (!slug) { setPapel("normal"); return; }
    let vivo = true;
    getJob(slug).then((j) => { if (vivo && j?.papel) setPapel(j.papel); }).catch(() => {});
    return () => { vivo = false; };
  }, [slug]);

  const [Steps, labels] = papel === "matriz" ? MATRIZ : NORMAL;
  const ultimo = Steps.length - 1;

  const next = () => setStep((s) => Math.min(ultimo, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  const voltarParaLista = () => { setCriando(false); setSlug(""); setStep(0); };

  // A troca de papel (após o fetch acima resolver) pode deixar `step`
  // apontando para um passo que só existia na lista NORMAL — sem esta guarda
  // o wizard tentaria renderizar Steps[step] com step fora do array.
  useEffect(() => { if (step > ultimo) setStep(ultimo); }, [ultimo, step]);

  if (!slug && !criando) {
    return (
      <ProjectsScreen
        onOpen={(s: string, stepInicial = 0) => { setSlug(s); setStep(stepInicial); }}
        onNew={() => { setCriando(true); setStep(0); }}
      />
    );
  }

  const Current = Steps[step];
  const naUltima = papel === "matriz" && step === ultimo;

  return (
    <main className="min-h-screen p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-semibold">Edit Local</h1>
        <button onClick={voltarParaLista} className="px-3 py-1 bg-zinc-800 rounded text-sm">
          ← Projetos
        </button>
      </div>
      <Stepper step={step} onJump={setStep} labels={labels} />
      {naUltima ? (
        <Current slug={slug} setSlug={setSlug} next={voltarParaLista} back={back} nextLabel="Concluir" />
      ) : (
        <Current slug={slug} setSlug={setSlug} next={next} back={back} />
      )}
    </main>
  );
}
