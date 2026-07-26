import { useAppStore } from "../state";

export function ModeSelect() {
  const setMode = useAppStore((s) => s.setMode);
  return (
    <main className="min-h-screen p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-semibold mb-1">Edit Local</h1>
      <p className="text-zinc-400 mb-8">Escolha como quer começar.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <button
          onClick={() => setMode("recorded")}
          className="text-left rounded-2xl border border-zinc-800 bg-zinc-900 p-6 transition-colors hover:border-emerald-600 hover:bg-zinc-800/70 focus:outline-none focus:ring-2 focus:ring-emerald-600"
        >
          <h2 className="text-xl font-semibold text-zinc-100 mb-2">🎬 Editar gravação</h2>
          <p className="text-sm text-zinc-400">
            Suba seu vídeo, corte silêncios, transcreva, adicione hook e textos
            sobre o vídeo, e renderize.
          </p>
        </button>
        <button
          onClick={() => setMode("animated")}
          className="text-left rounded-2xl border border-zinc-800 bg-zinc-900 p-6 transition-colors hover:border-emerald-600 hover:bg-zinc-800/70 focus:outline-none focus:ring-2 focus:ring-emerald-600"
        >
          <h2 className="text-xl font-semibold text-zinc-100 mb-2">✨ Gerar animado</h2>
          <p className="text-sm text-zinc-400">
            Produza um vídeo de produto estilo Sendkit usando seu brand kit.
          </p>
        </button>
      </div>
    </main>
  );
}
