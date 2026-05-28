const STEPS = ["Upload", "Cortes", "Transcrição", "Hook", "Render"];

export const Stepper: React.FC<{ step: number; onJump: (s: number) => void }> = ({ step, onJump }) => (
  <ol className="flex gap-2 mb-8">
    {STEPS.map((label, i) => {
      const done = i < step;
      const current = i === step;
      return (
        <li key={label} className="flex-1">
          <button
            onClick={() => i <= step && onJump(i)}
            disabled={i > step}
            className={[
              "w-full px-3 py-2 rounded text-sm font-medium transition-colors",
              current ? "bg-emerald-600 text-white" :
              done ? "bg-zinc-800 text-zinc-100 hover:bg-zinc-700" :
              "bg-zinc-900 text-zinc-500 cursor-not-allowed",
            ].join(" ")}
          >
            {i + 1}. {label}
          </button>
        </li>
      );
    })}
  </ol>
);
