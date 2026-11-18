// A busca por texto da base (websearch_to_tsquery) exige TODAS as palavras: "vocês abrem aos
// sábados? até que horas?" não acha "atendemos aos sábados das 8h". Para o agente, a busca vira
// "qualquer palavra que importa" (OR) e o ranking do banco põe o melhor artigo primeiro.
const STOP = new Set(
  "a o as os um uma uns umas de da do das dos em no na nos nas por para pra pro com sem que se e ou mas ao aos à às é são ser foi vai vou eu você vocês voce voces nós nos meu minha seu sua tem ter tá ta isso essa esse esta este aqui ali lá la qual quais quando onde como porque oi olá ola bom boa dia tarde noite obrigado obrigada favor por favor gostaria queria quero saber até ate já ja não nao sim mais muito pouco também tambem".split(
    " ",
  ),
);

export function kbQuery(text: string, maxWords = 8): string {
  const words = text
    .toLowerCase()
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP.has(w));
  const unique = [...new Set(words)].slice(0, maxWords);
  return unique.join(" or ");
}
