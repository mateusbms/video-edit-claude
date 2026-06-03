import { useState } from "react";
import { Stepper } from "./components/Stepper";
import { BrandStep } from "./steps/animated/BrandStep";
import { ScriptStep } from "./steps/animated/ScriptStep";
import { AudioStep } from "./steps/animated/AudioStep";
import { ReviewStep } from "./steps/animated/ReviewStep";
import { RenderStep } from "./steps/animated/RenderStep";

const TOTAL_STEPS = 5;
const LABELS = ["Brand Kit", "Script", "Áudio", "Revisão", "Render"] as const;

export function AnimatedWizard() {
  const [i, setI] = useState(0);
  const next = () => setI((x) => Math.min(x + 1, TOTAL_STEPS - 1));
  return (
    <div>
      <Stepper step={i} onJump={setI} labels={LABELS} />
      {i === 0 && <BrandStep onNext={next} />}
      {i === 1 && <ScriptStep onNext={next} />}
      {i === 2 && <AudioStep onNext={next} />}
      {i === 3 && <ReviewStep onNext={next} />}
      {i === 4 && <RenderStep />}
    </div>
  );
}
