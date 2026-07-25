# Design — Fase A: legendas editáveis + brand kit no modo gravado

**Data:** 2026-07-24
**Status:** aprovado (pré-implementação)

## Problema

No modo gravado, o estilo das legendas queimadas (tamanho, posição, cor, cor de
destaque, fonte) é **hardcoded** em `Main16x9.tsx`/`CaptionLayer.tsx` e não é editável. O
brand kit por projeto (usado no modo animado) **não é ligado** ao modo gravado, e as
fontes **não são carregadas** na composição gravada.

## Objetivo

Permitir editar o estilo das legendas por projeto, com preview ao vivo, tendo o **brand
kit** como origem dos padrões — e o brand kit selecionável/criável/editável dentro do
modo gravado.

## Decisões (do brainstorm)

- Propriedades editáveis: **tamanho, posição vertical, cor do texto, cor de destaque,
  fonte**.
- Padrões vêm do **brand kit por projeto** (selecionar/criar/editar no modo gravado).
- Fonte: **dropdown curado** de fontes carregadas via `@remotion/google-fonts` (fonte
  arbitrária não renderiza sem carregamento).

## Dados

`captionStyle = { fontSize:int, bottom:int, color:str, highlightColor:str, fontFamily:str }`.

- Guardado no `JobConfig` (campos novos, com defaults) e resolvido para dentro do
  `edit-recipe.json` (`captionStyle`).
- Job gravado guarda `brand_kit_slug` (novo campo do `JobConfig`).
- Resolução no build do recipe: campos vazios do `captionStyle` herdam do brand kit
  (`color←colors.foreground`, `highlightColor←colors.accent`, `fontFamily←fonts.body`);
  sem brand kit, usa o `brand.json` estático atual.

## Backend

- `pipeline/job.py` `JobConfig`: adicionar `brand_kit_slug: str = ""`,
  `caption_font_size: int = 48`, `caption_bottom: int = 120`, `caption_color: str = ""`,
  `caption_highlight: str = ""`, `caption_font: str = ""`.
- `pipeline/recipe.py` `build_recipe(...)`: novo parâmetro `caption_style: dict` e
  `brand: dict | None`; injeta um `captionStyle` resolvido no recipe.
- `pipeline/stages.py` `stage_recipe`: carrega o brand kit (se `brand_kit_slug`) e passa
  `brand` + `caption_style` (dos campos do config) para `build_recipe`.
- `api/jobs.py`: helpers `update_caption_style(slug, jobs_root, style)` e
  `update_brand_kit(slug, jobs_root, kit_slug)` (gravam no `job.config.json`); `get_state`
  passa a expor o `captionStyle`/`brand_kit_slug` atuais para a UI.
- `api/routes.py`: `PUT /jobs/{slug}/caption-style` e `PUT /jobs/{slug}/brand-kit`.
- Reusa o store de brand kits existente (`api/brand_kits_store.py`, rotas `/brand-kits`).

## Remotion

- `remotion/src/fonts.ts` (novo): carrega um conjunto curado via
  `@remotion/google-fonts` (ex.: Inter, Poppins, Montserrat, Roboto) e expõe
  `resolveFont(name) -> fontFamily` (fallback pro padrão se o nome não estiver na lista).
- `remotion/src/schema.ts`: `zCaptionStyle` + `zEditRecipe.captionStyle` (opcional, com
  default para retrocompatibilidade).
- `remotion/src/components/CaptionLayer.tsx`: lê `fontSize/bottom/color/highlightColor/
  fontFamily` do `captionStyle` (via `resolveFont`) em vez do hardcode + theme.
- `remotion/src/Timeline.tsx` / `Main16x9.tsx` / `Vertical9x16.tsx`: passam
  `recipe.captionStyle` (com fallback aos defaults 48/120) para a `CaptionLayer`.

## Frontend

- Estender `web/src/components/BrandKitModal.tsx` para **editar** (prop opcional
  `editing?: BrandKit` → usa `updateBrandKit`; senão `createBrandKit`).
- Novo `web/src/components/BrandKitPicker.tsx`: lista kits (`listBrandKits`), seleciona,
  "+ Novo" e "Editar" (abrem o modal). Reutiliza o padrão do BrandStep animado.
- `web/src/steps/TranscriptStep.tsx`: seção **"Legendas & Marca"**:
  - `BrandKitPicker` (seleciona/cria/edita o kit do projeto → salva via `/brand-kit`).
  - Controles de estilo: slider de tamanho, slider de posição, color pickers (texto +
    destaque), dropdown de fonte (lista curada) → salva via `/caption-style` (debounced).
  - O preview `CaptionOverlay` (que já existe) passa a **refletir** o `captionStyle`
    (tamanho, posição, cores, fonte).
- `web/src/api.ts`: `putCaptionStyle(slug, style)`, `putBrandKit(slug, kitSlug)`; e
  o estado do job (`getJob`) passa a trazer `captionStyle`/`brandKitSlug` para hidratar a UI.

## Ordem de implementação (incremental, cada parte shippable)

1. **Estilo de legenda funcionando** com defaults do `brand.json` estático: JobConfig +
   recipe `captionStyle` + CaptionLayer lê do recipe + font loading + controles na UI +
   preview refletindo. (Já resolve a dor principal.)
2. **Brand kit ligado**: seleção/criação/edição no modo gravado; defaults do estilo
   passam a vir do kit selecionado.

## Tratamento de erros

- Fonte fora da lista curada → `resolveFont` cai no padrão (Inter). Sem quebrar render.
- Brand kit inexistente/ausente → usa `brand.json` estático (comportamento atual).
- `captionStyle` ausente no recipe (jobs antigos) → CaptionLayer usa defaults 48/120 +
  theme (retrocompatível).

## Testes

**Backend:**
- `build_recipe` injeta `captionStyle` resolvido: com brand → cores/fonte do brand; com
  overrides → valores do usuário; sem nada → defaults.
- `PUT /caption-style` e `PUT /brand-kit` persistem no config e refletem no
  `edit-recipe.json` após `/recipe`.

**Remotion:**
- `resolveFont`: nome conhecido → fontFamily correspondente; desconhecido → fallback.
- `CaptionLayer` (render de teste/DOM): usa fontSize/cores do `captionStyle`.

**Frontend:**
- `BrandKitPicker`: lista, seleciona, abre modal de criar/editar.
- `TranscriptStep`: mexer nos controles chama `putCaptionStyle`; preview reflete tamanho/
  cor.

## Fora de escopo (Fase A)

- Hook como overlay (Fase B) — o `card` continua como está por ora.
- Editor de overlays / sugestões da IA (Fases C/D).
- Estilos por-linha ou por-palavra diferentes (estilo é global das legendas).
- Upload de fontes próprias (só a lista curada).
