// Retirada (revisão de segurança de 04/11, S6): classificar e sugerir respostas moram em /api/ai,
// com limite por pessoa e a trava de vendedor. Fica só este aviso para quem ainda chamar aqui
// (a função publicada é sobrescrita por esta versão, que não faz mais nada).
import { serve, json } from "../_shared/http.ts";

serve(async () =>
  json(
    { error: "Esta função foi retirada. Atualize o app (agora é /api/ai).", code: "retired" },
    410,
  ),
);
