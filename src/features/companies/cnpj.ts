// CNPJ: validação dos dígitos verificadores e consulta pública (BrasilAPI, sem chave).
export function onlyDigits(v: string): string {
  return v.replace(/\D/g, "");
}

export function formatCnpj(v: string | null | undefined): string {
  const d = onlyDigits(v ?? "");
  if (d.length !== 14) return v ?? "";
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function isValidCnpj(v: string): boolean {
  const d = onlyDigits(v);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (len: number) => {
    const weights =
      len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, w, i) => acc + Number(d[i]) * w, 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

export interface CnpjData {
  legal_name: string;
  name: string;
  industry: string | null;
  phone: string | null;
  email: string | null;
  address: Record<string, string>;
  size: string | null;
}

const PORTE: Record<string, string> = {
  "MICRO EMPRESA": "1-10",
  "EMPRESA DE PEQUENO PORTE": "11-50",
};

export async function lookupCnpj(cnpj: string): Promise<CnpjData> {
  const d = onlyDigits(cnpj);
  const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${d}`);
  if (res.status === 404) throw new Error("CNPJ não encontrado na Receita");
  if (!res.ok) throw new Error("Consulta de CNPJ indisponível agora");
  const j = (await res.json()) as Record<string, unknown>;
  const s = (k: string) =>
    typeof j[k] === "string" && (j[k] as string).trim() ? (j[k] as string).trim() : null;
  const phone = s("ddd_telefone_1");
  return {
    legal_name: s("razao_social") ?? "",
    name: s("nome_fantasia") ?? s("razao_social") ?? "",
    industry: s("cnae_fiscal_descricao"),
    phone: phone ? onlyDigits(phone) : null,
    email: s("email")?.toLowerCase() ?? null,
    size: PORTE[s("porte") ?? ""] ?? null,
    address: Object.fromEntries(
      (
        [
          ["street", s("logradouro")],
          ["number", s("numero")],
          ["complement", s("complemento")],
          ["district", s("bairro")],
          ["city", s("municipio")],
          ["state", s("uf")],
          ["zip", s("cep")],
        ] as [string, string | null][]
      ).filter((e): e is [string, string] => Boolean(e[1])),
    ),
  };
}
