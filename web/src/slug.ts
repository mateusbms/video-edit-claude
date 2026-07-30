// Sugestão de nome para um projeto novo. O campo do passo 1 vinha preenchido
// com o slug atual, o que fazia do reuso — e da sobrescrita — o caminho de
// menor esforço. A sugestão é sempre um nome livre.
export function proximoSlugLivre(existentes: string[]): string {
  const usados = new Set(existentes);
  for (let n = 1; ; n++) {
    const candidato = `A${n}`;
    if (!usados.has(candidato)) return candidato;
  }
}
