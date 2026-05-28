export const ProgressBar: React.FC<{ label: string; n: number; total: number }> = ({ label, n, total }) => {
  const pct = total > 0 ? Math.min(100, Math.round((n / total) * 100)) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-zinc-400">{label}</span>
        <span className="font-mono">{n}/{total} ({pct}%)</span>
      </div>
      <div className="h-2 bg-zinc-800 rounded overflow-hidden">
        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};
