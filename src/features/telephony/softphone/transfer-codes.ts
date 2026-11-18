// Transferência de ligação na PBX da Zadarma (#69). A API não controla a ligação em andamento e
// o widget do navegador não aceita tons enviados pelo app, então a Central de CS mostra o código pronto
// para digitar no teclado da ligação. Fonte: zadarma.com/en/support/faq/pbx/how-to-make-calls
// (lido em 02/11/2026): "#101#" passa direto; "*101#" fala antes com o colega.
export function transferCodes(extension: string): { blind: string; attended: string } | null {
  const ext = extension.trim();
  if (!/^\d{2,6}$/.test(ext)) return null;
  return { blind: `#${ext}#`, attended: `*${ext}#` };
}
