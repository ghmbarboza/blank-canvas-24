// Aviso ao excluir formulário: o link público para e o que fica guardado.
/** Texto do aviso ao excluir um formulário (com número de envios e o efeito no link). */
export function formDeleteWarning(live: boolean, submissions: number): string {
  const n =
    submissions === 0
      ? "Ele ainda não recebeu nenhum envio."
      : `Os ${submissions === 1 ? "1 envio recebido" : `${submissions} envios recebidos`} e os contatos continuam guardados.`;
  return `${live ? "Este formulário está no ar. " : ""}O link público para de funcionar na hora, inclusive em anúncios e no site. ${n} Para só tirar do ar, desligue em vez de excluir.`;
}
