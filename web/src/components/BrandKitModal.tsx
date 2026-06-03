import React, { useState } from "react";
import { BrandKitSchema } from "../schemas/brandKit";
import { createBrandKit, type BrandKit } from "../animatedApi";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (kit: BrandKit) => void;
};

const FONT_OPTIONS = ["Inter", "Instrument Serif", "Roboto", "Arial"];

const DEFAULTS = {
  name: "",
  colors: {
    bg: "#f5f5f0",
    card: "#ffffff",
    border: "#e2e2dc",
    foreground: "#262622",
    muted: "#757568",
    accent: "#16a34a",
    accentLight: "rgba(22,163,74,0.12)",
  },
  fonts: { body: "Inter", headline: "Instrument Serif" },
};

type ColorKey = keyof typeof DEFAULTS.colors;

const COLOR_LABELS: { key: ColorKey; label: string; isText?: boolean }[] = [
  { key: "bg", label: "Background" },
  { key: "card", label: "Card" },
  { key: "border", label: "Border" },
  { key: "foreground", label: "Foreground" },
  { key: "muted", label: "Muted" },
  { key: "accent", label: "Accent" },
  { key: "accentLight", label: "Accent Light", isText: true },
];

export const BrandKitModal: React.FC<Props> = ({ open, onClose, onCreated }) => {
  const [name, setName] = useState(DEFAULTS.name);
  const [colors, setColors] = useState(DEFAULTS.colors);
  const [fonts, setFonts] = useState(DEFAULTS.fonts);
  const [logo, setLogo] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const validation = BrandKitSchema.safeParse({ name, colors, fonts });
  const isValid = validation.success && logo !== null && !submitting;

  const setColor = (key: ColorKey, value: string) =>
    setColors((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || !logo) return;
    setSubmitting(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("name", name);
      fd.append("colors_bg", colors.bg);
      fd.append("colors_card", colors.card);
      fd.append("colors_border", colors.border);
      fd.append("colors_foreground", colors.foreground);
      fd.append("colors_muted", colors.muted);
      fd.append("colors_accent", colors.accent);
      fd.append("colors_accentLight", colors.accentLight);
      fd.append("fonts_body", fonts.body);
      fd.append("fonts_headline", fonts.headline);
      fd.append("logo", logo);
      const kit = await createBrandKit(fd);
      onCreated(kit);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar kit");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50,
      }}
    >
      <div
        style={{
          background: "#18181b", borderRadius: 12, padding: 32,
          width: 480, maxHeight: "90vh", overflowY: "auto",
          color: "#f4f4f5",
        }}
      >
        <h2 style={{ margin: "0 0 20px", fontSize: 20, fontWeight: 600 }}>Novo Brand Kit</h2>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Name */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label htmlFor="bk-name" style={{ fontSize: 13, color: "#a1a1aa" }}>Nome</label>
            <input
              id="bk-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Acme Corp"
              style={{
                background: "#27272a", border: "1px solid #3f3f46",
                borderRadius: 6, padding: "8px 12px", color: "#f4f4f5", fontSize: 14,
              }}
            />
          </div>

          {/* Colors */}
          <fieldset style={{ border: "1px solid #3f3f46", borderRadius: 8, padding: "12px 16px" }}>
            <legend style={{ fontSize: 13, color: "#a1a1aa", padding: "0 4px" }}>Cores</legend>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {COLOR_LABELS.map(({ key, label, isText }) => (
                <div key={key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <label
                    htmlFor={`bk-color-${key}`}
                    style={{ fontSize: 13, color: "#a1a1aa", width: 100, flexShrink: 0 }}
                  >
                    {label}
                  </label>
                  {!isText && (
                    <input
                      type="color"
                      value={colors[key]}
                      onChange={(e) => setColor(key, e.target.value)}
                      style={{ width: 32, height: 28, padding: 2, cursor: "pointer",
                        border: "1px solid #3f3f46", borderRadius: 4, background: "#27272a" }}
                      aria-label={`${label} color picker`}
                    />
                  )}
                  <input
                    id={`bk-color-${key}`}
                    type="text"
                    value={colors[key]}
                    onChange={(e) => setColor(key, e.target.value)}
                    style={{
                      flex: 1, background: "#27272a", border: "1px solid #3f3f46",
                      borderRadius: 6, padding: "6px 10px", color: "#f4f4f5", fontSize: 13,
                      fontFamily: "monospace",
                    }}
                  />
                </div>
              ))}
            </div>
          </fieldset>

          {/* Fonts */}
          <fieldset style={{ border: "1px solid #3f3f46", borderRadius: 8, padding: "12px 16px" }}>
            <legend style={{ fontSize: 13, color: "#a1a1aa", padding: "0 4px" }}>Fontes</legend>
            <div style={{ display: "flex", gap: 16 }}>
              {(["body", "headline"] as const).map((fk) => (
                <div key={fk} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                  <label htmlFor={`bk-font-${fk}`} style={{ fontSize: 13, color: "#a1a1aa" }}>
                    {fk === "body" ? "Body" : "Headline"}
                  </label>
                  <select
                    id={`bk-font-${fk}`}
                    value={fonts[fk]}
                    onChange={(e) => setFonts((prev) => ({ ...prev, [fk]: e.target.value }))}
                    style={{
                      background: "#27272a", border: "1px solid #3f3f46", borderRadius: 6,
                      padding: "7px 10px", color: "#f4f4f5", fontSize: 13,
                    }}
                  >
                    {FONT_OPTIONS.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </fieldset>

          {/* Logo */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label htmlFor="bk-logo" style={{ fontSize: 13, color: "#a1a1aa" }}>Logo</label>
            <input
              id="bk-logo"
              type="file"
              accept="image/*"
              onChange={(e) => setLogo(e.target.files?.[0] ?? null)}
              style={{ fontSize: 13, color: "#a1a1aa" }}
            />
          </div>

          {error && (
            <p style={{ color: "#f87171", fontSize: 13, margin: 0 }}>{error}</p>
          )}

          {/* Actions */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              style={{
                padding: "8px 20px", borderRadius: 6, border: "1px solid #3f3f46",
                background: "transparent", color: "#a1a1aa", cursor: "pointer", fontSize: 14,
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!isValid}
              style={{
                padding: "8px 20px", borderRadius: 6, border: "none",
                background: isValid ? "#16a34a" : "#27272a",
                color: isValid ? "#fff" : "#52525b",
                cursor: isValid ? "pointer" : "not-allowed", fontSize: 14, fontWeight: 600,
              }}
            >
              {submitting ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
