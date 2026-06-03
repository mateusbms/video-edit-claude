import { useEffect, useState } from "react";
import { useAppStore } from "../../state";
import { listBrandKits, BrandKit } from "../../animatedApi";
import { BrandKitModal } from "../../components/BrandKitModal";

export function BrandStep({ onNext }: { onNext: () => void }) {
  const slug = useAppStore((s) => s.animatedState.brandKitSlug);
  const setAnimatedState = useAppStore((s) => s.setAnimatedState);
  const [kits, setKits] = useState<BrandKit[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const k = await listBrandKits();
      setKits(k);
    } finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);

  const select = (s: string) =>
    setAnimatedState((st) => ({ ...st, brandKitSlug: s }));

  return (
    <div style={{ padding: 32 }}>
      <h2>Brand Kit</h2>
      {loading && <p>Carregando...</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {kits.map((k) => (
          <button
            key={k.slug}
            onClick={() => select(k.slug)}
            style={{
              padding: 16, borderRadius: 8,
              border: `2px solid ${slug === k.slug ? "#16a34a" : "#e2e2dc"}`,
              background: "#fff", textAlign: "left", cursor: "pointer",
            }}
          >
            {k.name}
          </button>
        ))}
      </div>
      <button onClick={() => setModalOpen(true)} style={{ marginTop: 16 }}>
        + Novo kit
      </button>
      <div style={{ marginTop: 24 }}>
        <button
          onClick={onNext}
          disabled={!slug}
        >
          Próximo
        </button>
      </div>
      <BrandKitModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={(kit) => {
          setKits((prev) => [...prev, kit]);
          select(kit.slug);
        }}
      />
    </div>
  );
}
