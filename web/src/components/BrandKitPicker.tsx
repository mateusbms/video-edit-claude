import { useEffect, useState } from "react";
import { listBrandKits, type BrandKit } from "../animatedApi";
import { BrandKitModal } from "./BrandKitModal";

type Props = {
  value: string;
  onChange: (slug: string) => void;
};

export function BrandKitPicker({ value, onChange }: Props) {
  const [kits, setKits] = useState<BrandKit[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalMode, setModalMode] = useState<"none" | "create" | "edit">("none");

  const refresh = async () => {
    setLoading(true);
    try {
      setKits(await listBrandKits());
    } catch {
      // sem conexão com a API ainda / erro de rede: mantém a lista atual
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const selectedKit = kits.find((k) => k.slug === value);

  const handleSaved = (kit: BrandKit) => {
    setKits((prev) => {
      const idx = prev.findIndex((k) => k.slug === kit.slug);
      if (idx === -1) return [...prev, kit];
      const copy = [...prev];
      copy[idx] = kit;
      return copy;
    });
    onChange(kit.slug);
    setModalMode("none");
  };

  return (
    <div className="flex flex-col gap-2">
      {loading && <p className="text-sm text-zinc-400">Carregando kits…</p>}
      <div className="flex flex-wrap gap-2">
        {kits.map((k) => (
          <button
            key={k.slug}
            type="button"
            onClick={() => onChange(k.slug)}
            className={`px-3 py-1.5 rounded border text-sm ${
              value === k.slug
                ? "border-emerald-500 bg-emerald-600/20 text-emerald-300"
                : "border-zinc-800 bg-zinc-900 text-zinc-200 hover:border-zinc-700"
            }`}
          >
            {k.name}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setModalMode("create")}
          className="px-3 py-1.5 rounded bg-zinc-800 text-sm text-zinc-100"
        >
          + Novo
        </button>
        <button
          type="button"
          onClick={() => setModalMode("edit")}
          disabled={!selectedKit}
          className="px-3 py-1.5 rounded bg-zinc-800 text-sm text-zinc-100 disabled:opacity-40"
        >
          Editar
        </button>
      </div>
      <BrandKitModal
        open={modalMode !== "none"}
        editing={modalMode === "edit" ? selectedKit : undefined}
        onClose={() => setModalMode("none")}
        onCreated={handleSaved}
      />
    </div>
  );
}
