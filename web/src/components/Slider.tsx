export const Slider: React.FC<{
  label: string; value: number; min: number; max: number; step: number;
  onChange: (n: number) => void; format?: (n: number) => string;
  // uma linha sobre o IMPACTO do ajuste ("mais alto = X · mais baixo = Y"),
  // não sobre a mecânica — o rótulo já diz o que o controle é
  hint?: string;
}> = ({ label, value, min, max, step, onChange, format, hint }) => (
  <label className="block">
    <div className="flex justify-between text-sm">
      <span className="text-zinc-400">{label}</span>
      <span className="font-mono">{format ? format(value) : value}</span>
    </div>
    <input
      type="range" min={min} max={max} step={step} value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full"
    />
    {hint && <p className="text-xs text-zinc-500 mt-0.5">{hint}</p>}
  </label>
);
