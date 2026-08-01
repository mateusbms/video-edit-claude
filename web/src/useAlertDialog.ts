import { useEffect, useRef } from "react";

// Mesmos elementos que o navegador considera "tabbable" por padrão — os
// cinco diálogos só têm botões, mas o seletor cobre o caso geral.
const SELETOR_FOCAVEL =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Acessibilidade compartilhada pelos cinco `role="alertdialog"` do app
 * (ProjectsScreen ×2, UploadStep ×1, CutsStep ×2):
 * - ao montar, foca o primeiro elemento focável do diálogo;
 * - Esc chama `onClose` — o mesmo handler do botão "Desistir"/"Cancelar";
 * - Tab/Shift+Tab ciclam dentro do diálogo (focus trap simples);
 * - ao desmontar, devolve o foco a quem estava focado antes de abrir.
 *
 * `onClose` é guardado numa ref e não entra nas deps do efeito de propósito:
 * os chamadores passam uma arrow function inline, que troca de identidade a
 * cada render — se o efeito rodasse de novo a cada mudança de identidade,
 * ele roubaria o foco do usuário no meio da interação, não só ao abrir.
 */
export function useAlertDialog<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = ref.current;
    const elementoAnterior = document.activeElement as HTMLElement | null;

    const focaveis = () =>
      dialog ? Array.from(dialog.querySelectorAll<HTMLElement>(SELETOR_FOCAVEL)) : [];

    focaveis()[0]?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const itens = focaveis();
      if (itens.length === 0) return;
      const primeiro = itens[0];
      const ultimo = itens[itens.length - 1];
      if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    };

    dialog?.addEventListener("keydown", onKeyDown);
    return () => {
      dialog?.removeEventListener("keydown", onKeyDown);
      elementoAnterior?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return ref;
}
