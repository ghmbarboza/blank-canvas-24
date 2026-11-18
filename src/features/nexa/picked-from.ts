// A conversa com a Nexa: a pessoa em balão à direita, a Nexa em texto corrido à esquerda,
// e o que ela desenha (opções, formulário, cartões, etapas, ações) dentro da própria resposta.
// Só a última resposta aceita clique; nas antigas fica marcado o que a pessoa escolheu.

/** "Escolhi: A, B" da resposta seguinte → o que fica marcado nas opções antigas. */
export function pickedFrom(reply: string | undefined): string[] {
  const m = reply?.match(/^Escolhi:\s*(.+)$/s);
  return m
    ? m[1]!
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)
    : [];
}
