// Fontes disponíveis nos seletores do editor.
// Deve espelhar SUPPORTED_FONTS em remotion/src/fonts.ts (o render só carrega essas).
export const FONTS = [
  "Inter",
  "Poppins",
  "Montserrat",
  "Roboto",
  "DM Serif Display",
  "Plus Jakarta Sans",
] as const;

// Padrão do editor. Espelha DEFAULT_CAPTION_FONT/DEFAULT_HOOK_FONT/
// DEFAULT_TEXT_FONT no backend: é o que o render usa quando o job não escolheu
// fonte e não há brand kit, então é também o que os seletores devem mostrar.
export const DEFAULT_FONT = "Plus Jakarta Sans";
